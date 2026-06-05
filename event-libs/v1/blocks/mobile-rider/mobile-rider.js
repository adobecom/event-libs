/* eslint-disable no-underscore-dangle */
import { createTag, getEventConfig } from '../../utils/utils.js';

const DRAWER_CSS_URL = new URL('./drawer.css', import.meta.url).href;
const BLOCK_CSS_URL = new URL('./mobile-rider.css', import.meta.url).href;

const CONFIG = {
  ANALYTICS: { PROVIDER: 'adobe' },
  SCRIPTS: {
    DEV_URL: '//assets.mobilerider.com/p/player-adobe-integration/player.min.js',
    PROD_URL: '//assets.mobilerider.com/p/adobe/player.min.js',
  },
  PLAYER: {
    DEFAULT_OPTIONS: { autoplay: true, controls: true, muted: true },
    CONTAINER_ID: 'mr-adobe',
    VIDEO_ID: 'idPlayer',
    VIDEO_CLASS: 'mobileRider_viewport',
  },
  ASL: { TOGGLE_CLASS: 'isASL', BUTTON_ID: 'asl-button', CHECK_INTERVAL: 100, MAX_CHECKS: 50 },
  STORE: { ATTACH_RETRIES: 20, ATTACH_INTERVAL_MS: 5 },
};

/** * UTILITIES */
const getEnv = () => getEventConfig()?.miloConfig?.env?.name || 'prod';
const isProd = () => getEnv() === 'prod';
const toBool = (v) => {
  if (typeof v !== 'string') return v;
  const s = v.trim().toLowerCase();
  if (s === 'true') return true;
  if (s === 'false') return false;
  return v;
};

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

  #storeHas(id) {
    if (!this.store || !id) return false;
    try {
      return this.store.get(id) != null;
    } catch (e) {
      return false;
    }
  }

  async init() {
    try {
      if (!document.getElementById('mobile-rider-css')) {
        createTag('link', { rel: 'stylesheet', href: BLOCK_CSS_URL, id: 'mobile-rider-css' }, '', { parent: document.head });
      }
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

    const finish = () => {
      setTimeout(() => { this.isEmbedding = false; }, 100);
    };

    try {
      if (window.__mr_player) {
        try { window.__mr_player.dispose?.(); } catch (e) { /* ignore */ }
        window.__mr_player = null;
      }

      this.wrap.innerHTML = '';

      const container = createTag('div', {
        class: 'mobile-rider-container',
        id: CONFIG.PLAYER.CONTAINER_ID,
        'data-videoid': vid,
      }, '', { parent: this.wrap });

      createTag('video', {
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
          finish();
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
          if (asl) this.#initASL(container, vid);
          this.#maybeAttachEndListener(vid);
        } catch (e) {
          this.log(`Embed Error: ${e.message}`);
        }

        finish();
      });
    } catch (e) {
      this.log(`Inject Error: ${e.message}`);
      finish();
    }
  }

  #getOverrides() {
    return Object.keys(CONFIG.PLAYER.DEFAULT_OPTIONS).reduce((acc, k) => {
      if (k in this.cfg) acc[k] = toBool(this.cfg[k]);
      return acc;
    }, {});
  }

  #maybeAttachEndListener(vid) {
    const tryAttach = () => {
      const mainTracked = this.#storeHas(this.mainID);
      const vidTracked = this.#storeHas(vid);
      if (mainTracked || vidTracked) {
        this.#attachEndListener(vid);
        return true;
      }
      return false;
    };

    if (tryAttach()) return;

    // Retry a bit: supports tests where instance.store is assigned after init()
    let attempts = 0;
    const tick = () => {
      attempts += 1;
      if (tryAttach()) return;
      if (attempts >= CONFIG.STORE.ATTACH_RETRIES) return;
      setTimeout(tick, CONFIG.STORE.ATTACH_INTERVAL_MS);
    };
    setTimeout(tick, 0);
  }

  #attachEndListener(vid) {
    // Avoid stacking listeners
    window.__mr_player?.off?.('streamend');
    window.__mr_player?.on?.('streamend', () => {
      if (this.drawer) {
        this.drawer.remove();
        this.drawer = null;
      }

      if (this.store) this.setStatus(vid, false);

      window.__mr_player?.dispose?.();
      window.__mr_player = null;
    });
  }

  async #selectInitialVideo(videos) {
    const urlIdxRaw = new URLSearchParams(window.location.search).get('video');
    const urlIdx = urlIdxRaw ? parseInt(urlIdxRaw, 10) : null;
    if (urlIdx && videos[urlIdx - 1]) return videos[urlIdx - 1];

    const sessionTitle = sessionStorage?.getItem('concurrentVideoTitle');
    if (sessionTitle) {
      const found = videos.find((v) => v.title?.trim() === sessionTitle.trim());
      if (found) {
        sessionStorage.removeItem('concurrentVideoTitle');
        return found;
      }
    }
    return videos[0];
  }

  async #initDrawer(videos, activeId) {
    if (!document.getElementById('mobile-rider-drawer-css')) {
      createTag('link', { rel: 'stylesheet', href: DRAWER_CSS_URL, id: 'mobile-rider-drawer-css' }, '', { parent: document.head });
    }
    const { default: createDrawer } = await import('./drawer.js');
    this.drawer = createDrawer(this.root, {
      items: videos,
      renderItem: (v) => this.#renderDrawerItem(v),
      onItemClick: (_el, v) => this.#activateVideo(v),
    });
    this.drawer?.setActiveById?.(activeId);
  }

  #activateVideo(v) {
    const idx = this.allVideos.indexOf(v) + 1;
    const url = new URL(window.location.href);
    if (idx === 1) url.searchParams.delete('video');
    else url.searchParams.set('video', String(idx));
    if (url.toString() !== window.location.href) window.history.replaceState({}, '', url.toString());
    this.injectPlayer(v.videoid, this.cfg.skinid, v.aslid);
  }

  #renderDrawerItem(v) {
    const item = createTag('div', { class: 'drawer-item', 'data-id': v.videoid, role: 'button', tabindex: '0' });
    if (v.thumbnail) {
      const thumb = createTag('div', { class: 'drawer-item-thumbnail' }, '', { parent: item });
      createTag('img', { src: v.thumbnail }, '', { parent: thumb });
    }
    const content = createTag('div', { class: 'drawer-item-content' }, '', { parent: item });
    createTag('div', { class: 'drawer-item-title' }, v.title || '', { parent: content });
    createTag('div', { class: 'drawer-item-description' }, v.description || '', { parent: content });
    return item;
  }

  #initASL(container, vid) {
    let currentCheck = null;
    let pollCount = 0;
    const poll = () => {
      pollCount += 1;
      console.log(`[ASL] poll() call #${pollCount} — clearing previous interval:`, currentCheck);
      clearInterval(currentCheck);
      let attempts = 0;
      currentCheck = setInterval(() => {
        const btn = container.querySelector(`#${CONFIG.ASL.BUTTON_ID}`);
        if (btn || ++attempts > CONFIG.ASL.MAX_CHECKS) {
          clearInterval(currentCheck);
          currentCheck = null;
          if (btn) {
            console.log(`[ASL] button found on poll #${pollCount} — attaching { once: true } listener`);
            btn.addEventListener('click', () => {
              console.log(`[ASL] button clicked (poll #${pollCount}) — handler firing once then removing itself`);
              if (this.store) this.#attachEndListener(vid);
              if (!container.classList.contains(CONFIG.ASL.TOGGLE_CLASS)) {
                container.classList.add(CONFIG.ASL.TOGGLE_CLASS);
              }
              poll();
            }, { once: true });
          } else {
            console.log('[ASL] max attempts reached — button not found');
          }
        }
      }, CONFIG.ASL.CHECK_INTERVAL);
    };
    poll();
  }

  #parseCfg() {
    if (this.el.dataset.extractedVideoId) {
      return {
        videoid: this.el.dataset.extractedVideoId,
        skinid: this.el.dataset.extractedSkinId || '',
        autoplay: toBool(this.el.dataset.extractedAutoplay || 'true'),
        poster: this.el.dataset.extractedThumbnail || '',
        concurrentenabled: false,
      };
    }

    return [...this.el.querySelectorAll(':scope > div > div:first-child')].reduce((acc, div) => {
      const key = div.textContent.trim().toLowerCase().replace(/ /g, '-');
      acc[key] = toBool(div.nextElementSibling?.textContent?.trim() || '');
      return acc;
    }, {});
  }

  #parseConcurrent(meta) {
    const matches = Object.keys(meta)
      .filter((k) => k.startsWith('concurrentvideoid'))
      .map((k) => k.replace('concurrentvideoid', ''));

    return [...new Set(matches)].sort((a, b) => Number(a) - Number(b)).map((i) => ({
      videoid: meta[`concurrentvideoid${i}`],
      aslid: meta[`concurrentaslid${i}`],
      title: meta[`concurrenttitle${i}`],
      description: meta[`concurrentdescription${i}`],
      thumbnail: meta[`concurrentthumbnail${i}`],
    }));
  }

  async #loadStore() {
    try {
      const { mobileRiderStore } = await import(
        new URL('../../features/timing-framework/plugins/mobile-rider/plugin.js', import.meta.url).href
      );
      this.store = mobileRiderStore;
    } catch (e) { this.log('Store Fail'); }
  }

  setStatus(id, live) { this.#updateStatus(id, live); }

  #updateStatus(id, live) {
    if (!this.store) return;

    const key = this.#storeHas(this.mainID)
      ? this.mainID
      : (this.#storeHas(id) ? id : null);

    if (!key) return;

    try {
      if (this.store.get(key) === live) return;
      this.store.set(key, live);
    } catch (e) {
      this.log(`Status update failed: ${e.message}`);
    }
  }
}

