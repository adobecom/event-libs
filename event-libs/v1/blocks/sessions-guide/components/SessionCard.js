import { isSessionOnDemand, formatSessionTime, formatShortTime, getNowMs } from '../utils/time.js';
import { addSession, removeSession, toggleSessionInterest } from '../services/rainfocus.js';
import { setSessionParam } from '../utils/url.js';

function hasTimeConflict(a, b) {
  const aStart = Date.parse(a.startTimeUtc);
  const aEnd = Date.parse(a.endTimeUtc);
  const bStart = Date.parse(b.startTimeUtc);
  const bEnd = Date.parse(b.endTimeUtc);
  return aStart < bEnd && aEnd > bStart;
}

function findScheduleConflict(incoming, sessions, scheduled) {
  return sessions.find(
    (s) => s.id !== incoming.id && scheduled.has(s.id) && hasTimeConflict(s, incoming),
  ) || null;
}

export function buildSessionCard(preact, store) {
  const { html } = preact;
  const { useSessionGuide } = store;

  return function SessionCard({ session }) {
    const { state, dispatch } = useSessionGuide();
    const {
      scheduled, favorited, isLoggedIn, isRegistered, eventConfig,
    } = state;
    const pendingActions = state.pendingActions || new Set();
    const sessions = state.sessions || [];
    const {
      userTz, surface, trackColors, trackIcons,
      rfApiProfileId, rfApiUrl, showConflictModal,
      title: eventTitle, registerUrl,
    } = eventConfig;

    const isScheduled = scheduled.has(session.id);
    const isFavorited = favorited.has(session.id);
    const isPending = pendingActions.has(session.id);
    const onDemand = isSessionOnDemand(session, getNowMs());
    const trackColor = (trackColors && trackColors[session.track]) || '';
    const trackIcon = (trackIcons && trackIcons[session.track]) || '';

    // eslint-disable-next-line no-nested-ternary
    const timeLabel = onDemand
      ? (session.inPerson && !session.videoAvailable ? 'Recording coming soon' : 'On demand')
      : formatSessionTime(session.startTimeUtc, userTz);
    const endShort = (!onDemand && session.endTimeUtc) ? formatShortTime(session.endTimeUtc, userTz) : '';
    const timeRange = onDemand
      ? timeLabel
      : (endShort ? `${formatShortTime(session.startTimeUtc, userTz)} – ${endShort}` : timeLabel);

    const cardClass = [
      'sg-card',
      isScheduled ? 'is-scheduled' : '',
      isFavorited ? 'is-favorited' : '',
      onDemand ? 'sg-card--on-demand' : '',
      isPending ? 'is-pending' : '',
    ].filter(Boolean).join(' ');

    function showAuthToast(action) {
      if (isLoggedIn !== true) {
        dispatch({
          type: 'SHOW_TOAST',
          message: `Login required to ${action}`,
          variant: 'informative',
          ctaLabel: 'Login to Adobe',
          ctaAction: () => window.adobeIMS?.signIn(),
          duration: null,
        });
        return true;
      }
      if (isRegistered !== true) {
        const eventName = eventTitle ? ` for ${eventTitle}` : '';
        dispatch({
          type: 'SHOW_TOAST',
          message: `Registration${eventName} required to ${action}`,
          variant: 'informative',
          ctaLabel: 'Register',
          ctaHref: registerUrl || '/register',
          duration: null,
        });
        return true;
      }
      return false;
    }

    async function handleSchedule(e) {
      e.stopPropagation();
      if (showAuthToast('add to schedule')) return;
      if (isPending) return;

      dispatch({ type: 'SET_PENDING', sessionId: session.id, pending: true });
      try {
        if (isScheduled) {
          // TODO: replace null credentials with real rfAuthToken/clientId from auth integration
          await removeSession(session.rfCode, null, null, rfApiProfileId, rfApiUrl);
          dispatch({ type: 'SCHEDULE_REMOVE', sessionId: session.id });
          dispatch({ type: 'SHOW_TOAST', message: 'Removed from schedule', variant: 'default' });
        } else {
          if (showConflictModal) {
            const conflict = findScheduleConflict(session, sessions, scheduled);
            if (conflict) {
              dispatch({
                type: 'SHOW_CONFLICT',
                conflict: {
                  existing: conflict,
                  incoming: session,
                  onConfirm: async (keep) => {
                    if (keep.id === session.id) {
                      await removeSession(conflict.rfCode, null, null, rfApiProfileId, rfApiUrl);
                      dispatch({ type: 'SCHEDULE_REMOVE', sessionId: conflict.id });
                      await addSession(session.rfCode, null, null, rfApiProfileId, rfApiUrl);
                      dispatch({ type: 'SCHEDULE_ADD', sessionId: session.id });
                    }
                    dispatch({ type: 'SHOW_TOAST', message: 'Schedule updated', variant: 'success' });
                  },
                },
              });
              dispatch({ type: 'SET_PENDING', sessionId: session.id, pending: false });
              return;
            }
          }
          await addSession(session.rfCode, null, null, rfApiProfileId, rfApiUrl);
          dispatch({ type: 'SCHEDULE_ADD', sessionId: session.id });
          dispatch({ type: 'SHOW_TOAST', message: 'Added to schedule', variant: 'success' });
        }
      } catch (err) {
        window.lana?.log(`[sessions-guide] schedule action failed: ${err.message}`);
        dispatch({ type: 'SHOW_TOAST', message: 'Something went wrong. Please try again.', variant: 'error' });
      } finally {
        dispatch({ type: 'SET_PENDING', sessionId: session.id, pending: false });
      }
    }

    async function handleFavorite(e) {
      e.stopPropagation();
      if (showAuthToast('add to favorites')) return;
      if (isPending) return;

      dispatch({ type: 'SET_PENDING', sessionId: session.id, pending: true });
      try {
        // TODO: replace null credentials with real rfAuthToken/clientId from auth integration
        await toggleSessionInterest(session.rfCode, session.id, null, null, rfApiProfileId, rfApiUrl);
        dispatch({ type: isFavorited ? 'FAVORITE_REMOVE' : 'FAVORITE_ADD', sessionId: session.id });
        dispatch({ type: 'SHOW_TOAST', message: isFavorited ? 'Removed from favorites' : 'Added to favorites', variant: isFavorited ? 'default' : 'success' });
      } catch (err) {
        window.lana?.log(`[sessions-guide] favorite action failed: ${err.message}`);
        dispatch({ type: 'SHOW_TOAST', message: 'Something went wrong. Please try again.', variant: 'error' });
      } finally {
        dispatch({ type: 'SET_PENDING', sessionId: session.id, pending: false });
      }
    }

    function handleClick() {
      if (surface === 'page') {
        if (session.sessionPageUrl) window.location.href = session.sessionPageUrl;
        return;
      }
      // Widget: navigate for available on-demand, otherwise open detail overlay
      if (onDemand && session.videoAvailable) {
        if (session.sessionPageUrl) window.location.href = session.sessionPageUrl;
        return;
      }
      dispatch({ type: 'SET_ACTIVE_SESSION', sessionId: session.id });
      const slug = session.slug || session.id;
      const rfCode = session.rfCode || session.id;
      history.pushState({}, '', setSessionParam(`${slug}-${rfCode}`));
    }

    return html`
      <div class=${cardClass} onclick=${handleClick} role="button" tabindex="0">
        <div class="sg-card__body">
          <span class="sg-card__track sg-card__track--top" style=${'color:' + trackColor}>
            ${trackIcon && html`<img class="sg-card__track-icon" src=${trackIcon} alt="" aria-hidden="true" />`}${session.track}
          </span>
          <p class="sg-card__title">${session.title}</p>
          <p class="sg-card__desc">${session.description}</p>
          <div class="sg-card__footer">
            <span class="sg-card__track sg-card__track--footer" style=${'color:' + trackColor}>${session.track}</span>
            <span class="sg-card__time">${timeLabel}</span>
          </div>
        </div>
        <div class="sg-card__actions" data-time=${timeRange}>
          ${!onDemand && html`<button
            class=${'sg-card__btn sg-card__btn--schedule' + (isPending ? ' sg-card__btn--loading' : '')}
            onclick=${handleSchedule}
            aria-label=${isScheduled ? 'Remove from schedule' : 'Add to schedule'}
            aria-pressed=${String(isScheduled)}
            disabled=${isPending}
            type="button"
          ></button>`}
          <button
            class=${'sg-card__btn sg-card__btn--favorite' + (isPending ? ' sg-card__btn--loading' : '')}
            onclick=${handleFavorite}
            aria-label=${isFavorited ? 'Remove from favorites' : 'Add to favorites'}
            aria-pressed=${String(isFavorited)}
            disabled=${isPending}
            type="button"
          ></button>
        </div>
      </div>
    `;
  };
}
