/* eslint-disable no-underscore-dangle */
import { createTag, getEventConfig } from '../../utils/utils.js';

const DRAWER_CSS_URL = new URL('./drawer.css', import.meta.url).href;

const CONFIG = {
  ANALYTICS: { PROVIDER: 'adobe' },
  SCRIPTS: { DEV_URL: '//player.min.js', PROD_URL: 'player.min.js' },
  PLAYER: {
    DEFAULT_OPTIONS: { autoplay: true, controls: true, muted: true },
    CONTAINER_ID: 'mr-adobe',
    VIDEO_ID: 'idPlayer',
    VIDEO_CLASS: 'mobileRider_viewport',
  },
  ASL: { TOGGLE_CLASS: 'isASL', BUTTON_ID: 'asl-button', CHECK_INTERVAL: 100, MAX_CHECKS: 50 },
  API: { PROD_URL: 'mobilerider.com', DEV_URL: 'mobilerider.com' },
  POSTER: { CLEANUP_TIMEOUT_MS: 4000 },
};

// State for script loading
let scriptPromise = null;

/** * HELPER UTILITIES */
const getEnv = () => getEventConfig()?.miloConfig?.env?.name || 'prod';
const isProd = () => getEnv() === 'prod';
const toBool = (v) => (typeof v === 'string' ? v.trim().toLowerCase() === 'true' || (v.trim().toLowerCase() === 'false' ? false : v) : v);