/**
 * URL/Anchor Helpers
 */
function extractVideoParamsFromHref(anchor) {
  try {
    const href = anchor.getAttribute('href');
    if (!href) return null;
    const url = new URL(href, window.location.href);

    const videoId = url.searchParams.get('videoId')
      || url.searchParams.get('id')
      || url.pathname.split('/').pop();

    if (!videoId || videoId.includes('.html')) return null;

    return {
      videoId,
      skinId: url.searchParams.get('skinId'),
      autoplay: url.searchParams.get('autoplay'),
      thumbnail: url.searchParams.get('thumbnail'),
    };
  } catch (e) { return null; }
}

function handleAnchorElement(anchor) {
  if (anchor.tagName !== 'A' || !anchor.classList.contains('link-block')) return anchor;

  const params = extractVideoParamsFromHref(anchor);
  if (!params || !params.videoId) return anchor;

  const mobileRiderDiv = createTag('div', { class: 'mobile-rider' });

  mobileRiderDiv.dataset.extractedVideoId = params.videoId;
  if (params.skinId) mobileRiderDiv.dataset.extractedSkinId = params.skinId;
  if (params.autoplay) mobileRiderDiv.dataset.extractedAutoplay = params.autoplay;
  if (params.thumbnail) mobileRiderDiv.dataset.extractedThumbnail = params.thumbnail;

  anchor.insertAdjacentElement('afterend', mobileRiderDiv);
  anchor.remove();

  return mobileRiderDiv;
}

export default (el) => {
  const processedEl = handleAnchorElement(el);
  return new MobileRider(processedEl);
};
