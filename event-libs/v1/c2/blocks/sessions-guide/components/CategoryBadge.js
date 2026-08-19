import { html } from '../../../../deps/htm-preact.js';
import { Icon } from '../../../../features/icons/Icon.js';
import { resolveTrackBadge, resolveNamedTrackBadge } from '../utils/session-filters.js';

// Renders resolveTrackBadge()'s badge; returns null (no "Other" fallback) for an
// excluded session.
//
// `track` badges that one named track instead of deriving the session's own, so a caller
// can render an additional track alongside the primary. `hideCount` drops the "+N" for
// callers that show those extra tracks as their own badges, where the count would double
// count them.
export function CategoryBadge({ session, size, track, hideCount }) {
  const badge = track ? resolveNamedTrackBadge(track) : resolveTrackBadge(session);
  if (!badge) return null;

  const cls = size === 'sm' ? 'sg-category-badge sg-category-badge--sm' : 'sg-category-badge';
  // Track color goes through a custom property, not `color` directly, so a card's
  // hover rules can knock the icon to white without `!important`.
  return html`
    <span class=${cls}>
      <span class="sg-category-badge__icon-color" style=${badge.color ? `--sg-badge-icon-color:${badge.color}` : ''}>
        ${html`<${Icon} name=${badge.icon} size=${20} />`}
      </span>
      <span class="sg-category-badge__label">${badge.label}</span>
      ${!hideCount && badge.count > 0 && html`<span class="sg-category-badge__count">+${badge.count}</span>`}
    </span>
  `;
}
