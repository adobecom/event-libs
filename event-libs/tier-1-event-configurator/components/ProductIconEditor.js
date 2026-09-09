import { html } from '../../v1/deps/htm-preact.js';
import { Icon } from '../../v1/features/icons/Icon.js';
import { fetchFederalProductIcon } from '../../v1/features/icons/federal-icons.js';
import { extractProductIconSlug } from '../utils.js';

export default function ProductIconEditor({ products, productConfig, onChange }) {
  if (!products || products.length === 0) {
    return html`<p class="tec-track-editor__empty">No products found in this event's sessions yet.</p>`;
  }

  return html`
    <ul class="tec-track-editor__list">
      ${products.map((product) => {
        const entry = productConfig?.[product];
        const icon = entry?.icon ?? '';
        const pageUrl = entry?.pageUrl ?? '';
        return html`
          <li class="tec-track-editor__row" key=${product}>
            <div class="tec-track-editor__preview-wrap">
              ${icon && html`<${Icon} name=${icon} size=${20} resolve=${fetchFederalProductIcon} />`}
            </div>
            <span class="tec-track-editor__name">${product}</span>
            <input
              type="text"
              class="tec-field tec-track-editor__icon-input"
              placeholder="Icon slug (e.g. photoshop-64), or paste the full federal icon URL"
              value=${icon}
              onInput=${(e) => onChange(product, { icon: extractProductIconSlug(e.target.value) })}
              aria-label="Icon slug for ${product}"
            />
            <input
              type="text"
              class="tec-field tec-track-editor__url-input"
              placeholder="Product page URL"
              value=${pageUrl}
              onInput=${(e) => onChange(product, { pageUrl: e.target.value })}
              aria-label="Page URL for ${product}"
            />
          </li>
        `;
      })}
    </ul>
  `;
}
