/* eslint-disable no-underscore-dangle */
import { createTag, getEventConfig } from '../../utils/utils.js';

const DRAWER_CSS_URL = new URL('./drawer.css', import.meta.url).href;

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
  ASL: {
    TOGGLE_CLASS: 'isASL',
    BUTTON_ID: 'asl-button',
    CHECK_INTERVAL: 100,
    MAX_CHECKS: 50,
  },
  API: {
    PROD_URL: 'https://overlay-admin-integration.mobilerider.com',
    DEV_URL: 'https://overlay-admin-integration.mobilerider.com',
  },
  POSTER: {
    CLEANUP_TIMEOUT_MS: 4000,
  },
};

let scriptPromise = null;

function getEnvName() {
  const eventConfig = getEventConfig();
  return eventConfig?.miloConfig?.env?.name || 'prod';
}

function isProdEnv() {
  return getEnvName() === 'prod';
}

/**
 * Preload poster image for better LCP performance
 * @param {string} url
 */
function preloadPoster(url) {
  if (!url) return;
  const sel = `link[rel="preload"][as="image"][href="${url}"]`;
  if (document.querySelector(sel)) return;
  const l = document.createElement('link');
  l.rel = 'preload';
  l.as = 'image';
  l.href = url;
  document.head.appendChild(l);
}

/**
 * Show poster placeholder image
 * @param {HTMLElement} container
 * @param {string} poster
 * @param {string} altText
 * @returns {Function} cleanup
 */
function showPosterPlaceholder(container, poster, altText = 'Video poster') {
  if (!poster || !container) return () => {};
  let img = container.querySelector('.mr-poster');
  if (!img) {
    img = createTag('img', {
      src: poster,
      alt: altText,
      class: 'mr-poster',
      fetchpriority: 'high',
      loading: 'eager',
      decoding: 'async',
    });
    container.appendChild(img);
  }
  return () => img?.remove();
}

async function loadScript() {
  if (window.mobilerider) return null;
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise((resolve, reject) => {
    const src = isProdEnv() ? CONFIG.SCRIPTS.PROD_URL : CONFIG.SCRIPTS.DEV_URL;
    const s = createTag('script', { src });
    s.async = true;
    s.onload = resolve;
    s.onerror = () => reject(new Error(`Failed to load MobileRider script: ${src}`));
    document.head.appendChild(s);
  }).catch((e) => {
    scriptPromise = null;
    window.lana?.log?.(e.message);
    throw e;
  });

  return scriptPromise;
}

/**
 * Updates the URL with video parameter
 * @param {number|null} videoIndex - 1-based index, or null to remove
 */
function updateVideoUrlParam(videoIndex) {
  try {
    const url = new URL(window.location.href);
    if (videoIndex === null || videoIndex === 1) url.searchParams.delete('video');
    else if (videoIndex > 1) url.searchParams.set('video', String(videoIndex));

    const newUrl = url.toString();
    if (newUrl !== window.location.href) window.history.replaceState({}, '', newUrl);
  } catch (e) {
    window.lana?.log?.(`Failed to update video URL parameter: ${e.message}`);
  }
}

/**
 * Finds a video whose title matches sessionStorage concurrentVideoTitle (one-time)
 * Also updates URL param if found.
 * @param {Array} videos
 * @returns {Object|undefined}
 */
function getConcurrentVideoBySessionStorage(videos) {
  const t = (sessionStorage?.getItem('concurrentVideoTitle') || '').trim();
  if (!t) return undefined;

  let idx = -1;
  const v = videos.find((video, i) => {
    if ((video.title || '').trim() !== t) return false;
    idx = i;
    return true;
  });

  if (!v) return undefined;

  sessionStorage?.removeItem('concurrentVideoTitle');
  const videoIndex = idx + 1;
  updateVideoUrlParam(videoIndex === 1 ? null : videoIndex);
  return v;
}

function toBool(v) {
  if (typeof v === 'boolean') return v;
  if (typeof v !== 'string') return v;
  const s = v.trim().toLowerCase();
  if (s === 'true') return true;
  if (s === 'false') return false;
  return v;
}

