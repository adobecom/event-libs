/* eslint-disable no-underscore-dangle */
import { createTag } from '../../utils/utils.js';

class Drawer {
  constructor(root, cfg = {}) {
    if (!root) throw new Error('Drawer needs a root element.');

    this.root = root;
    this.cfg = cfg;
    this.items = cfg.items || [];
    this.renderItem = cfg.renderItem || (() => createTag('div', { class: 'drawer-item' }, 'Item'));
    this.onClick = cfg.onItemClick || (() => {});
    this.itemsEl = null;

    this.render();
  }

  /**
   * Builds the Drawer UI
   */
  render() {
    // 1. Create Main Drawer Container
    const drawer = createTag('div', {
      class: 'drawer',
      'aria-label': this.cfg.ariaLabel || 'Drawer',
    }, '', { parent: this.root });
    const content = createTag('div', { class: 'drawer-content' }, '', { parent: drawer });
    
    this.itemsEl = createTag('div', { class: 'drawer-items' }, '', { parent: content });
    this.items.forEach((data, i) => {
      const el = this.renderItem(data, i);
      if (!el) return;

      if (i === 0) el.classList.add('current');
      
      this.bindEvents(el, data);
      this.itemsEl.append(el); 
    });
  }

  /**
   * Adds Accessibility and Click listeners
   */
  bindEvents(el, data) {
    const handler = (e) => {
      // Prevent event bubbling if necessary
      e.stopPropagation();
      this.setActive(el, data);
    };

    el.addEventListener('click', handler);
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handler(e);
      }
    });
  }

  /**
   * Sets active state and triggers the external callback
   */
  async setActive(el, data) {
    this.#updateVisuals(el);
    
    try {
      // Pass the data back to MobileRider
      await this.onClick(el, data);
    } catch (e) {
      window.lana?.log?.(`[Drawer] Click callback failed: ${e.message}`);
    }
  }

  /**
   * Public method to update state from external URL/logic
   */
  setActiveById(id) {
    if (!this.itemsEl || !id) return;
    const el = this.itemsEl.querySelector(`[data-id="${id}"]`);
    if (el) this.#updateVisuals(el);
  }

  /**
   * Internal helper to handle CSS classes
   */
  #updateVisuals(el) {
    const current = this.itemsEl.querySelectorAll('.drawer-item.current');
    current.forEach((i) => i.classList.remove('current'));
    el.classList.add('current');
    
    // Optional: Scroll the selected item into view if the drawer is long
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  /**
   * Cleanup method
   */
  remove() {
    const drawerElement = this.root.querySelector('.drawer');
    if (drawerElement) drawerElement.remove();
  }
}

export default function initDrawers(root, cfg) {
  try {
    return new Drawer(root, cfg);
  } catch (e) {
    window.lana?.log?.(`Drawer init failed: ${e.message}`);
    return null;
  }
}
