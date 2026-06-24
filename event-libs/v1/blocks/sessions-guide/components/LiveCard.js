import { html } from '../../../deps/htm-preact.js';
import { useSessionGuide } from '../store/index.js';
import { formatShortTime, getNowMs } from '../utils/time.js';
import { deriveSessionState } from '../utils/session-state.js';
import { scheduleAction, favoriteAction } from '../services/session-actions.js';
import { IconPlay, IconCalendarCheck, IconCalendarPlus, IconHeartFilled, IconHeartOutline } from './icons.js';
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
          ? html`<${IconCalendarCheck} />Added to schedule`
          : html`<${IconCalendarPlus} />Add to schedule`
        }</button>`;
    } else if (sessionState === 'on-demand' && watchHref) {
      primaryCta = html`<button
        class="sg-live-card__btn sg-live-card__btn--watch"
        onclick=${(e) => { e.stopPropagation(); window.location.href = watchHref; }}
        type="button"
      ><${IconPlay} />Watch on demand</button>`;
    }
  } else if (session.watchUrl) {
    primaryCta = html`<button
      class="sg-live-card__btn sg-live-card__btn--watch"
      onclick=${(e) => { e.stopPropagation(); window.location.href = session.watchUrl; }}
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
          >${isFavorited ? html`<${IconHeartFilled} />` : html`<${IconHeartOutline} />`
          }<span class="sg-live-card__btn-label">${isFavorited ? 'Favorited' : 'Favorite'}</span></button>
        </div>
      </div>
    </div>
  `;
}
