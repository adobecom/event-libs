import { html, useState, useEffect } from '../../../../deps/htm-preact.js';
import { IconButton } from './IconButton.js';
import { useSessionGuide } from '../store/index.js';
import { formatSessionTime, formatShortTime, getNowMs } from '../utils/time.js';
import {
  sessions, scheduled, favorited, pendingActions, liveStreamActiveIds, sessionStateVersion,
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
import { fetchFederalProductIcon } from '../../../../features/icons/federal-icons.js';
import { getProduct } from '../../../../utils/tier-1-event-config.js';
import { resolveTrackBadge } from '../utils/session-filters.js';
import { isBehaviorEnabled } from '../utils/behavior-flags.js';
import { scrollBehavior } from '../utils/motion.js';

// Collapsed lengths of the list pods, per the Figma frames (products 1325:141847,
// speakers 1325:141990). A pod only grows a "Show more" toggle when it actually has more
// than this.
const COLLAPSED_PRODUCTS = 6;
const COLLAPSED_SPEAKERS = 5;

// Only the desktop frame splits the pods into two columns (1323:139140). Tracked reactively
// — and used to pick the DOM order rather than CSS `order`, so tab order always follows what
// is on screen: summary → products → speakers when stacked, column by column when split.
// Same hook shape as FilterPanel.js's useIsMobile().
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
  const schedulingEnabled = isBehaviorEnabled(guideConfig, 'enableScheduling');
  const favoritingEnabled = isBehaviorEnabled(guideConfig, 'enableFavoriting');
  const watchNowEnabled = isBehaviorEnabled(guideConfig, 'enableWatchNowCtas');
  const isLive = sessionState === 'live';
  const onDemand = sessionState === 'on-demand';
  const watchHref = safeUrl(getWatchDestination(session, sessionState));
  // Live / on-demand sessions surface "Watch now" (disabled if there's no real
  // destination); upcoming sessions surface "Add to schedule". Either can be turned off
  // entirely via behaviorFlags — showWatchCta/showScheduleCta below gate on that too.
  const showWatch = isLive || onDemand;
  const showWatchCta = showWatch && watchNowEnabled;
  const showScheduleCta = !showWatch && schedulingEnabled;

  function handleWatch(e) {
    // Already on the destination page (e.g. the widget is embedded on the homepage/broadcast
    // page itself) — close the widget instead of reloading the page out from under the player.
    if (isSamePage(watchHref)) {
      e.preventDefault();
      dispatch({ type: 'CLOSE_DRAWER' });
      history.pushState({}, '', clearSessionParams());
      window.scrollTo({ top: 0, behavior: scrollBehavior() });
    }
  }

  // null for a session with neither a primary track nor an override — no "Other" badge,
  // matching swimlane placement.
  const trackBadge = resolveTrackBadge(session);
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
      await navigator.clipboard.writeText(shareUrl);
      showToast({ message: 'Link copied!', variant: 'positive' });
    } catch (err) {
      window.lana?.log(`[sessions-guide] detail share failed: ${err.message}`);
    }
  }

  // Fixed order, per design. `AI focus` has no catalog attribute yet, so its row simply does
  // not render until one is authored — same as any other unauthored attribute here. `Industry`
  // is deliberately absent: it is not in this list and does not exist in the real catalog.
  const attrs = [
    ['Technical level', session.technicalLevel],
    ['Track', session.track],
    ['AI focus', session.aiFocus?.join(', ')],
    ['Audience', session.audience?.join(', ')],
    ['Category', session.contentCategory?.join(', ')],
  ].filter(([, value]) => value);

  // Each list pod renders its collapsed slice with the full count in the heading, so the
  // toggle is only offered when it changes what's on screen.
  const products = session.products || [];
  const speakers = session.speakers || [];
  const shownProducts = productsExpanded ? products : products.slice(0, COLLAPSED_PRODUCTS);
  const shownSpeakers = speakersExpanded ? speakers : speakers.slice(0, COLLAPSED_SPEAKERS);

  // Shared "Show more"/"Show less" affordance for the list pods — same markup as the
  // description's More/Less toggle, with an explicit label for screen readers since the
  // visible text alone doesn't say what expands.
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
                  ${trackBadge && html`
                    <div class="sg-detail__channel">
                      <${Icon} name=${trackBadge.icon} size=${20} className="sg-detail__channel-icon" />
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
                          daa-ll="Watch-Now"
                        >
                          <span class="sg-detail__btn-icon sg-detail__btn-icon--play" aria-hidden="true"></span>
                          Watch now
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
    // Product icon and destination both come from the Tier 1 Event Configurator's
    // authored products map — same resolution FilterPanel.js uses for its pills.
    // An unmapped product has nowhere to link, so it stays a plain tile.
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

  // Desktop splits into a wide main column and a 383px side column, each stacking its own
  // pods; every narrower width is one stack in reading order. The order lives here rather
  // than in CSS so the tab order matches what is on screen at both layouts.
  //
  // Session resources and the legal disclaimer are deliberately not rendered here: both are
  // sourced from the public sessions catalog, which is reachable before an event goes live.
  // Individual session pages hydrate them directly on page creation instead, where exposure
  // isn't a pre-event leak.
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
          <button class="sg-detail__back" onclick=${onBack} type="button" aria-label="Back to sessions list">
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
