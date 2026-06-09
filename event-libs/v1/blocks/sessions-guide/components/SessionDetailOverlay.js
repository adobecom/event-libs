import { addSession, removeSession, toggleSessionInterest } from '../services/rainfocus.js';
import { formatSessionTime, formatShortTime, getNowMs } from '../utils/time.js';
import { deriveSessionState } from '../utils/session-state.js';
import { setSessionParam } from '../utils/url.js';

export function buildSessionDetailOverlay(preact, store) {
  const { html, useState } = preact;
  const { useSessionGuide } = store;

  return function SessionDetailOverlay({ onBack }) {
    const { state, dispatch } = useSessionGuide();
    const {
      sessions, activeSessionId, scheduled, favorited, pendingActions,
      liveStreamActiveIds, isRegistered, eventConfig,
    } = state;
    const { userTz, rfApiProfileId, rfApiUrl, trackIcons } = eventConfig;

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
      if (isRegistered !== true) { dispatch({ type: 'SHOW_REG_PROMPT' }); return; }
      if (isPending) return;
      dispatch({ type: 'SET_PENDING', sessionId: session.id, pending: true });
      try {
        if (isScheduled) {
          // TODO: replace null credentials with real rfAuthToken/clientId from auth integration
          await removeSession(session.rfCode, null, null, rfApiProfileId, rfApiUrl);
          dispatch({ type: 'SCHEDULE_REMOVE', sessionId: session.id });
          dispatch({ type: 'SHOW_TOAST', message: 'Removed from schedule', variant: 'default' });
        } else {
          await addSession(session.rfCode, null, null, rfApiProfileId, rfApiUrl);
          dispatch({ type: 'SCHEDULE_ADD', sessionId: session.id });
          dispatch({ type: 'SHOW_TOAST', message: 'Added to schedule', variant: 'success' });
        }
      } catch (err) {
        window.lana?.log(`[sessions-guide] detail schedule failed: ${err.message}`);
        dispatch({ type: 'SHOW_TOAST', message: 'Something went wrong. Please try again.', variant: 'error' });
      } finally {
        dispatch({ type: 'SET_PENDING', sessionId: session.id, pending: false });
      }
    }

    async function handleFavorite(e) {
      e.stopPropagation();
      if (isRegistered !== true) { dispatch({ type: 'SHOW_REG_PROMPT' }); return; }
      if (isPending) return;
      dispatch({ type: 'SET_PENDING', sessionId: session.id, pending: true });
      try {
        // TODO: replace null credentials with real rfAuthToken/clientId from auth integration
        await toggleSessionInterest(session.rfCode, session.id, null, null, rfApiProfileId, rfApiUrl);
        dispatch({ type: isFavorited ? 'FAVORITE_REMOVE' : 'FAVORITE_ADD', sessionId: session.id });
        dispatch({ type: 'SHOW_TOAST', message: isFavorited ? 'Removed from favorites' : 'Added to favorites', variant: isFavorited ? 'default' : 'success' });
      } catch (err) {
        window.lana?.log(`[sessions-guide] detail favorite failed: ${err.message}`);
        dispatch({ type: 'SHOW_TOAST', message: 'Something went wrong. Please try again.', variant: 'error' });
      } finally {
        dispatch({ type: 'SET_PENDING', sessionId: session.id, pending: false });
      }
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
          dispatch({ type: 'SHOW_TOAST', message: 'Link copied', variant: 'success' });
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
        <div class="sg-detail__header">
          <button class="sg-detail__back" onclick=${onBack} type="button" aria-label="Back to sessions list">
            <span class="sg-detail__back-icon" aria-hidden="true"></span>
            Back
          </button>
        </div>

        <div class="sg-detail__body">
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

                <button
                  class=${'sg-detail__icon-btn sg-detail__icon-btn--favorite' + (isFavorited ? ' is-active' : '') + (isPending ? ' is-loading' : '')}
                  onclick=${handleFavorite}
                  disabled=${isPending}
                  aria-pressed=${String(isFavorited)}
                  aria-label=${isFavorited ? 'Remove from favorites' : 'Add to favorites'}
                  type="button"
                >
                  <span class="sg-detail__icon sg-detail__icon--heart" aria-hidden="true"></span>
                </button>

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

          ${session.speakers?.length > 0 && html`
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
          `}

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
      </div>
    `;
  };
}
