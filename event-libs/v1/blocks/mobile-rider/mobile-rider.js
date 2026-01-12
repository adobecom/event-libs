/* eslint-disable no-underscore-dangle */
import { createTag, getEventConfig } from '../../utils/utils.js';

const DRAWER_CSS_URL = new URL('./drawer.css', import.meta.url).href;

const CONFIG = {
  ANALYTICS: { PROVIDER: 'adobe' },
  SCRIPTS: {
    DEV_URL: 'player.min.js',
    PROD_URL: 'player.min.js',
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
    PROD_URL: 'mobilerider.com',
    DEV_URL: 'mobilerider.com',
  },
  POSTER: {
    CLEANUP_TIMEOUT_MS: 4000,
  },
};

let scriptPromise = null;

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Gets the current environment name
 * @returns {string} Environment name (default: 'prod')
 */
function getEnvName() {
  const eventConfig = getEventConfig();
  return eventConfig?.miloConfig?.env?.name || 'prod';
}

/**
 * Checks if current environment is production
 * @returns {boolean}
 */
function isProdEnv() {
  return getEnvName() === 'prod';
}

/**
 * Converts string values to boolean
 * @param {*} value - Value to convert
 * @returns {*} Converted value or original if not convertible
 */
function toBool(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return value;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  return value;
}

/**
 * Preload poster image for better LCP performance
 * @param {string} url - Poster image URL
 */
function preloadPoster(url) {
  if (!url) return;
  const selector = `link[rel="preload"][as="image"][href="${url}"]`;
  if (document.querySelector(selector)) return;

  const link = document.createElement('link');
  link.rel = 'preload';
  link.as = 'image';
  link.href = url;
  document.head.appendChild(link);
}

/**
 * Shows poster placeholder image
 * @param {HTMLElement} container - Container element
 * @param {string} poster - Poster image URL
 * @param {string} altText - Alt text for the image
 * @returns {Function} Cleanup function to remove the poster
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

/**
 * Loads the MobileRider player script
 * @returns {Promise<void>}
 */
