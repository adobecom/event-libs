/* eslint-disable no-underscore-dangle */
import { createTag, getEventConfig } from '../../../utils/utils.js';
import {
  sessions, favorited, initSessionState, openSessionGuideDetail, getApiConfig,
} from '../../../utils/session-store.js';
import { getTrackIcon } from '../../../utils/tier-1-event-config.js';
import { resolveIcon } from '../../../features/icons/icon-resolver.js';
import { toggleFavoriteWithFeedback } from '../../../services/sessions/action-feedback.js';
import { showToast } from '../../../features/toast/toast.js';
import { setSessionParam } from '../sessions-guide/utils/url.js';

const BLOCK_CSS_URL = new URL('./mobile-rider.css', import.meta.url).href;

const ICON_HEART_OUTLINE = '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"><path d="M10 18C9.51124 18 9.02247 17.8398 8.61427 17.5195C7.02833 16.2754 3.41163 13.0078 2.23976 11.0908C1.30714 9.56542 0.986826 7.67772 1.38283 6.04198C1.72267 4.63768 2.54494 3.50487 3.76125 2.76366C5.13527 1.92479 6.7842 1.76659 8.06301 2.35057C8.72317 2.65233 9.42629 3.17772 9.99172 3.77147C10.5698 3.14159 11.2647 2.63182 11.959 2.34178C13.2705 1.79002 14.9116 1.95408 16.2393 2.76366C17.4551 3.50487 18.2774 4.63768 18.6172 6.04198C19.0132 7.67772 18.6929 9.56542 17.7603 11.0908C16.5908 13.0039 12.9732 16.2734 11.3858 17.5195C10.9781 17.8398 10.4888 18 10 18ZM6.38722 3.49901C5.78077 3.49901 5.13185 3.68456 4.54201 4.04491C3.67287 4.57421 3.08498 5.38671 2.84084 6.39452C2.53615 7.65233 2.79006 9.11522 3.51906 10.3076C4.47218 11.8662 7.66847 14.8711 9.54006 16.3398C9.81057 16.5527 10.189 16.5527 10.4595 16.3398C12.333 14.8691 15.5298 11.8633 16.4805 10.3076C17.21 9.11523 17.4639 7.65234 17.1592 6.39452C16.9151 5.38671 16.3272 4.57421 15.4585 4.04491C14.5327 3.48046 13.4136 3.35839 12.5386 3.7246C11.8565 4.01073 11.1055 4.6621 10.6245 5.38476C10.3462 5.80273 9.65385 5.80273 9.37553 5.38476C8.94047 4.73144 8.12651 4.02929 7.43998 3.71581C7.12162 3.5703 6.7627 3.49901 6.38722 3.49901Z" fill="currentColor"/></svg>';
const ICON_HEART_FILLED = '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"><path d="M8.61426 17.5195C9.02246 17.8398 9.51123 18 10 18C10.4888 18 10.9781 17.8398 11.3858 17.5195C12.9732 16.2734 16.5908 13.0039 17.7603 11.0908C18.6929 9.56543 19.0132 7.67773 18.6172 6.04199C18.2774 4.63769 17.4551 3.50488 16.2393 2.76367C14.9116 1.95409 13.2705 1.79003 11.959 2.34179C11.2647 2.63183 10.5698 3.1416 9.99171 3.77148C9.42628 3.17773 8.72316 2.65234 8.063 2.35058C6.78419 1.7666 5.13526 1.9248 3.76124 2.76367C2.54493 3.50488 1.72266 4.63769 1.38282 6.04199C0.98682 7.67773 1.30713 9.56543 2.23975 11.0908C3.41162 13.0078 7.02832 16.2754 8.61426 17.5195Z" fill="currentColor"/></svg>';
const ICON_SHARE = '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"><path d="M14.5 6.5C15.8807 6.5 17 5.38071 17 4C17 2.61929 15.8807 1.5 14.5 1.5C13.1193 1.5 12 2.61929 12 4C12 4.16249 12.0154 4.32158 12.0447 4.4759L6.68625 7.62766C6.21886 7.09565 5.5387 6.76 4.78125 6.76C3.39871 6.76 2.28125 7.87746 2.28125 9.26C2.28125 10.6425 3.39871 11.76 4.78125 11.76C5.53927 11.76 6.21996 11.4239 6.68738 10.8912L12.0447 14.0416C12.0154 14.1959 12 14.355 12 14.5175C12 15.8982 13.1193 17.0175 14.5 17.0175C15.8807 17.0175 17 15.8982 17 14.5175C17 13.1368 15.8807 12.0175 14.5 12.0175C13.7412 12.0175 13.0603 12.3546 12.5928 12.8879L7.23752 9.73838C7.26721 9.58281 7.28125 9.42246 7.28125 9.26C7.28125 9.09708 7.26714 8.93627 7.23731 8.78028L12.5936 5.6289C13.0611 6.16257 13.7417 6.5 14.5 6.5Z" fill="currentColor"/></svg>';
const ICON_CHEVRON_DOWN = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"><path d="M4 6L8 10L12 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function readSectionMetadata(el, key) {
  const metadataBlock = el.closest('.section')?.querySelector(':scope > .section-metadata');
  if (!metadataBlock) return null;
  const rows = metadataBlock.querySelectorAll(':scope > div');
  for (const row of rows) {
    const cells = row.querySelectorAll(':scope > div');
    const rowKey = cells[0]?.textContent?.trim().toLowerCase();
    if (rowKey === key) return cells[1]?.textContent?.trim() ?? '';
  }
  return null;
}

