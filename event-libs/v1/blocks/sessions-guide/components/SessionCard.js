import { isSessionOnDemand, formatSessionTime, formatShortTime, getNowMs } from '../utils/time.js';
import { scheduleAction, favoriteAction } from '../services/session-actions.js';
import { setSessionParam } from '../utils/url.js';

export function buildSessionCard(preact, store) {
  const { html } = preact;
  const { useSessionGuide } = store;

  return function SessionCard({ session }) {
    const { state, dispatch } = useSessionGuide();
    const { scheduled, favorited, eventConfig } = state;
    const pendingActions = state.pendingActions || new Set();
    const { userTz, surface, trackColors, trackIcons } = eventConfig;

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

    async function handleSchedule(e) {
      e.stopPropagation();
      await scheduleAction(session, state, dispatch);
    }

    async function handleFavorite(e) {
      e.stopPropagation();
      await favoriteAction(session, state, dispatch);
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