const updateUrlParam = (idx) => {
  const url = new URL(window.location.href);
  if (!idx || idx === 1) url.searchParams.delete('video');
  else url.searchParams.set('video', String(idx));
  if (url.toString() !== window.location.href) window.history.replaceState({}, '', url.toString());
};

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
    this.state = { isEmbedding: false, currentVid: null, mainID: null, drawer: null, videos: [] };
    this.init();
  }

  log(msg) { window.lana?.log?.(`[MobileRider] ${msg}`); }

  async init() {
    try {
      this.cfg = this.#parseCfg();
      await this.#loadDeps();
      
      this.#setupDOM();
      this.state.videos = this.cfg.concurrentenabled ? this.#parseConcurrent(this.cfg) : [this.cfg];
      
      const selected = await this.#selectInitialVideo();
      if (!selected?.videoid) return this.log('No Video ID found');

      if (this.cfg.concurrentenabled && this.store) this.state.mainID = this.state.videos[0].videoid;

      await this.injectPlayer(selected.videoid, this.cfg.skinid, selected.aslid);

      if (this.cfg.concurrentenabled && this.state.videos.length > 1) {
        await this.#initDrawer(selected.videoid);
      }
    } catch (e) { this.log(e.message); }
  }

  #parseCfg() {
    const rows = [...this.el.querySelectorAll(':scope > div > div:first-child')];
    return rows.reduce((acc, div) => {
      const key = div.textContent.trim().toLowerCase().replace(/ /g, '-');
      acc[key] = toBool(div.nextElementSibling?.textContent?.trim() || '');
      return acc;
    }, {});
  }

  #parseConcurrent(meta) {
    const ids = [...new Set(Object.keys(meta)
      .filter(k => k.startsWith('concurrentvideoid'))
      .map(k => k.replace('concurrentvideoid', '')))].sort((a, b) => a - b);
    return ids.map(i => ({
      videoid: meta[`concurrentvideoid${i}`],
      aslid: meta[`concurrentaslid${i}`],
      title: meta[`concurrenttitle${i}`],
      description: meta[`concurrentdescription${i}`],
      thumbnail: meta[`concurrentthumbnail${i}`],
    }));
  }

  async #loadDeps() {
    const storeTask = this.el.closest('.chrono-box') ? this.#loadStore() : null;
    await loadScript();
    if (storeTask) await storeTask;
  }

  async #loadStore() {
    try {
      const { mobileRiderStore } = await import(new URL('../../features/timing-framework/plugins/mobile-rider/plugin.js', import.meta.url).href);
      this.store = mobileRiderStore;
    } catch (e) { this.log('Store failed'); }
  }

  #setupDOM() {
    this.root = this.el.querySelector('.mobile-rider-player') || createTag('div', { class: 'mobile-rider-player' }, '', this.el);
    this.wrap = this.root.querySelector('.video-wrapper') || createTag('div', { class: 'video-wrapper' }, '', this.root);
  }

  async #selectInitialVideo() {
    const urlIdx = new URLSearchParams(window.location.search).get('video');
    if (urlIdx && this.state.videos[urlIdx - 1]) return this.state.videos[urlIdx - 1];

    const sessionTitle = sessionStorage?.getItem('concurrentVideoTitle');
    if (sessionTitle) {
      const found = this.state.videos.find(v => v.title?.trim() === sessionTitle.trim());
      if (found) {
        sessionStorage.removeItem('concurrentVideoTitle');
        updateUrlParam(this.state.videos.indexOf(found) + 1);
        return found;
      }
    }
    return this.state.videos[0];
  }

  async injectPlayer(vid, skin, asl = null) {
    if (this.state.isEmbedding) return;
    this.state.isEmbedding = true;

    // UI Cleanup
    if (window.__mr_player) {
      try { window.__mr_player.dispose(); } catch (e) { this.log(e.message); }
      window.__mr_player = null;
    }
    this.wrap.innerHTML = '';

    const container = createTag('div', {
      class: 'mobile-rider-container',
      id: CONFIG.PLAYER.CONTAINER_ID,
      'data-videoid': vid,
    }, '', this.wrap);

    const poster = this.cfg.poster || this.cfg.thumbnail;
    const video = createTag('video', {
      id: CONFIG.PLAYER.VIDEO_ID,
      class: CONFIG.PLAYER.VIDEO_CLASS,
      controls: true,
      playsinline: '',
      poster: poster || '',
    }, '', container);

    requestAnimationFrame(() => {
      try {
        window.mobilerider.embed(video.id, vid, skin, {
          ...CONFIG.PLAYER.DEFAULT_OPTIONS,
          ...this.#getOverrides(),
          analytics: { provider: CONFIG.ANALYTICS.PROVIDER },
          identifier1: vid,
          identifier2: asl,
        });
        if (asl) this.#initASL(container);
        this.#attachEndListener(vid);
      } catch (e) { this.log(e.message); }
      this.state.isEmbedding = false;
    });
  }

  #getOverrides() {
    return Object.keys(CONFIG.PLAYER.DEFAULT_OPTIONS).reduce((acc, k) => {
      if (k in this.cfg) acc[k] = toBool(this.cfg[k]);
      return acc;
    }, {});
  }

  #attachEndListener(vid) {
    window.__mr_player?.on?.('streamend', () => {
      this.state.drawer?.remove();
      this.#updateStatus(vid, false);
      window.__mr_player?.dispose?.();
    });
  }

  async #initDrawer(activeId) {
    if (!document.querySelector('link[href*="drawer.css"]')) {
      createTag('link', { rel: 'stylesheet', href: DRAWER_CSS_URL }, '', document.head);
    }
    const { default: createDrawer } = await import('./drawer.js');
    this.state.drawer = createDrawer(this.root, {
      items: this.state.videos,
      renderItem: (v) => this.#renderItem(v),
    });
    this.state.drawer?.setActiveById?.(activeId);
    this.#addDrawerHeader();
  }

  #renderItem(v) {
    const item = createTag('div', { class: 'drawer-item', 'data-id': v.videoid, role: 'button', tabindex: '0' });
    item.innerHTML = `
      ${v.thumbnail ? `<div class="drawer-item-thumbnail"><img src="${v.thumbnail}" /></div>` : ''}
      <div class="drawer-item-content">
        <div class="drawer-item-title">${v.title || ''}</div>
        <div class="drawer-item-description">${v.description || ''}</div>
      </div>`;
    
    const action = async () => {
      if (this.store && !(await this.#checkLive(v))) return;
      updateUrlParam(this.state.videos.indexOf(v) + 1);
      this.state.drawer.setActiveById(v.videoid);
      this.injectPlayer(v.videoid, this.cfg.skinid, v.aslid);
    };

    item.addEventListener('click', action);
    item.addEventListener('keydown', e => (e.key === 'Enter' || e.key === ' ') && action());
    return item;
  }

  #addDrawerHeader() {
    const header = createTag('div', { class: 'now-playing-header' });
    header.innerHTML = `<p class="now-playing-title">${this.cfg.drawertitle || 'Now Playing'}</p>
                        <span class="now-playing-subtitle">${this.cfg.drawersubtitle || 'Select a session'}</span>`;
    this.state.drawer.itemsEl.prepend(header);
  }

  async #checkLive(v) {
    try {
      const base = isProd() ? CONFIG.API.PROD_URL : CONFIG.API.DEV_URL;
      const res = await fetch(`${base}/api/media-status?ids=${this.state.mainID || v.videoid}`);
      const { active = [] } = await res.json();
      const isLive = active.includes(this.state.mainID || v.videoid);
      this.#updateStatus(v.videoid, isLive);
      return isLive;
    } catch (e) { return false; }
  }

  #updateStatus(id, live) {
    if (!this.store) return;
    const key = (this.state.mainID && this.store.get(this.state.mainID) !== undefined) ? this.state.mainID : id;
    if (this.store.get(key) !== undefined && this.store.get(key) !== live) this.store.set(key, live);
  }

  #initASL(container) {
    let attempts = 0;
    const check = setInterval(() => {
      const btn = container.querySelector(`#${CONFIG.ASL.BUTTON_ID}`);
      if (btn || ++attempts > CONFIG.ASL.MAX_CHECKS) {
        clearInterval(check);
        btn?.addEventListener('click', () => container.classList.add(CONFIG.ASL.TOGGLE_CLASS));
      }
    }, CONFIG.ASL.CHECK_INTERVAL);
  }
}

export default (el) => new MobileRider(el);
