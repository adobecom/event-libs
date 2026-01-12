/* eslint-disable no-underscore-dangle */
import { createTag, getEventConfig } from '../../utils/utils.js';

const DRAWER_CSS_URL = new URL('./drawer.css', import.meta.url).href;

const CONFIG = {
  ANALYTICS: { PROVIDER: 'adobe' },
  SCRIPTS: {
    DEV_URL: '//assets.mobilerider.com/p/player-adobe-integration/player.min.js',
    PROD_URL: '//assets.mobilerider.com/p/adobe/player.min.js',
  },
  API: {
    DEV_URL: 'https://overlay-admin-integration.mobilerider.com',
    PROD_URL: 'https://overlay-admin-integration.mobilerider.com',
  },
  PLAYER: {
    DEFAULT_OPTIONS: { autoplay: true, controls: true, muted: true },
    CONTAINER_ID: 'mr-adobe',
    VIDEO_ID: 'idPlayer',
    VIDEO_CLASS: 'mobileRider_viewport',
  },
  ASL: {
    TOGGLE_CLASS: 'isASL',
    BUTTON_ID: 'asl-button',
    CHECK_INTERVAL: 100,
    MAX_CHECKS: 50,
  },
};

/** * GLOBAL UTILITIES 
 */
const getEnv = () => getEventConfig()?.miloConfig?.env?.name || 'prod';
const isProd = () => getEnv() === 'prod';

const toBool = (v) => {
  if (typeof v === 'boolean') return v;
  if (typeof v !== 'string') return v;
  const s = v.trim().toLowerCase();
  return s === 'true' ? true : (s === 'false' ? false : v);
};

let scriptPromise = null;
async function loadMobileRiderScript() {
  if (window.mobilerider) return;
  if (!scriptPromise) {
    const src = isProd() ? CONFIG.SCRIPTS.PROD_URL : CONFIG.SCRIPTS.DEV_URL;
    scriptPromise = new Promise((resolve, reject) => {
      const s = createTag('script', { src, async: true });
      s.onload = resolve;
      s.onerror = () => { scriptPromise = null; reject(new Error(`Load fail: ${src}`)); };
      document.head.appendChild(s);
    });
  }
  return scriptPromise;
}

/** * MAIN CLASS 
 */
class MobileRider {
  constructor(el) {
    this.el = el;
    this.state = {
      isEmbedding: false,
      currentVid: null,
      mainID: null,
      drawer: null,
      allVideos: [],
    };
    this.init();
  }

  #log(msg) { window.lana?.log?.(`[MobileRider] ${msg}`); }

  async init() {
    try {
      this.cfg = this.#parseConfig();
      
      // Load dependencies (Script & Store)
      const deps = [loadMobileRiderScript()];
      if (this.el.closest('.chrono-box')) deps.push(this.#loadStore());
      await Promise.all(deps);

      this.#setupDOM();

      const videos = this.cfg.concurrentenabled ? this.cfg.concurrentVideos : [this.cfg];
      this.state.allVideos = videos;
      if (this.cfg.concurrentenabled) this.state.mainID = videos[0]?.videoid;

      const selected = await this.#determineInitialVideo(videos);
      
      // Initial Player Load
      await this.renderPlayer(selected);

      // Setup Drawer if multiple videos exist
      if (this.cfg.concurrentenabled && videos.length > 1) {
        await this.#initDrawer(videos, selected.videoid);
      }
    } catch (e) {
      this.#log(`Init error: ${e.message}`);
    }
  }

  #parseConfig() {
    const data = [...this.el.querySelectorAll(':scope > div > div:first-child')].reduce((acc, div) => {
      const key = div.textContent.trim().toLowerCase().replace(/ /g, '-');
      acc[key] = toBool(div.nextElementSibling?.textContent?.trim() || '');
      return acc;
    }, {});

    if (data.concurrentenabled) {
      const ids = [...new Set(Object.keys(data)
        .filter(k => k.startsWith('concurrentvideoid'))
        .map(k => k.replace('concurrentvideoid', '')))].sort((a, b) => a - b);

      data.concurrentVideos = ids.map(i => ({
        videoid: data[`concurrentvideoid${i}`],
        aslid: data[`concurrentaslid${i}`],
        title: data[`concurrenttitle${i}`],
        description: data[`concurrentdescription${i}`],
        thumbnail: data[`concurrentthumbnail${i}`],
      }));
    }
    return data;
  }

