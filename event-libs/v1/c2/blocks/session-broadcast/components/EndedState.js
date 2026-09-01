import { html, useState, useEffect } from '../../../../deps/htm-preact.js';
import {
  favorited, pendingActions, getEventApiConfig,
} from '../../../../utils/session-store.js';
import { toggleFavoriteWithFeedback } from '../../../../services/sessions/action-feedback.js';
import { safeUrl } from '../../../../utils/utils.js';
import { showToast } from '../../../../features/toast/toast.js';
import { formatDuration } from '../../sessions-guide/utils/time.js';
import { CategoryBadge } from '../../sessions-guide/components/CategoryBadge.js';
import {
  IconPlay, IconHeartFilled, IconHeartOutline, IconShare,
} from '../../sessions-guide/components/icons.js';

// Same matchMedia-hook shape as FilterPanel.js's useIsMobile()/SessionDetailOverlay.js's
// useIsDesktop() — this codebase's established per-component convention, not a shared hook.
const TABLET_QUERY = '(min-width: 768px) and (max-width: 1279px)';
const matchesTabletRange = () => !!window.matchMedia?.(TABLET_QUERY).matches;

function useIsTabletRange() {
  const [isTabletRange, setIsTabletRange] = useState(matchesTabletRange);
  useEffect(() => {
    const mq = window.matchMedia?.(TABLET_QUERY);
    if (!mq) return undefined;
    const onChange = (e) => setIsTabletRange(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return isTabletRange;
}

// Figma (tablet-only spec, "Session Broadcast VizD R1 8.17.26" node 24:21722): the collapsed
// description truncates at a fixed 70 characters, not whatever a single CSS-ellipsis line
// happens to fit at the container's actual rendered width (which was showing meaningfully more
// text than the design calls for). Character count confirmed directly against the design's
// rendered screenshot, not assumed from a token/spec value.
const TABLET_DESC_MAX_CHARS = 70;
function truncateChars(text, maxChars) {
  return text.length > maxChars ? `${text.slice(0, maxChars)}…` : text;
}

// Covers both State 2 (other sessions live) and State 3 (nothing live) — same marquee. The
// Also Live/Up Next carousels rendered below this ARE the "join a live session"/"see what's
// upcoming" actions, not a separate interstitial. Background photo is a CSS background on the
// shared .sb-app ancestor (see session-broadcast.css), not rendered here.
export function EndedState({ session }) {
  const [expanded, setExpanded] = useState(false);
  const isTabletRange = useIsTabletRange();

  if (!session) return null;

  const isFavorited = favorited.value.has(session.id);
  const isPending = pendingActions.value.has(session.id);
  const watchOnDemandHref = safeUrl(session.sessionPageUrl);
  const durationLabel = session.endTimeUtc
    ? formatDuration(session.startTimeUtc, session.endTimeUtc, { short: true })
    : '';
  // Only the collapsed tablet view uses character-count truncation — expanded always shows the
  // full text, and mobile/desktop keep their existing CSS-driven single-line ellipsis untouched.
  const descriptionText = (!expanded && isTabletRange && session.description)
    ? truncateChars(session.description, TABLET_DESC_MAX_CHARS)
    : session.description;

  async function handleFavorite(e) {
    e.stopPropagation();
    await toggleFavoriteWithFeedback(session, { eventConfig: getEventApiConfig(), isFavorited });
  }

  // Same copy-to-clipboard behavior as SessionInfoPanel.js's own Share action.
  async function handleShare(e) {
    e.stopPropagation();
    const shareUrl = safeUrl(session.sessionPageUrl);
    if (!shareUrl) return;
    try {
      if (!navigator.clipboard) throw new Error('Clipboard API unavailable');
      await navigator.clipboard.writeText(shareUrl);
      showToast({ message: 'Link copied!', variant: 'positive' });
    } catch (err) {
      window.lana?.log(`[session-broadcast] share failed: ${err.message}`);
    }
  }

  return html`
    <div class="sb-ended" role="region" aria-label="Session complete">
      <p class="sb-ended__eyebrow">Session complete.</p>
      <h2 class="sb-ended__title">${session.title}</h2>
      <div class="sb-ended__meta">
        <${CategoryBadge} session=${session} hideCount=${true} />
        ${durationLabel && html`<span class="sb-ended__time">${durationLabel}</span>`}
      </div>
      ${session.description && html`
        <div class=${'sb-ended__desc-wrap' + (expanded ? ' is-expanded' : '')}>
          <p class="sb-ended__desc">${descriptionText}</p>
        </div>
      `}
      ${session.description && html`
        <button
          class="sb-ended__view-more"
          type="button"
          onclick=${() => setExpanded((v) => !v)}
        >${expanded ? 'View less' : 'View more'}</button>
      `}
      <div class="sb-ended__actions">
        ${watchOnDemandHref && html`
          <a class="sb-ended__watch" href=${watchOnDemandHref} daa-ll="Watch-On-Demand">
            <${IconPlay} />
            Watch on demand
          </a>
        `}
        <button
          class="sb-ended__icon-btn sb-ended__icon-btn--favorite"
          type="button"
          onclick=${handleFavorite}
          disabled=${isPending}
          aria-pressed=${String(isFavorited)}
          aria-label=${isFavorited ? `Remove ${session.title} from favorites` : `Add ${session.title} to favorites`}
          daa-ll=${isFavorited ? 'Remove-from-Favorites' : 'Add-to-Favorites'}
        >${isFavorited ? html`<${IconHeartFilled} />` : html`<${IconHeartOutline} />`}</button>
        <button
          class="sb-ended__icon-btn"
          type="button"
          onclick=${handleShare}
          aria-label=${`Share ${session.title}`}
          daa-ll="Share"
        ><${IconShare} /></button>
      </div>
    </div>
  `;
}
