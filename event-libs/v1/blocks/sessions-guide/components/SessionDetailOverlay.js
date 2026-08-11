import { html, useState } from '../../../deps/htm-preact.js';
import { IconButton } from './IconButton.js';
import { useSessionGuide } from '../store/index.js';
import { formatSessionTime, formatShortTime, getNowMs } from '../utils/time.js';
import {
  sessions, scheduled, favorited, pendingActions, liveStreamActiveIds, sessionStateVersion,
} from '../../../utils/session-store.js';
import { scheduleWithFeedback, favoriteWithFeedback } from '../../../services/sessions/action-feedback.js';
import { showToast } from '../../../features/toast/toast.js';
import { deriveSessionState, getWatchDestination } from '../../../utils/session-state.js';
import { setSessionParam, clearSessionParams, safeUrl, isSamePage } from '../utils/url.js';
import { IconHeartFilled, IconHeartOutline } from './icons.js';
import { Icon } from '../../../features/icons/Icon.js';
import { getTrackIcon } from '../../../utils/tier-1-event-config.js';

export function SessionDetailOverlay({ onBack }) {
  const { state, dispatch } = useSessionGuide();
  const { activeSessionId, guideConfig } = state;
  const { userTz } = guideConfig;

  const [descExpanded, setDescExpanded] = useState(false);

  const session = sessions.value.find((s) => s.id === activeSessionId);
  if (!session) return null;

  // Read purely to establish a re-render dependency on time-driven session-state
  // transitions (see sessionStateVersion in session-store.js) — value itself is unused.
  // eslint-disable-next-line no-unused-expressions
  sessionStateVersion.value;
  const nowMs = getNowMs();
  const sessionState = deriveSessionState(session, liveStreamActiveIds.value, nowMs);
  const isScheduled = scheduled.value.has(session.id);
  const isFavorited = favorited.value.has(session.id);
  const isPending = pendingActions.value.has(session.id);
  const isLive = sessionState === 'live';
  const onDemand = sessionState === 'on-demand';
  const recordingComing = onDemand && session.inPerson && !session.videoAvailable;
  const watchHref = safeUrl(getWatchDestination(session, sessionState));
  // Live / on-demand sessions surface "Watch now" (disabled if there's no real
  // destination); upcoming sessions surface "Add to schedule".
  const showWatch = isLive || onDemand;

  function handleWatch(e) {
    // Already on the destination page (e.g. the widget is embedded on the homepage/broadcast
    // page itself) — close the widget instead of reloading the page out from under the player.
    if (isSamePage(watchHref)) {
      e.preventDefault();
      dispatch({ type: 'CLOSE_DRAWER' });
      history.pushState({}, '', clearSessionParams());
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  const trackIconName = getTrackIcon(session.track)?.icon || '';
  const startShort = session.startTimeUtc ? formatShortTime(session.startTimeUtc, userTz) : '';
  const endShort = session.endTimeUtc ? formatShortTime(session.endTimeUtc, userTz) : '';
  const timeRange = showWatch && !endShort
    ? formatSessionTime(session.startTimeUtc, userTz)
    : [startShort, endShort].filter(Boolean).join(' – ');

  async function handleSchedule(e) {
    e.stopPropagation();
    await scheduleWithFeedback(session, { eventConfig: guideConfig, isScheduled });
  }

  async function handleFavorite(e) {
    e.stopPropagation();
    await favoriteWithFeedback(session, { eventConfig: guideConfig, isFavorited });
  }

  async function handleShare(e) {
    e.stopPropagation();
    const slug = session.slug || session.id;
    const rfCode = session.rfCode || session.id;
    const shareUrl = window.location.origin + setSessionParam(`${slug}-${rfCode}`);
    try {
      if (navigator.share) {
        await navigator.share({ title: session.title, url: shareUrl });
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
        showToast({ message: 'Link copied', variant: 'positive' });
      }
    } catch (err) {
      // Swallow the user-cancelled share dialog; log anything else.
      if (err?.name !== 'AbortError') {
        window.lana?.log(`[sessions-guide] detail share failed: ${err.message}`);
      }
    }
  }

  const attrs = [
    ['Technical level', session.technicalLevel],
    ['Track', session.track],
    ['Content category', session.contentCategory?.join(', ')],
    ['Audience', session.audience?.join(', ')],
  ].filter(([, value]) => value);

  return html`
    <div class="sg-detail" role="region" aria-label="Session detail">
      <div class="sg-detail__body">
        <div class="sg-detail__back-wrap">
          <button class="sg-detail__back" onclick=${onBack} type="button" aria-label="Back to sessions list">
            <span class="sg-detail__back-icon" aria-hidden="true"></span>
            Back
          </button>
        </div>

        <div class="sg-detail__cols">
          <div class="sg-detail__col sg-detail__col--main">
            <div class="sg-detail__group sg-detail__group--summary">
              <div class="sg-detail__summary">
                <div class="sg-detail__summary-top">
                  <div class="sg-detail__channel">
                    ${trackIconName && html`<${Icon} name=${trackIconName} size=${20} className="sg-detail__channel-icon" />`}
                    <span class="sg-detail__channel-name">${session.track}</span>
                  </div>
                  ${timeRange && html`<span class="sg-detail__time">${timeRange}</span>`}
                </div>

                <h2 class="sg-detail__title">${session.title}</h2>

                ${recordingComing && html`<div class="sg-detail__recording-badge">Recording coming soon</div>`}

                <div class="sg-detail__actions">
                  ${showWatch
    ? html`
                        <a
                          class=${'sg-detail__btn sg-detail__btn--primary sg-detail__btn--watch' + (watchHref ? '' : ' is-disabled')}
                          href=${watchHref}
                          onclick=${handleWatch}
                          aria-disabled=${watchHref ? undefined : 'true'}
                          daa-ll="Watch-Now"
                        >
                          <span class="sg-detail__btn-icon sg-detail__btn-icon--play" aria-hidden="true"></span>
                          Watch now
                        </a>
                      `
    : html`
                        <button
                          class=${'sg-detail__btn sg-detail__btn--primary sg-detail__btn--schedule' + (isScheduled ? ' is-active' : '') + (isPending ? ' is-loading' : '')}
                          onclick=${handleSchedule}
                          disabled=${isPending}
                          aria-pressed=${String(isScheduled)}
                          daa-ll=${isScheduled ? 'Remove-from-Schedule' : 'Add-to-Schedule'}
                          type="button"
                        >
                          <span class=${'sg-detail__btn-icon ' + (isScheduled ? 'sg-detail__btn-icon--check' : 'sg-detail__btn-icon--plus')} aria-hidden="true"></span>
                          ${isScheduled ? 'Scheduled' : 'Add to schedule'}
                        </button>
                      `}

                  <${IconButton}
                    variant="outlined"
                    context="on-light"
                    size="lg"
                    extraClass="sg-detail__icon-btn--favorite"
                    label=${isFavorited ? 'Remove from favorites' : 'Add to favorites'}
                    onclick=${handleFavorite}
                    pressed=${isFavorited}
                    disabled=${isPending}
                    daaLl=${isFavorited ? 'Remove-from-Favorites' : 'Add-to-Favorites'}
                  >
                    ${isFavorited ? html`<${IconHeartFilled} />` : html`<${IconHeartOutline} />`}
                  </${IconButton}>

                  <button
                    class="sg-detail__icon-btn sg-detail__icon-btn--share"
                    onclick=${handleShare}
                    aria-label="Share this session"
                    type="button"
                  >
                    <span class="sg-detail__icon sg-detail__icon--share" aria-hidden="true"></span>
                  </button>
                </div>
              </div>

              ${session.description && html`
                <div class="sg-detail__details">
                  <h3 class="sg-detail__section-label">Session details</h3>
                  <div class=${'sg-detail__desc-wrap' + (descExpanded ? ' is-expanded' : '')}>
                    <p class="sg-detail__desc">${session.description}</p>
                  </div>
                  <button
                    class="sg-detail__more"
                    onclick=${() => setDescExpanded((v) => !v)}
                    type="button"
                    aria-expanded=${String(descExpanded)}
                  >
                    ${descExpanded ? 'Less' : 'More'}
                    <span class="sg-detail__more-icon" aria-hidden="true"></span>
                  </button>
                  ${attrs.length > 0 && html`
                    <dl class="sg-detail__attrs">
                      ${attrs.map(([label, value]) => html`
                        <div class="sg-detail__attr">
                          <dt>${label}:</dt>
                          <dd>${value}</dd>
                        </div>
                      `)}
                    </dl>
                  `}
                </div>
              `}
            </div>

            ${session.products?.length > 0 && html`
              <div class="sg-detail__group sg-detail__group--products">
                <h3 class="sg-detail__section-label">Featured products</h3>
                <div class="sg-detail__products">
                  ${session.products.map((p) => html`
                    <div class="sg-detail__product-card">
                      <span class="sg-detail__product-icon" aria-hidden="true"></span>
                      <span class="sg-detail__product-name">${p}</span>
                    </div>
                  `)}
                </div>
              </div>
            `}

            ${session.resources?.length > 0 && html`
              <div class="sg-detail__group sg-detail__group--resources">
                <h3 class="sg-detail__section-label">Session resources</h3>
                <div class="sg-detail__resources">
                  ${session.resources.map((r) => html`
                    <a class="sg-detail__resource-card" href=${safeUrl(r.url)} target="_blank" rel="noopener noreferrer">
                      <span class="sg-detail__resource-name">${r.title || r.label || r.url}</span>
                      <span class="sg-detail__resource-action">Download</span>
                    </a>
                  `)}
                </div>
              </div>
            `}

            ${session.copyrightDisclaimer && html`
              <p class="sg-detail__copyright">${session.copyrightDisclaimer}</p>
            `}
          </div>

          ${session.speakers?.length > 0 && html`
            <div class="sg-detail__col sg-detail__col--side">
              <div class="sg-detail__group sg-detail__group--speakers">
                <h3 class="sg-detail__section-label">
                  Speakers <span class="sg-detail__count">(${session.speakers.length})</span>
                </h3>
                <div class="sg-detail__speakers">
                  ${session.speakers.map((sp) => html`
                    <div class="sg-detail__speaker">
                      ${sp.photo
    ? html`<img class="sg-detail__speaker-photo" src=${sp.photo} alt=${sp.name} />`
    : html`<span class="sg-detail__speaker-photo sg-detail__speaker-photo--placeholder" aria-hidden="true"></span>`}
                      <div class="sg-detail__speaker-info">
                        <span class="sg-detail__speaker-name">${sp.name}</span>
                        ${sp.title && html`<span class="sg-detail__speaker-title">${sp.title}</span>`}
                      </div>
                    </div>
                  `)}
                </div>
              </div>
            </div>
          `}
        </div>
      </div>
    </div>
  `;
}