async function loadScript() {
  if (window.mobilerider) return null;
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise((resolve, reject) => {
    const src = isProdEnv() ? CONFIG.SCRIPTS.PROD_URL : CONFIG.SCRIPTS.DEV_URL;
    const script = createTag('script', { src });
    script.async = true;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Failed to load MobileRider script: ${src}`));
    document.head.appendChild(script);
  }).catch((error) => {
    scriptPromise = null;
    window.lana?.log?.(error.message);
    throw error;
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
    if (videoIndex === null || videoIndex === 1) {
      url.searchParams.delete('video');
    } else if (videoIndex > 1) {
      url.searchParams.set('video', String(videoIndex));
    }

    const newUrl = url.toString();
    if (newUrl !== window.location.href) {
      window.history.replaceState({}, '', newUrl);
    }
  } catch (error) {
    window.lana?.log?.(`Failed to update video URL parameter: ${error.message}`);
  }
}

/**
 * Finds a video whose title matches sessionStorage concurrentVideoTitle (one-time)
 * Also updates URL param if found.
 * @param {Array} videos - Array of video objects
 * @returns {Object|undefined} - Matched video or undefined
 */
function getConcurrentVideoBySessionStorage(videos) {
  const concurrentTitle = (sessionStorage?.getItem('concurrentVideoTitle') || '').trim();
  if (!concurrentTitle) return undefined;

  let foundIndex = -1;
  const selectedVideo = videos.find((video, index) => {
    const videoTitle = (video.title || '').trim();
    if (videoTitle !== concurrentTitle) return false;
    foundIndex = index;
    return true;
  });

  if (!selectedVideo) return undefined;

  sessionStorage?.removeItem('concurrentVideoTitle');
  const videoIndex = foundIndex + 1;
  updateVideoUrlParam(videoIndex === 1 ? null : videoIndex);
  return selectedVideo;
}

// ============================================================================
// MobileRider Class
// ============================================================================

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

  /**
   * Logs a message using lana if available
   * @param {string} message - Message to log
   */
  log(message) {
    window.lana?.log?.(message);
  }

  /**
   * Initializes the MobileRider instance
   */
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
      if (!defaultVideo?.videoid) {
        return this.log('Missing video-id in config.');
      }

      const { video: selectedVideo, source } = isConcurrent
        ? await this.selectVideo(videos, defaultVideo)
        : { video: defaultVideo, source: 'default' };

      const { videoid, aslid } = selectedVideo || {};
      if (!videoid) {
        return this.log('Missing video-id in selected video.');
      }

      if (isConcurrent && this.store && !this.mainID) {
        this.mainID = videos[0].videoid;
      }

      if (source !== 'default') {
        this.log(`Mobile-rider video selected via ${source}: ${videoid}`);
      }

      await this.loadPlayer(videoid, aslid);

      if (isConcurrent && videos.length > 1) {
        this.selectedVideoId = videoid;
        await this.initDrawer(videos);
        this.drawer?.setActiveById?.(videoid);
      }
    } catch (error) {
      this.log(`MobileRider Init error: ${error.message}`);
    }
  }

  /**
   * Loads required dependencies (script and store)
   */
  async loadDependencies() {
    const storePromise = this.el.closest('.chrono-box') ? this.loadStore() : null;
    await loadScript();
    if (storePromise) await storePromise;
  }

  /**
   * Loads the mobile rider store plugin
   */
  async loadStore() {
    try {
      const pluginUrl = new URL(
        '../../features/timing-framework/plugins/mobile-rider/plugin.js',
        import.meta.url,
      );
      const { mobileRiderStore } = await import(pluginUrl.href);
      this.store = mobileRiderStore;
    } catch (error) {
      this.log(`Failed to import mobileRiderStore: ${error.message}`);
    }
  }

  /**
   * Loads the player with given video ID and ASL ID
   * @param {string} vid - Video ID
   * @param {string} asl - ASL ID
   */
  async loadPlayer(vid, asl) {
    try {
      this.injectPlayer(vid, this.cfg.skinid, asl);
    } catch (error) {
      this.log(`Failed to initialize the player: ${error.message}`);
    }
  }

  /**
   * Extracts player option overrides from config
   * @returns {Object} Player option overrides
   */
  extractPlayerOverrides() {
    const overrides = {};
    Object.keys(CONFIG.PLAYER.DEFAULT_OPTIONS).forEach((key) => {
      if (!(key in this.cfg)) return;
      const value = this.cfg[key];
      overrides[key] = String(value).toLowerCase() === 'true';
    });
    return overrides;
  }

  /**
   * Gets player options with overrides applied
   * @returns {Object} Player options
   */
  getPlayerOptions() {
    return { ...CONFIG.PLAYER.DEFAULT_OPTIONS, ...this.extractPlayerOverrides() };
  }

  /**
   * Gets or creates the player container element
   * @param {string} vid - Video ID
   * @param {string} skin - Skin ID
   * @param {string|null} asl - ASL ID
   * @returns {HTMLElement} Container element
   */
  getOrCreateContainer(vid, skin, asl) {
    let container = this.wrap.querySelector('.mobile-rider-container');
    if (!container) {
      container = createTag('div', {
        class: 'mobile-rider-container is-hidden',
        id: CONFIG.PLAYER.CONTAINER_ID,
        'data-videoid': vid,
        'data-skinid': skin,
        'data-aslid': asl,
      });
      this.wrap.appendChild(container);
    } else {
      Object.assign(container.dataset, { videoid: vid, skinid: skin, aslid: asl });
      if (!container.parentNode) {
        this.wrap.appendChild(container);
      }
    }
    return container;
  }

  /**
   * Sets up poster placeholder if poster is available
   * @param {HTMLElement} container - Container element
   * @returns {Function|null} Cleanup function to remove poster, or null
   */
  setupPoster(container) {
    const poster = this.cfg.poster || this.cfg.thumbnail;
    if (!poster) return null;
    preloadPoster(poster);
    return showPosterPlaceholder(container, poster, this.cfg.title);
  }

  /**
   * Disposes the previous player instance and removes old video element
   * @param {HTMLElement} container - Container element
   */
  cleanupPreviousPlayer(container) {
    const oldVideo = container.querySelector(`#${CONFIG.PLAYER.VIDEO_ID}`);

    if (window.__mr_player) {
      try {
        window.__mr_player.dispose();
      } catch (error) {
        this.log(`Error disposing player: ${error.message}`);
      } finally {
        window.__mr_player = null;
      }
    }

    oldVideo?.remove();
  }

  /**
   * Creates and appends the video element to the container
   * @param {HTMLElement} container - Container element
   * @returns {HTMLVideoElement} Created video element
   */
  createVideoElement(container) {
    const poster = this.cfg.poster || this.cfg.thumbnail;
    const attrs = {
      id: CONFIG.PLAYER.VIDEO_ID,
      class: CONFIG.PLAYER.VIDEO_CLASS,
      controls: true,
      preload: 'metadata',
      playsinline: '',
    };
    if (poster) {
      attrs.poster = poster;
    }

    const video = createTag('video', attrs);
    container.appendChild(video);
    return video;
  }

  /**
   * Sets up poster cleanup when video loads
   * @param {HTMLVideoElement} video - Video element
   * @param {Function} removePoster - Function to remove poster
   */
  setupPosterCleanup(video, removePoster) {
    if (!removePoster) return;

    let cleanupCalled = false;
    const cleanup = () => {
      if (cleanupCalled) return;
      cleanupCalled = true;
      removePoster();
    };

    const timeoutId = setTimeout(cleanup, CONFIG.POSTER.CLEANUP_TIMEOUT_MS);
    video.addEventListener('loadeddata', () => {
      clearTimeout(timeoutId);
      cleanup();
    }, { once: true });
  }

  /**
   * Validates that the video element is ready for embedding
   * @param {HTMLVideoElement} video - Video element to validate
   * @returns {{ok: boolean, msg?: string}} Validation result
   */
  canEmbed(video) {
    if (!video?.parentNode) {
      return { ok: false, msg: 'Video element not in DOM' };
    }
    if (!window.mobilerider) {
      return { ok: false, msg: 'mobilerider library not available' };
    }
    const videoInDoc = document.getElementById(CONFIG.PLAYER.VIDEO_ID);
    if (!videoInDoc || videoInDoc !== video) {
      return { ok: false, msg: 'Video element not found in document' };
    }
    return { ok: true };
  }

  /**
   * Handles embed failure
   * @param {HTMLElement} container - Container element
   * @param {string} message - Error message
   */
  failEmbed(container, message) {
    if (message) this.log(message);
    container?.classList?.add('is-hidden');
    this.isEmbedding = false;
  }

  /**
   * Embeds the MobileRider player
   * @param {HTMLVideoElement} video - Video element
   * @param {string} vid - Video ID
   * @param {string} skin - Skin ID
   * @param {string|null} asl - ASL ID
   * @param {HTMLElement} container - Container element
   * @throws {Error} If video or container is not properly attached
   */
  embedPlayer(video, vid, skin, asl, container) {
    if (!video?.parentNode || !container?.parentNode) {
      throw new Error('Video or container not properly attached to DOM');
    }
    if (video.parentNode !== container) {
      throw new Error('Video element parent mismatch');
    }

    window.mobilerider.embed(video.id, vid, skin, {
      ...this.getPlayerOptions(),
      analytics: { provider: CONFIG.ANALYTICS.PROVIDER },
      identifier1: vid,
      identifier2: asl,
      sessionId: vid,
    });
  }

  /**
   * Sets up stream end handler if video has ended
   * @param {string} vid - Video ID
   */
  maybeAttachStreamEndListener(vid) {
    if (!this.store) return;
    const storeKey = (this.mainID && this.store.get(this.mainID) !== undefined)
      ? this.mainID
      : (this.store.get(vid) !== undefined ? vid : null);
    if (storeKey) {
      this.onStreamEnd(vid);
    }
  }

  /**
   * Injects the player into the DOM
   * @param {string} vid - Video ID
   * @param {string} skin - Skin ID
   * @param {string|null} asl - ASL ID
   */
  injectPlayer(vid, skin, asl = null) {
    if (!this.wrap) return;
    if (this.isEmbedding) {
      return this.log('Embed already in progress, skipping');
    }

    this.currentVideoId = vid;

    const container = this.getOrCreateContainer(vid, skin, asl);
    const removePoster = this.setupPoster(container);
    this.cleanupPreviousPlayer(container);
    const video = this.createVideoElement(container);

    const validation = this.canEmbed(video);
    if (!validation.ok) {
      return this.failEmbed(container, validation.msg);
    }

    this.setupPosterCleanup(video, removePoster);
    container.classList.remove('is-hidden');
    this.isEmbedding = true;

    requestAnimationFrame(() => {
      const handleFailure = (message) => this.failEmbed(container, message);

      if (!this.wrap) {
        return handleFailure('Wrap removed from DOM');
      }
      if (!container.parentNode || container.parentNode !== this.wrap) {
        return handleFailure('Container or wrap removed from DOM');
      }

      const videoInDoc = document.getElementById(CONFIG.PLAYER.VIDEO_ID);
      if (!videoInDoc || videoInDoc !== video) {
        return handleFailure('Video element not ready for embedding');
      }
      if (!window.mobilerider) {
        return handleFailure('mobilerider library not available');
      }
      if (videoInDoc.parentNode !== container) {
        return handleFailure('Video element or container parent mismatch');
      }
      if (!container.contains(videoInDoc)) {
        return handleFailure('Video element not contained in container');
      }

      try {
        this.embedPlayer(video, vid, skin, asl, container);
        if (asl) {
          this.initASL();
        }
        this.maybeAttachStreamEndListener(vid);
      } catch (error) {
        return handleFailure(`Error embedding player: ${error.message}`);
      }

      setTimeout(() => {
        this.isEmbedding = false;
      }, 100);
    });
  }

  /**
   * Sets up stream end handler
   * @param {string} vid - Video ID
   */
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

  /**
   * Disposes the player and cleans up resources
   */
  static dispose() {
    window.__mr_player?.dispose?.();
    window.__mr_player = null;
    window.__mr_stream_published = null;
  }

  /**
   * Loads drawer CSS dynamically
   */
  static loadDrawerCSS() {
    if (document.querySelector('link[href*="drawer.css"]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = DRAWER_CSS_URL;
    document.head.appendChild(link);
  }

  /**
   * Creates drawer heading element
   * @returns {HTMLElement} Header element
   */
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

  /**
   * Initializes the drawer component
   * @param {Array} videos - Array of video objects
   */
  async initDrawer(videos) {
    try {
      MobileRider.loadDrawerCSS();
      const { default: createDrawer } = await import('./drawer.js');

      const renderItem = (video) => {
        const item = createTag('div', {
          class: 'drawer-item',
          'data-id': video.videoid,
          role: 'button',
          tabindex: '0',
        });

        const activate = () => this.onDrawerClick(video);
        item.addEventListener('click', activate);
        item.addEventListener('keydown', (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            activate();
          }
        });

        if (video.thumbnail) {
          const thumbnail = createTag('div', { class: 'drawer-item-thumbnail' });
          thumbnail.appendChild(createTag('img', {
            src: video.thumbnail,
            alt: video.title || 'video thumbnail',
          }));
          item.appendChild(thumbnail);
        }

        const content = createTag('div', { class: 'drawer-item-content' });
        if (video.title) {
          content.appendChild(createTag('div', { class: 'drawer-item-title' }, video.title));
        }
        if (video.description) {
          content.appendChild(createTag('div', { class: 'drawer-item-description' }, video.description));
        }
        item.appendChild(content);

        return item;
      };

      this.drawer = createDrawer(this.root, {
        items: videos,
        ariaLabel: 'Videos',
        renderItem,
        onItemClick: () => {}, // We handle click/keydown inside renderItem to avoid loop risks
      });

      if (this.selectedVideoId) {
        this.drawer?.setActiveById?.(this.selectedVideoId);
      }

      const itemsList = this.drawer?.itemsEl;
      if (itemsList?.firstChild) {
        itemsList.insertBefore(this.drawerHeading(), itemsList.firstChild);
      }
    } catch (error) {
      this.log(`Drawer load failed: ${error.message}`);
    }
  }

  /**
   * Handles drawer item click
   * @param {Object} video - Video object
   */
  async onDrawerClick(video) {
    try {
      if (this.store) {
        const isLive = await this.checkLive(video);
        if (!isLive) {
          this.log(`This stream is not currently live: ${video.videoid}`);
        }
      }

      if (video.videoid) {
        this.selectedVideoId = video.videoid;
      }

      const videosArray = this.allVideos || [];
      const videoIndex = video.videoid
        ? videosArray.findIndex((v) => v.videoid === video.videoid)
        : -1;

      if (videoIndex >= 0) {
        const oneBasedIndex = videoIndex + 1;
        updateVideoUrlParam(oneBasedIndex === 1 ? null : oneBasedIndex);
      } else {
        this.log(`Could not find video index for ${video.videoid}, URL param not updated`);
      }

      this.drawer?.setActiveById?.(video.videoid);
      this.injectPlayer(video.videoid, this.cfg.skinid, video.aslid);
    } catch (error) {
      this.log(`Drawer item click error: ${error.message}`);
    }
  }

  /**
   * Gets media status from API
   * @param {string} id - Media ID
   * @returns {Promise<Object>} Media status response
   */
  static async getMediaStatus(id) {
    try {
      const baseUrl = isProdEnv() ? CONFIG.API.PROD_URL : CONFIG.API.DEV_URL;
      const response = await fetch(`${baseUrl}/api/media-status?ids=${id}`);
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.message || 'Failed to get media status');
      }
      return response.json();
    } catch (error) {
      window.lana?.log?.(`getMediaStatus error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Checks if a video is currently live
   * @param {Object} video - Video object
   * @returns {Promise<boolean>} True if video is live
   */
  async checkLive(video) {
    if (!video?.videoid) return false;
    try {
      const idToCheck = this.mainID || video.videoid;
      const { active } = await MobileRider.getMediaStatus(idToCheck);
      const isActive = (active || []).includes(idToCheck);
      this.setStatus(video.videoid, isActive);
      return isActive;
    } catch (error) {
      this.log(`checkLive failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Updates the status in the store
   * @param {string} id - Video ID
   * @param {boolean} live - Live status
   */
  setStatus(id, live) {
    if (!id || !this.store) return;

    try {
      let storeKey = null;
      if (this.mainID && this.store.get(this.mainID) !== undefined) {
        storeKey = this.mainID;
      } else if (this.store.get(id) !== undefined) {
        storeKey = id;
      }
      if (!storeKey) return;

      const currentStatus = this.store.get(storeKey);
      if (currentStatus === live) return;

      this.store.set(storeKey, live);
      this.log(`Status updated for ${storeKey}: ${live}`);
    } catch (error) {
      this.log(`setStatus error for ${this.mainID || id}: ${error.message}`);
    }
  }

  /**
   * Initializes ASL (American Sign Language) support
   */
  initASL() {
    const container = this.wrap?.querySelector('.mobile-rider-container');
    if (!container) return;

    let attempts = 0;
    const check = () => {
      const button = container.querySelector(`#${CONFIG.ASL.BUTTON_ID}`);
      if (button) {
        return this.setupASL(button, container);
      }
      attempts += 1;
      if (attempts < CONFIG.ASL.MAX_CHECKS) {
        setTimeout(check, CONFIG.ASL.CHECK_INTERVAL);
      }
    };
    check();
  }

  /**
   * Sets up ASL button click handler
   * @param {HTMLElement} button - ASL button element
   * @param {HTMLElement} container - Container element
   */
  setupASL(button, container) {
    button.addEventListener('click', () => {
      if (container.classList.contains(CONFIG.ASL.TOGGLE_CLASS)) return;
      container.classList.add(CONFIG.ASL.TOGGLE_CLASS);
      this.initASL();
    });
  }

  /**
   * Creates the DOM structure
   * @returns {{container: HTMLElement, wrapper: HTMLElement}}
   */
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

  /**
   * Parses configuration from DOM
   * @returns {Object} Parsed configuration
   */
  parseCfg() {
    const meta = Object.fromEntries(
      [...this.el.querySelectorAll(':scope > div > div:first-child')].map((div) => [
        div.textContent.trim().toLowerCase().replace(/ /g, '-'),
        div.nextElementSibling?.textContent?.trim() || '',
      ]),
    );

    Object.keys(meta).forEach((key) => {
      meta[key] = toBool(meta[key]);
    });

    if (meta.concurrentenabled === true) {
      meta.concurrentVideos = MobileRider.parseConcurrent(meta);
    }

    return meta;
  }

  /**
   * Parses concurrent videos from metadata
   * @param {Object} meta - Metadata object
   * @returns {Array} Array of concurrent video objects
   */
  static parseConcurrent(meta) {
    const matches = Object.keys(meta)
      .map((key) => key.match(/^concurrentvideoid(\d+)$/))
      .filter(Boolean)
      .map((match) => match[1]);

    const uniqueIndices = [...new Set(matches)].sort((a, b) => Number(a) - Number(b));

    return uniqueIndices.map((index) => ({
      videoid: meta[`concurrentvideoid${index}`] || '',
      aslid: meta[`concurrentaslid${index}`] || '',
      title: meta[`concurrenttitle${index}`] || '',
      description: meta[`concurrentdescription${index}`] || '',
      thumbnail: meta[`concurrentthumbnail${index}`] || '',
    }));
  }

  /**
   * Determines which video to play based on priority cascade
   * Priority: URL param > ConcurrentVideoTitle (one-time) > Default
   * @param {Array} allVideos - All available videos
   * @param {Object} defaultVideo - Default/first video
   * @returns {Promise<{video: Object, source: string}>}
   */
  async selectVideo(allVideos, defaultVideo) {
    // Priority 1: URL parameter
    const urlParams = new URLSearchParams(window.location.search);
    const videoParamRaw = urlParams.get('video');
    const videoParam = videoParamRaw ? parseInt(videoParamRaw, 10) : null;

    if (videoParam && videoParam >= 1 && videoParam <= allVideos.length) {
      return { video: allVideos[videoParam - 1], source: 'param' };
    }

    // Priority 2: SessionStorage concurrentVideoTitle
    const selectedVideo = getConcurrentVideoBySessionStorage(allVideos);
    if (selectedVideo) {
      return { video: selectedVideo, source: 'sessionStorage' };
    }

    // Priority 3: Default video
    return { video: defaultVideo, source: 'default' };
  }
}

/**
 * Initializes MobileRider on the given element
 * @param {HTMLElement} el - Element to initialize
 * @returns {MobileRider|null} MobileRider instance or null on error
 */
export default function init(el) {
  try {
    return new MobileRider(el);
  } catch (error) {
    window.lana?.log?.(`Mobile Rider init failed: ${error.message}`);
    return null;
  }
}
