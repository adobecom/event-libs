import {
  html, useState, useEffect, useLayoutEffect, useRef,
} from '../../../../deps/htm-preact.js';
import { IconButton } from './IconButton.js';
import { useSessionGuide } from '../store/index.js';
import { formatSessionTime, formatShortTime, getNowMs } from '../utils/time.js';
import {
  sessions, scheduled, favorited, pendingActions, liveStreamActiveIds, sessionStateVersion,
  requestWatchSameSession,
} from '../../../../utils/session-store.js';
import { toggleScheduleWithFeedback, toggleFavoriteWithFeedback } from '../../../../services/sessions/action-feedback.js';
import { showToast } from '../../../../features/toast/toast.js';
import { deriveSessionState, getWatchDestination } from '../../../../utils/session-state.js';
import { setSessionParam, sessionParamValue, clearSessionParams, safeUrl, isSamePage } from '../utils/url.js';
import { sanitizedRichText } from '../utils/rich-text.js';
import {
  IconHeartFilled, IconHeartOutline, IconLinkOut, IconCalendarCheck, IconCalendarPlus,
} from './icons.js';
import { Icon } from '../../../../features/icons/Icon.js';
import { fetchFederalProductIcon, fetchFederalTrackIcon } from '../../../../features/icons/federal-icons.js';
import { getProduct } from '../../../../utils/tier-1-event-config.js';
import { resolveTrackBadge, resolveNamedTrackBadge } from '../utils/session-filters.js';
import { isBehaviorEnabled } from '../utils/behavior-flags.js';
import { scrollBehavior } from '../utils/motion.js';

// Collapsed list-pod lengths (Figma products 1325:141847, speakers 1325:141990).
const COLLAPSED_PRODUCTS = 6;
const COLLAPSED_SPEAKERS = 5;

// Desktop splits pods into two columns (1323:139140); tracked reactively so DOM order
// (used for tab order, not CSS `order`) always matches what's on screen.
const DESKTOP_QUERY = '(min-width: 1280px)';
const matchesDesktop = () => !!window.matchMedia?.(DESKTOP_QUERY).matches;

