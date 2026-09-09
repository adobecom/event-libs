import { html } from '../../../../deps/htm-preact.js';
import { Icon } from '../../../../features/icons/Icon.js';
import { fetchFederalTrackIcon } from '../../../../features/icons/federal-icons.js';
import { resolveTrackBadge, resolveNamedTrackBadge } from '../utils/session-filters.js';

// `track` renders one named track instead of deriving the session's own primary track;
// `hideCount` drops the "+N" for callers rendering extra tracks as their own badges.
export function CategoryBadge({ session, size, track, hideCount }) {
  const badge = track ? resolveNamedTrackBadge(track) : resolveTrackBadge(session);
  if (!badge) return null;

  const cls = size === 'sm' ? 'sg-category-badge sg-category-badge--sm' : 'sg-category-badge';
  return html`
    <span class=${cls}>
      <span class="sg-category-badge__icon-color" style=${badge.color ? `--sg-badge-icon-color:${badge.color}` : ''}>
        ${html`<${Icon} name=${badge.icon} size=${20} resolve=${fetchFederalTrackIcon} />`}
      </span>
      <span class="sg-category-badge__label">${badge.label}</span>
      ${!hideCount && badge.count > 0 && html`<span class="sg-category-badge__count">+${badge.count}</span>`}
    </span>
  `;
}
