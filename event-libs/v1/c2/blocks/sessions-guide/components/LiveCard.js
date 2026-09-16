import { html, useEffect, useState } from '../../../../deps/htm-preact.js';
import { useSessionGuide } from '../store/index.js';
import { formatShortTime, formatDuration, getNowMs } from '../utils/time.js';
import { deriveSessionState, getWatchDestination } from '../../../../utils/session-state.js';
import {
  scheduled, favorited, pendingActions, liveStreamActiveIds, requestWatchSameSession,
} from '../../../../utils/session-store.js';
import { toggleScheduleWithFeedback, toggleFavoriteWithFeedback } from '../../../../services/sessions/action-feedback.js';
import { IconPlay, IconCalendarCheck, IconCalendarPlus, IconHeartFilled, IconHeartOutline } from './icons.js';
import { setSessionParam, sessionParamValue, clearSessionParams, safeUrl, isSamePage } from '../utils/url.js';
import { CategoryBadge } from './CategoryBadge.js';
import { scrollBehavior } from '../utils/motion.js';
import { getTrackIcon } from '../../../../utils/tier-1-event-config.js';
import { isBehaviorEnabled } from '../utils/behavior-flags.js';

export const buildLiveCard = () => LiveCard;

// Non-MR sessions need this manual tick; MR sessions get an equivalent refresh from the poller.
export const PROGRESS_REFRESH_MS = 30_000;

