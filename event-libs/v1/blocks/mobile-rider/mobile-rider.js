/* eslint-disable no-underscore-dangle */
import { createTag, getEventConfig } from '../../utils/utils.js';

const DRAWER_CSS_URL = new URL('./drawer.css', import.meta.url).href;

const CONFIG = {
  ANALYTICS: { PROVIDER: 'adobe' },
  SCRIPTS: {
    DEV_URL: '//assets.mobilerider.com/p/player-adobe-integration/player.min.js', // Leading // for protocol-relative or adjust to your dev path
    PROD_URL: '//assets.mobilerider.com/p/adobe/player.min.js',
  },
  PLAYER: {
    DEFAULT_OPTIONS: { autoplay: true, controls: true, muted: true },
    CONTAINER_ID: 'mr-adobe',
    VIDEO_ID: 'idPlayer',
    VIDEO_CLASS: 'mobileRider_viewport',
  },
  API: {
    PROD_URL: 'https://overlay-admin-integration.mobilerider.com',
    DEV_URL: 'https://overlay-admin-integration.mobilerider.com',
  },
  ASL: { TOGGLE_CLASS: 'isASL', BUTTON_ID: 'asl-button', CHECK_INTERVAL: 100, MAX_CHECKS: 50 },
};

/** * UTILITIES */
const getEnv = () => getEventConfig()?.miloConfig?.env?.name || 'prod';
const isProd = () => getEnv() === 'prod';
const toBool = (v) => (typeof v === 'string' ? v.trim().toLowerCase() === 'true' || (v.trim().toLowerCase() === 'false' ? false : v) : v);

