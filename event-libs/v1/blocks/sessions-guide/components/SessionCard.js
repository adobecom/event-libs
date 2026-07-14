import { html, useState } from '../../../deps/htm-preact.js';
import { useSessionGuide } from '../store/index.js';
import { isSessionOnDemand, formatSessionTime, formatShortTime, formatDuration, getNowMs } from '../utils/time.js';
import { scheduled, favorited, pendingActions } from '../../../utils/session-store.js';
import { scheduleWithFeedback, favoriteWithFeedback } from '../../../services/sessions/action-feedback.js';
import { setSessionParam, safeUrl } from '../utils/url.js';
import { CategoryBadge } from './CategoryBadge.js';
import { IconButton } from './IconButton.js';
import { IconPlay, IconCalendarCheck, IconCalendarPlus, IconHeartFilled, IconHeartOutline } from './icons.js';

export const buildSessionCard = () => SessionCard;

export function SessionCard({ session, forceOnDemand = false, timeDisplay = 'duration' }) {
  const { state, dispatch } = useSessionGuide();
  const { eventConfig, activeView } = state;
  const dismissingIds = state.dismissingIds || new Set();
  const { userTz, surface, trackColors } = eventConfig;

  const isScheduled = scheduled.value.has(session.id);
  const isFavorited = favorited.value.has(session.id);
  const isPending = pendingActions.value.has(session.id);
  const [hoverAnim, setHoverAnim] = useState(null);
  const onDemandNatural = isSessionOnDemand(session, getNowMs());
  const onDemand = forceOnDemand || onDemandNatural;
  const trackColor = (trackColors && trackColors[session.track]) || '';

  const upcomingTimeLabel = (timeDisplay === 'duration' && session.endTimeUtc)
    ? formatDuration(session.startTimeUtc, session.endTimeUtc)
    : formatSessionTime(session.startTimeUtc, userTz);
  // eslint-disable-next-line no-nested-ternary
  const timeLabel = forceOnDemand
    ? 'ON DEMAND'
    : (onDemandNatural
      ? (session.inPerson && !session.videoAvailable ? 'Recording coming soon' : 'ON DEMAND')
      : upcomingTimeLabel);
  const endShort = (!onDemand && session.endTimeUtc) ? formatShortTime(session.endTimeUtc, userTz) : '';
  const timeRange = onDemand
    ? timeLabel
    : (endShort ? `${formatShortTime(session.startTimeUtc, userTz)} – ${endShort}` : timeLabel);

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
      () => scheduleWithFeedback(session, { eventConfig, isScheduled }),
    );
  }

  async function handleFavorite(e) {
    e.stopPropagation();
    await withDismissAnimation(
      e,
      activeView === 'my-favorites' && isFavorited,
      () => favoriteWithFeedback(session, { eventConfig, isFavorited }),
    );
  }

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
    const slug = session.slug || session.id;
    const rfCode = session.rfCode || session.id;
    history.pushState({}, '', setSessionParam(`${slug}-${rfCode}`));
  }

  return html`
    <div class=${cardClass} onclick=${handleClick} role="button" tabindex="0"
      onkeydown=${(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleClick(); } }}
      onmouseenter=${onMouseEnter} onmouseleave=${onMouseLeave}>
      <div class="sg-card__body">
        <div class="sg-card__badge-row">
          <${CategoryBadge} category=${session.category?.[0]} size="sm" />
        </div>
        <p class="sg-card__title">${session.title}</p>
        <p class="sg-card__desc">${session.description}</p>
        <div class="sg-card__footer">
          <span class="sg-card__track sg-card__track--footer" style=${'color:' + trackColor}>${session.track}</span>
          <span class="sg-card__footer-badge"><${CategoryBadge} category=${session.category?.[0]} size="sm" /></span>
          <span class="sg-card__time">${timeLabel}</span>
        </div>
      </div>
      <div class="sg-card__actions" data-time=${timeRange} onclick=${(e) => e.stopPropagation()} ontouchend=${handleActionsTouchEnd}>
        ${forceOnDemand && html`<${IconButton}
          variant="solid"
          context="on-dark"
          size="md"
          extraClass="sg-card__btn--play"
          label="Play session"
          onclick=${handlePlay}
        >
          <${IconPlay} />
        </${IconButton}>`}
        ${!forceOnDemand && !onDemand && html`<${IconButton}
          variant="solid"
          context="on-dark"
          size="md"
          extraClass="sg-card__btn--schedule"
          label=${isScheduled ? 'Remove from schedule' : 'Add to schedule'}
          onclick=${handleSchedule}
          pressed=${isScheduled}
          disabled=${isPending}
        >
          ${isScheduled ? html`<${IconCalendarCheck} />` : html`<${IconCalendarPlus} />`}
        </${IconButton}>`}
        <${IconButton}
          variant="solid"
          context="on-dark"
          size="md"
          extraClass="sg-card__btn--favorite"
          label=${isFavorited ? 'Remove from favorites' : 'Add to favorites'}
          onclick=${handleFavorite}
          pressed=${isFavorited}
          disabled=${isPending}
        >
          ${isFavorited ? html`<${IconHeartFilled} />` : html`<${IconHeartOutline} />`}
        </${IconButton}>
      </div>
    </div>
  `;
}
