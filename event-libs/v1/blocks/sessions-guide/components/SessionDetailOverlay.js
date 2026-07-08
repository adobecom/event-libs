import { html, useState } from '../../../deps/htm-preact.js';
import { IconButton } from './IconButton.js';
import { useSessionGuide } from '../store/index.js';
import { formatSessionTime, formatShortTime, getNowMs } from '../utils/time.js';
import { scheduleAction, favoriteAction } from '../services/session-actions.js';
import { deriveSessionState } from '../utils/session-state.js';
import { setSessionParam } from '../utils/url.js';

export function SessionDetailOverlay({ onBack }) {
  const { state, dispatch } = useSessionGuide();
  const {
    sessions, activeSessionId, scheduled, favorited, pendingActions,
    liveStreamActiveIds, eventConfig,
  } = state;
  const { userTz, trackIcons } = eventConfig;

  const [descExpanded, setDescExpanded] = useState(false);

  const session = sessions.find((s) => s.id === activeSessionId);
  if (!session) return null;

  const nowMs = getNowMs();
  const sessionState = deriveSessionState(session, liveStreamActiveIds, nowMs);
  const isScheduled = scheduled.has(session.id);
  const isFavorited = favorited.has(session.id);
  const isPending = pendingActions.has(session.id);
  const isLive = sessionState === 'live';
  const onDemand = sessionState === 'on-demand';
  const recordingComing = onDemand && session.inPerson && !session.videoAvailable;
  // Live / on-demand sessions surface "Watch now"; upcoming sessions surface "Add to schedule".
  const showWatch = isLive || onDemand;

  const trackIcon = (trackIcons && trackIcons[session.track]) || '';
  const startShort = session.startTimeUtc ? formatShortTime(session.startTimeUtc, userTz) : '';
  const endShort = session.endTimeUtc ? formatShortTime(session.endTimeUtc, userTz) : '';
  const timeRange = showWatch && !endShort
    ? formatSessionTime(session.startTimeUtc, userTz)
    : [startShort, endShort].filter(Boolean).join(' – ');

  async function handleSchedule(e) {
    e.stopPropagation();
    await scheduleAction(session, state, dispatch);
  }

  async function handleFavorite(e) {
    e.stopPropagation();
    await favoriteAction(session, state, dispatch);
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
        dispatch({ type: 'SHOW_TOAST', message: 'Link copied', variant: 'positive' });
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
    ['Content category', session.category],
    ['Audience', session.audience],
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
                    ${trackIcon && html`<img class="sg-detail__channel-icon" src=${trackIcon} alt="" aria-hidden="true" />`}
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
                          class=${'sg-detail__btn sg-detail__btn--primary sg-detail__btn--watch' + (session.watchUrl ? '' : ' is-disabled')}
                          href=${session.watchUrl || undefined}
                          aria-disabled=${session.watchUrl ? undefined : 'true'}
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
                  >
                    ${isFavorited
                      ? html`<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"><path d="M8.61426 17.5195C9.02246 17.8398 9.51123 18 10 18C10.4888 18 10.9781 17.8398 11.3858 17.5195C12.9732 16.2734 16.5908 13.0039 17.7603 11.0908C18.6929 9.56543 19.0132 7.67773 18.6172 6.04199C18.2774 4.63769 17.4551 3.50488 16.2393 2.76367C14.9116 1.95409 13.2705 1.79003 11.959 2.34179C11.2647 2.63183 10.5698 3.1416 9.99171 3.77148C9.42628 3.17773 8.72316 2.65234 8.063 2.35058C6.78419 1.7666 5.13526 1.9248 3.76124 2.76367C2.54493 3.50488 1.72266 4.63769 1.38282 6.04199C0.98682 7.67773 1.30713 9.56543 2.23975 11.0908C3.41162 13.0078 7.02832 16.2754 8.61426 17.5195Z" fill="currentColor"/></svg>`
                      : html`<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"><path d="M10 18C9.51124 18 9.02247 17.8398 8.61427 17.5195C7.02833 16.2754 3.41163 13.0078 2.23976 11.0908C1.30714 9.56542 0.986826 7.67772 1.38283 6.04198C1.72267 4.63768 2.54494 3.50487 3.76125 2.76366C5.13527 1.92479 6.7842 1.76659 8.06301 2.35057C8.72317 2.65233 9.42629 3.17772 9.99172 3.77147C10.5698 3.14159 11.2647 2.63182 11.959 2.34178C13.2705 1.79002 14.9116 1.95408 16.2393 2.76366C17.4551 3.50487 18.2774 4.63768 18.6172 6.04198C19.0132 7.67772 18.6929 9.56542 17.7603 11.0908C16.5908 13.0039 12.9732 16.2734 11.3858 17.5195C10.9781 17.8398 10.4888 18 10 18ZM6.38722 3.49901C5.78077 3.49901 5.13185 3.68456 4.54201 4.04491C3.67287 4.57421 3.08498 5.38671 2.84084 6.39452C2.53615 7.65233 2.79006 9.11522 3.51906 10.3076C4.47218 11.8662 7.66847 14.8711 9.54006 16.3398C9.81057 16.5527 10.189 16.5527 10.4595 16.3398C12.333 14.8691 15.5298 11.8633 16.4805 10.3076C17.21 9.11523 17.4639 7.65234 17.1592 6.39452C16.9151 5.38671 16.3272 4.57421 15.4585 4.04491C14.5327 3.48046 13.4136 3.35839 12.5386 3.7246C11.8565 4.01073 11.1055 4.6621 10.6245 5.38476C10.3462 5.80273 9.65385 5.80273 9.37553 5.38476C8.94047 4.73144 8.12651 4.02929 7.43998 3.71581C7.12162 3.5703 6.7627 3.49901 6.38722 3.49901Z" fill="currentColor"/></svg>`
                    }
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
                    <a class="sg-detail__resource-card" href=${r.url} target="_blank" rel="noopener noreferrer">
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
    ? html`<img class="sg-detail__speaker-photo" src=${sp.photo} alt="" />`
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