class MobileRider {
  constructor(el) {
    this.el = el;
    this.cfg = null;
    this.wrap = null;
    this.root = null;
    this.store = null;
    this.mainID = null;
    this.selectedVideoId = null;
    this.currentVideoId = null;
    this.drawer = null;
    this.allVideos = null;
    this.isEmbedding = false;
    this.init();
  }

  log(msg) {
    window.lana?.log?.(msg);
  }

  async init() {
    try {
      await this.loadDependencies();
      this.cfg = this.parseCfg();
      const { container, wrapper } = this.createDOM();
      this.root = container;
      this.wrap = wrapper;

      const isConcurrent = !!this.cfg.concurrentenabled;
      const videos = isConcurrent ? this.cfg.concurrentVideos : [this.cfg];
      this.allVideos = videos;

      const defaultVideo = videos[0];
      if (!defaultVideo?.videoid) return this.log('Missing video-id in config.');

      const { video: selectedVideo, source } = isConcurrent
        ? await this.selectVideo(videos, defaultVideo)
        : { video: defaultVideo, source: 'default' };

      const { videoid, aslid } = selectedVideo || {};
      if (!videoid) return this.log('Missing video-id in selected video.');

      if (isConcurrent && this.store && !this.mainID) this.mainID = videos[0].videoid;

      if (source !== 'default') this.log(`Mobile-rider video selected via ${source}: ${videoid}`);

      await this.loadPlayer(videoid, aslid);

      if (isConcurrent && videos.length > 1) {
        this.selectedVideoId = videoid;
        await this.initDrawer(videos);
        this.drawer?.setActiveById?.(videoid);
      }
    } catch (e) {
      this.log(`MobileRider Init error: ${e.message}`);
    }
  }

  async loadDependencies() {
    const storePromise = this.el.closest('.chrono-box')
      ? this.loadStore()
      : null;
    await loadScript();
    if (storePromise) await storePromise;
  }

  async loadStore() {
    try {
      const pluginUrl = new URL(
        '../../features/timing-framework/plugins/mobile-rider/plugin.js',
        import.meta.url,
      );
      const { mobileRiderStore } = await import(pluginUrl.href);
      this.store = mobileRiderStore;
    } catch (e) {
      this.log(`Failed to import mobileRiderStore: ${e.message}`);
    }
  }

  async loadPlayer(vid, asl) {
    try {
      this.injectPlayer(vid, this.cfg.skinid, asl);
    } catch (e) {
      this.log(`Failed to initialize the player: ${e.message}`);
    }
  }

  extractPlayerOverrides() {
    const overrides = {};
    Object.keys(CONFIG.PLAYER.DEFAULT_OPTIONS).forEach((key) => {
      if (!(key in this.cfg)) return;
      const val = this.cfg[key];
      overrides[key] = String(val).toLowerCase() === 'true';
    });
    return overrides;
  }

  getPlayerOptions() {
    return { ...CONFIG.PLAYER.DEFAULT_OPTIONS, ...this.extractPlayerOverrides() };
  }

  getOrCreateContainer(vid, skin, asl) {
    let con = this.wrap.querySelector('.mobile-rider-container');
    if (!con) {
      con = createTag('div', {
        class: 'mobile-rider-container is-hidden',
        id: CONFIG.PLAYER.CONTAINER_ID,
        'data-videoid': vid,
        'data-skinid': skin,
        'data-aslid': asl,
      });
      this.wrap.appendChild(con);
    } else {
      Object.assign(con.dataset, { videoid: vid, skinid: skin, aslid: asl });
      if (!con.parentNode) this.wrap.appendChild(con);
    }
    return con;
  }

  setupPoster(container) {
    const poster = this.cfg.poster || this.cfg.thumbnail;
    if (!poster) return null;
    preloadPoster(poster);
    return showPosterPlaceholder(container, poster, this.cfg.title);
  }

