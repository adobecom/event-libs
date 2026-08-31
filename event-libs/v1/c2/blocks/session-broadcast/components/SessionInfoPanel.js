import { html, useState } from '../../../../deps/htm-preact.js';
import {
  favorited, pendingActions, getEventApiConfig, openSessionGuideDetail,
} from '../../../../utils/session-store.js';
import { toggleFavoriteWithFeedback } from '../../../../services/sessions/action-feedback.js';
import { safeUrl } from '../../../../utils/utils.js';
import { showToast } from '../../../../features/toast/toast.js';
import { formatDuration } from '../../sessions-guide/utils/time.js';
import { CategoryBadge } from '../../sessions-guide/components/CategoryBadge.js';
import {
  IconHeartFilled, IconHeartOutline, IconShare, IconChevronRight,
} from '../../sessions-guide/components/icons.js';
import { trackBroadcastEvent } from '../utils/broadcast-analytics.js';

// Collapsed: title, caret, clamped description (hidden if favorited), Favorite + Share.
// Expanded: actions move under the title, followed by a channel/duration row, the full
// description (always shown, regardless of favorited), and "View all details" — the only
// thing that opens the real Session Guide detail view (no local modal).
export function SessionInfoPanel({ session, viewAllDetailsLabel = 'View all details' }) {
  const [expanded, setExpanded] = useState(false);

  if (!session) return null;

  const isFavorited = favorited.value.has(session.id);
  const isPending = pendingActions.value.has(session.id);
  const durationLabel = session.endTimeUtc
    ? formatDuration(session.startTimeUtc, session.endTimeUtc, { short: true })
    : '';

  async function handleFavorite(e) {
    e.stopPropagation();
    await toggleFavoriteWithFeedback(session, { eventConfig: getEventApiConfig(), isFavorited });
  }

  // Copies the session's own page URL, not a sessions-guide `?session=` deep link.
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

  function handleViewAllDetails() {
    openSessionGuideDetail(session.id);
    trackBroadcastEvent(`Broadcast-Session-Detail-Open | ${session.id}`);
  }

  function handleToggleExpand() {
    setExpanded((v) => {
      const next = !v;
      if (next) trackBroadcastEvent(`Broadcast-Panel-Expand | ${session.id}`);
      return next;
    });
  }

  const actions = html`
    <div class="sb-info__actions">
      <button
        class="sb-info__icon-btn sb-info__icon-btn--favorite"
        type="button"
        onclick=${handleFavorite}
        disabled=${isPending}
        aria-pressed=${String(isFavorited)}
        aria-label=${isFavorited ? `Remove ${session.title} from favorites` : `Add ${session.title} to favorites`}
        daa-ll=${isFavorited ? 'Remove-from-Favorites' : 'Add-to-Favorites'}
      >${isFavorited ? html`<${IconHeartFilled} />` : html`<${IconHeartOutline} />`}</button>
      <button
        class="sb-info__icon-btn"
        type="button"
        onclick=${handleShare}
        aria-label=${`Share ${session.title}`}
        daa-ll="Share"
      ><${IconShare} /></button>
    </div>
  `;

  return html`
    <div class="sb-info" role="region" aria-label="Now playing session info">
      <div class="sb-info__row">
        <h2 class="sb-info__title">${session.title}</h2>
        <button
          class="sb-info__expand"
          type="button"
          onclick=${handleToggleExpand}
          aria-expanded=${String(expanded)}
          aria-controls="sb-info-desc"
        >
          <span class="sb-sr-only">${expanded ? 'Show less session info' : 'Show more session info'}</span>
          <span class=${'sb-info__expand-icon' + (expanded ? ' is-expanded' : '')} aria-hidden="true"><${IconChevronRight} /></span>
        </button>
      </div>
      ${expanded && actions}
      ${expanded && html`
        <div class="sb-info__meta">
          <${CategoryBadge} session=${session} hideCount=${true} />
          ${durationLabel && html`<span class="sb-info__time">${durationLabel}</span>`}
        </div>
      `}
      ${(expanded || !isFavorited) && html`
        <div class=${'sb-info__desc-wrap' + (expanded ? ' is-expanded' : '')} id="sb-info-desc">
          <p class="sb-info__desc">${session.description}</p>
        </div>
      `}
      ${!expanded && actions}
      ${expanded && html`
        <button
          class="sb-info__view-all"
          type="button"
          onclick=${handleViewAllDetails}
          daa-ll="View-All-Details"
        >${viewAllDetailsLabel}</button>
      `}
    </div>
  `;
}
