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
  STORAGE: {
    CURRENT_VIDEO_KEY: 'mobile-rider-current-video',
  },
  POSTER: {
    CLEANUP_TIMEOUT_MS: 4000,
  },
};

let scriptPromise = null;

/**
 * Clear the saved current video state
 */
function clearCurrentVideo() {
  try {
    sessionStorage.removeItem(CONFIG.STORAGE.CURRENT_VIDEO_KEY);
  } catch (e) {
    window.lana?.log(`Failed to clear current video state: ${e.message}`);
  }
}

/**
 * Preload poster image for better LCP performance
 * @param {string} url - Poster image URL
 */
function preloadPoster(url) {
  if (!url) return;
  const sel = `link[rel="preload"][as="image"][href="${url}"]`;
  if (!document.querySelector(sel)) {
    const l = document.createElement('link');
    l.rel = 'preload';
    l.as = 'image';
    l.href = url;
    document.head.appendChild(l);
  }
}

/**
 * Show poster placeholder image
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


async function loadScript() {
  if (window.mobilerider) return null;
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise((res) => {
    const eventConfig = getEventConfig();
    const env = eventConfig?.miloConfig?.miloLibs?.env || 'prod';
    const isProd = env === 'prod';
    const src = isProd ? CONFIG.SCRIPTS.PROD_URL : CONFIG.SCRIPTS.DEV_URL;
    const s = createTag('script', { src });
    s.onload = res;
    document.head.appendChild(s);
  });

  return scriptPromise;
}

/**
 * Updates the URL with video parameter
 * @param {number|null} videoIndex - 1-based video index, or null to remove the parameter
 */
function updateVideoUrlParam(videoIndex) {
  try {
    const url = new URL(window.location.href);
    if (videoIndex === null || videoIndex === 1) {
      // Remove param for video 1 or null
      url.searchParams.delete('video');
    } else if (videoIndex > 1) {
      // Add/update param for video 2+
      url.searchParams.set('video', videoIndex.toString());
    }
    // Only update if URL actually changed to avoid unnecessary history entries
    const newUrl = url.toString();
    if (newUrl !== window.location.href) {
      window.history.replaceState({}, '', url);
    }
  } catch (e) {
    window.lana?.log(`Failed to update video URL parameter: ${e.message}`);
  }
}

/**
 * Finds a video in the videos array whose title matches the concurrentVideoTitle from sessionStorage.
 * Returns the video object or undefined if not found.
 * Also updates URL parameter if a match is found.
 * @param {Array} videos - All videos including default/first video
 * @returns {Object|undefined} - The matched video or undefined
 */