  cleanupPreviousPlayer(container) {
    const oldVideo = container.querySelector(`#${CONFIG.PLAYER.VIDEO_ID}`);

    if (window.__mr_player) {
      try {
        window.__mr_player.dispose();
      } catch (e) {
        this.log(`Error disposing player: ${e.message}`);
      } finally {
        window.__mr_player = null;
      }
    }

    oldVideo?.remove();
  }

  createVideoElement(container) {
    const poster = this.cfg.poster || this.cfg.thumbnail;
    const attrs = {
      id: CONFIG.PLAYER.VIDEO_ID,
      class: CONFIG.PLAYER.VIDEO_CLASS,
      controls: true,
      preload: 'metadata',
      playsinline: '',
    };
    if (poster) attrs.poster = poster;

    const video = createTag('video', attrs);
    container.appendChild(video);
    return video;
  }

  setupPosterCleanup(video, removePoster) {
    if (!removePoster) return;
    let done = false;
    const cleanup = () => {
      if (done) return;
      done = true;
      removePoster();
    };
    const t = setTimeout(cleanup, CONFIG.POSTER.CLEANUP_TIMEOUT_MS);
    video.addEventListener('loadeddata', () => {
      clearTimeout(t);
      cleanup();
    }, { once: true });
  }

  canEmbed(video) {
    if (!video?.parentNode) return { ok: false, msg: 'Video element not in DOM' };
    if (!window.mobilerider) return { ok: false, msg: 'mobilerider library not available' };
    const inDoc = document.getElementById(CONFIG.PLAYER.VIDEO_ID);
    if (!inDoc || inDoc !== video) return { ok: false, msg: 'Video element not found in document' };
    return { ok: true };
  }

  failEmbed(container, msg) {
    if (msg) this.log(msg);
    container?.classList?.add('is-hidden');
    this.isEmbedding = false;
  }

  embedPlayer(video, vid, skin, asl, container) {
    if (!video?.parentNode || !container?.parentNode) throw new Error('Video or container not properly attached to DOM');
    if (video.parentNode !== container) throw new Error('Video element parent mismatch');

    window.mobilerider.embed(video.id, vid, skin, {
      ...this.getPlayerOptions(),
      analytics: { provider: CONFIG.ANALYTICS.PROVIDER },
      identifier1: vid,
      identifier2: asl,
      sessionId: vid,
    });
  }

  maybeAttachStreamEndListener(vid) {
    if (!this.store) return;
    const key = (this.mainID && this.store.get(this.mainID) !== undefined)
      ? this.mainID
      : (this.store.get(vid) !== undefined ? vid : null);
    if (key) this.onStreamEnd(vid);
  }

  injectPlayer(vid, skin, asl = null) {
    if (!this.wrap) return;
    if (this.isEmbedding) return this.log('Embed already in progress, skipping');

    this.currentVideoId = vid;

    const container = this.getOrCreateContainer(vid, skin, asl);
    const removePoster = this.setupPoster(container);

    this.cleanupPreviousPlayer(container);

    const video = this.createVideoElement(container);
    const pre = this.canEmbed(video);
    if (!pre.ok) return this.failEmbed(container, pre.msg);

    this.setupPosterCleanup(video, removePoster);

    container.classList.remove('is-hidden');
    this.isEmbedding = true;

    requestAnimationFrame(() => {
      const finish = (msg) => this.failEmbed(container, msg);

      if (!this.wrap) return finish('Wrap removed from DOM');
      if (!container.parentNode || container.parentNode !== this.wrap) return finish('Container or wrap removed from DOM');

      const inDoc = document.getElementById(CONFIG.PLAYER.VIDEO_ID);
      if (!inDoc || inDoc !== video) return finish('Video element not ready for embedding');
      if (!window.mobilerider) return finish('mobilerider library not available');
      if (inDoc.parentNode !== container) return finish('Video element or container parent mismatch');
      if (!container.contains(inDoc)) return finish('Video element not contained in container');

      try {
        this.embedPlayer(video, vid, skin, asl, container);
        if (asl) this.initASL();
        this.maybeAttachStreamEndListener(vid);
      } catch (e) {
        return finish(`Error embedding player: ${e.message}`);
      }

      setTimeout(() => { this.isEmbedding = false; }, 100);
    });
  }

