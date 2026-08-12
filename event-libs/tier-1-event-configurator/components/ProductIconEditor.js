import { html } from '../../v1/deps/htm-preact.js';
import IconPicker, { useIconSlugOptions } from './IconPicker.js';

// Simpler than TrackIconEditor — products already have colored SVGs, so there's no
// color field to author, and no built-in default map to pre-fill from (no product icons
// exist anywhere yet; federal's inventory is the only source once they're uploaded there).
export default function ProductIconEditor({ products, productIcons, onChange }) {
  // Called unconditionally, before the early return below — Preact hooks must run in
  // the same order on every render. No curated base list (unlike tracks) — federal's own
  // inventory is the whole list once product icons exist there.
  const iconSlugs = useIconSlugOptions();

  if (!products || products.length === 0) {
    return html`<p class="tec-track-editor__empty">No products found in this event's sessions yet.</p>`;
  }

  return html`
    <ul class="tec-track-editor__list">
      ${products.map((product) => {
        const icon = productIcons?.[product] ?? '';
        return html`
          <li class="tec-track-editor__row" key=${product}>
            <span class="tec-track-editor__name">${product}</span>
            <${IconPicker}
              value=${icon}
              options=${iconSlugs}
              onChange=${(newIcon) => onChange(product, newIcon)}
              ariaLabel="Icon for ${product}"
            />
          </li>
        `;
      })}
    </ul>
  `;
}
