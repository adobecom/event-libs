import { html, useState } from '../../../../deps/htm-preact.js';
import { useSessionGuide } from '../store/index.js';
import { isSessionOnDemand, formatSessionTime, formatDuration, getNowMs } from '../utils/time.js';
import { isDvrPending } from '../../../../utils/session-state.js';
import { scheduled, favorited, pendingActions, getEventApiConfig } from '../../../../utils/session-store.js';
import { toggleScheduleWithFeedback, toggleFavoriteWithFeedback } from '../../../../services/sessions/action-feedback.js';
import { setSessionParam, sessionParamValue, safeUrl } from '../utils/url.js';
import { CategoryBadge } from './CategoryBadge.js';
import { IconButton } from './IconButton.js';
import { IconPlay, IconCalendarCheck, IconCalendarPlus, IconHeartFilled, IconHeartOutline } from './icons.js';
import { getTrackIcon } from '../../../../utils/tier-1-event-config.js';
import { isBehaviorEnabled } from '../utils/behavior-flags.js';

export const buildSessionCard = () => SessionCard;

export function SessionCard({ session, forceOnDemand = false, timeDisplay = 'duration' }) {
  const { state, dispatch } = useSessionGuide();
  const { guideConfig, activeView } = state;
  const dismissingIds = state.dismissingIds || new Set();
  const { userTz, surface } = guideConfig;

  const isScheduled = scheduled.value.has(session.id);
  const isFavorited = favorited.value.has(session.id);
  const isPending = pendingActions.value.has(session.id);
  const schedulingEnabled = isBehaviorEnabled(guideConfig, 'enableScheduling');
  const favoritingEnabled = isBehaviorEnabled(guideConfig, 'enableFavoriting');
  const [hoverAnim, setHoverAnim] = useState(null);
  const nowMs = getNowMs();
  const onDemandNatural = isSessionOnDemand(session, nowMs);
  const onDemand = forceOnDemand || onDemandNatural;
  const trackColor = getTrackIcon(session.primaryTrack)?.color || '';

  const upcomingTimeLabel = (timeDisplay === 'duration' && session.endTimeUtc)
    ? formatDuration(session.startTimeUtc, session.endTimeUtc)
    : formatSessionTime(session.startTimeUtc, userTz);
  // A session with a DVR delay isn't watchable yet if the delay window (from the event's own
  // start, not this session's) hasn't elapsed — see isDvrPending. No dvrDelayHours, or no
  // known event start, means it's just on demand with no wait.
  const dvrPending = onDemand && isDvrPending(session, nowMs, getEventApiConfig()?.eventStartMs);
  const timeLabel = onDemand ? (dvrPending ? 'AVAILABLE SOON' : 'ON DEMAND') : upcomingTimeLabel;

  const cardClass = [
    'sg-card',
    isScheduled ? 'is-scheduled' : '',
    isFavorited ? 'is-favorited' : '',
    onDemand ? 'sg-card--on-demand' : '',
    forceOnDemand ? 'sg-card--previously-aired' : '',
    isPending ? 'is-pending' : '',
    hoverAnim === 'fav' ? 'sg-card--anim-fav' : '',
    hoverAnim === 'sched' ? 'sg-card--anim-sched' : '',
    dismissingIds.has(session.id) ? 'sg-card--collapsing' : '',
  ].filter(Boolean).join(' ');

  function onMouseEnter() {
    // On-demand: Play always reveals above Favorite — same slide-down geometry as --anim-fav.
    if (onDemand || (isFavorited && !isScheduled)) setHoverAnim('fav');
    else if (isScheduled && !isFavorited) setHoverAnim('sched');
  }
  function onMouseLeave() {
    setHoverAnim(null);
  }

  // Shared by handleSchedule/handleFavorite: when a card is about to leave its own
  // list (e.g. unscheduling from "My sessions"), collapse it before the action runs
  // so the exit animation isn't cut short by the list re-rendering underneath it.
  async function withDismissAnimation(e, willDismiss, actionFn) {
    if (willDismiss) {
      const cardWrap = e.currentTarget.closest('.sg-card')?.parentElement;
      if (cardWrap) {
        cardWrap.style.maxWidth = `${cardWrap.offsetWidth}px`;
        // eslint-disable-next-line no-unused-expressions
        cardWrap.offsetHeight; // force reflow so transition starts from current width, not none
      }
      dispatch({ type: 'ADD_DISMISSING_ID', id: session.id });
      await new Promise((r) => setTimeout(r, 450));
    }
    await actionFn();
    if (willDismiss) dispatch({ type: 'REMOVE_DISMISSING_ID', id: session.id });
  }

  async function handleSchedule(e) {
    e.stopPropagation();
    await withDismissAnimation(
      e,
      activeView === 'my-sessions' && isScheduled,
      () => toggleScheduleWithFeedback(session, { eventConfig: guideConfig, isScheduled }),
    );
  }

  async function handleFavorite(e) {
    e.stopPropagation();
    await withDismissAnimation(
      e,
      activeView === 'my-favorites' && isFavorited,
      () => toggleFavoriteWithFeedback(session, { eventConfig: guideConfig, isFavorited }),
    );
  }

  // Not gated by enableWatchNowCtas: that flag's identified scope is the discrete
  // "Watch now" CTA in LiveCard.js/SessionDetailOverlay.js, not this play button.
  function handlePlay(e) {
    e.stopPropagation();
    const dest = safeUrl(session.sessionPageUrl);
    if (dest) window.location.href = dest;
  }

  // iOS mis-routes the synthetic click to the card div when the touch target is
  // inside a transform + overflow:hidden ancestor (sg-time-row__cards/viewport).
  // Handle the action on touchend and preventDefault to kill the synthetic click.
  async function handleActionsTouchEnd(e) {
    e.preventDefault();
    const touch = e.changedTouches[0];
    const el = document.elementFromPoint(touch.clientX, touch.clientY);
    if (!el) return;
    if (el.closest('.sg-card__btn--schedule')) { await handleSchedule(e); return; }
    if (el.closest('.sg-card__btn--favorite')) { await handleFavorite(e); return; }
    if (el.closest('.sg-card__btn--play')) handlePlay(e);
  }

  function handleClick() {
    if (surface === 'page') {
      const dest = safeUrl(session.sessionPageUrl);
      if (dest) window.location.href = dest;
      return;
    }
    // Widget: on-demand and previously-aired cards always navigate to session page
    if (onDemand) {
      const dest = safeUrl(session.sessionPageUrl);
      if (dest) window.location.href = dest;
      return;
    }
    dispatch({ type: 'SET_ACTIVE_SESSION', sessionId: session.id });
    history.pushState({}, '', setSessionParam(sessionParamValue(session)));
  }

  // eslint-disable-next-line no-nested-ternary
  const cardDaaLl = surface === 'page'
    ? 'Session-Card-Navigate'
    : (onDemand ? 'On-Demand-Card-Navigate' : 'Session-Card-Open');

  return html`
    <div class=${cardClass} onclick=${handleClick}
      onmouseenter=${onMouseEnter} onmouseleave=${onMouseLeave}>
      <div class="sg-card__body">
        <div class="sg-card__badge-row">
          <${CategoryBadge} session=${session} size="sm" />
        </div>
        <button
          class="sg-card__title sg-card__title-btn"
          type="button"
          onclick=${(e) => { e.stopPropagation(); handleClick(); }}
          daa-ll=${cardDaaLl}
        >${session.title}</button>
        <div class="sg-card__footer">
          <span class="sg-card__track sg-card__track--footer" style=${'color:' + trackColor}>${session.primaryTrack}</span>
          <span class="sg-card__footer-badge"><${CategoryBadge} session=${session} size="sm" /></span>
          <span class="sg-card__time">${timeLabel}</span>
        </div>
      </div>
      <div class="sg-card__actions" data-time=${timeLabel} onclick=${(e) => e.stopPropagation()} ontouchend=${handleActionsTouchEnd}>
        ${forceOnDemand && html`<${IconButton}
          variant="solid"
          context="on-dark"
          size="md"
          extraClass="sg-card__btn--play"
          label=${`Play ${session.title}`}
          onclick=${handlePlay}
          daaLl=${'Watch-Now'}
        >
          <${IconPlay} />
        </${IconButton}>`}
        ${!forceOnDemand && !onDemand && schedulingEnabled && html`<${IconButton}
          variant="solid"
          context="on-dark"
          size="md"
          extraClass="sg-card__btn--schedule"
          label=${isScheduled ? `Remove ${session.title} from schedule` : `Add ${session.title} to schedule`}
          onclick=${handleSchedule}
          pressed=${isScheduled}
          disabled=${isPending}
          daaLl=${isScheduled ? 'Remove-from-Schedule' : 'Add-to-Schedule'}
        >
          ${isScheduled ? html`<${IconCalendarCheck} />` : html`<${IconCalendarPlus} />`}
        </${IconButton}>`}
        ${favoritingEnabled && html`<${IconButton}
          variant="solid"
          context="on-dark"
          size="md"
          extraClass="sg-card__btn--favorite"
          label=${isFavorited ? `Remove ${session.title} from favorites` : `Add ${session.title} to favorites`}
          onclick=${handleFavorite}
          pressed=${isFavorited}
          disabled=${isPending}
          daaLl=${isFavorited ? 'Remove-from-Favorites' : 'Add-to-Favorites'}
        >
          ${isFavorited ? html`<${IconHeartFilled} />` : html`<${IconHeartOutline} />`}
        </${IconButton}>`}
      </div>
    </div>
  `;
}
