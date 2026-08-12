import { html } from '../../../deps/htm-preact.js';
import { Icon } from '../../../features/icons/Icon.js';
import { resolveTrackBadge } from '../utils/session-filters.js';

// Renders resolveTrackBadge()'s badge; returns null (no "Other" fallback) for an
// excluded session.
export function CategoryBadge({ session, size }) {
  const badge = resolveTrackBadge(session);
  if (!badge) return null;

  const cls = size === 'sm' ? 'sg-category-badge sg-category-badge--sm' : 'sg-category-badge';
  return html`
    <span class=${cls}>
      <span class="sg-category-badge__icon-color" style=${badge.color ? `color:${badge.color}` : ''}>
        ${html`<${Icon} name=${badge.icon} size=${20} />`}
      </span>
      <span class="sg-category-badge__label">${badge.label}</span>
      ${badge.count > 0 && html`<span class="sg-category-badge__count">+${badge.count}</span>`}
    </span>
  `;
}