function getConcurrentVideoBySessionStorage(videos) {
  const concurrentVideoTitle = (sessionStorage?.getItem('concurrentVideoTitle') || '').trim();
  if (!concurrentVideoTitle) return undefined;
  const selectedVideo = videos.find(
    (video) => video.title?.trim() === concurrentVideoTitle,
  );
  // Remove from sessionStorage after use
  if (selectedVideo) {
    sessionStorage?.removeItem('concurrentVideoTitle');
    // Find the 1-based index and update URL
    // video=1 removes param, video=2+ adds/updates param
    const videoIndex = videos.findIndex((v) => v.videoid === selectedVideo.videoid) + 1;
    if (videoIndex > 0) {
      updateVideoUrlParam(videoIndex === 1 ? null : videoIndex);
    }
  }
  return selectedVideo;
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
    this.allVideos = null; // Store all videos array for index calculation
    this.init();
  }

  async init() {
    try {
      scriptPromise = loadScript();
      const storePromise = this.el.closest('.chrono-box')
        ? (() => {
            const pluginUrl = new URL('../../features/timing-framework/plugins/mobile-rider/plugin.js', import.meta.url);
            return import(pluginUrl.href);
          })().then(({ mobileRiderStore }) => {
            this.store = mobileRiderStore;
          })
          .catch((e) => {
            window.lana?.log(`Failed to import mobileRiderStore: ${e.message}`);
          })
        : null;

      await scriptPromise;
      if (storePromise) await storePromise;
      this.cfg = this.parseCfg();
      const { container, wrapper } = this.createDOM();
      this.root = container;
      this.wrap = wrapper;

      const isConcurrent = this.cfg.concurrentenabled;
      const videos = isConcurrent ? this.cfg.concurrentVideos : [this.cfg];
      this.allVideos = videos; // Store for use in onDrawerClick
      const defaultVideo = videos[0];

      if (!defaultVideo?.videoid) {
        window.lana?.log('Missing video-id in config.');
        return;
      }

      // Select video - only runs selection logic when concurrent videos are enabled
      const { video: selectedVideo, source } = isConcurrent
        ? await this.selectVideo(videos, defaultVideo)
        : { video: defaultVideo, source: 'default' };

      const { videoid, aslid } = selectedVideo;
      if (!videoid) {
        window.lana?.log('Missing video-id in selected video.');
        return;
      }

      // Set mainID for concurrent streams (use selected video's ID if not already set from saved state)
      if (isConcurrent && this.store && !this.mainID) {
        this.mainID = selectedVideo.videoid;
      }

      // Log selection source for debugging
      if (source !== 'default' && window.lana) {
        window.lana.log(`Mobile-rider video selected via ${source}: ${videoid}`);
      }
      await this.loadPlayer(videoid, aslid);
      if (isConcurrent && videos.length > 1) {
        // Store selected video ID only when drawer will be initialized
        this.selectedVideoId = videoid;
        await this.initDrawer(videos);
        // Update drawer active state to match the selected video
        if (this.drawer?.setActiveById) {
          this.drawer.setActiveById(videoid);
        }
      }
    } catch (e) {
      window.lana?.log(`MobileRider Init error: ${e.message}`);
    }
  }

  async loadPlayer(vid, asl) {
    try {
      this.injectPlayer(vid, this.cfg.skinid, asl);
    } catch (e) {
      window.lana?.log(`Failed to initialize the player: ${e.message}`);
    }
  }

  extractPlayerOverrides() {
    const overrides = {};
    Object.keys(CONFIG.PLAYER.DEFAULT_OPTIONS).forEach((key) => {
      if (key in this.cfg) {
        const val = this.cfg[key];
        overrides[key] = String(val).toLowerCase() === 'true';
      }
    });
    return overrides;
  }

  getPlayerOptions() {
    return {
      ...CONFIG.PLAYER.DEFAULT_OPTIONS,
      ...this.extractPlayerOverrides(),
    };
  }

  /**
   * Gets or creates the player container element
   * @param {string} vid - Video ID
   * @param {string} skin - Skin ID
   * @param {string|null} asl - ASL ID
   * @returns {HTMLElement} Container element
   */
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
    }
    return con;
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
    return showPosterPlaceholder(container, poster, this.cfg.title || 'Video poster');
  }

  /**
   * Disposes the previous player instance and removes old video element
   * @param {HTMLElement} container - Container element
   */
  cleanupPreviousPlayer(container) {
    const oldVideo = container.querySelector(`#${CONFIG.PLAYER.VIDEO_ID}`);

    if (window.__mr_player) {
      try {
        // Dispose player first while old video element still exists
        window.__mr_player.dispose();
      } catch (e) {
        window.lana?.log(`Error disposing player: ${e.message}`);
      }
      window.__mr_player = null;
    }

    // Remove old video element after player is disposed
    if (oldVideo?.parentNode) {
      oldVideo.remove();
    }
  }

  /**
   * Creates and appends the video element to the container
   * @param {HTMLElement} container - Container element
   * @returns {HTMLVideoElement} Created video element
   */
  createVideoElement(container) {
    const poster = this.cfg.poster || this.cfg.thumbnail;
    const videoAttrs = {
      id: CONFIG.PLAYER.VIDEO_ID,
      class: CONFIG.PLAYER.VIDEO_CLASS,
      controls: true,
      preload: 'metadata',
      playsinline: '',
    };
    if (poster) {
      videoAttrs.poster = poster;
    }

    const video = createTag('video', videoAttrs);
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
   * @returns {boolean} True if video is ready, false otherwise
   */
  validateVideoElement(video) {
    if (!video.parentNode) {
      window.lana?.log('Video element not in DOM');
      return false;
    }

    if (!window.mobilerider) {
      window.lana?.log('mobilerider library not available');
      return false;
    }

    const videoInDoc = document.getElementById(CONFIG.PLAYER.VIDEO_ID);
    if (!videoInDoc || videoInDoc !== video) {
      window.lana?.log('Video element not found in document');
      return false;
    }

    return true;
  }

  /**
   * Embeds the MobileRider player
   * @param {HTMLVideoElement} video - Video element
   * @param {string} vid - Video ID
   * @param {string} skin - Skin ID
   * @param {string|null} asl - ASL ID
   * @param {HTMLElement} container - Container element
   */
  embedPlayer(video, vid, skin, asl, container) {
    try {
      window.mobilerider.embed(video.id, vid, skin, {
        ...this.getPlayerOptions(),
        analytics: { provider: CONFIG.ANALYTICS.PROVIDER },
        identifier1: vid,
        identifier2: asl,
        sessionId: vid,
      });
    } catch (e) {
      window.lana?.log(`Error embedding player: ${e.message}`);
      container.classList.add('is-hidden');
      throw e;
    }
  }

  /**
   * Sets up stream end handler if video has ended
   * @param {string} vid - Video ID
   */
  setupStreamEndListener(vid) {
    if (!this.store) return;

    const key = (this.mainID && this.store.get(this.mainID) !== undefined)
      ? this.mainID
      : (this.store.get(vid) !== undefined ? vid : null);

    if (key) {
      this.onStreamEnd(vid);
    }
  }

  injectPlayer(vid, skin, asl = null) {
    if (!this.wrap) return;
    this.currentVideoId = vid;

    // Get or create container
    const con = this.getOrCreateContainer(vid, skin, asl);

    // Setup poster if available
    const removePoster = this.setupPoster(con);

    // Cleanup previous player and video element
    this.cleanupPreviousPlayer(con);

    // Create new video element
    const video = this.createVideoElement(con);

    // Validate video element before proceeding
    if (!this.validateVideoElement(video)) {
      return;
    }

    // Setup poster cleanup if poster was shown
    this.setupPosterCleanup(video, removePoster);

    // Make container visible (library may need it)
    con.classList.remove('is-hidden');

    // Use requestAnimationFrame to ensure DOM is ready
    requestAnimationFrame(() => {
      // Re-validate video element exists in DOM
      const videoElement = document.getElementById(CONFIG.PLAYER.VIDEO_ID);
      if (!videoElement || videoElement !== video || !window.mobilerider) {
        window.lana?.log('Video element not ready for embedding');
        con.classList.add('is-hidden');
        return;
      }

      // Embed player
      try {
        this.embedPlayer(video, vid, skin, asl, con);

        // Initialize ASL if needed
        if (asl) {
          this.initASL();
        }

        // Setup stream end listener if video has ended
        this.setupStreamEndListener(vid);
      } catch (e) {
        // Error already logged in embedPlayer
      }
    });
  }

  onStreamEnd(vid) {
    window.__mr_player?.off('streamend');
    window.__mr_player?.on('streamend', () => {
      if (this.drawer) {
        this.drawer.remove();
        this.drawer = null;
      }
      this.setStatus(vid, false);
      MobileRider.dispose();
    });
  }

  static dispose() {
    window.__mr_player?.dispose();
    window.__mr_player = null;
    window.__mr_stream_published = null;
    clearCurrentVideo();
  }

  static loadDrawerCSS() {
    // Check if drawer CSS is already loaded
    if (document.querySelector('link[href*="drawer.css"]')) return;

    // Load drawer CSS dynamically
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
      // Load drawer CSS dynamically
      MobileRider.loadDrawerCSS();
      const { default: createDrawer } = await import('./drawer.js');

      const renderItem = (v) => {
        const item = createTag('div', {
          class: 'drawer-item',
          'data-id': v.videoid,
          role: 'button',
          tabindex: '0',
        });

        if (v.thumbnail) {
          const thumbImg = createTag('div', { class: 'drawer-item-thumbnail' });
          thumbImg.appendChild(createTag('img', { src: v.thumbnail, alt: v.title || 'video thumbnail' }));
          item.appendChild(thumbImg);
        }

        const vidCon = createTag('div', { class: 'drawer-item-content' });
        if (v.title) vidCon.appendChild(createTag('div', { class: 'drawer-item-title' }, v.title));
        if (v.description) vidCon.appendChild(createTag('div', { class: 'drawer-item-description' }, v.description));
        item.appendChild(vidCon);

        return item;
      };

      this.drawer = createDrawer(this.root, {
        items: videos,
        ariaLabel: 'Videos',
        renderItem,
        onItemClick: (_, v) => this.onDrawerClick(v),
      });

      // Set the active drawer item to match the selected video
      if (this.selectedVideoId && this.drawer?.setActiveById) {
        this.drawer.setActiveById(this.selectedVideoId);
      }

      const itemsList = this.drawer?.itemsEl;
      if (itemsList?.firstChild) {
        itemsList.insertBefore(this.drawerHeading(), itemsList.firstChild);
      }
    } catch (e) {
      window.lana?.log(`Drawer load failed: ${e.message}`);
    }
  }

  async onDrawerClick(v) {
    try {
      if (this.store) {
        const live = await this.checkLive(v);
        if (!live) window.lana?.log(`This stream is not currently live: ${v.videoid}`);
      }
      
      // Update instance property for drawer state
      if (v.videoid) {
        this.selectedVideoId = v.videoid;
      }
      
      // Find the 1-based video index to update URL parameter
      // Use drawer.items if available, otherwise fallback to allVideos
      const videosArray = this.drawer?.items || this.allVideos;
      let videoIndex = null;
      
      if (videosArray && videosArray.length > 0 && v.videoid) {
        const index = videosArray.findIndex((video) => video.videoid === v.videoid);
        if (index >= 0) {
          videoIndex = index + 1; // Convert to 1-based index
        }
      }
      
      // Always update URL parameter when a video is clicked
      // video=1 removes param, video=2+ adds/updates param
      if (videoIndex !== null) {
        updateVideoUrlParam(videoIndex === 1 ? null : videoIndex);
      } else {
        // Fallback: if we can't find the index, still try to update based on videoid
        window.lana?.log(`Could not find video index for ${v.videoid}, URL param not updated`);
      }
      
      this.injectPlayer(v.videoid, this.cfg.skinid, v.aslid);
      
      // Update drawer active state
      if (this.drawer?.setActiveById) {
        this.drawer.setActiveById(v.videoid);
      }
    } catch (e) {
      window.lana?.log(`Drawer item click error: ${e.message}`);
    }
  }

  static async getMediaStatus(id) {
    try {
      const eventConfig = getEventConfig();
      const env = eventConfig?.miloConfig?.miloLibs?.env || 'prod';
      const isLowerEnv = env !== 'prod';
      const baseUrl = isLowerEnv ? CONFIG.API.DEV_URL : CONFIG.API.PROD_URL;
      const res = await fetch(`${baseUrl}/api/media-status?ids=${id}`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Failed to get media status');
      }
      return res.json();
    } catch (e) {
      window.lana?.log(`getMediaStatus error: ${e.message}`);
      throw e;
    }
  }

  async checkLive(v) {
    if (!v?.videoid) return false;
    try {
      // Use mainID if available, otherwise use the provided video ID
      const videoIDToCheck = this.mainID || v.videoid;

      const { active } = await MobileRider.getMediaStatus(videoIDToCheck);
      const isActive = active.includes(videoIDToCheck);

      // Only update store if status has actually changed
      this.setStatus(v.videoid, isActive);
      return isActive;
    } catch (e) {
      window.lana?.log?.(`checkLive failed: ${e.message}`);
      return false;
    }
  }

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
      if (currentStatus !== live) {
        this.store.set(storeKey, live);
        window.lana?.log?.(`Status updated for ${storeKey}: ${live}`);
      }
    } catch (e) {
      window.lana?.log?.(`setStatus error for ${this.mainID || id}: ${e.message}`);
    }
  }

  initASL() {
    const con = this.wrap?.querySelector('.mobile-rider-container');
    if (!con) return;

    let attempts = 0;
    const check = () => {
      const btn = con.querySelector(`#${CONFIG.ASL.BUTTON_ID}`);
      if (btn) {
        this.setupASL(btn, con);
        return;
      }
      attempts += 1;
      if (attempts < CONFIG.ASL.MAX_CHECKS) setTimeout(check, CONFIG.ASL.CHECK_INTERVAL);
    };
    check();
  }

  setupASL(btn, con) {
    btn.addEventListener('click', () => {
      if (!con.classList.contains(CONFIG.ASL.TOGGLE_CLASS)) {
        con.classList.add(CONFIG.ASL.TOGGLE_CLASS);
        this.initASL();
      }
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
      [...this.el.querySelectorAll(':scope > div > div:first-child')].map((div) => [
        div.textContent.trim().toLowerCase().replace(/ /g, '-'),
        div.nextElementSibling?.textContent?.trim() || '',
      ]),
    );

    if (meta.concurrentenabled === 'true') {
      meta.concurrentenabled = true;
      meta.concurrentVideos = MobileRider.parseConcurrent(meta);
    }

    return meta;
  }

  static parseConcurrent(meta) {
    const keys = Object.keys(meta)
      .filter((k) => k.startsWith('concurrentvideoid'))
      .map((k) => k.replace('concurrentvideoid', ''));

    const uniq = [...new Set(keys)].sort((a, b) => Number(a) - Number(b));

    return uniq.map((i) => ({
      videoid: meta[`concurrentvideoid${i}`] || '',
      aslid: meta[`concurrentaslid${i}`] || '',
      title: meta[`concurrenttitle${i}`] || '',
      description: meta[`concurrentdescription${i}`] || '',
      thumbnail: meta[`concurrentthumbnail${i}`] || '',
    }));
  }

  /**
   * Determines which video to play based on priority cascade.
   * Priority: URL param > ConcurrentVideoTitle (one-time) > Default
   * @param {Array} allVideos - All available videos
   * @param {Object} defaultVideo - Default/first video
   * @returns {Promise<Object>} - { video, source } where source is 'param'|'sessionStorage'|'default'
   */
  async selectVideo(allVideos, defaultVideo) {
    // Priority 1: URL parameter (explicit intent, sharable links)
    // Check synchronously first to avoid unnecessary network calls
    const urlParams = new URLSearchParams(window.location.search);
    const videoParam = urlParams.get('video') ? parseInt(urlParams.get('video'), 10) : null;
    
    if (videoParam && videoParam >= 1 && videoParam <= allVideos.length) {
      return {
        video: allVideos[videoParam - 1], // videoParam is 1-based, array is 0-based
        source: 'param',
      };
    }

    // Priority 2: SessionStorage concurrentVideoTitle (one-time navigation from carousel)
    // Must search ALL videos including the default/first video
    // This will also update the URL parameter if a match is found
    const selectedVideo = getConcurrentVideoBySessionStorage(allVideos);
    if (selectedVideo) {
      return {
        video: selectedVideo,
        source: 'sessionStorage',
      };
    }

    // TODO: Priority 3 - Scheduled session match (automation for logged-in users)
    // Once the schedule API is ready, implement:
    // 1. Add getMySchedule() method to fetch user's scheduled sessions from API
    // 2. Add getScheduledVideoMatch() function to match videos with scheduled sessions
    // 3. Add isUserRegistered() helper function to check user registration status
    // 4. Add scheduleLoaded and cachedSchedule properties to class
    // 5. Insert scheduled video matching as Priority 3 before default fallback
    // Expected API structure: { mySchedule: [{ title: '...', ... }] }

    // Priority 3: Default video (fallback)
    return {
      video: defaultVideo,
      source: 'default',
    };
  }

}

export default function init(el) {
  try {
    return new MobileRider(el);
  } catch (e) {
    window.lana?.log(`Mobile Rider init failed: ${e.message}`);
    return null;
  }
}
