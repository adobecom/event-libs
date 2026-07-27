import { html } from '../../../deps/htm-preact.js';
import { Icon } from '../../../features/icons/Icon.js';
import { getTrackIcon } from '../../../utils/tier-1-event-config.js';

export function CategoryBadge({ category, size }) {
  const entry = getTrackIcon(category) || getTrackIcon('mainstage');
  const cls = size === 'sm' ? 'sg-category-badge sg-category-badge--sm' : 'sg-category-badge';
  return html`
    <span class=${cls}>
      <span class="sg-category-badge__icon-color" style=${entry.color ? `color:${entry.color}` : ''}>
        ${html`<${Icon} name=${entry.icon} size=${20} />`}
      </span>
      <span class="sg-category-badge__label">${category || 'General'}</span>
    </span>
  `;
}
