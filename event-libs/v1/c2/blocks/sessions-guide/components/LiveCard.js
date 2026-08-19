import { html } from '../../../../deps/htm-preact.js';
import { useSessionGuide } from '../store/index.js';
import { formatShortTime, formatDuration, getNowMs } from '../utils/time.js';
import { deriveSessionState, getWatchDestination } from '../../../../utils/session-state.js';
import {
  scheduled, favorited, pendingActions, liveStreamActiveIds,
} from '../../../../utils/session-store.js';
import { toggleScheduleWithFeedback, toggleFavoriteWithFeedback } from '../../../../services/sessions/action-feedback.js';
import { IconPlay, IconCalendarCheck, IconCalendarPlus, IconHeartFilled, IconHeartOutline } from './icons.js';
import { setSessionParam, clearSessionParams, safeUrl, isSamePage } from '../utils/url.js';
import { CategoryBadge } from './CategoryBadge.js';
import { scrollBehavior } from '../utils/motion.js';
import { getTrackIcon } from '../../../../utils/tier-1-event-config.js';
import { isBehaviorEnabled } from '../utils/behavior-flags.js';

export const buildLiveCard = () => LiveCard;

export function LiveCard({ session, variant = 'live' }) {
  const { state, dispatch } = useSessionGuide();
  const { guideConfig } = state;
  const { userTz, surface } = guideConfig;

  const isScheduled = scheduled.value.has(session.id);
  const isFavorited = favorited.value.has(session.id);
  const isPending = pendingActions.value.has(session.id);
  const schedulingEnabled = isBehaviorEnabled(guideConfig, 'enableScheduling');
  const favoritingEnabled = isBehaviorEnabled(guideConfig, 'enableFavoriting');
  const watchNowEnabled = isBehaviorEnabled(guideConfig, 'enableWatchNowCtas');

  const nowMs = getNowMs();
  const sessionState = deriveSessionState(session, liveStreamActiveIds.value, nowMs);

  const startMs = Date.parse(session.startTimeUtc);
  const endMs = Date.parse(session.endTimeUtc);
  const duration = endMs - startMs;
  const elapsed = Math.min(Math.max(nowMs - startMs, 0), duration);
  const progressPct = duration > 0 ? Math.round((elapsed / duration) * 100) : 0;
  const durationLabel = duration >= 0
    ? formatDuration(session.startTimeUtc, session.endTimeUtc, { short: true })
    : '';

  const trackColor = getTrackIcon(session.track)?.color || '';
  const startTime = formatShortTime(session.startTimeUtc, userTz);
  const endTime = session.endTimeUtc ? formatShortTime(session.endTimeUtc, userTz) : '';
  const timeRange = endTime ? `${startTime} – ${endTime}` : startTime;
  // Only an upcoming Recommended card states its time. A live card shows the progress bar
  // and remaining duration instead, and a start time says nothing useful once a session is
  // on demand.
  const showTime = variant === 'recommended' && sessionState === 'upcoming';
  // A live session with an additional event-site track badges both, side by side, in the
  // slot the time would otherwise take. Only the first additional track is used — the ESP
  // field is multi-select but the badge model supports one (see resolveTrackBadge).
  const secondTrack = sessionState === 'live' ? (session.additionalTracks || [])[0] : undefined;

  const cardClass = [
    'sg-live-card',
    isScheduled ? 'is-scheduled' : '',
    isFavorited ? 'is-favorited' : '',
    isPending ? 'is-pending' : '',
  ].filter(Boolean).join(' ');

  async function handleSchedule(e) {
    e.stopPropagation();
    await toggleScheduleWithFeedback(session, { eventConfig: guideConfig, isScheduled });
  }

  async function handleFavorite(e) {
    e.stopPropagation();
    await toggleFavoriteWithFeedback(session, { eventConfig: guideConfig, isFavorited });
  }

  const watchHref = safeUrl(getWatchDestination(session, sessionState));

  function handleWatch(e) {
    e.stopPropagation();
    // Already on the destination page (e.g. the widget is embedded on the homepage/broadcast
    // page itself) — close the widget instead of reloading the page out from under the player.
    if (isSamePage(watchHref)) {
      dispatch({ type: 'CLOSE_DRAWER' });
      history.pushState({}, '', clearSessionParams());
      window.scrollTo({ top: 0, behavior: scrollBehavior() });
      return;
    }
    window.location.href = watchHref;
  }

  let primaryCta;
  if (sessionState === 'upcoming') {
    if (variant === 'recommended' && schedulingEnabled) {
      primaryCta = html`<button
        class=${'sg-live-card__btn sg-live-card__btn--watch' + (isScheduled ? ' is-scheduled' : '') + (isPending ? ' is-pending' : '')}
        onclick=${handleSchedule}
        disabled=${isPending}
        daa-ll=${isScheduled ? 'Remove-from-Schedule' : 'Add-to-Schedule'}
        type="button"
      >${isScheduled
          ? html`<${IconCalendarCheck} />Added to schedule`
          : html`<${IconCalendarPlus} />Add to schedule`
        }</button>`;
    }
  } else if (watchHref && watchNowEnabled) {
    primaryCta = html`<button
      class="sg-live-card__btn sg-live-card__btn--watch"
      onclick=${handleWatch}
      daa-ll="Watch-Now"
      type="button"
    ><${IconPlay} />Watch now</button>`;
  }

  function handleCardClick() {
    if (surface !== 'widget') return;
    dispatch({ type: 'SET_ACTIVE_SESSION', sessionId: session.id });
    const slug = session.slug || session.id;
    const rfCode = session.rfCode || session.id;
    history.pushState({}, '', setSessionParam(`${slug}-${rfCode}`));
  }

  return html`
    <div class=${cardClass} onclick=${handleCardClick}>
      <div class="sg-live-card__image">
        ${session.thumbnailUrl
    ? html`<img src=${session.thumbnailUrl} alt=${session.title} loading="lazy" decoding="async" />`
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
            ${html`<${CategoryBadge} session=${session} hideCount=${!!secondTrack} />`}
          </div>
          ${secondTrack && html`<span class="sg-live-card__track-extra">
            <${CategoryBadge} track=${secondTrack} />
          </span>`}
          ${showTime && html`<p class="sg-live-card__time">${timeRange}</p>`}
        </div>
        ${surface === 'widget'
    ? html`<button
              class="sg-live-card__title sg-live-card__title-btn"
              type="button"
              onclick=${(e) => { e.stopPropagation(); handleCardClick(); }}
              daa-ll="Session-Card-Open"
            >${session.title}</button>`
    : html`<p class="sg-live-card__title">${session.title}</p>`}
        <p class="sg-live-card__desc">${session.description}</p>
        <div class="sg-live-card__actions">
          ${primaryCta}
          ${schedulingEnabled && html`<button
            class=${'sg-live-card__btn sg-live-card__btn--schedule' + (isScheduled ? ' is-scheduled' : '') + (isPending ? ' is-pending' : '')}
            onclick=${handleSchedule}
            aria-label=${isScheduled ? `Remove ${session.title} from schedule` : `Add ${session.title} to schedule`}
            aria-pressed=${String(isScheduled)}
            disabled=${isPending}
            daa-ll=${isScheduled ? 'Remove-from-Schedule' : 'Add-to-Schedule'}
            type="button"
          ></button>`}
          ${favoritingEnabled && html`<button
            class=${'sg-live-card__btn sg-live-card__btn--favorite' + (isFavorited ? ' is-favorited' : '') + (isPending ? ' is-pending' : '')}
            onclick=${handleFavorite}
            aria-label=${isFavorited ? `Remove ${session.title} from favorites` : `Add ${session.title} to favorites`}
            aria-pressed=${String(isFavorited)}
            disabled=${isPending}
            daa-ll=${isFavorited ? 'Remove-from-Favorites' : 'Add-to-Favorites'}
            type="button"
          >${isFavorited ? html`<${IconHeartFilled} />` : html`<${IconHeartOutline} />`}</button>`}
        </div>
      </div>
    </div>
  `;
}