function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(matchesDesktop);
  useEffect(() => {
    const mq = window.matchMedia?.(DESKTOP_QUERY);
    if (!mq) return undefined;
    const onChange = (e) => setIsDesktop(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return isDesktop;
}

export function SessionDetailOverlay({ onBack }) {
  const { state, dispatch } = useSessionGuide();
  const { activeSessionId, guideConfig } = state;
  const { userTz } = guideConfig;

  const [descExpanded, setDescExpanded] = useState(false);
  const [productsExpanded, setProductsExpanded] = useState(false);
  const [speakersExpanded, setSpeakersExpanded] = useState(false);
  const isDesktop = useIsDesktop();

  // On open, move focus to Back before paint (pre-empts the browser's own blur-to-<body>
  // fixup); on unmount (Back), restore focus to whatever was focused before this opened.
  const backBtnRef = useRef(null);
  useLayoutEffect(() => {
    const previouslyFocused = document.activeElement;
    backBtnRef.current?.focus({ preventScroll: true });
    return () => {
      if (previouslyFocused?.focus && document.contains(previouslyFocused)) {
        previouslyFocused.focus({ preventScroll: true });
      }
    };
  }, []);

  const session = sessions.value.find((s) => s.id === activeSessionId);
  if (!session) return null;

  // Establishes a re-render dependency on time-driven session-state transitions.
  // eslint-disable-next-line no-unused-expressions
  sessionStateVersion.value;
  const nowMs = getNowMs();
  const sessionState = deriveSessionState(session, liveStreamActiveIds.value, nowMs);
  const isScheduled = scheduled.value.has(session.id);
  const isFavorited = favorited.value.has(session.id);
  const isPending = pendingActions.value.has(session.id);
  const schedulingEnabled = isBehaviorEnabled(guideConfig, 'enableScheduling');
  const favoritingEnabled = isBehaviorEnabled(guideConfig, 'enableFavoriting');
  const watchNowEnabled = isBehaviorEnabled(guideConfig, 'enableWatchNowCtas');
  const isLive = sessionState === 'live';
  const onDemand = sessionState === 'on-demand';
  const watchHref = safeUrl(getWatchDestination(session, sessionState));
  // Live/on-demand sessions show "Watch now"; upcoming shows "Add to schedule". Either can
  // be disabled entirely via behaviorFlags.
  const showWatch = isLive || onDemand;
  const showWatchCta = showWatch && watchNowEnabled;
  const showScheduleCta = !showWatch && schedulingEnabled;

  function handleWatch(e) {
    // Already on the destination page — close the widget and ask it to switch instead of
    // reloading the page out from under the player.
    if (isLive && isSamePage(watchHref)) {
      e.preventDefault();
      requestWatchSameSession(session.id);
      dispatch({ type: 'CLOSE_DRAWER' });
      history.pushState({}, '', clearSessionParams());
      window.scrollTo({ top: 0, behavior: scrollBehavior() });
    }
  }

  const trackBadge = resolveTrackBadge(session);
  // Primary/override track + additional tracks render as two full rows (Figma's "Status
  // tag"); stackedTracks[0] is always trackBadge itself.
  const stackedTrackBadges = trackBadge?.stackedTracks?.map(
    (name, i) => (i === 0 ? trackBadge : resolveNamedTrackBadge(name)),
  ).filter(Boolean);
  const startShort = session.startTimeUtc ? formatShortTime(session.startTimeUtc, userTz) : '';
  const endShort = session.endTimeUtc ? formatShortTime(session.endTimeUtc, userTz) : '';
  const timeRange = showWatch && !endShort
    ? formatSessionTime(session.startTimeUtc, userTz)
    : [startShort, endShort].filter(Boolean).join(' – ');

  async function handleSchedule(e) {
    e.stopPropagation();
    await toggleScheduleWithFeedback(session, { eventConfig: guideConfig, isScheduled });
  }

  async function handleFavorite(e) {
    e.stopPropagation();
    await toggleFavoriteWithFeedback(session, { eventConfig: guideConfig, isFavorited });
  }

  async function handleShare(e) {
    e.stopPropagation();
    const shareUrl = window.location.origin + setSessionParam(sessionParamValue(session));
    try {
      // Explicit check: optional-chaining past a missing clipboard API would resolve
      // `await undefined` and still show the success toast.
      if (!navigator.clipboard) throw new Error('Clipboard API unavailable');
      await navigator.clipboard.writeText(shareUrl);
      showToast({ message: 'Link copied!', variant: 'positive' });
    } catch (err) {
      window.lana?.log(`[sessions-guide] detail share failed: ${err.message}`);
    }
  }

  // Fixed order, per design. A row simply doesn't render until its attribute is authored.
  const attrs = [
    ['Technical level', session.technicalLevel],
    ['Track', session.tracks?.join(', ')],
    ['AI focus', session.aiFocus?.join(', ')],
    ['Audience', session.audience?.join(', ')],
    ['Category', session.contentCategory?.join(', ')],
  ].filter(([, value]) => value);

  const products = session.products || [];
  const speakers = session.speakers || [];
  const shownProducts = productsExpanded ? products : products.slice(0, COLLAPSED_PRODUCTS);
  const shownSpeakers = speakersExpanded ? speakers : speakers.slice(0, COLLAPSED_SPEAKERS);

  // Shared "Show more"/"Show less" toggle for the list pods.
  const showMoreToggle = (expanded, setExpanded, label, controls) => html`
    <button
      class="sg-detail__more"
      onclick=${() => setExpanded((v) => !v)}
      type="button"
      aria-expanded=${String(expanded)}
      aria-controls=${controls}
    >
      <span class="sg-sr-only">${expanded ? `Show fewer ${label}` : `Show all ${label}`}</span>
      <span aria-hidden="true">${expanded ? 'Show less' : 'Show more'}</span>
      <span class="sg-detail__more-icon" aria-hidden="true"></span>
    </button>
  `;

  const summaryPod = html`
            <div class="sg-detail__group sg-detail__group--summary">
              <div class="sg-detail__summary">
                <div class="sg-detail__summary-top">
                  ${stackedTrackBadges?.length > 1 ? html`
                    <div class="sg-detail__channels sg-detail__channels--stacked">
                      ${stackedTrackBadges.map((badge) => html`
                        <div class="sg-detail__channel" key=${badge.label}>
                          <${Icon} name=${badge.icon} size=${16} resolve=${fetchFederalTrackIcon} className="sg-detail__channel-icon sg-detail__channel-icon--sm" />
                          <span class="sg-detail__channel-name">${badge.label}</span>
                        </div>
                      `)}
                    </div>
                  ` : trackBadge && html`
                    <div class="sg-detail__channel">
                      <${Icon} name=${trackBadge.icon} size=${20} resolve=${fetchFederalTrackIcon} className="sg-detail__channel-icon" />
                      <span class="sg-detail__channel-name">${trackBadge.label}</span>
                    </div>
                  `}
                  ${trackBadge && timeRange && html`<span class="sg-detail__meta-divider" aria-hidden="true"></span>`}
                  ${timeRange && html`<span class="sg-detail__time">${timeRange}</span>`}
                </div>

                <h2 class="sg-detail__title">${session.title}</h2>

                ${session.ipodOrGdprCopy && html`
                  <div
                    class="sg-detail__legal"
                    dangerouslySetInnerHTML=${{ __html: sanitizedRichText(session.ipodOrGdprCopy) }}
                  ></div>`}

                <div class="sg-detail__actions">
                  ${showWatchCta
    ? html`
                        <a
                          class=${'sg-detail__btn sg-detail__btn--primary sg-detail__btn--watch' + (watchHref ? '' : ' is-disabled')}
                          href=${watchHref}
                          onclick=${handleWatch}
                          aria-disabled=${watchHref ? undefined : 'true'}
                          daa-ll=${onDemand ? 'Watch-On-Demand' : 'Watch-Now'}
                        >
                          <span class="sg-detail__btn-icon sg-detail__btn-icon--play" aria-hidden="true"></span>
                          ${onDemand ? 'Watch on demand' : 'Watch now'}
                        </a>
                      `
    : showScheduleCta && html`
                        <button
                          class=${'sg-detail__btn sg-detail__btn--primary sg-detail__btn--schedule' + (isScheduled ? ' is-active' : '') + (isPending ? ' is-loading' : '')}
                          onclick=${handleSchedule}
                          disabled=${isPending}
                          aria-pressed=${String(isScheduled)}
                          daa-ll=${isScheduled ? 'Remove-from-Schedule' : 'Add-to-Schedule'}
                          type="button"
                        >
                          ${isScheduled ? html`<${IconCalendarCheck} />` : html`<${IconCalendarPlus} />`}
                          ${isScheduled ? 'Scheduled' : 'Add to schedule'}
                        </button>
                      `}

                  ${favoritingEnabled && html`<${IconButton}
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
                  </${IconButton}>`}

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
                  <div class=${'sg-detail__desc-wrap' + (descExpanded ? ' is-expanded' : '')} id="sg-detail-desc">
                    <p class="sg-detail__desc">${session.description}</p>
                  </div>
                  <button
                    class="sg-detail__more"
                    onclick=${() => setDescExpanded((v) => !v)}
                    type="button"
                    aria-expanded=${String(descExpanded)}
                    aria-controls="sg-detail-desc"
                  >
                    <span class="sg-sr-only">${descExpanded ? 'Show less of the session description' : 'Show more of the session description'}</span>
                    <span aria-hidden="true">${descExpanded ? 'Less' : 'More'}</span>
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
  `;

  const productsPod = products.length > 0 && html`
              <div class="sg-detail__group sg-detail__group--products">
                <h3 class="sg-detail__section-label">
                  Featured products ${products.length > COLLAPSED_PRODUCTS
    && html`<span class="sg-detail__count">(${products.length})</span>`}
                </h3>
                <div class="sg-detail__products" id="sg-detail-products">
                  ${shownProducts.map((p) => {
    const product = getProduct(p);
    const href = safeUrl(product?.pageUrl);
    const inner = html`
                      ${product?.icon
    ? html`<${Icon} name=${product.icon} size=${32} resolve=${fetchFederalProductIcon} className="sg-detail__product-icon" />`
    : html`<span class="sg-detail__product-icon sg-detail__product-icon--placeholder" aria-hidden="true"></span>`}
                      <span class="sg-detail__product-name">${p}</span>
                      ${href && html`<span class="sg-detail__product-linkout" aria-hidden="true"><${IconLinkOut} /></span>`}
                    `;
    return href
      ? html`<a class="sg-detail__product-card" href=${href} target="_blank" rel="noopener noreferrer" daa-ll="Featured-Product">${inner}</a>`
      : html`<div class="sg-detail__product-card">${inner}</div>`;
  })}
                </div>
                ${products.length > COLLAPSED_PRODUCTS
    && showMoreToggle(productsExpanded, setProductsExpanded, 'featured products', 'sg-detail-products')}
              </div>
  `;

  const speakersPod = speakers.length > 0 && html`
              <div class="sg-detail__group sg-detail__group--speakers">
                <h3 class="sg-detail__section-label">
                  Speakers ${speakers.length > COLLAPSED_SPEAKERS
    && html`<span class="sg-detail__count">(${speakers.length})</span>`}
                </h3>
                <div class="sg-detail__speakers" id="sg-detail-speakers">
                  ${shownSpeakers.map((sp) => html`
                    <div class="sg-detail__speaker">
                      ${sp.photo
    ? html`<img class="sg-detail__speaker-photo" src=${sp.photo} alt="" width="56" height="56" loading="lazy" decoding="async" />`
    : html`<span class="sg-detail__speaker-photo sg-detail__speaker-photo--placeholder" aria-hidden="true"></span>`}
                      <div class="sg-detail__speaker-info">
                        <span class="sg-detail__speaker-name">${sp.name}</span>
                        ${sp.title && html`<span class="sg-detail__speaker-title">${sp.title}</span>`}
                      </div>
                    </div>
                  `)}
                </div>
                ${speakers.length > COLLAPSED_SPEAKERS
    && showMoreToggle(speakersExpanded, setSpeakersExpanded, 'speakers', 'sg-detail-speakers')}
              </div>
  `;

  // Desktop splits into a wide main column and a 383px side column; narrower widths are
  // one stack in reading order. Order lives here, not CSS, so tab order matches the DOM.
  const pods = isDesktop
    ? html`
          <div class="sg-detail__col sg-detail__col--main">
            ${summaryPod}
          </div>
          <div class="sg-detail__col sg-detail__col--side">
            ${productsPod}
            ${speakersPod}
          </div>
        `
    : html`
          ${summaryPod}
          ${productsPod}
          ${speakersPod}
        `;

  return html`
    <div class="sg-detail" role="region" aria-label="Session detail">
      <div class="sg-detail__body">
        <div class="sg-detail__back-wrap">
          <button ref=${backBtnRef} class="sg-detail__back" onclick=${onBack} type="button" aria-label="Back to sessions list">
            <span class="sg-detail__back-icon" aria-hidden="true"></span>
            Back
          </button>
        </div>

        <div class=${'sg-detail__cols' + (isDesktop ? ' sg-detail__cols--split' : '')}>
          ${pods}
        </div>
      </div>
    </div>
  `;
}
