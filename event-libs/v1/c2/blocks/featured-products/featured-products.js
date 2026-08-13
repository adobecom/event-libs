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
import { getProduct, initTierOneEventConfig } from '../../../utils/tier-1-event-config.js';
import { fetchFederalProductIcon } from '../../../features/icons/federal-icons.js';

const VISIBLE_LIMIT = 6;
const ARROW_ICON = '<svg viewBox="0 0 12 12" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="M3.75 8.25 8.25 3.75M8.25 3.75H4.5M8.25 3.75V7.5"/></svg>';

async function paintProductIcon(slot, iconName) {
  if (!iconName) return;
  try {
    const svg = await fetchFederalProductIcon(iconName);
    if (!svg) return;
    svg.setAttribute('width', '24');
    svg.setAttribute('height', '24');
    slot.replaceChildren(svg);
  } catch (err) {
    window.lana?.log(`[featured-products] icon "${iconName}" failed to resolve: ${err.message}`);
  }
}

export default async function init(el) {
  // Ensure the configurator config is loaded before getProduct reads it.
  initTierOneEventConfig();

  const products = getAttrValues('Product').map((v) => v.label).filter(Boolean);
  el.replaceChildren();
  if (!products.length) return;

  el.append(createTag('h2', { class: 'featured-products-title' }, `Featured products (${products.length})`));

  const list = createTag('ul', { class: 'featured-products-list' });
  products.forEach((name, i) => {
    const cfg = getProduct(name);
    const item = createTag('li', { class: 'featured-product' });
    if (i >= VISIBLE_LIMIT) item.classList.add('is-overflow');

    const tile = cfg?.pageUrl
      ? createTag('a', {
        class: 'featured-product-tile', href: cfg.pageUrl, target: '_blank', rel: 'noopener noreferrer',
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
    const toggle = createTag('button', {
      class: 'featured-products-toggle', type: 'button', 'aria-expanded': 'false',
    }, 'Show more');
    toggle.addEventListener('click', () => {
      const expanded = el.classList.toggle('is-expanded');
      toggle.setAttribute('aria-expanded', String(expanded));
      toggle.textContent = expanded ? 'Show less' : 'Show more';
    });
    el.append(toggle);
  }
}
