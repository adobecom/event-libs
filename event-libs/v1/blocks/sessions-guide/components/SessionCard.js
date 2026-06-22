import { html } from '../../../deps/htm-preact.js';
import { useSessionGuide } from '../store/index.js';
import { isSessionOnDemand, formatSessionTime, formatShortTime, getNowMs } from '../utils/time.js';
import { scheduleAction, favoriteAction } from '../services/session-actions.js';
import { setSessionParam } from '../utils/url.js';
import { CategoryBadge } from './CategoryBadge.js';
import { IconButton } from './IconButton.js';

export const buildSessionCard = () => SessionCard;

export function SessionCard({ session, forceOnDemand = false }) {
  const { state, dispatch } = useSessionGuide();
  const { scheduled, favorited, eventConfig } = state;
  const pendingActions = state.pendingActions || new Set();
  const { userTz, surface, trackColors } = eventConfig;

  const isScheduled = scheduled.has(session.id);
  const isFavorited = favorited.has(session.id);
  const isPending = pendingActions.has(session.id);
  const onDemandNatural = isSessionOnDemand(session, getNowMs());
  const onDemand = forceOnDemand || onDemandNatural;
  const trackColor = (trackColors && trackColors[session.track]) || '';

  // eslint-disable-next-line no-nested-ternary
  const timeLabel = forceOnDemand
    ? 'ON DEMAND'
    : (onDemandNatural
      ? (session.inPerson && !session.videoAvailable ? 'Recording coming soon' : 'On demand')
      : formatSessionTime(session.startTimeUtc, userTz));
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
  ].filter(Boolean).join(' ');

  async function handleSchedule(e) {
    e.stopPropagation();
    await scheduleAction(session, state, dispatch);
  }

  async function handleFavorite(e) {
    e.stopPropagation();
    await favoriteAction(session, state, dispatch);
  }

  function handlePlay(e) {
    e.stopPropagation();
    if (session.sessionPageUrl) window.location.href = session.sessionPageUrl;
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
        <div class="sg-card__badge-row">
          <${CategoryBadge} category=${session.category} size="sm" />
        </div>
        <p class="sg-card__title">${session.title}</p>
        <p class="sg-card__desc">${session.description}</p>
        <div class="sg-card__footer">
          <span class="sg-card__track sg-card__track--footer" style=${'color:' + trackColor}>${session.track}</span>
          <span class="sg-card__footer-badge"><${CategoryBadge} category=${session.category} size="sm" /></span>
          <span class="sg-card__time">${timeLabel}</span>
        </div>
      </div>
      <div class="sg-card__actions" data-time=${timeRange}>
        ${forceOnDemand && html`<${IconButton}
          variant="outlined"
          context="on-light"
          size="md"
          extraClass="sg-card__btn--play"
          label="Play session"
          onclick=${handlePlay}
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"><path d="M6.5 4L15.5 10L6.5 16V4Z" fill="currentColor"/></svg>
        </${IconButton}>`}
        ${!forceOnDemand && !onDemand && html`<${IconButton}
          variant="outlined"
          context="on-light"
          size="md"
          extraClass="sg-card__btn--schedule"
          label=${isScheduled ? 'Remove from schedule' : 'Add to schedule'}
          onclick=${handleSchedule}
          pressed=${isScheduled}
          disabled=${isPending}
        >
          ${isScheduled
            ? html`<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"><path d="M7.86427 15.7344C7.64161 15.7344 7.43068 15.6357 7.2881 15.4648L3.54103 10.9668C3.27541 10.6484 3.31935 10.1748 3.63673 9.91015C3.95411 9.64453 4.42677 9.68652 4.69337 10.0059L7.84669 13.792L15.2861 4.32323C15.542 3.99706 16.0147 3.94139 16.3389 4.19628C16.665 4.45214 16.7217 4.92382 16.4658 5.24901L8.4541 15.4473C8.31445 15.626 8.10156 15.7314 7.875 15.7344L7.86427 15.7344Z" fill="currentColor"/></svg>`
            : html`<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"><path d="M8.64355 16.5H4.25C3.83643 16.5 3.5 16.1636 3.5 15.75V8.5H16.5V8.64355C16.5 9.05761 16.8359 9.39355 17.25 9.39355C17.6641 9.39355 18 9.05761 18 8.64355V5.25C18 4.00928 16.9907 3 15.75 3H13.75V2C13.75 1.58594 13.4141 1.25 13 1.25C12.5859 1.25 12.25 1.58594 12.25 2V3H7.75V2C7.75 1.58594 7.41406 1.25 7 1.25C6.58594 1.25 6.25 1.58594 6.25 2V3H4.25C3.00928 3 2 4.00928 2 5.25V15.75C2 16.9907 3.00928 18 4.25 18H8.64355C9.05761 18 9.39355 17.6641 9.39355 17.25C9.39355 16.8359 9.05761 16.5 8.64355 16.5ZM4.25 4.5H6.25V5C6.25 5.41406 6.58594 5.75 7 5.75C7.41406 5.75 7.75 5.41406 7.75 5V4.5H12.25V5C12.25 5.41406 12.5859 5.75 13 5.75C13.4141 5.75 13.75 5.41406 13.75 5V4.5H15.75C16.1636 4.5 16.5 4.83643 16.5 5.25V7H3.5V5.25C3.5 4.83643 3.83643 4.5 4.25 4.5Z" fill="currentColor"/><path d="M15 10.5C12.5147 10.5 10.5 12.5147 10.5 15C10.5 17.4853 12.5147 19.5 15 19.5C17.4853 19.5 19.5 17.4853 19.5 15C19.5 12.5147 17.4853 10.5 15 10.5ZM17.5 15.625H15.625V17.5C15.625 17.8452 15.3452 18.125 15 18.125C14.6548 18.125 14.375 17.8452 14.375 17.5V15.625H12.5C12.1548 15.625 11.875 15.3452 11.875 15C11.875 14.6648 12.1548 14.375 12.5 14.375H14.375V12.5C14.375 12.1548 14.6548 11.875 15 11.875C15.3452 11.875 15.625 12.1548 15.625 12.5V14.375H17.5C17.8452 14.375 18.125 14.6648 18.125 15C18.125 15.3452 17.8452 15.625 17.5 15.625Z" fill="currentColor"/></svg>`
          }
        </${IconButton}>`}
        <${IconButton}
          variant="outlined"
          context="on-light"
          size="md"
          extraClass="sg-card__btn--favorite"
          label=${isFavorited ? 'Remove from favorites' : 'Add to favorites'}
          onclick=${handleFavorite}
          pressed=${isFavorited}
          disabled=${isPending}
        >
          ${isFavorited
            ? html`<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"><path d="M8.61426 17.5195C9.02246 17.8398 9.51123 18 10 18C10.4888 18 10.9781 17.8398 11.3858 17.5195C12.9732 16.2734 16.5908 13.0039 17.7603 11.0908C18.6929 9.56543 19.0132 7.67773 18.6172 6.04199C18.2774 4.63769 17.4551 3.50488 16.2393 2.76367C14.9116 1.95409 13.2705 1.79003 11.959 2.34179C11.2647 2.63183 10.5698 3.1416 9.99171 3.77148C9.42628 3.17773 8.72316 2.65234 8.063 2.35058C6.78419 1.7666 5.13526 1.9248 3.76124 2.76367C2.54493 3.50488 1.72266 4.63769 1.38282 6.04199C0.98682 7.67773 1.30713 9.56543 2.23975 11.0908C3.41162 13.0078 7.02832 16.2754 8.61426 17.5195Z" fill="currentColor"/></svg>`
            : html`<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"><path d="M10 18C9.51124 18 9.02247 17.8398 8.61427 17.5195C7.02833 16.2754 3.41163 13.0078 2.23976 11.0908C1.30714 9.56542 0.986826 7.67772 1.38283 6.04198C1.72267 4.63768 2.54494 3.50487 3.76125 2.76366C5.13527 1.92479 6.7842 1.76659 8.06301 2.35057C8.72317 2.65233 9.42629 3.17772 9.99172 3.77147C10.5698 3.14159 11.2647 2.63182 11.959 2.34178C13.2705 1.79002 14.9116 1.95408 16.2393 2.76366C17.4551 3.50487 18.2774 4.63768 18.6172 6.04198C19.0132 7.67772 18.6929 9.56542 17.7603 11.0908C16.5908 13.0039 12.9732 16.2734 11.3858 17.5195C10.9781 17.8398 10.4888 18 10 18ZM6.38722 3.49901C5.78077 3.49901 5.13185 3.68456 4.54201 4.04491C3.67287 4.57421 3.08498 5.38671 2.84084 6.39452C2.53615 7.65233 2.79006 9.11522 3.51906 10.3076C4.47218 11.8662 7.66847 14.8711 9.54006 16.3398C9.81057 16.5527 10.189 16.5527 10.4595 16.3398C12.333 14.8691 15.5298 11.8633 16.4805 10.3076C17.21 9.11523 17.4639 7.65234 17.1592 6.39452C16.9151 5.38671 16.3272 4.57421 15.4585 4.04491C14.5327 3.48046 13.4136 3.35839 12.5386 3.7246C11.8565 4.01073 11.1055 4.6621 10.6245 5.38476C10.3462 5.80273 9.65385 5.80273 9.37553 5.38476C8.94047 4.73144 8.12651 4.02929 7.43998 3.71581C7.12162 3.5703 6.7627 3.49901 6.38722 3.49901Z" fill="currentColor"/></svg>`
          }
        </${IconButton}>
      </div>
    </div>
  `;
}
