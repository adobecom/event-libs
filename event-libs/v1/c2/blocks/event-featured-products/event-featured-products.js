/*
 * Featured Products (MWPW-203469)
 * Standalone white card. Tiles (colored product logo + name + ↗ link) sourced
 * from the Product custom-attribute; icon + page link per product come from the
 * Tier 1 Event Configurator's `products` map (getProduct -> { icon, pageUrl }).
 * Product logos are colored SVGs resolved via fetchFederalProductIcon.
 *
 * Count shown next to the title. Truncates after VISIBLE_LIMIT with "Show more".
 * Links open in a new tab.
 *
 * NOTE: VISIBLE_LIMIT follows the mobile mock + annotation (6 before truncation);
 * the AC prose says mobile 4 / desktop 6 — reconcile in the desktop pass. Icons
 * only render for products present in the configurator's `products` map.
 */
import { createTag } from '../../../utils/utils.js';
import { getAttrValues } from '../../utils/custom-attributes.js';
import { readBackgroundConfig } from '../../utils/background-config.js';
import { getProduct, initTierOneEventConfig } from '../../../utils/tier-1-event-config.js';
import { fetchFederalProductIcon } from '../../../features/icons/federal-icons.js';

// Shows up to 6 before truncating. NOTE: the ticket says mobile 4 / desktop 6,
// but Figma appears to show 6 on desktop too — confirm actual behavior with Kat
// before finalizing (and whether it's responsive). Holding at 6 for now.
const VISIBLE_LIMIT = 6;
// Suffixes the aria-controls id so multiple instances on one page stay unique.
let instances = 0;
// Diagonal "open in new" arrow — Figma glyph (10x10). fill: currentColor so CSS
// drives the color (var(--s2a-color-gray-600) per the design).
const ARROW_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true"><path d="M8.57198 0.710938H3.57198C3.17718 0.710938 2.8577 1.03042 2.8577 1.42522C2.8577 1.82003 3.17718 2.13951 3.57198 2.13951H6.84765L0.924104 8.06306C0.64509 8.34207 0.64509 8.79409 0.924104 9.0731C1.06361 9.21261 1.24637 9.28237 1.42913 9.28237C1.61188 9.28237 1.79464 9.21261 1.93415 9.0731L7.8577 3.14955V6.42522C7.8577 6.82003 8.17718 7.13951 8.57198 7.13951C8.96679 7.13951 9.28627 6.82003 9.28627 6.42522V1.42522C9.28627 1.03042 8.96679 0.710938 8.57198 0.710938Z" fill="currentColor"/></svg>';
// Chevron next to the toggle label; rotates 180° when expanded (see CSS).
const CHEVRON_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="5" viewBox="0 0 8 5" fill="none" aria-hidden="true"><path d="M1 1L4 4L7 1" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

async function paintProductIcon(slot, iconName) {
  if (!iconName) return;
  try {
    const svg = await fetchFederalProductIcon(iconName);
    if (!svg) return;
    svg.setAttribute('width', '24');
    svg.setAttribute('height', '24');
    // Decorative — the product name sits right beside it. The fetched federal SVG
    // may carry a <title> that would otherwise be added to the tile link's name.
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    slot.replaceChildren(svg);
  } catch (err) {
    window.lana?.log(`[featured-products] icon "${iconName}" failed to resolve: ${err.message}`);
  }
}

export default async function init(el) {
  const background = readBackgroundConfig(el);

  // Ensure the configurator config is loaded before getProduct reads it.
  initTierOneEventConfig();

  const products = getAttrValues('Product').map((v) => v.label).filter(Boolean);
  el.replaceChildren();
  if (background) el.style.background = background;
  if (!products.length) return;

  const title = createTag('h2', { class: 'featured-products-title' }, 'Featured products ');
  title.append(createTag('span', { class: 'featured-products-count' }, `(${products.length})`));
  el.append(title);

  const list = createTag('ul', { class: 'featured-products-list' });
  products.forEach((name, i) => {
    const cfg = getProduct(name);
    const item = createTag('li', { class: 'featured-product' });
    if (i >= VISIBLE_LIMIT) item.classList.add('is-overflow');

    const tile = cfg?.pageUrl
      ? createTag('a', {
        class: 'featured-product-tile',
        href: cfg.pageUrl,
        target: '_blank',
        rel: 'noopener noreferrer',
        // New-tab behavior is signalled visually by the ↗ arrow (aria-hidden), so
        // say it in the accessible name too.
        'aria-label': `${name} (opens in new tab)`,
      })
      : createTag('span', { class: 'featured-product-tile' });

    const iconSlot = createTag('span', { class: 'featured-product-icon' });
    if (cfg?.icon) paintProductIcon(iconSlot, cfg.icon);
    tile.append(iconSlot, createTag('span', { class: 'featured-product-name' }, name));
    if (cfg?.pageUrl) {
      const arrow = createTag('span', { class: 'featured-product-arrow' });
      arrow.innerHTML = ARROW_ICON;
      tile.append(arrow);
    }

    item.append(tile);
    list.append(item);
  });
  el.append(list);

  if (products.length > VISIBLE_LIMIT) {
    instances += 1;
    list.id = `featured-products-list-${instances}`; // unique per instance for aria-controls
    const toggle = createTag('button', {
      class: 'featured-products-toggle',
      type: 'button',
      'aria-expanded': 'false',
      'aria-controls': list.id,
    });
    const label = createTag('span', {}, 'Show more');
    toggle.append(label);
    toggle.insertAdjacentHTML('beforeend', CHEVRON_ICON);
    toggle.addEventListener('click', () => {
      const expanded = el.classList.toggle('is-expanded');
      toggle.setAttribute('aria-expanded', String(expanded));
      label.textContent = expanded ? 'Show less' : 'Show more';
    });
    el.append(toggle);
  }
}
