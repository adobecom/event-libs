/* eslint-disable no-underscore-dangle */
import { createTag, getEventConfig } from '../../utils/utils.js';

const DRAWER_CSS_URL = new URL('./drawer.css', import.meta.url).href;

const CONFIG = {
  ANALYTICS: { PROVIDER: 'adobe' },
  SCRIPTS: { DEV_URL: '//assets.mobilerider.com/p/player-adobe-integration/player.min.js', PROD_URL: '//assets.mobilerider.com/p/adobe/player.min.js' },
  PLAYER: {
    DEFAULT_OPTIONS: { autoplay: true, controls: true, muted: true },
    CONTAINER_ID: 'mr-adobe',
    VIDEO_ID: 'idPlayer',
    VIDEO_CLASS: 'mobileRider_viewport',
  },
  ASL: { TOGGLE_CLASS: 'isASL', BUTTON_ID: 'asl-button', CHECK_INTERVAL: 100, MAX_CHECKS: 50 },
  API: { PROD_URL: 'https://overlay-admin-integration.mobilerider.com', DEV_URL: 'https://overlay-admin-integration.mobilerider.com' },
};

/** * HELPER UTILITIES */
const getEnv = () => getEventConfig()?.miloConfig?.env?.name || 'prod';
const isProd = () => getEnv() === 'prod';
const toBool = (v) => (typeof v === 'string' ? v.trim().toLowerCase() === 'true' || (v.trim().toLowerCase() === 'false' ? false : v) : v);

let scriptPromise = null;
async function loadScript() {
  if (window.mobilerider) return;
  if (!scriptPromise) {
    const src = isProd() ? CONFIG.SCRIPTS.PROD_URL : CONFIG.SCRIPTS.DEV_URL;
    scriptPromise = new Promise((res, rej) => {
      const s = createTag('script', { src, async: true });
      s.onload = res;
      s.onerror = () => { scriptPromise = null; rej(new Error('Script Load Fail')); };
      document.head.appendChild(s);
    });
  }
  return scriptPromise;
}

class MobileRider {
  constructor(el) {
    this.el = el;
    this.isEmbedding = false;
    this.init();
  }

  log(msg) { window.lana?.log?.(`[MobileRider] ${msg}`); }

  async init() {
    try {
      this.cfg = this.#parseCfg();
      await Promise.all([loadScript(), this.el.closest('.chrono-box') ? this.#loadStore() : null]);
      
      this.#setupDOM();
      const videos = this.cfg.concurrentenabled ? this.#parseConcurrent(this.cfg) : [this.cfg];
      this.allVideos = videos;
      
      const selected = await this.#selectInitialVideo(videos);
      if (this.cfg.concurrentenabled && this.store) this.mainID = videos[0].videoid;

      await this.injectPlayer(selected.videoid, this.cfg.skinid, selected.aslid);

      if (this.cfg.concurrentenabled && videos.length > 1) {
        await this.#initDrawer(videos, selected.videoid);
      }
    } catch (e) { this.log(e.message); }
  }

  #setupDOM() {
    this.root = this.el.querySelector('.mobile-rider-player') || createTag('div', { class: 'mobile-rider-player' }, '', this.el);
    this.wrap = this.root.querySelector('.video-wrapper') || createTag('div', { class: 'video-wrapper' }, '', this.root);
  }

  /**
   * Adopted Strict Injection Logic
   */
  async injectPlayer(vid, skin, asl = null) {
    if (!this.wrap || this.isEmbedding) return;
    this.isEmbedding = true;

    // 1. Cleanup previous instance
    if (window.__mr_player) {
      try { window.__mr_player.dispose(); } catch (e) { this.log(e.message); }
      window.__mr_player = null;
    }

    // 2. Build Container & Video
    this.wrap.innerHTML = '';
    const container = createTag('div', {
      class: 'mobile-rider-container',
      id: CONFIG.PLAYER.CONTAINER_ID,
      'data-videoid': vid,
    }, '', this.wrap);

    const video = createTag('video', {
      id: CONFIG.PLAYER.VIDEO_ID,
      class: CONFIG.PLAYER.VIDEO_CLASS,
      controls: true,
      playsinline: '',
      poster: this.cfg.poster || this.cfg.thumbnail || '',
    }, '', container);

    // 3. Adoption of the strict verification check from actual file
    requestAnimationFrame(() => {
      const fail = (msg) => {
        this.log(msg);
        this.isEmbedding = false;
      };

      // Ensure elements are still in the document
      const videoInDoc = document.getElementById(CONFIG.PLAYER.VIDEO_ID);
      if (!videoInDoc || videoInDoc !== video) return fail('Video element not found in document');
      if (!container.parentNode || !container.contains(videoInDoc)) return fail('DOM Hierarchy mismatch');
      if (!window.mobilerider) return fail('Library not loaded');

      try {
        window.mobilerider.embed(video.id, vid, skin, {
          ...CONFIG.PLAYER.DEFAULT_OPTIONS,
          ...this.#getOverrides(),
          analytics: { provider: CONFIG.ANALYTICS.PROVIDER },
          identifier1: vid,
          identifier2: asl || '',
          sessionId: vid,
        });

        if (asl) this.#initASL(container);
        this.#attachEndListener(vid);
      } catch (e) {
        fail(`Embed Error: ${e.message}`);
      }

      // Small delay before unlocking to ensure stability
      setTimeout(() => { this.isEmbedding = false; }, 100);
    });
  }

  #getOverrides() {
    const overrides = {};
    Object.keys(CONFIG.PLAYER.DEFAULT_OPTIONS).forEach(key => {
      if (key in this.cfg) overrides[key] = toBool(this.cfg[key]);
    });
    return overrides;
  }

