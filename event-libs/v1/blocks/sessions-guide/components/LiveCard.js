import { formatShortTime, getNowMs } from '../utils/time.js';
import { addSession, removeSession, toggleSessionInterest } from '../services/rainfocus.js';
import { setSessionParam } from '../utils/url.js';

function formatDuration(ms) {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

export function buildLiveCard(preact, store) {
  const { html } = preact;
  const { useSessionGuide } = store;

  return function LiveCard({ session }) {
    const { state, dispatch } = useSessionGuide();
    const {
      scheduled, favorited, isRegistered, eventConfig,
    } = state;
    const pendingActions = state.pendingActions || new Set();
    const sessions = state.sessions || [];
    const {
      userTz, trackColors, trackIcons, rfApiProfileId, rfApiUrl, showConflictModal, surface,
    } = eventConfig;

    const isScheduled = scheduled.has(session.id);
    const isFavorited = favorited.has(session.id);
    const isPending = pendingActions.has(session.id);

    const startMs = Date.parse(session.startTimeUtc);
    const endMs = Date.parse(session.endTimeUtc);
    const duration = endMs - startMs;
    const elapsed = Math.min(Math.max(getNowMs() - startMs, 0), duration);
    const progressPct = duration > 0 ? Math.round((elapsed / duration) * 100) : 0;
    const durationLabel = duration > 0 ? formatDuration(duration) : '';

    const trackColor = (trackColors && trackColors[session.track]) || '';
    const trackIcon = (trackIcons && trackIcons[session.track]) || '';
    const startTime = formatShortTime(session.startTimeUtc, userTz);
    const endTime = session.endTimeUtc ? formatShortTime(session.endTimeUtc, userTz) : '';
    const timeRange = endTime ? `${startTime} – ${endTime}` : startTime;

    const cardClass = [
      'sg-live-card',
      isScheduled ? 'is-scheduled' : '',
      isFavorited ? 'is-favorited' : '',
      isPending ? 'is-pending' : '',
    ].filter(Boolean).join(' ');

    function hasTimeConflict(a, b) {
      const aStart = Date.parse(a.startTimeUtc);
      const aEnd = Date.parse(a.endTimeUtc);
      const bStart = Date.parse(b.startTimeUtc);
      const bEnd = Date.parse(b.endTimeUtc);
      return aStart < bEnd && aEnd > bStart;
    }

    async function handleSchedule(e) {
      e.stopPropagation();
      if (isRegistered !== true) { dispatch({ type: 'SHOW_REG_PROMPT' }); return; }
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
            const conflict = sessions.find(
              (s) => s.id !== session.id && scheduled.has(s.id) && hasTimeConflict(s, session),
            );
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
        window.lana?.log(`[sessions-guide] live card schedule failed: ${err.message}`);
        dispatch({ type: 'SHOW_TOAST', message: 'Something went wrong. Please try again.', variant: 'error' });
      } finally {
        dispatch({ type: 'SET_PENDING', sessionId: session.id, pending: false });
      }
    }

    async function handleFavorite(e) {
      e.stopPropagation();
      if (isRegistered !== true) { dispatch({ type: 'SHOW_REG_PROMPT' }); return; }
      if (isPending) return;

      dispatch({ type: 'SET_PENDING', sessionId: session.id, pending: true });
      try {
        // TODO: replace null credentials with real rfAuthToken/clientId from auth integration
        await toggleSessionInterest(session.rfCode, session.id, null, null, rfApiProfileId, rfApiUrl);
        dispatch({ type: isFavorited ? 'FAVORITE_REMOVE' : 'FAVORITE_ADD', sessionId: session.id });
        dispatch({ type: 'SHOW_TOAST', message: isFavorited ? 'Removed from favorites' : 'Added to favorites', variant: isFavorited ? 'default' : 'success' });
      } catch (err) {
        window.lana?.log(`[sessions-guide] live card favorite failed: ${err.message}`);
        dispatch({ type: 'SHOW_TOAST', message: 'Something went wrong. Please try again.', variant: 'error' });
      } finally {
        dispatch({ type: 'SET_PENDING', sessionId: session.id, pending: false });
      }
    }

    function handleCardClick() {
      if (surface !== 'widget') return;
      dispatch({ type: 'SET_ACTIVE_SESSION', sessionId: session.id });
      const slug = session.slug || session.id;
      const rfCode = session.rfCode || session.id;
      history.pushState({}, '', setSessionParam(`${slug}-${rfCode}`));
    }

    return html`
      <div class=${cardClass} onclick=${handleCardClick} role="button" tabindex="0">
        <div class="sg-live-card__image">
          ${session.thumbnailUrl
    ? html`<img src=${session.thumbnailUrl} alt=${session.title} loading="lazy" />`
    : html`<div class="sg-live-card__thumb-placeholder" style=${'background:' + trackColor}></div>`}
          <div class="sg-live-card__progress-row">
            <div class="sg-live-card__progress">
              <div class="sg-live-card__progress-bar" style=${'width:' + progressPct + '%'}></div>
            </div>
            ${durationLabel && html`<span class="sg-live-card__duration">${durationLabel}</span>`}
          </div>
        </div>
        <div class="sg-live-card__body">
          <div class="sg-live-card__meta">
            <div class="sg-live-card__track-row">
              ${trackIcon && html`<img class="sg-live-card__track-icon" src=${trackIcon} alt="" aria-hidden="true" />`}
              <span class="sg-live-card__track" style=${'color:' + trackColor}>${session.track}</span>
            </div>
            <p class="sg-live-card__time">${timeRange}</p>
          </div>
          <p class="sg-live-card__title">${session.title}</p>
          <p class="sg-live-card__desc">${session.description}</p>
          <div class="sg-live-card__actions">
            ${session.watchUrl && html`<button
              class="sg-live-card__btn sg-live-card__btn--watch"
              onclick=${(e) => { e.stopPropagation(); window.location.href = session.watchUrl; }}
              type="button"
            ><span class="sg-live-card__play-icon" aria-hidden="true"></span>Watch now</button>`}
            <button
              class=${'sg-live-card__btn sg-live-card__btn--schedule' + (isScheduled ? ' is-scheduled' : '') + (isPending ? ' is-pending' : '')}
              onclick=${handleSchedule}
              aria-label=${isScheduled ? 'Remove from schedule' : 'Add to schedule'}
              aria-pressed=${String(isScheduled)}
              disabled=${isPending}
              type="button"
            ></button>
            <button
              class=${'sg-live-card__btn sg-live-card__btn--favorite' + (isPending ? ' is-pending' : '')}
              onclick=${handleFavorite}
              aria-label=${isFavorited ? 'Remove from favorites' : 'Favorite'}
              aria-pressed=${String(isFavorited)}
              disabled=${isPending}
              type="button"
            ><span class="sg-live-card__btn-label">Favorite</span></button>
          </div>
        </div>
      </div>
    `;
  };
}
