import { html } from '../../../../deps/htm-preact.js';
import {
  favorited, pendingActions, getEventApiConfig,
} from '../../../../utils/session-store.js';
import { toggleFavoriteWithFeedback } from '../../../../services/sessions/action-feedback.js';
import { safeUrl } from '../../../../utils/utils.js';
import { IconHeartFilled, IconHeartOutline } from '../../sessions-guide/components/icons.js';

// Covers both State 2 (other sessions still live) and State 3 (nothing else live) — they
// share the same "session ended" marquee. Per the Figma review, the actual "join a live
// session" / "see what's upcoming" options ARE the Also Live/Up Next carousels rendered
// right below this (see BroadcastApp), not a separate two-button interstitial the way the
// ticket/PRD text describes it more abstractly — the carousels already do that job, and
// AlsoLiveCarousel's onSwitchSession (unchanged from Phase 1) is exactly how "join a live
// session" commits a new primary session and exits this state.
// sessionEndedImageUrl is a plain URL, not authored HTML — session-broadcast.js reads it from
// a *linked* row rather than an embedded picture on purpose. Any embedded <img> in the DA doc
// (even one authored purely as block config, never meant to render as page content) gets
// swept up by Milo's site-wide decorateImageLinks() before any block's own init() runs; many
// asset-library images carry a `|`-delimited alt-text convention (used for hover/background
// video elsewhere) as stored metadata, which silently replaces the picture with an empty
// <video> before we ever get to read it. Building our own plain <img> from a URL string
// sidesteps that pass entirely — see PLAN.md's Phase 4 writeup for the full incident.
export function EndedState({ session, sessionEndedImageUrl }) {
  if (!session) return null;

  const isFavorited = favorited.value.has(session.id);
  const isPending = pendingActions.value.has(session.id);
  const watchOnDemandHref = safeUrl(session.sessionPageUrl);
  const bgImageUrl = safeUrl(sessionEndedImageUrl);

  async function handleFavorite(e) {
    e.stopPropagation();
    await toggleFavoriteWithFeedback(session, { eventConfig: getEventApiConfig(), isFavorited });
  }

  return html`
    <div class="sb-ended" role="region" aria-label="Session ended">
      ${bgImageUrl && html`<img class="sb-ended__bg" src=${bgImageUrl} alt="" loading="lazy" />`}
      <p class="sb-ended__eyebrow">Session ended.</p>
      <h2 class="sb-ended__title">${session.title}</h2>
      <p class="sb-ended__desc">${session.description}</p>
      <div class="sb-ended__actions">
        ${watchOnDemandHref && html`
          <a class="sb-ended__watch" href=${watchOnDemandHref} daa-ll="Watch-On-Demand">
            Watch on demand
          </a>
        `}
        <button
          class="sb-ended__favorite"
          type="button"
          onclick=${handleFavorite}
          disabled=${isPending}
          aria-pressed=${String(isFavorited)}
          aria-label=${isFavorited ? `Remove ${session.title} from favorites` : `Add ${session.title} to favorites`}
          daa-ll=${isFavorited ? 'Remove-from-Favorites' : 'Add-to-Favorites'}
        >${isFavorited ? html`<${IconHeartFilled} />` : html`<${IconHeartOutline} />`}</button>
      </div>
    </div>
  `;
}
