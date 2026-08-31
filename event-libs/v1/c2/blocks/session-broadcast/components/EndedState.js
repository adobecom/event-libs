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

// Covers both State 2 (other sessions still live) and State 3 (nothing else live) — they
// share the same "session ended" marquee. Per the Figma review, the actual "join a live
// session" / "see what's upcoming" options ARE the Also Live/Up Next carousels rendered
// right below this (see BroadcastApp), not a separate two-button interstitial the way the
// ticket/PRD text describes it more abstractly — the carousels already do that job, and
// AlsoLiveCarousel's onSwitchSession (unchanged from Phase 1) is exactly how "join a live
// session" commits a new primary session and exits this state.
// Content block matches node 4975:46072: eyebrow + title, a channel-badge/duration meta row,
// a single-line-truncated description with a "View more"/"View less" toggle, and a Watch on
// demand pill plus Favorite/Share icon buttons (the same outlined-ring treatment on both,
// confirmed via a zoomed screenshot of node 4975:46089 — not the frosted-glass chip
// session-broadcast.css uses for Also Live/Upcoming's own on-light buttons).
//
// The background photo itself is NOT rendered here — it's a CSS background on the shared
// .sb-app ancestor instead (see session-broadcast.css's "Ended-state background bleed"
// section for why), so it can visually bleed past this component's own (short) box into Also
// Live/Upcoming below it. PLAN.md's Phase 4 writeup covers the separate decorateImageLinks()
// authoring-convention incident that's why the URL travels as a linked row, not a picture.
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
