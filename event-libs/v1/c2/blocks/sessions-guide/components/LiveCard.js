import { html, useEffect, useState } from '../../../../deps/htm-preact.js';
import { useSessionGuide } from '../store/index.js';
import { formatShortTime, formatDuration, getNowMs } from '../utils/time.js';
import { deriveSessionState, getWatchDestination } from '../../../../utils/session-state.js';
import {
  scheduled, favorited, pendingActions, liveStreamActiveIds,
} from '../../../../utils/session-store.js';
import { toggleScheduleWithFeedback, toggleFavoriteWithFeedback } from '../../../../services/sessions/action-feedback.js';
import { IconPlay, IconCalendarCheck, IconCalendarPlus, IconHeartFilled, IconHeartOutline } from './icons.js';
import { setSessionParam, sessionParamValue, clearSessionParams, safeUrl, isSamePage } from '../utils/url.js';
import { CategoryBadge } from './CategoryBadge.js';
import { scrollBehavior } from '../utils/motion.js';
import { getTrackIcon } from '../../../../utils/tier-1-event-config.js';
import { isBehaviorEnabled } from '../utils/behavior-flags.js';

export const buildLiveCard = () => LiveCard;

// A non-MR session only gets a fresh render from the shared session-state ticker when some
// session's live/upcoming/on-demand bucket actually flips — which can go untriggered for a
// while if nothing else on the page is transitioning, leaving the progress bar visibly stuck.
// An MR session gets an equivalent refresh for free every ~30s from the poller reassigning
// liveStreamActiveIds. Exported so the cadence is one shared constant, not a magic number.
export const PROGRESS_REFRESH_MS = 30_000;

export function computeProgressPct(session, nowMs) {
  const startMs = Date.parse(session.startTimeUtc);
  const endMs = Date.parse(session.endTimeUtc);
  const duration = endMs - startMs;
  const elapsed = Math.min(Math.max(nowMs - startMs, 0), duration);
  return duration > 0 ? Math.round((elapsed / duration) * 100) : 0;
}

export function LiveCard({
  session, variant = 'live', onCardClick, onWatchSamePage,
}) {
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

  // Forces a re-render every PROGRESS_REFRESH_MS while live, purely so progressPct below gets
  // recomputed against the current clock — see PROGRESS_REFRESH_MS for why this can't rely on
  // the shared session-state ticker alone.
  const [, forceProgressTick] = useState(0);
  useEffect(() => {
    if (sessionState !== 'live') return undefined;
    const id = setInterval(() => forceProgressTick((n) => n + 1), PROGRESS_REFRESH_MS);
    return () => clearInterval(id);
  }, [sessionState]);

  const duration = Date.parse(session.endTimeUtc) - Date.parse(session.startTimeUtc);
  const progressPct = computeProgressPct(session, nowMs);
  const durationLabel = duration >= 0
    ? formatDuration(session.startTimeUtc, session.endTimeUtc, { short: true })
    : '';

  const trackColor = getTrackIcon(session.primaryTrack)?.color || '';
  const startTime = formatShortTime(session.startTimeUtc, userTz);
  const endTime = session.endTimeUtc ? formatShortTime(session.endTimeUtc, userTz) : '';
  const timeRange = endTime ? `${startTime} – ${endTime}` : startTime;
  // The meta row's second slot is shared. An upcoming Recommended card states its time
  // there; every other card badges its first additional event-site track instead, so live
  // and past Recommended cards get the same two-badge treatment. A live card never needs the
  // time (it has a progress bar and remaining duration), and a start time says nothing once a
  // session is on demand. Only the first additional track is used — the ESP field is
  // multi-select but the badge model supports one (see resolveTrackBadge).
  const showTime = variant === 'recommended' && sessionState === 'upcoming';
  const secondTrack = showTime ? undefined : (session.additionalTracks || [])[0];

  const cardClass = [
    'sg-live-card',
    isScheduled ? 'is-scheduled' : '',
    isFavorited ? 'is-favorited' : '',
    isPending ? 'is-pending' : '',
  ].filter(Boolean).join(' ');

  async function handleSchedule(e) {
    e.stopPropagation();
    // Captured now — e.currentTarget is nulled out once the event finishes dispatching,
    // but onBlocked fires later, after the (possibly rejected) action settles.
    const btn = e.currentTarget;
    await toggleScheduleWithFeedback(session, {
      eventConfig: guideConfig, isScheduled, onBlocked: () => btn.blur(),
    });
  }

  async function handleFavorite(e) {
    e.stopPropagation();
    const btn = e.currentTarget;
    await toggleFavoriteWithFeedback(session, {
      eventConfig: guideConfig, isFavorited, onBlocked: () => btn.blur(),
    });
  }

  const watchHref = safeUrl(getWatchDestination(session, sessionState));

  function handleWatch(e) {
    e.stopPropagation();
    // Already on the destination page (e.g. the widget is embedded on the homepage/broadcast
    // page itself) — let the caller decide what "already here" means (session-broadcast wants
    // to switch its own primary player, not close a drawer that doesn't exist there) instead of
    // reloading the page out from under whatever is already playing.
    if (isSamePage(watchHref)) {
      if (onWatchSamePage) { onWatchSamePage(session); return; }
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
        class=${'sg-live-card__btn sg-live-card__btn--schedule-cta' + (isScheduled ? ' is-scheduled' : '') + (isPending ? ' is-pending' : '')}
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
    const isOnDemand = sessionState === 'on-demand';
    primaryCta = html`<button
      class="sg-live-card__btn sg-live-card__btn--watch"
      onclick=${handleWatch}
      daa-ll=${isOnDemand ? 'Watch-On-Demand' : 'Watch-Now'}
      type="button"
    ><${IconPlay} />${isOnDemand ? 'Watch on demand' : 'Watch now'}</button>`;
  }

  // On demand: match SessionCard/TrackRow — the whole card always navigates straight to
  // the session page, regardless of surface, instead of opening the in-widget overlay.
  function handleCardClick(e) {
    if (sessionState === 'on-demand') { handleWatch(e); return; }
    if (surface === 'widget') {
      dispatch({ type: 'SET_ACTIVE_SESSION', sessionId: session.id });
      history.pushState({}, '', setSessionParam(sessionParamValue(session)));
      return;
    }
    // Non-widget surfaces have no in-widget overlay of their own to open — onCardClick lets
    // a caller like session-broadcast (no drawer, no Context) supply its own "open detail"
    // behavior instead. Defaults to the prior no-op when nothing is supplied.
    onCardClick?.(session);
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
              onclick=${(e) => { e.stopPropagation(); handleCardClick(e); }}
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
          ${variant === 'live' && durationLabel && html`<span class="sg-live-card__actions-time">${durationLabel}</span>`}
        </div>
      </div>
    </div>
  `;
}