  onStreamEnd(vid) {
    window.__mr_player?.off?.('streamend');
    window.__mr_player?.on?.('streamend', () => {
      if (this.drawer) {
        this.drawer.remove();
        this.drawer = null;
      }
      this.setStatus(vid, false);
      MobileRider.dispose();
    });
  }

  static dispose() {
    window.__mr_player?.dispose?.();
    window.__mr_player = null;
    window.__mr_stream_published = null;
  }

  static loadDrawerCSS() {
    if (document.querySelector('link[href*="drawer.css"]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = DRAWER_CSS_URL;
    document.head.appendChild(link);
  }

  drawerHeading() {
    const title = this.cfg.drawertitle || 'Now Playing';
    const subtitle = this.cfg.drawersubtitle || 'Select a live session';
    const header = createTag('div', { class: 'now-playing-header' });
    header.innerHTML = `
      <p class="now-playing-title">${title}</p>
      <span class="now-playing-subtitle">${subtitle}</span>
    `;
    return header;
  }

  async initDrawer(videos) {
    try {
      MobileRider.loadDrawerCSS();
      const { default: createDrawer } = await import('./drawer.js');

      const renderItem = (v) => {
        const item = createTag('div', {
          class: 'drawer-item',
          'data-id': v.videoid,
          role: 'button',
          tabindex: '0',
        });

        const activate = () => this.onDrawerClick(v);
        item.addEventListener('click', activate);
        item.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            activate();
          }
        });

        if (v.thumbnail) {
          const thumb = createTag('div', { class: 'drawer-item-thumbnail' });
          thumb.appendChild(createTag('img', { src: v.thumbnail, alt: v.title || 'video thumbnail' }));
          item.appendChild(thumb);
        }

        const content = createTag('div', { class: 'drawer-item-content' });
        if (v.title) content.appendChild(createTag('div', { class: 'drawer-item-title' }, v.title));
        if (v.description) content.appendChild(createTag('div', { class: 'drawer-item-description' }, v.description));
        item.appendChild(content);

        return item;
      };

      this.drawer = createDrawer(this.root, {
        items: videos,
        ariaLabel: 'Videos',
        renderItem,
        onItemClick: () => {}, // we handle click/keydown inside renderItem to avoid loop risks
      });

      if (this.selectedVideoId) this.drawer?.setActiveById?.(this.selectedVideoId);

      const itemsList = this.drawer?.itemsEl;
      if (itemsList?.firstChild) itemsList.insertBefore(this.drawerHeading(), itemsList.firstChild);
    } catch (e) {
      this.log(`Drawer load failed: ${e.message}`);
    }
  }

  async onDrawerClick(v) {
    try {
      if (this.store) {
        const live = await this.checkLive(v);
        if (!live) this.log(`This stream is not currently live: ${v.videoid}`);
      }

      if (v.videoid) this.selectedVideoId = v.videoid;

      const videosArray = this.allVideos || [];
      const idx = v.videoid ? videosArray.findIndex((x) => x.videoid === v.videoid) : -1;
      if (idx >= 0) updateVideoUrlParam(idx + 1 === 1 ? null : idx + 1);
      else this.log(`Could not find video index for ${v.videoid}, URL param not updated`);

      this.drawer?.setActiveById?.(v.videoid);
      this.injectPlayer(v.videoid, this.cfg.skinid, v.aslid);
    } catch (e) {
      this.log(`Drawer item click error: ${e.message}`);
    }
  }

  static async getMediaStatus(id) {
    try {
      const baseUrl = isProdEnv() ? CONFIG.API.PROD_URL : CONFIG.API.DEV_URL;
      const res = await fetch(`${baseUrl}/api/media-status?ids=${id}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Failed to get media status');
      }
      return res.json();
    } catch (e) {
      window.lana?.log?.(`getMediaStatus error: ${e.message}`);
      throw e;
    }
  }

  async checkLive(v) {
    if (!v?.videoid) return false;
    try {
      const idToCheck = this.mainID || v.videoid;
      const { active } = await MobileRider.getMediaStatus(idToCheck);
      const isActive = (active || []).includes(idToCheck);
      this.setStatus(v.videoid, isActive);
      return isActive;
    } catch (e) {
      this.log(`checkLive failed: ${e.message}`);
      return false;
    }
  }

  setStatus(id, live) {
    if (!id || !this.store) return;

    try {
      let storeKey = null;
      if (this.mainID && this.store.get(this.mainID) !== undefined) storeKey = this.mainID;
      else if (this.store.get(id) !== undefined) storeKey = id;
      if (!storeKey) return;

      const current = this.store.get(storeKey);
      if (current === live) return;

      this.store.set(storeKey, live);
      this.log(`Status updated for ${storeKey}: ${live}`);
    } catch (e) {
      this.log(`setStatus error for ${this.mainID || id}: ${e.message}`);
    }
  }

  initASL() {
    const container = this.wrap?.querySelector('.mobile-rider-container');
    if (!container) return;

    let attempts = 0;
    const check = () => {
      const btn = container.querySelector(`#${CONFIG.ASL.BUTTON_ID}`);
      if (btn) return this.setupASL(btn, container);
      attempts += 1;
      if (attempts < CONFIG.ASL.MAX_CHECKS) setTimeout(check, CONFIG.ASL.CHECK_INTERVAL);
    };
    check();
  }

  setupASL(btn, container) {
    btn.addEventListener('click', () => {
      if (container.classList.contains(CONFIG.ASL.TOGGLE_CLASS)) return;
      container.classList.add(CONFIG.ASL.TOGGLE_CLASS);
      this.initASL();
    });
  }

  createDOM() {
    let root = this.el.querySelector('.mobile-rider-player');
    if (!root) {
      root = createTag('div', { class: 'mobile-rider-player' });
      this.el.appendChild(root);
    }

    let wrap = root.querySelector('.video-wrapper');
    if (!wrap) {
      wrap = createTag('div', { class: 'video-wrapper' });
      root.appendChild(wrap);
    }

    return { container: root, wrapper: wrap };
  }

  parseCfg() {
    const meta = Object.fromEntries(
      [...this.el.querySelectorAll(':scope > div > div:first-child')].map((div) => ([
        div.textContent.trim().toLowerCase().replace(/ /g, '-'),
        div.nextElementSibling?.textContent?.trim() || '',
      ])),
    );

    Object.keys(meta).forEach((k) => { meta[k] = toBool(meta[k]); });

    if (meta.concurrentenabled === true) meta.concurrentVideos = MobileRider.parseConcurrent(meta);

    return meta;
  }

  static parseConcurrent(meta) {
    const matches = Object.keys(meta)
      .map((k) => k.match(/^concurrentvideoid(\d+)$/))
      .filter(Boolean)
      .map((m) => m[1]);

    const uniq = [...new Set(matches)].sort((a, b) => Number(a) - Number(b));

    return uniq.map((i) => ({
      videoid: meta[`concurrentvideoid${i}`] || '',
      aslid: meta[`concurrentaslid${i}`] || '',
      title: meta[`concurrenttitle${i}`] || '',
      description: meta[`concurrentdescription${i}`] || '',
      thumbnail: meta[`concurrentthumbnail${i}`] || '',
    }));
  }

  async selectVideo(allVideos, defaultVideo) {
    const urlParams = new URLSearchParams(window.location.search);
    const raw = urlParams.get('video');
    const videoParam = raw ? parseInt(raw, 10) : null;

    if (videoParam && videoParam >= 1 && videoParam <= allVideos.length) {
      return { video: allVideos[videoParam - 1], source: 'param' };
    }

    const s = getConcurrentVideoBySessionStorage(allVideos);
    if (s) return { video: s, source: 'sessionStorage' };

    return { video: defaultVideo, source: 'default' };
  }
}

export default function init(el) {
  try {
    return new MobileRider(el);
  } catch (e) {
    window.lana?.log?.(`Mobile Rider init failed: ${e.message}`);
    return null;
  }
}
