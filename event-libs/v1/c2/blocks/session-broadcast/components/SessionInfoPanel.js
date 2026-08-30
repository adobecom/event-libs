import { html, useState } from '../../../../deps/htm-preact.js';
import {
  favorited, pendingActions, getEventApiConfig, openSessionGuideDetail,
} from '../../../../utils/session-store.js';
import { toggleFavoriteWithFeedback } from '../../../../services/sessions/action-feedback.js';
import { formatDuration } from '../../../../utils/date-time-helper.js';
import { IconHeartFilled, IconHeartOutline } from '../../sessions-guide/components/icons.js';
import { trackBroadcastEvent } from '../utils/broadcast-analytics.js';

// Always visible (collapsed): title, truncated abstract, duration, Favorite CTA. Per the
// PRD, Add-to-Schedule is never shown here — it's disabled for any session that's already
// live, and this panel only ever describes the one active in the primary player. Expanding
// via the caret reveals the full description and a "view all details" CTA that opens the
// real Session Guide detail view (see the plan's Architecture Decisions — no local modal).
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

  return html`
    <div class="sb-info" role="region" aria-label="Now playing session info">
      <div class="sb-info__row">
        <h2 class="sb-info__title">${session.title}</h2>
        <button
          class="sb-info__favorite"
          type="button"
          onclick=${handleFavorite}
          disabled=${isPending}
          aria-pressed=${String(isFavorited)}
          aria-label=${isFavorited ? `Remove ${session.title} from favorites` : `Add ${session.title} to favorites`}
          daa-ll=${isFavorited ? 'Remove-from-Favorites' : 'Add-to-Favorites'}
        >${isFavorited ? html`<${IconHeartFilled} />` : html`<${IconHeartOutline} />`}</button>
        <button
          class="sb-info__expand"
          type="button"
          onclick=${handleToggleExpand}
          aria-expanded=${String(expanded)}
          aria-controls="sb-info-desc"
        >
          <span class="sb-sr-only">${expanded ? 'Show less session info' : 'Show more session info'}</span>
          <span class="sb-info__expand-icon" aria-hidden="true"></span>
        </button>
      </div>
      ${durationLabel && html`<p class="sb-info__duration">${durationLabel}</p>`}
      <div class=${'sb-info__desc-wrap' + (expanded ? ' is-expanded' : '')} id="sb-info-desc">
        <p class="sb-info__desc">${session.description}</p>
      </div>
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