function buildCategoryBadge(track) {
  if (!track) return null;
  const entry = getTrackIcon(track) || getTrackIcon('mainstage');
  if (!entry) return null;

  const badge = createTag('span', { class: 'mobile-rider-info-bar-category' });
  // No inline color override — always the CSS default (--s2a-color-content-default),
  // regardless of what entry.color (the Tier 1 config's per-track color) says.
  const iconColor = createTag('span', {
    class: 'mobile-rider-info-bar-category-icon-color',
  }, '', { parent: badge });
  createTag('span', { class: 'mobile-rider-info-bar-category-label' }, track, { parent: badge });

  resolveIcon(entry.icon).then((svg) => {
    if (!svg) return;
    svg.classList.add('mobile-rider-info-bar-category-icon');
    iconColor.append(svg);
  }).catch((error) => {
    window.lana?.log(`[MobileRider] category icon resolution failed for "${entry.icon}": ${error.message}`);
  });

  return badge;
}

function buildFavoriteButton(session) {
  const btn = createTag('button', {
    type: 'button',
    class: 'mobile-rider-action mobile-rider-info-bar-favorite',
  });

  const paint = () => {
    const isFavorited = favorited.value.has(session.id);
    btn.innerHTML = isFavorited ? ICON_HEART_FILLED : ICON_HEART_OUTLINE;
    btn.setAttribute('aria-label', isFavorited ? 'Remove from favorites' : 'Add to favorites');
    btn.setAttribute('aria-pressed', String(isFavorited));
    btn.classList.toggle('is-favorited', isFavorited);
  };
  paint();
  favorited.subscribe(paint);

  btn.addEventListener('click', () => {
    toggleFavoriteWithFeedback(session, {
      eventConfig: { title: session.title || '', registerUrl: getApiConfig()?.registerUrl || '/register' },
      isFavorited: favorited.value.has(session.id),
    });
  });

  return btn;
}

