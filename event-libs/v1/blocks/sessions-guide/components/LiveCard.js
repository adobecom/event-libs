import { html } from '../../../deps/htm-preact.js';
import { useSessionGuide } from '../store/index.js';
import { formatShortTime, getNowMs } from '../utils/time.js';
import { deriveSessionState } from '../utils/session-state.js';
import { scheduleAction, favoriteAction } from '../services/session-actions.js';
import { setSessionParam } from '../utils/url.js';
import { CategoryBadge } from './CategoryBadge.js';

function formatDuration(ms) {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (h > 0 && m >= 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export const buildLiveCard = () => LiveCard;

export function LiveCard({ session, variant = 'live' }) {
  const { state, dispatch } = useSessionGuide();
  const { scheduled, favorited, eventConfig } = state;
  const pendingActions = state.pendingActions || new Set();
  const liveStreamActiveIds = state.liveStreamActiveIds || new Set();
  const { userTz, trackColors, surface } = eventConfig;

  const isScheduled = scheduled.has(session.id);
  const isFavorited = favorited.has(session.id);
  const isPending = pendingActions.has(session.id);

  const nowMs = getNowMs();
  const sessionState = deriveSessionState(session, liveStreamActiveIds, nowMs);

  const startMs = Date.parse(session.startTimeUtc);
  const endMs = Date.parse(session.endTimeUtc);
  const duration = endMs - startMs;
  const elapsed = Math.min(Math.max(nowMs - startMs, 0), duration);
  const progressPct = duration > 0 ? Math.round((elapsed / duration) * 100) : 0;
  const durationLabel = duration >= 0 ? formatDuration(duration) : '';

  const trackColor = (trackColors && trackColors[session.track]) || '';
  const startTime = formatShortTime(session.startTimeUtc, userTz);
  const endTime = session.endTimeUtc ? formatShortTime(session.endTimeUtc, userTz) : '';
  const timeRange = endTime ? `${startTime} – ${endTime}` : startTime;

  const cardClass = [
    'sg-live-card',
    isScheduled ? 'is-scheduled' : '',
    isFavorited ? 'is-favorited' : '',
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

  const watchHref = session.watchUrl || session.sessionPageUrl;

  let primaryCta;
  if (variant === 'featured') {
    if (sessionState === 'upcoming') {
      primaryCta = html`<button
        class=${'sg-live-card__btn sg-live-card__btn--watch' + (isScheduled ? ' is-scheduled' : '') + (isPending ? ' is-pending' : '')}
        onclick=${handleSchedule}
        disabled=${isPending}
        type="button"
      >${isScheduled
          ? html`<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"><path d="M7.86427 15.7344C7.64161 15.7344 7.43068 15.6357 7.2881 15.4648L3.54103 10.9668C3.27541 10.6484 3.31935 10.1748 3.63673 9.91015C3.95411 9.64453 4.42677 9.68652 4.69337 10.0059L7.84669 13.792L15.2861 4.32323C15.542 3.99706 16.0147 3.94139 16.3389 4.19628C16.665 4.45214 16.7217 4.92382 16.4658 5.24901L8.4541 15.4473C8.31445 15.626 8.10156 15.7314 7.875 15.7344L7.86427 15.7344Z" fill="currentColor"/></svg>Added to schedule`
          : html`<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"><path d="M8.64355 16.5H4.25C3.83643 16.5 3.5 16.1636 3.5 15.75V8.5H16.5V8.64355C16.5 9.05761 16.8359 9.39355 17.25 9.39355C17.6641 9.39355 18 9.05761 18 8.64355V5.25C18 4.00928 16.9907 3 15.75 3H13.75V2C13.75 1.58594 13.4141 1.25 13 1.25C12.5859 1.25 12.25 1.58594 12.25 2V3H7.75V2C7.75 1.58594 7.41406 1.25 7 1.25C6.58594 1.25 6.25 1.58594 6.25 2V3H4.25C3.00928 3 2 4.00928 2 5.25V15.75C2 16.9907 3.00928 18 4.25 18H8.64355C9.05761 18 9.39355 17.6641 9.39355 17.25C9.39355 16.8359 9.05761 16.5 8.64355 16.5ZM4.25 4.5H6.25V5C6.25 5.41406 6.58594 5.75 7 5.75C7.41406 5.75 7.75 5.41406 7.75 5V4.5H12.25V5C12.25 5.41406 12.5859 5.75 13 5.75C13.4141 5.75 13.75 5.41406 13.75 5V4.5H15.75C16.1636 4.5 16.5 4.83643 16.5 5.25V7H3.5V5.25C3.5 4.83643 3.83643 4.5 4.25 4.5Z" fill="currentColor"/><path d="M15 10.5C12.5147 10.5 10.5 12.5147 10.5 15C10.5 17.4853 12.5147 19.5 15 19.5C17.4853 19.5 19.5 17.4853 19.5 15C19.5 12.5147 17.4853 10.5 15 10.5ZM17.5 15.625H15.625V17.5C15.625 17.8452 15.3452 18.125 15 18.125C14.6548 18.125 14.375 17.8452 14.375 17.5V15.625H12.5C12.1548 15.625 11.875 15.3452 11.875 15C11.875 14.6648 12.1548 14.375 12.5 14.375H14.375V12.5C14.375 12.1548 14.6548 11.875 15 11.875C15.3452 11.875 15.625 12.1548 15.625 12.5V14.375H17.5C17.8452 14.375 18.125 14.6648 18.125 15C18.125 15.3452 17.8452 15.625 17.5 15.625Z" fill="currentColor"/></svg>Add to schedule`
        }</button>`;
    } else if (sessionState === 'on-demand' && watchHref) {
      primaryCta = html`<button
        class="sg-live-card__btn sg-live-card__btn--watch"
        onclick=${(e) => { e.stopPropagation(); window.location.href = watchHref; }}
        type="button"
      ><svg class="sg-live-card__play-icon" width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"><path d="M4.74902 18.004C4.35107 18.004 3.95361 17.8966 3.5957 17.6827C2.90966 17.2726 2.5 16.5499 2.5 15.7511V4.24912C2.5 3.45029 2.90967 2.72764 3.5957 2.31748C4.28125 1.9083 5.11084 1.88779 5.81494 2.26768L16.5161 8.01866C17.2466 8.41124 17.7002 9.171 17.7002 10.0001C17.7002 10.8292 17.2466 11.589 16.5161 11.9816L5.81494 17.7325C5.47851 17.9142 5.11328 18.004 4.74902 18.004ZM4.75244 3.49619C4.57422 3.49619 4.43408 3.56455 4.36523 3.60557C4.25537 3.671 4 3.86534 4 4.24912V15.7511C4 16.1349 4.25537 16.3292 4.36523 16.3946C4.47509 16.4601 4.7666 16.5929 5.10498 16.4122L15.8057 10.6612C16.1616 10.4688 16.2002 10.1349 16.2002 10.0001C16.2002 9.86533 16.1616 9.53134 15.8057 9.33896L5.10498 3.58799C4.97852 3.52061 4.85889 3.49619 4.75244 3.49619Z" fill="currentColor"/></svg>Watch on demand</button>`;
    }
  } else if (session.watchUrl) {
    primaryCta = html`<button
      class="sg-live-card__btn sg-live-card__btn--watch"
      onclick=${(e) => { e.stopPropagation(); window.location.href = session.watchUrl; }}
      type="button"
    ><svg class="sg-live-card__play-icon" width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"><path d="M4.74902 18.004C4.35107 18.004 3.95361 17.8966 3.5957 17.6827C2.90966 17.2726 2.5 16.5499 2.5 15.7511V4.24912C2.5 3.45029 2.90967 2.72764 3.5957 2.31748C4.28125 1.9083 5.11084 1.88779 5.81494 2.26768L16.5161 8.01866C17.2466 8.41124 17.7002 9.171 17.7002 10.0001C17.7002 10.8292 17.2466 11.589 16.5161 11.9816L5.81494 17.7325C5.47851 17.9142 5.11328 18.004 4.74902 18.004ZM4.75244 3.49619C4.57422 3.49619 4.43408 3.56455 4.36523 3.60557C4.25537 3.671 4 3.86534 4 4.24912V15.7511C4 16.1349 4.25537 16.3292 4.36523 16.3946C4.47509 16.4601 4.7666 16.5929 5.10498 16.4122L15.8057 10.6612C16.1616 10.4688 16.2002 10.1349 16.2002 10.0001C16.2002 9.86533 16.1616 9.53134 15.8057 9.33896L5.10498 3.58799C4.97852 3.52061 4.85889 3.49619 4.75244 3.49619Z" fill="currentColor"/></svg>Watch now</button>`;
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
            ${html`<${CategoryBadge} category=${session.category} />`}
          </div>
          <p class="sg-live-card__time">${timeRange}</p>
        </div>
        <p class="sg-live-card__title">${session.title}</p>
        <p class="sg-live-card__desc">${session.description}</p>
        <div class="sg-live-card__actions">
          ${primaryCta}
          <button
            class=${'sg-live-card__btn sg-live-card__btn--schedule' + (isScheduled ? ' is-scheduled' : '') + (isPending ? ' is-pending' : '')}
            onclick=${handleSchedule}
            aria-label=${isScheduled ? 'Remove from schedule' : 'Add to schedule'}
            aria-pressed=${String(isScheduled)}
            disabled=${isPending}
            type="button"
          ></button>
          <button
            class=${'sg-live-card__btn sg-live-card__btn--favorite' + (isFavorited ? ' is-favorited' : '') + (isPending ? ' is-pending' : '')}
            onclick=${handleFavorite}
            aria-label=${isFavorited ? 'Remove from favorites' : 'Add to favorites'}
            aria-pressed=${String(isFavorited)}
            disabled=${isPending}
            type="button"
          >${isFavorited
            ? html`<svg class="sg-live-card__favorite-icon" width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"><path d="M8.61426 17.5195C9.02246 17.8398 9.51123 18 10 18C10.4888 18 10.9781 17.8398 11.3858 17.5195C12.9732 16.2734 16.5908 13.0039 17.7603 11.0908C18.6929 9.56543 19.0132 7.67773 18.6172 6.04199C18.2774 4.63769 17.4551 3.50488 16.2393 2.76367C14.9116 1.95409 13.2705 1.79003 11.959 2.34179C11.2647 2.63183 10.5698 3.1416 9.99171 3.77148C9.42628 3.17773 8.72316 2.65234 8.063 2.35058C6.78419 1.7666 5.13526 1.9248 3.76124 2.76367C2.54493 3.50488 1.72266 4.63769 1.38282 6.04199C0.98682 7.67773 1.30713 9.56543 2.23975 11.0908C3.41162 13.0078 7.02832 16.2754 8.61426 17.5195Z" fill="currentColor"/></svg>`
            : html`<svg class="sg-live-card__favorite-icon" width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"><path d="M10.0012 18.0013C9.51243 18.0013 9.02361 17.8411 8.61537 17.5208C7.02929 16.2765 3.41226 13.0087 2.24028 11.0915C1.30757 9.56597 0.987233 7.67809 1.38327 6.0422C1.72314 4.63777 2.54549 3.50486 3.76191 2.76358C5.13605 1.92463 6.78514 1.76642 8.06406 2.35045C8.72428 2.65224 9.42747 3.17768 9.99295 3.77148C10.5711 3.14154 11.266 2.63173 11.9604 2.34166C13.2721 1.78985 14.9133 1.95392 16.2411 2.76358C17.457 3.50486 18.2794 4.63777 18.6192 6.0422C19.0153 7.67809 18.6949 9.56597 17.7622 11.0915C16.5927 13.0048 12.9747 16.2746 11.3871 17.5208C10.9794 17.8411 10.4901 18.0013 10.0012 18.0013ZM6.38812 3.499C5.78161 3.499 5.13263 3.68456 4.54274 4.04495C3.67352 4.5743 3.08558 5.38687 2.84141 6.39477C2.5367 7.6527 2.79063 9.11572 3.5197 10.3082C4.4729 11.867 7.66949 14.8721 9.54125 16.341C9.81178 16.5539 10.1902 16.5539 10.4608 16.341C12.3345 14.8702 15.5316 11.864 16.4823 10.3082C17.2119 9.11573 17.4658 7.65271 17.1611 6.39477C16.9169 5.38687 16.329 4.5743 15.4603 4.04495C14.5344 3.48045 13.4152 3.35836 12.5401 3.72461C11.8579 4.01076 11.1068 4.66219 10.6258 5.38492C10.3475 5.80293 9.65505 5.80293 9.3767 5.38492C8.9416 4.73154 8.12757 4.02933 7.44098 3.71582C7.12259 3.57029 6.76363 3.499 6.38812 3.499Z" fill="currentColor"/></svg>`
          }<span class="sg-live-card__btn-label">${isFavorited ? 'Favorited' : 'Favorite'}</span></button>
        </div>
      </div>
    </div>
  `;
}
