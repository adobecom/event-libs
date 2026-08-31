import { html, useState } from '../../../../deps/htm-preact.js';
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

// Covers both State 2 (other sessions live) and State 3 (nothing live) — same marquee. The
// Also Live/Up Next carousels rendered below this ARE the "join a live session"/"see what's
// upcoming" actions, not a separate interstitial. Background photo is a CSS background on the
// shared .sb-app ancestor (see session-broadcast.css), not rendered here.
export function EndedState({ session }) {
  const [expanded, setExpanded] = useState(false);

  if (!session) return null;

  const isFavorited = favorited.value.has(session.id);
  const isPending = pendingActions.value.has(session.id);
  const watchOnDemandHref = safeUrl(session.sessionPageUrl);
  const durationLabel = session.endTimeUtc
    ? formatDuration(session.startTimeUtc, session.endTimeUtc, { short: true })
    : '';

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
    <div class="sb-ended" role="region" aria-label="Session ended">
      <p class="sb-ended__eyebrow">Session ended.</p>
      <h2 class="sb-ended__title">${session.title}</h2>
      <div class="sb-ended__meta">
        <${CategoryBadge} session=${session} hideCount=${true} />
        ${durationLabel && html`<span class="sb-ended__time">${durationLabel}</span>`}
      </div>
      ${session.description && html`
        <div class=${'sb-ended__desc-wrap' + (expanded ? ' is-expanded' : '')}>
          <p class="sb-ended__desc">${session.description}</p>
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