  #setupDOM() {
    this.root = this.el.querySelector('.mobile-rider-player') || createTag('div', { class: 'mobile-rider-player' }, '', this.el);
    this.wrap = this.root.querySelector('.video-wrapper') || createTag('div', { class: 'video-wrapper' }, '', this.root);
  }

  async #determineInitialVideo(videos) {
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

  async #getMediaStatus(id) {
    try {
      const domain = isProd() ? CONFIG.API.PROD_URL : CONFIG.API.DEV_URL;
      const res = await fetch(`https://${domain}/api/media-status?ids=${id}`);
      return res.ok ? await res.json() : { active: [] };
    } catch (e) {
      return { active: [] };
    }
  }

  async #checkLiveStatus(videoObj) {
    if (!videoObj.videoid || !this.store) return true;
    const idToCheck = this.state.mainID || videoObj.videoid;
    const { active = [] } = await this.#getMediaStatus(idToCheck);
    const isActive = active.includes(idToCheck);

    const storeKey = (this.state.mainID && this.store.get(this.state.mainID) !== undefined) 
      ? this.state.mainID 
      : videoObj.videoid;

    if (this.store.get(storeKey) !== isActive) {
      this.store.set(storeKey, isActive);
    }
    return isActive;
  }

  async renderPlayer(videoObj) {
    if (this.state.isEmbedding || !videoObj.videoid) return;
    this.state.isEmbedding = true;

    await this.#checkLiveStatus(videoObj);

    // Cleanup previous player
    if (window.__mr_player) {
      try { window.__mr_player.dispose(); } catch (e) { /* ignore */ }
      window.__mr_player = null;
    }
    this.wrap.innerHTML = '';

    const container = createTag('div', {
      class: 'mobile-rider-container',
      id: CONFIG.PLAYER.CONTAINER_ID,
    }, '', this.wrap);

    const videoEl = createTag('video', {
      id: CONFIG.PLAYER.VIDEO_ID,
      class: CONFIG.PLAYER.VIDEO_CLASS,
      controls: true,
      playsinline: '',
      poster: videoObj.thumbnail || this.cfg.poster || '',
    }, '', container);

    try {
      window.mobilerider.embed(videoEl.id, videoObj.videoid, this.cfg.skinid, {
        ...CONFIG.PLAYER.DEFAULT_OPTIONS,
        analytics: { provider: CONFIG.ANALYTICS.PROVIDER },
        identifier1: videoObj.videoid,
        identifier2: videoObj.aslid || '',
      });

      if (videoObj.aslid) this.#initASL(container);
      this.#attachStreamEndListener(videoObj.videoid);
    } catch (e) {
      this.#log(`Embed Error: ${e.message}`);
    } finally {
      this.state.isEmbedding = false;
    }
  }

  #attachStreamEndListener(vid) {
    window.__mr_player?.on?.('streamend', () => {
      if (this.state.drawer) {
        this.state.drawer.remove?.();
        this.state.drawer = null;
      }
      const storeKey = this.state.mainID || vid;
      if (this.store) this.store.set(storeKey, false);
      window.__mr_player?.dispose?.();
    });
  }

  async #initDrawer(videos, activeId) {
    if (!document.querySelector(`link[href="${DRAWER_CSS_URL}"]`)) {
      createTag('link', { rel: 'stylesheet', href: DRAWER_CSS_URL }, '', document.head);
    }

    try {
      const { default: createDrawer } = await import('./drawer.js');
      this.state.drawer = createDrawer(this.root, {
        items: videos,
        renderItem: (v) => this.#renderDrawerItem(v),
      });
      this.state.drawer?.setActiveById?.(activeId);
      
      // Inject Header
      const header = createTag('div', { class: 'now-playing-header' });
      header.innerHTML = `<p class="now-playing-title">${this.cfg.drawertitle || 'Now Playing'}</p>
                          <span class="now-playing-subtitle">${this.cfg.drawersubtitle || 'Select a session'}</span>`;
      this.state.drawer?.itemsEl?.prepend(header);
    } catch (e) {
      this.#log('Drawer failed to load');
    }
  }

  #renderDrawerItem(v) {
    const item = createTag('div', { class: 'drawer-item', role: 'button', tabindex: '0', 'data-id': v.videoid });
    item.innerHTML = `
      ${v.thumbnail ? `<div class="drawer-item-thumbnail"><img src="${v.thumbnail}" alt="thumb" /></div>` : ''}
      <div class="drawer-item-content">
        <div class="drawer-item-title">${v.title || ''}</div>
        <div class="drawer-item-description">${v.description || ''}</div>
      </div>`;

    const select = () => {
      const idx = this.state.allVideos.indexOf(v) + 1;
      this.#updateUrl(idx);
      this.state.drawer?.setActiveById?.(v.videoid);
      this.renderPlayer(v);
    };

    item.addEventListener('click', select);
    item.addEventListener('keydown', e => (e.key === 'Enter' || e.key === ' ') && select());
    return item;
  }

  #updateUrl(idx) {
    const url = new URL(window.location.href);
    if (idx <= 1) url.searchParams.delete('video');
    else url.searchParams.set('video', idx);
    window.history.replaceState({}, '', url.toString());
  }

  async #loadStore() {
    try {
      const pluginUrl = new URL('../../features/timing-framework/plugins/mobile-rider/plugin.js', import.meta.url);
      const { mobileRiderStore } = await import(pluginUrl.href);
      this.store = mobileRiderStore;
    } catch (e) { /* ignore */ }
  }

  #initASL(container) {
    let attempts = 0;
    const check = setInterval(() => {
      const btn = container.querySelector(`#${CONFIG.ASL.BUTTON_ID}`);
      if (btn || ++attempts > CONFIG.ASL.MAX_CHECKS) {
        clearInterval(check);
        btn?.addEventListener('click', () => container.classList.toggle(CONFIG.ASL.TOGGLE_CLASS));
      }
    }, CONFIG.ASL.CHECK_INTERVAL);
  }
}

export default function init(el) {
  return new MobileRider(el);
}