let scriptPromise = null;
async function loadScript() {
  if (window.mobilerider) return;
  if (!scriptPromise) {
    const src = isProd() ? CONFIG.SCRIPTS.PROD_URL : CONFIG.SCRIPTS.DEV_URL;
    scriptPromise = new Promise((res, rej) => {
      const s = createTag('script', { src, async: true }, '', { parent: document.head });
    s.onload = res;
      s.onerror = () => { scriptPromise = null; rej(new Error('Script Load Fail')); };
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
    this.root = this.el.querySelector('.mobile-rider-player') 
                || createTag('div', { class: 'mobile-rider-player' }, '', { parent: this.el });
    
    this.wrap = this.root.querySelector('.video-wrapper') 
                || createTag('div', { class: 'video-wrapper' }, '', { parent: this.root });
  }

  async injectPlayer(vid, skin, asl = null) {
    if (!this.wrap || this.isEmbedding) return;
    this.isEmbedding = true;

    if (window.__mr_player) {
      try { window.__mr_player.dispose(); } catch (e) { /* ignore */ }
      window.__mr_player = null;
    }

    this.wrap.innerHTML = '';

    // Corrected createTag usage with { parent: ... }
    const container = createTag('div', {
      class: 'mobile-rider-container',
        id: CONFIG.PLAYER.CONTAINER_ID,
        'data-videoid': vid,
    }, '', { parent: this.wrap });

    const video = createTag('video', {
      id: CONFIG.PLAYER.VIDEO_ID,
      class: CONFIG.PLAYER.VIDEO_CLASS,
      controls: true,
      playsinline: '',
      poster: this.cfg.poster || this.cfg.thumbnail || '',
    }, '', { parent: container });

    requestAnimationFrame(() => {
      const videoInDoc = document.getElementById(CONFIG.PLAYER.VIDEO_ID);
      
      if (!videoInDoc || !window.mobilerider) {
        this.log('DOM or Library not ready');
        this.isEmbedding = false;
        return;
      }

      try {
        window.mobilerider.embed(videoInDoc.id, vid, skin, {
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
        this.log(`Embed Error: ${e.message}`);
      }
      
      setTimeout(() => { this.isEmbedding = false; }, 100);
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
      // 1. Always cleanup the UI regardless of store
      if (this.drawer) { 
        this.drawer.remove(); 
        this.drawer = null; 
      }
  
      // 2. Only update the store if it actually exists
      if (this.store) {
        this.#updateStatus(vid, false);
      }
  
      // 3. Clean up the player instance
      window.__mr_player?.dispose?.();
      window.__mr_player = null;
    });
  }

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
      createTag('link', { rel: 'stylesheet', href: DRAWER_CSS_URL }, '', { parent: document.head });
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
    const cfg = [...this.el.querySelectorAll(':scope > div > div:first-child')].reduce((acc, div) => {
      acc[div.textContent.trim().toLowerCase().replace(/ /g, '-')] = toBool(div.nextElementSibling?.textContent?.trim() || '');
      return acc;
    }, {});
    
    // If parameters were extracted from anchor href (stored in dataset), use them
    const extractedVideoId = this.el.dataset.extractedVideoId;
    if (extractedVideoId && !cfg.videoid) {
      cfg.videoid = extractedVideoId;
    }
    
    const extractedSkinId = this.el.dataset.extractedSkinId;
    if (extractedSkinId && !cfg.skinid) {
      cfg.skinid = extractedSkinId;
    }
    
    const extractedAutoplay = this.el.dataset.extractedAutoplay;
    if (extractedAutoplay && !cfg.autoplay) {
      cfg.autoplay = extractedAutoplay;
    }
    
    const extractedThumbnail = this.el.dataset.extractedThumbnail;
    if (extractedThumbnail && !cfg.thumbnail) {
      cfg.thumbnail = extractedThumbnail;
    }
    
    return cfg;
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

/**
 * Extracts video parameters from anchor href query params
 * @param {HTMLAnchorElement} anchor - Anchor element
 * @returns {Object|null} Object with videoId, skinId, autoplay, thumbnail or null
 */
function extractVideoParamsFromHref(anchor) {
  try {
    const href = anchor.getAttribute('href');
    if (!href) return null;
    
    const url = new URL(href, window.location.href);
    const params = {
      videoId: url.searchParams.get('videoId') || url.searchParams.get('id') || url.searchParams.get('video-id'),
      skinId: url.searchParams.get('skinId'),
      autoplay: url.searchParams.get('autoplay'),
      thumbnail: url.searchParams.get('thumbnail'),
    };
    
    // Return null if no videoId found
    if (!params.videoId) return null;
    
    return params;
  } catch (e) {
    return null;
  }
}

/**
 * Handles anchor tag conversion to mobile-rider div
 * @param {HTMLAnchorElement} anchor - Anchor element to convert
 * @returns {HTMLElement} New div element or original anchor
 */
function handleAnchorElement(anchor) {
  if (anchor.tagName !== 'A' || !anchor.classList.contains('link-block')) {
    return anchor;
  }

  const params = extractVideoParamsFromHref(anchor);
  if (!params || !params.videoId) {
    window.lana?.log?.('[MobileRider] Could not extract video-id from anchor href');
    return anchor;
  }

  // Create new div element with mobile-rider class
  const mobileRiderDiv = createTag('div', { class: 'mobile-rider' });
  
  // Store extracted parameters on the element for later use
  mobileRiderDiv.dataset.extractedVideoId = params.videoId;
  if (params.skinId) {
    mobileRiderDiv.dataset.extractedSkinId = params.skinId;
  }
  if (params.autoplay) {
    mobileRiderDiv.dataset.extractedAutoplay = params.autoplay;
  }
  if (params.thumbnail) {
    mobileRiderDiv.dataset.extractedThumbnail = params.thumbnail;
  }
  
  // Insert after anchor and remove anchor
  anchor.insertAdjacentElement('afterend', mobileRiderDiv);
  anchor.remove();
  
  return mobileRiderDiv;
}

export default (el) => {
  // Handle anchor tag conversion if needed
  const processedEl = handleAnchorElement(el);
  
  // Create MobileRider instance (extractedVideoId is already in dataset)
  return new MobileRider(processedEl);
};