  #attachEndListener(vid) {
    window.__mr_player?.on?.('streamend', () => {
      if (this.drawer) { this.drawer.remove(); this.drawer = null; }
      this.#updateStatus(vid, false);
      window.__mr_player?.dispose?.();
    });
  }

  // ... (Utility methods like #parseCfg, #parseConcurrent, #loadStore remain identical to your working code)

  async #selectInitialVideo(videos) {
    const urlIdx = new URLSearchParams(window.location.search).get('video');
    if (urlIdx && videos[urlIdx - 1]) return videos[urlIdx - 1];

    const sessionTitle = sessionStorage?.getItem('concurrentVideoTitle');
    if (sessionTitle) {
      const found = videos.find(v => v.title?.trim() === sessionTitle.trim());
      if (found) {
        sessionStorage.removeItem('concurrentVideoTitle');
        return found;
      }
    }
    return videos[0];
  }

  async #initDrawer(videos, activeId) {
    if (!document.querySelector('link[href*="drawer.css"]')) {
      createTag('link', { rel: 'stylesheet', href: DRAWER_CSS_URL }, '', document.head);
    }
    const { default: createDrawer } = await import('./drawer.js');
    this.drawer = createDrawer(this.root, {
      items: videos,
      renderItem: (v) => this.#renderDrawerItem(v),
    });
    this.drawer?.setActiveById?.(activeId);
  }

  #renderDrawerItem(v) {
    const item = createTag('div', { class: 'drawer-item', 'data-id': v.videoid, role: 'button', tabindex: '0' });
    item.innerHTML = `
      ${v.thumbnail ? `<div class="drawer-item-thumbnail"><img src="${v.thumbnail}" /></div>` : ''}
      <div class="drawer-item-content">
        <div class="drawer-item-title">${v.title || ''}</div>
        <div class="drawer-item-description">${v.description || ''}</div>
      </div>`;
    
    item.addEventListener('click', () => {
      const idx = this.allVideos.indexOf(v) + 1;
      const url = new URL(window.location.href);
      if (idx === 1) url.searchParams.delete('video'); else url.searchParams.set('video', idx);
      window.history.replaceState({}, '', url.toString());
      this.drawer.setActiveById(v.videoid);
      this.injectPlayer(v.videoid, this.cfg.skinid, v.aslid);
    });
    return item;
  }

  #initASL(container) {
    let attempts = 0;
    const check = setInterval(() => {
      const btn = container.querySelector(`#${CONFIG.ASL.BUTTON_ID}`);
      if (btn || ++attempts > CONFIG.ASL.MAX_CHECKS) {
        clearInterval(check);
        btn?.addEventListener('click', () => {
          if (!container.classList.contains(CONFIG.ASL.TOGGLE_CLASS)) {
             container.classList.add(CONFIG.ASL.TOGGLE_CLASS);
             this.#initASL(container);
          }
        });
      }
    }, CONFIG.ASL.CHECK_INTERVAL);
  }

  #parseCfg() {
    return [...this.el.querySelectorAll(':scope > div > div:first-child')].reduce((acc, div) => {
      acc[div.textContent.trim().toLowerCase().replace(/ /g, '-')] = toBool(div.nextElementSibling?.textContent?.trim() || '');
      return acc;
    }, {});
  }

  #parseConcurrent(meta) {
    const matches = Object.keys(meta).filter(k => k.startsWith('concurrentvideoid')).map(k => k.replace('concurrentvideoid', ''));
    return [...new Set(matches)].sort((a,b) => a-b).map(i => ({
      videoid: meta[`concurrentvideoid${i}`],
      aslid: meta[`concurrentaslid${i}`],
      title: meta[`concurrenttitle${i}`],
      description: meta[`concurrentdescription${i}`],
      thumbnail: meta[`concurrentthumbnail${i}`],
    }));
  }

  async #loadStore() {
    try {
      const { mobileRiderStore } = await import(new URL('../../features/timing-framework/plugins/mobile-rider/plugin.js', import.meta.url).href);
      this.store = mobileRiderStore;
    } catch (e) { this.log('Store Fail'); }
  }

  #updateStatus(id, live) {
    if (!this.store) return;
    const key = (this.mainID && this.store.get(this.mainID) !== undefined) ? this.mainID : id;
    if (this.store.get(key) !== undefined) this.store.set(key, live);
  }
}

export default (el) => new MobileRider(el);
