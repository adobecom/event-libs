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
};

let scriptPromise = null;

/**
 * Checks if the user is registered for the event
 * @returns {Promise<boolean>} - True if user is registered, false otherwise
 */
function isUserRegistered() {
  if (
    !window.feds
    || !window.feds.utilities
    || !window.feds.utilities.getEventData
  ) {
    return Promise.resolve(false);
  }
  return window.feds.utilities
    .getEventData()
    .then((data) => data.isRegistered)
    .catch(() => false);
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
 * Finds a video in the videos array whose title matches the concurrentVideoTitle from sessionStorage.
 * Returns the video object or undefined if not found.
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
  }

  return selectedVideo;
}

/**
 * Finds video(s) in the videos array whose title matches scheduled session titles.
 * If multiple matches found, defaults to the first video.
 * If single match found, returns that video.
 * If no matches found, returns undefined.
 * Only checks if user has scheduled sessions (mySchedule is only populated when user is registered).
 * @param {Array} videos - All videos including default/first video
 * @param {Array} mySchedule - User's scheduled sessions
 * @returns {Object|undefined} - The matched video or undefined
 */
function getScheduledVideoMatch(videos, mySchedule = []) {
  // Only proceed if user has scheduled sessions
  if (!mySchedule || mySchedule.length === 0) {
    return undefined;
  }
  if (!videos || videos.length === 0) {
    return undefined;
  }

  // Find ALL videos that match scheduled session titles
  const matchedVideos = videos.filter((video) => {
    const videoTitle = video.title?.trim() || '';
    if (!videoTitle) return false;

    const match = mySchedule.find((scheduledSession) => {
      const sessionTitle = scheduledSession.title?.trim() || '';
      return sessionTitle && videoTitle === sessionTitle;
    });

    return !!match;
  });

  if (matchedVideos.length === 0) {
    return undefined;
  }

  // If multiple matches found, default to first video
  if (matchedVideos.length > 1) {
    return videos[0];
  }

  // Single match - return it
  return matchedVideos[0];
}


class MobileRider {
  constructor(el) {
    this.el = el;
    this.cfg = null;
    this.wrap = null;
    this.root = null;
    this.store = null;
    this.mainID = null;
    this.scheduleLoaded = false;
    this.cachedSchedule = null;
    this.selectedVideoId = null;
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

      // Set mainID for concurrent streams (use selected video's ID)
      if (isConcurrent && this.store) {
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

  injectPlayer(vid, skin, asl = null) {
    if (!this.wrap) return;

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

    window.__mr_player?.dispose();
    con.querySelector(`#${CONFIG.PLAYER.VIDEO_ID}`)?.remove();

    const video = createTag('video', {
      id: CONFIG.PLAYER.VIDEO_ID,
      class: CONFIG.PLAYER.VIDEO_CLASS,
      controls: true,
    });
    con.appendChild(video);

    if (!window.mobilerider) return;
    window.mobilerider.embed(video.id, vid, skin, {
      ...this.getPlayerOptions(),
      analytics: { provider: CONFIG.ANALYTICS.PROVIDER },
      identifier1: vid,
      identifier2: asl,
      sessionId: vid,
    });

    if (asl) this.initASL();
    // Check store existence first, then check mainID or vid in store
    if (this.store) {
      let key = null;
      if (this.mainID && this.store.get(this.mainID) !== undefined) {
        key = this.mainID;
      } else if (this.store.get(vid) !== undefined) {
        key = vid;
      }

      if (key) this.onStreamEnd(vid);
    }
    con.classList.remove('is-hidden');
  }

  onStreamEnd(vid) {
    window.__mr_player?.off('streamend');
    window.__mr_player?.on('streamend', () => {
      this.setStatus(vid, false);
      MobileRider.dispose();
    });
  }

  static dispose() {
    window.__mr_player?.dispose();
    window.__mr_player = null;
    window.__mr_stream_published = null;
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

      const drawer = createDrawer(this.root, {
        items: videos,
        ariaLabel: 'Videos',
        renderItem,
        onItemClick: (_, v) => this.onDrawerClick(v),
      });

      // Set the active drawer item to match the selected video
      if (this.selectedVideoId && drawer?.setActiveById) {
        drawer.setActiveById(this.selectedVideoId);
      }

      const itemsList = drawer?.itemsEl;
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
      this.injectPlayer(v.videoid, this.cfg.skinid, v.aslid);
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
   * Priority: URL param > SessionStorage > Scheduled > Default
   * Only fetches schedule if URL param and SessionStorage don't match
   * @param {Array} allVideos - All available videos
   * @param {Object} defaultVideo - Default/first video
   * @returns {Promise<Object>} - { video, source } where source is 'param'|'sessionStorage'|'scheduled'|'default'
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

    // Priority 2: SessionStorage (user's session preference from carousel)
    // Must search ALL videos including the default/first video
    const selectedVideo = getConcurrentVideoBySessionStorage(allVideos);
    if (selectedVideo) {
      return {
        video: selectedVideo,
        source: 'sessionStorage',
      };
    }

    // Priority 3: Scheduled session match (automation for logged-in users)
    // Only fetch schedule if URL param and SessionStorage didn't match
    const mySchedule = await this.getMySchedule();
    const scheduledVideo = getScheduledVideoMatch(allVideos, mySchedule);
    if (scheduledVideo) {
      return {
        video: scheduledVideo,
        source: 'scheduled',
      };
    }

    // Priority 4: Default video (fallback)
    return {
      video: defaultVideo,
      source: 'default',
    };
  }

  /**
   * Fetches user's scheduled sessions from API if needed
   * @returns {Promise<Array>} - Array of scheduled sessions
   */
  async getMySchedule() {
    // Check if user is logged in
    const isLoggedIn = window?.feds?.utilities?.isUserLoggedIn?.() || false;
    if (!isLoggedIn) {
      return [];
    }

    // Check if user is registered for the event
    const isRegistered = await isUserRegistered();
    if (!isRegistered) {
      return [];
    }

    // Check if schedule already loaded
    if (this.scheduleLoaded) {
      return this.cachedSchedule || [];
    }

    // Mark as loading to prevent duplicate fetches
    this.scheduleLoaded = true;

    try {
      // TODO: Replace with actual API endpoint when available
      // Mock implementation for now
      const eventConfig = getEventConfig();
      const eventId = eventConfig?.eventId;
      
      if (!eventId) {
        return [];
      }

      // Mock API call - replace with actual endpoint
      // const response = await fetch(`/api/schedule?eventId=${eventId}`);
      // if (!response.ok) {
      //   throw new Error('Failed to fetch schedule');
      // }
      // const data = await response.json();
      // this.cachedSchedule = data.mySchedule || [];
      
      // Mock response structure (remove when real API is available)
      // Expected structure: { mySchedule: [{ title: '...', ... }] }
      this.cachedSchedule = [];
      
      return this.cachedSchedule;
    } catch (e) {
      // Silently fail - schedule matching is an enhancement, not critical
      window.lana?.log(`Failed to fetch schedule: ${e.message}`);
      this.scheduleLoaded = false; // Allow retry on next page load
      return [];
    }
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