function buildShareButton(session) {
  const btn = createTag('button', {
    type: 'button',
    class: 'mobile-rider-action mobile-rider-info-bar-share',
    'aria-label': 'Share',
  }, ICON_SHARE);

  btn.addEventListener('click', async () => {
    // setSessionParam builds the same `?session=<id>` deep link Session Guide's own
    // cards use — opens straight to this session's detail view, not a generic page URL.
    const url = new URL(setSessionParam(session.id), window.location.origin).toString();
    const shareData = { url, title: session.title || document.title };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
        return;
      }
      await navigator.clipboard.writeText(url);
      showToast({ message: 'Link copied to clipboard', variant: 'positive' });
    } catch (e) {
      if (e.name !== 'AbortError') window.lana?.log(`[MobileRider] share failed: ${e.message}`);
    }
  });

  return btn;
}

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
  #embedRafId = null;

  #embedGeneration = 0;

  #streamEnded = false;

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

  #isStreamInactive(vid) {
    if (!this.store || !vid || !this.#storeHas(vid)) return false;

    try {
      return this.store.get(vid) === false;
    } catch (e) {
      return false;
    }
  }

  async init() {
    try {
      if (!document.getElementById('mobile-rider-css')) {
        createTag('link', { rel: 'stylesheet', href: BLOCK_CSS_URL, id: 'mobile-rider-css' }, '', { parent: document.head });
      }
      this.el.dataset.theme = this.el.classList.contains('dark') ? 'dark' : 'light';
      this.cfg = this.#parseCfg();
      await Promise.all([loadScript(), this.el.closest('.chrono-box') ? this.#loadStore() : null]);

      this.#setupDOM();

      const videoId = this.cfg.videoid || this.cfg['video-id'];
      if (this.#isStreamInactive(videoId)) {
        this.root?.classList.add('is-hidden');
        return;
      }

      await this.injectPlayer(videoId, this.cfg.skinid, this.cfg.aslid);

      // Same section-metadata table upcoming-sessions.js already reads for this page —
      // avoids making the author repeat session-id on the mobile-rider block itself when
      // it's already authored there.
      const sessionId = this.cfg['session-id'] || readSectionMetadata(this.el, 'session-id');
      if (sessionId) this.#initInfoBar(this.cfg, sessionId);
    } catch (e) { this.log(e.message); }
  }

  #setupDOM() {
    this.root = this.el.querySelector('.mobile-rider-player')
      || createTag('div', { class: 'mobile-rider-player' }, '', { parent: this.el });

    this.wrap = this.root.querySelector('.video-wrapper')
      || createTag('div', { class: 'video-wrapper' }, '', { parent: this.root });
  }

  #initInfoBar(cfg, sessionId) {
    const aboutEnabled = cfg['about-session-enabled'] === true;
    if (!aboutEnabled) return;

    const bar = createTag('div', {
      class: 'mobile-rider-info-bar',
      style: cfg.background ? `background:${cfg.background}` : '',
    }, '', { parent: this.root });
    const header = createTag('div', { class: 'mobile-rider-info-bar-header' }, '', { parent: bar });
    createTag('h3', { class: 'mobile-rider-info-bar-title' }, cfg['session-title'] || '', { parent: header });

    const toggle = createTag('button', {
      type: 'button',
      class: 'mobile-rider-info-bar-toggle',
      'aria-expanded': 'false',
      'aria-label': 'About this session',
    }, '', { parent: header });
    createTag('span', { class: 'mobile-rider-info-bar-chevron' }, ICON_CHEVRON_DOWN, { parent: toggle });

    toggle.addEventListener('click', () => {
      const expanded = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', String(!expanded));
      bar.classList.toggle('is-expanded', !expanded);
    });

    const panelWrap = createTag('div', { class: 'mobile-rider-info-bar-panel-wrap' }, '', { parent: bar });
    const panel = createTag('div', { class: 'mobile-rider-info-bar-panel' }, '', { parent: panelWrap });

    const badge = buildCategoryBadge(cfg['session-category']);
    if (badge) panel.append(badge);
    if (cfg['session-description']) {
      createTag('p', { class: 'mobile-rider-info-bar-description' }, cfg['session-description'], { parent: panel });
    }
    const viewAllDetailsDevices = new Set(
      (cfg['view-all-details-devices'] || '').split(',').map((d) => d.trim().toLowerCase()).filter(Boolean),
    );
    if (viewAllDetailsDevices.size) {
      const more = createTag('button', {
        type: 'button',
        class: 'mobile-rider-info-bar-more',
        'data-view-all-mobile': String(viewAllDetailsDevices.has('mobile')),
        'data-view-all-tablet': String(viewAllDetailsDevices.has('tablet')),
        'data-view-all-desktop': String(viewAllDetailsDevices.has('desktop')),
      }, 'View all details', { parent: panel });
      more.addEventListener('click', () => openSessionGuideDetail(sessionId));
    }

    const actions = createTag('div', { class: 'mobile-rider-info-bar-actions' }, '', { parent: panel });
    actions.append(buildShareButton({ id: sessionId, title: cfg['session-title'] || '' }));

    initSessionState();
    const addFavorite = (session) => actions.prepend(buildFavoriteButton(session));
    const existing = sessions.value.find((s) => s.id === sessionId);
    if (existing) {
      addFavorite(existing);
      return;
    }
    const unsubscribe = sessions.subscribe((list) => {
      const found = list.find((s) => s.id === sessionId);
      if (found) {
        addFavorite(found);
        unsubscribe();
      }
    });
  }

  #cancelPendingEmbed() {
    if (this.#embedRafId != null) {
      cancelAnimationFrame(this.#embedRafId);
      this.#embedRafId = null;
    }
  }

  async injectPlayer(vid, skin, asl = null) {
    if (!this.wrap || this.isEmbedding) return;
    this.isEmbedding = true;
    this.#streamEnded = false;
    this.#cancelPendingEmbed();
    const generation = this.#embedGeneration + 1;
    this.#embedGeneration = generation;

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

      this.#embedRafId = requestAnimationFrame(() => {
        this.#embedRafId = null;

        if (generation !== this.#embedGeneration || this.#streamEnded) {
          finish();
          return;
        }

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
      if (this.#storeHas(vid) && window.__mr_player?.on) {
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
    if (new URLSearchParams(window.location.search).get('avoidStreamEndFlag') === 'true') return;
    // Avoid stacking listeners
    window.__mr_player?.off?.('streamend');
    window.__mr_player?.on?.('streamend', () => {
      this.#streamEnded = true;
      this.#cancelPendingEmbed();

      this.wrap?.querySelector('.mobile-rider-container')?.classList.add('is-hidden');

      if (this.store) this.setStatus(vid, false);

      window.__mr_player?.dispose?.();
      window.__mr_player = null;
    });
  }

  #initASL(container, vid) {
    let currentCheck = null;
    const poll = () => {
      clearInterval(currentCheck);
      let attempts = 0;
      currentCheck = setInterval(() => {
        const btn = container.querySelector(`#${CONFIG.ASL.BUTTON_ID}`);
        if (btn) {
          clearInterval(currentCheck);
          currentCheck = null;
          btn.addEventListener('click', () => {
            if (!container.classList.contains(CONFIG.ASL.TOGGLE_CLASS)) {
              container.classList.add(CONFIG.ASL.TOGGLE_CLASS);
            }
            // ASL toggle may replace window.__mr_player; defer so new player is ready
            if (this.store) {
              requestAnimationFrame(() => {
                try {
                  this.#maybeAttachEndListener(vid);
                } catch (e) {
                  this.log(`ASL end-listener error: ${e.message}`);
                }
              });
            }
            poll();
          }, { once: true });
        } else if (++attempts > CONFIG.ASL.MAX_CHECKS) {
          clearInterval(currentCheck);
          currentCheck = null;
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
      };
    }

    return [...this.el.querySelectorAll(':scope > div > div:first-child')].reduce((acc, div) => {
      const key = div.textContent.trim().toLowerCase().replace(/ /g, '-');
      acc[key] = toBool(div.nextElementSibling?.textContent?.trim() || '');
      return acc;
    }, {});
  }

  async #loadStore() {
    try {
      const { mobileRiderStore } = await import(
        new URL('../../../features/timing-framework/plugins/mobile-rider/plugin.js', import.meta.url).href
      );
      this.store = mobileRiderStore;
    } catch (e) { this.log('Store Fail'); }
  }

  setStatus(id, live) { this.#updateStatus(id, live); }

  #updateStatus(id, live) {
    if (!this.store || !this.#storeHas(id)) return;

    try {
      if (this.store.get(id) === live) return;
      this.store.set(id, live);
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