// Mirrors FilterPanel.js's own hook — same breakpoint, same pattern, not shared as a util since
// it's a small, self-contained piece of view state (matches use-carousel-row.js's precedent of
// each caller keeping its own matchMedia hook rather than a shared one).
const MOBILE_QUERY = '(max-width: 767px)';
const matchesMobile = () => !!window.matchMedia?.(MOBILE_QUERY).matches;
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(matchesMobile);
  useEffect(() => {
    const mq = window.matchMedia?.(MOBILE_QUERY);
    if (!mq) return undefined;
    const onChange = (e) => setIsMobile(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return isMobile;
}

export function computeProgressPct(session, nowMs) {
  const startMs = Date.parse(session.startTimeUtc);
  const endMs = Date.parse(session.endTimeUtc);
  const duration = endMs - startMs;
  const elapsed = Math.min(Math.max(nowMs - startMs, 0), duration);
  return duration > 0 ? Math.round((elapsed / duration) * 100) : 0;
}

export function LiveCard({
  session, variant = 'live', onCardClick, onWatchSamePage, showDurationBadge = false, forceLive = false,
}) {
  const { state, dispatch } = useSessionGuide();
  const { guideConfig } = state;
  const { userTz, surface } = guideConfig;
  const isMobile = useIsMobile();
  // Mobile redesign (Figma 8463:87698) — title, then a fixed-height badges block, then actions.
  // Scoped to the 'live' card only; 'recommended' keeps its current meta-then-title order for now.
  const useMobileLayout = isMobile && variant !== 'recommended';

  const isScheduled = scheduled.value.has(session.id);
  const isFavorited = favorited.value.has(session.id);
  const isPending = pendingActions.value.has(session.id);
  const schedulingEnabled = isBehaviorEnabled(guideConfig, 'enableScheduling');
  const favoritingEnabled = isBehaviorEnabled(guideConfig, 'enableFavoriting');
  const watchNowEnabled = isBehaviorEnabled(guideConfig, 'enableWatchNowCtas');

  const nowMs = getNowMs();
  // forceLive: caller already vetted liveness via video duration; deriveSessionState only knows endTimeUtc.
  const sessionState = forceLive ? 'live' : deriveSessionState(session, liveStreamActiveIds.value, nowMs);

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
  // Meta row's second slot is shared: Recommended+upcoming shows time, others show a track badge.
  const showTime = variant === 'recommended' && sessionState === 'upcoming';
  const secondTrack = showTime ? undefined : (session.additionalTracks || [])[0];

  const cardClass = [
    'sg-live-card',
    useMobileLayout ? 'sg-live-card--mobile-live' : '',
    isScheduled ? 'is-scheduled' : '',
    isFavorited ? 'is-favorited' : '',
    isPending ? 'is-pending' : '',
  ].filter(Boolean).join(' ');

  async function handleSchedule(e) {
    e.stopPropagation();
    // Captured now: e.currentTarget is nulled once the event finishes dispatching, but onBlocked fires later.
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
    // Live-only same-page switch avoids reloading; on-demand always does a real navigation.
    if (sessionState === 'live' && isSamePage(watchHref)) {
      if (onWatchSamePage) { onWatchSamePage(session); return; }
      // No-op on pages with nothing subscribed to this request (e.g. the homepage).
      requestWatchSameSession(session.id);
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
    ><${IconPlay} size=${useMobileLayout ? 14 : 20} />${isOnDemand ? 'Watch on demand' : 'Watch now'}</button>`;
  }

  // On demand, the whole card always navigates to the session page, regardless of surface.
  function handleCardClick(e) {
    if (sessionState === 'on-demand') { handleWatch(e); return; }
    if (surface === 'widget') {
      dispatch({ type: 'SET_ACTIVE_SESSION', sessionId: session.id });
      history.pushState({}, '', setSessionParam(sessionParamValue(session)));
      return;
    }
    // A non-widget caller like session-broadcast has no in-widget overlay to navigate away
    // from — onCardClick lets it supply its own "open detail" behavior instead.
    if (onCardClick) { onCardClick(session); return; }
    // Full page: a live session's card click reuses the same watch-destination routing as
    // the Watch Now button (homepage player for a keynote, channel page otherwise) — but
    // only when there actually is one; an in-person-only session has no stream to jump to
    // (getWatchDestination returns '' for it), so it falls through to its session page like
    // 'upcoming' does (same pattern as SessionCard.js's handleClick).
    if (sessionState === 'live' && watchHref) { handleWatch(e); return; }
    const dest = safeUrl(session.sessionPageUrl);
    if (dest) window.location.href = dest;
  }

  // Full page (no onCardClick): the click destination differs by state (watch vs. session info
  // page), so the accessible name says which — same distinction handleCardClick itself makes.
  const selfNavigates = surface !== 'widget' && !onCardClick;
  const opensWatch = sessionState === 'on-demand' || (sessionState === 'live' && !!watchHref);
  const titleAriaLabel = selfNavigates
    ? (opensWatch ? `Watch ${session.title} now` : `View ${session.title} details`)
    : undefined;

  const titleBlock = html`<button
              class="sg-live-card__title sg-live-card__title-btn"
              type="button"
              onclick=${(e) => { e.stopPropagation(); handleCardClick(e); }}
              aria-label=${titleAriaLabel}
              daa-ll="Session-Card-Open"
            >${session.title}</button>`;

  // Current layout: horizontal, divider-separated, used everywhere except the new mobile 'live' case below.
  const metaBlock = html`
    <div class="sg-live-card__meta">
      <div class="sg-live-card__track-row">
        ${html`<${CategoryBadge} session=${session} hideCount=${!!secondTrack} />`}
      </div>
      ${secondTrack && html`<span class="sg-live-card__track-extra">
        <${CategoryBadge} track=${secondTrack} />
      </span>`}
      ${showTime && html`<p class="sg-live-card__time">${timeRange}</p>`}
    </div>
  `;

  // New mobile layout (Figma 8463:87698): up to 2 badges stacked in a fixed-height block, so a
  // 1-badge card and a 2-badge card are always the same total height.
  const badgesBlock = html`
    <div class="sg-live-card__badges">
      ${html`<${CategoryBadge} session=${session} size=${'sm'} iconSize=${16} hideCount=${!!secondTrack} />`}
      ${secondTrack && html`<${CategoryBadge} track=${secondTrack} size=${'sm'} iconSize=${16} />`}
    </div>
  `;

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
        ${useMobileLayout
    ? html`${titleBlock}${badgesBlock}`
    : html`${metaBlock}${titleBlock}<p class="sg-live-card__desc">${session.description}</p>`}
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
          >${isFavorited
    ? html`<${IconHeartFilled} size=${useMobileLayout ? 16 : 20} />`
    : html`<${IconHeartOutline} size=${useMobileLayout ? 16 : 20} />`}</button>`}
          ${variant === 'live' && showDurationBadge && durationLabel && html`<span class="sg-live-card__actions-time">${durationLabel}</span>`}
        </div>
      </div>
    </div>
  `;
}
