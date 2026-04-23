import { createTag } from '../../utils/utils.js';
import {
  getLocalStorageVideos,
  getLocalStorageShouldAutoPlay,
  saveShouldAutoPlayToLocalStorage,
  normalizeVideoId,
  logError,
  convertDurationStringToSeconds,
} from './utils.js';
import {
  PLAYLIST_PLAY_ALL_ID,
  TOAST_CONTAINER_ID,
  ANALYTICS,
  PLAYLIST_SKIP_TO_ID,
  MAX_PERCENTAGE,
} from './constants.js';
import {
  getSessions,
  getUserAuthoredPlaylist,
  getChimeraFeaturedCards,
  isUserRegistered,
} from './api.js';
import { PlayerManager } from './player-manager.js';

/* --- Global Constants and Selectors --- */
const SELECTORS = {
  HEADER_CHECKBOX: `#${PLAYLIST_PLAY_ALL_ID}`,
  SESSION_CARD: '.session',
  PROGRESS_BAR: '.session-thumb-progress-bar',
};

const DEFAULT_CFG = {
  playlistId: null,
  playlistTitle: 'Video Playlist',
  autoplayText: 'Play All',
  topicEyebrow: '',
  skipPlaylistText: 'Skip playlist',
  minimumSessions: 4,
  isTagbased: true,
  tags: '',
  sort: 'default',
  socialSharing: true,
  favoritesEnabled: true,
  favoritesTooltipText: 'Add to favorites',
  favoritesNotificationText: 'Session added to favorites',
  favoritesButtonText: 'View',
  favoritesButtonLink: '/schedule',
  theme: 'light',
  videoUrl: '',
  enableFacebook: false,
  facebookAltText: 'Share Playlist on Facebook',
  enableTwitter: false,
  twitterCustomText: '',
  twitterAltText: 'Share Playlist on X',
  enableLinkedIn: false,
  linkedInAltText: 'Share Playlist on LinkedIn',
  enableCopyLink: false,
  copyLinkAltText: 'Share with link',
  copyNotificationText: 'Link copied to clipboard!',
  sessionPath: '',
};


const getMeta = (root) =>
  Object.fromEntries(
    [...root.querySelectorAll(':scope > div > div:first-child')].map((div) => {
      const key = div.textContent?.trim();
      const value = div.nextElementSibling?.textContent?.trim() ?? '';
      return [key, value];
    }).filter(([key]) => key),
  );


const coerceValue = (key, value, defaults) => {
  const defaultValue = defaults[key];
  if (typeof defaultValue === 'boolean') {
    if (value == null || value === '') return defaultValue;
    return String(value).toLowerCase() === 'true';
  }
  if (typeof defaultValue === 'number') {
    const parsed = parseInt(value, 10);
    return Number.isNaN(parsed) ? defaultValue : parsed;
  }
  return value;
};

const prepareCards = (cards = []) => cards.filter((card) => card.search?.thumbnailUrl);

const PLAY_ICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" height="40" viewBox="0 0 18 18" width="40"><rect opacity="0" width="18" height="18"/><path fill="#e5e5e5" d="M9,1a8,8,0,1,0,8,8A8,8,0,0,0,9,1Zm4.2685,8.43L7.255,12.93A.50009.50009,0,0,1,7,13H6.5a.5.5,0,0,1-.5-.5v-7A.5.5,0,0,1,6.5,5H7a.50009.50009,0,0,1,.255.07l6.0135,3.5a.5.5,0,0,1,0,.86Z"/></svg>';

const buildSessionCard = (card) => {
  const videoId = normalizeVideoId(card.search.mpcVideoId || card.search.videoId);
  const session = createTag('div', {
    'daa-lh': card.contentArea.title,
    class: 'session',
    'data-video-id': videoId,
  });
  const link = createTag('a', {
    'daa-ll': ANALYTICS.VIDEO_SELECT,
    href: card.overlayLink,
    class: 'session-link',
  }, '', { parent: session });

  const thumb = createTag('div', { class: 'session-thumb' }, '', { parent: link });
  createTag('img', {
    src: card.search.thumbnailUrl,
    alt: card.contentArea.title,
    loading: 'lazy',
  }, '', { parent: thumb });
  createTag('div', { class: 'session-thumb-play-icon' }, PLAY_ICON_SVG, { parent: thumb });
  const duration = createTag('div', { class: 'session-thumb-duration' }, '', { parent: thumb });
  createTag('p', { class: 'session-thumb-duration' }, card.search.videoDuration, { parent: duration });
  const progress = createTag('div', { class: 'session-thumb-progress' }, '', { parent: thumb });
  createTag('div', { class: 'session-thumb-progress-bar' }, '', { parent: progress });

  const info = createTag('div', { class: 'session-info' }, '', { parent: link });
  createTag('h4', { class: 'session-title' }, card.contentArea.title, { parent: info });
  createTag('p', { class: 'session-desc' }, card.contentArea.description, { parent: info });

  return session;
};


const TOAST_MODIFIERS = {
  positive: 'toast--positive',
  info: 'toast--info',
};

const TOAST_CLOSE_SVG = '<svg class="toast-close-icon" viewBox="0 0 8 8"><path d="m5.238 4 2.456-2.457A.875.875 0 1 0 6.456.306L4 2.763 1.543.306A.875.875 0 0 0 .306 1.544L2.763 4 .306 6.457a.875.875 0 1 0 1.238 1.237L4 5.237l2.456 2.457a.875.875 0 1 0 1.238-1.237z"></path></svg>';

const getToastIcon = (type) => {
  if (type === 'positive') {
    return '<svg xmlns="http://www.w3.org/2000/svg" height="18" viewBox="0 0 18 18" width="18" class="toast-icon"><path d="M9,1a8,8,0,1,0,8,8A8,8,0,0,0,9,1Zm5.333,4.54L8.009,13.6705a.603.603,0,0,1-.4375.2305H7.535a.6.6,0,0,1-.4245-.1755L3.218,9.829a.6.6,0,0,1-.00147-.84853L3.218,8.979l.663-.6625A.6.6,0,0,1,4.72953,8.315L4.731,8.3165,7.4,10.991l5.257-6.7545a.6.6,0,0,1,.8419-.10586L13.5,4.1315l.7275.5685A.6.6,0,0,1,14.333,5.54Z"></path></svg>';
  }
  if (type === 'info') {
    return '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18" fill="none" class="toast-icon"><circle cx="8" cy="8" r="7" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M8 4v4M8 11h.01" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
  }
  return '';
};


class VideoPlaylist {
  constructor(el) {
    this.el = el;
    this.cfg = {};
    this.root = null;
    this.sessionsWrapper = null;
    this.cards = [];
    this.disposers = [];
    this.favoritesManager = null;
    this.playerManager = null;
    this.init();
  }

  
  async init() {
    try {
      this.cfg = this.parseCfg();
      this.root = this.createRoot();
      this.el.appendChild(this.root);
      await this.loadAndRender();
      this.initPlayerManager();
    } catch (err) {
      logError(err, 'VideoPlaylist.init');
      this.root?.classList.remove('is-hidden');
    }
  }

  cleanup() {
    this.playerManager?.cleanup();
    this.favoritesManager?.cleanup();
    this.disposers.forEach((fn) => {
      try {
        fn();
      } catch {
        /* swallow */
      }
    });
    this.disposers.length = 0;
  }

  /* config */
  parseCfg() {
    const meta = getMeta(this.el);
    const config = { ...DEFAULT_CFG };

    Object.entries(meta).forEach(([key, value]) => {
      // Find case-insensitive key in defaults
      const normalizedKey = Object.keys(DEFAULT_CFG).find(k => k.toLowerCase() === key.toLowerCase());
      if (normalizedKey) {
        config[normalizedKey] = coerceValue(normalizedKey, value, DEFAULT_CFG);
      }
    });

    // Validate critical config values
    if (config.minimumSessions < 1) {
      logError('minimumSessions must be >= 1', 'VideoPlaylist.parseCfg', { value: config.minimumSessions });
      config.minimumSessions = DEFAULT_CFG.minimumSessions;
    }

    return config;
  }

  createRoot() {
    const container = createTag('div', { class: 'container is-hidden' });
    if (this.cfg.theme) container.classList.add(`consonant--${this.cfg.theme}`);
    return container;
  }

  /* data */
  async fetchCards() {
    if (this.cfg.isTagbased) {
      const { cards = [] } = await getSessions();
      return prepareCards(cards);
    }

    const playlist = await getUserAuthoredPlaylist(this.cfg);
    this.cfg.playlistTitle = playlist.playlistTitle || this.cfg.playlistTitle;
    this.cfg.topicEyebrow = playlist.topicEyebrow || this.cfg.topicEyebrow;

    const ids = (playlist.sessions || []).map((session) => session.entityId);
    const { cards = [] } = await getChimeraFeaturedCards(ids);
    return prepareCards(cards);
  }

  sortCards(cards) {
    if (this.cfg.sort === 'default') return cards;
    
    const sorted = [...cards];

    // Sort by title
    if (this.cfg.sort === 'titleAscending') {
      sorted.sort((a, b) => a.contentArea.title.localeCompare(b.contentArea.title));
    } else if (this.cfg.sort === 'titleDescending') {
      sorted.sort((a, b) => b.contentArea.title.localeCompare(a.contentArea.title));
    }
    // Sort by time (duration)
    else if (this.cfg.sort === 'timeAscending') {
      sorted.sort((a, b) => {
        const aSeconds = convertDurationStringToSeconds(a.search.videoDuration);
        const bSeconds = convertDurationStringToSeconds(b.search.videoDuration);
        return aSeconds - bSeconds; // shortest to longest
      });
    } else if (this.cfg.sort === 'timeDescending') {
      sorted.sort((a, b) => {
        const aSeconds = convertDurationStringToSeconds(a.search.videoDuration);
        const bSeconds = convertDurationStringToSeconds(b.search.videoDuration);
        return bSeconds - aSeconds; // longest to shortest
      });
    }
    
    return sorted;
  }

  /* render */
  async loadAndRender() {
    try {
      const raw = await this.fetchCards();
      this.cards = this.sortCards(raw);
      if (this.cards.length < this.cfg.minimumSessions) {
        logError(
          `Not enough sessions: ${this.cards.length} of ${this.cfg.minimumSessions} required.`,
          'VideoPlaylist.loadAndRender',
          { cardCount: this.cards.length, minimum: this.cfg.minimumSessions }
        );
        return;
      }
      await this.render(this.cards);
    } catch (err) {
      logError(err, 'VideoPlaylist.loadAndRender');
    }
  }

  async render(cards) {
    this.root.classList.remove('is-hidden');
    const header = await this.renderHeader();
    this.root.appendChild(header);
    this.root.appendChild(this.renderSessions(cards));
    
    // 3. Initialize Favorites Manager (only if enabled AND user is registered)
    if (this.cfg.favoritesEnabled) {
      try {
        const isRegistered = await isUserRegistered();
        if (!isRegistered) return;
          this.favoritesManager?.cleanup();
          const { FavoritesManager } = await import('./favorites-manager.js');
          this.favoritesManager = new FavoritesManager({
            config: this.cfg,
            getCards: () => this.cards,
            getSessionsWrapper: () => this.sessionsWrapper,
            showToast: (...args) => this.toast(...args),
          });
          await this.favoritesManager.setup();
      } catch (error) {
        logError(error, 'VideoPlaylist.render.favoritesManager');
      }
    }
    this.root.appendChild(
      createTag('div', { id: PLAYLIST_SKIP_TO_ID, class: 'playlist-skip-to' }),
    );
  }

  async renderHeader() {
    const header = createTag('div', { class: 'header' });
    const checked = getLocalStorageShouldAutoPlay();

    const upper = createTag('div', { class: 'header-upper' }, '', { parent: header });
    const skip = createTag('div', { class: 'header-skip' }, '', { parent: upper });
    createTag('a', {
      href: `#${PLAYLIST_SKIP_TO_ID}`,
      class: 'header-skip-link button',
    }, this.cfg.skipPlaylistText, { parent: skip });

    const toggle = createTag('div', { class: 'header-toggle' }, '', { parent: upper });
    const switchEl = createTag('div', { class: 'consonant-switch consonant-switch--sizeM' }, '', { parent: toggle });
    const checkbox = createTag('input', {
      type: 'checkbox',
      class: 'consonant-switch-input',
      id: PLAYLIST_PLAY_ALL_ID,
      'daa-ll': checked ? ANALYTICS.TOGGLE_OFF : ANALYTICS.TOGGLE_ON,
    }, '', { parent: switchEl });
    if (checked) checkbox.checked = true;
    createTag('span', { class: 'consonant-switch-switch' }, '', { parent: switchEl });
    createTag('label', {
      class: 'consonant-switch-label',
      for: PLAYLIST_PLAY_ALL_ID,
    }, this.cfg.autoplayText.toUpperCase(), { parent: switchEl });

    const content = createTag('div', { class: 'header-content' }, '', { parent: header });
    const left = createTag('div', { class: 'header-left' }, '', { parent: content });
    createTag('p', { class: 'header-topic' }, this.cfg.topicEyebrow, { parent: left });
    createTag('h3', { class: 'header-title' }, this.cfg.playlistTitle, { parent: left });
    const right = createTag('div', { class: 'header-right' }, '', { parent: content });

    let socialModule = null;
    if (this.cfg.socialSharing) {
      try {
        socialModule = await import('./social.js');
        const socialMarkup = socialModule.createSocialShareMarkup(this.cfg);
        if (socialMarkup) right.insertAdjacentHTML('beforeend', socialMarkup);
      } catch (error) {
        logError(error, 'VideoPlaylist.renderHeader.socialSharing');
      }
    }

    // Autoplay toggle wiring
    const onToggleChange = (event) => {
      saveShouldAutoPlayToLocalStorage(event.target.checked);
      event.target.setAttribute(
        'daa-ll',
        event.target.checked ? ANALYTICS.TOGGLE_ON : ANALYTICS.TOGGLE_OFF,
      );
    };
    checkbox.addEventListener('change', onToggleChange);
    this.disposers.push(() => checkbox.removeEventListener('change', onToggleChange));

    // Social sharing wiring
    if (this.cfg.socialSharing && socialModule) {
      try {
        const disposer = socialModule.wireSocialShare(header, {
          onCopy: () => {
            this.copy(window.location.href);
            this.toast(this.cfg.copyNotificationText, 'info');
          },
        });
        if (disposer) this.disposers.push(disposer);
      } catch (error) {
        logError(error, 'VideoPlaylist.renderHeader.socialSharing');
      }
    }

    return header;
  }

  renderSessions(cards) {
    const outer = createTag('div', { class: 'sessions' });
    this.sessionsWrapper = createTag('div', { class: 'sessions' }, '', { parent: outer });
    cards.forEach((card) => this.sessionsWrapper.appendChild(buildSessionCard(card)));
    this.initProgressBars(this.sessionsWrapper);
    return outer;
  }

  initProgressBars(wrapper) {
    const videos = getLocalStorageVideos();
    [...wrapper.querySelectorAll(SELECTORS.SESSION_CARD)].forEach(
      (session) => {
        const videoId = normalizeVideoId(session.getAttribute('data-video-id'));
        if (!videoId) return;
        
        // Try both normalized and original key formats for backward compatibility
        const data = videos[videoId] || videos[session.getAttribute('data-video-id')];
        if (data?.length && data.secondsWatched > 0) {
          const bar = session.querySelector(SELECTORS.PROGRESS_BAR);
          if (bar) {
            const percentage = Math.min(
              MAX_PERCENTAGE,
              (data.secondsWatched / data.length) * MAX_PERCENTAGE,
            );
            bar.style.width = `${percentage}%`;
          }
        }
      },
    );
  }

  highlightSession(videoId) {
    if (!this.sessionsWrapper || !videoId) return;
    
    // Remove highlight from all sessions
    const highlighted = this.sessionsWrapper.querySelectorAll('.highlighted');
    highlighted.forEach((element) => element.classList.remove('highlighted'));
    
    // Find and highlight target session using normalized videoId
    const normalizedId = normalizeVideoId(videoId);
    if (!normalizedId) return;
    
    const sessions = this.sessionsWrapper.querySelectorAll(SELECTORS.SESSION_CARD);
    const target = Array.from(sessions).find((session) => {
      const sessionVideoId = normalizeVideoId(session.getAttribute('data-video-id'));
      return sessionVideoId === normalizedId;
    });
    
    if (target) {
      target.classList.add('highlighted');
      target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  updateProgress(videoId, current, length) {
    if (!this.sessionsWrapper || !videoId || !length) return;
    
    const normalizedId = normalizeVideoId(videoId);
    if (!normalizedId) return;
    
    // Find session by normalized videoId
    const sessions = this.sessionsWrapper.querySelectorAll(SELECTORS.SESSION_CARD);
    const container = Array.from(sessions).find((session) => {
      const sessionVideoId = normalizeVideoId(session.getAttribute('data-video-id'));
      return sessionVideoId === normalizedId;
    });
    
    if (!container) return;

    const bar = container.querySelector(SELECTORS.PROGRESS_BAR);
    if (!bar) return;
    
    const percentage = Math.min(MAX_PERCENTAGE, (current / length) * MAX_PERCENTAGE);
    bar.style.width = `${percentage}%`;
  }

  /**
   * Initializes the PlayerManager, connecting player events to UI update methods.
   */
  initPlayerManager() {
    this.playerManager?.cleanup();
    this.playerManager = new PlayerManager({
      highlightSession: (videoId) => this.highlightSession(videoId),
      updateProgressBar: (videoId, current, length) =>
        this.updateProgress(videoId, current, length),
      getCards: () => this.cards,
      navigateTo: (href) => {
        window.location.href = href;
      },
    });
    this.playerManager.bootstrap();
  }

  /* utility */
  
  getToastContainer() {
    let container = document.getElementById(TOAST_CONTAINER_ID);
    if (!container) {
      container = createTag('div', { id: TOAST_CONTAINER_ID });
      this.root.appendChild(container); 
    }
    return container;
  }

  toast(message, type = 'default', button = null) {
    const container = this.getToastContainer();
    const modifier = TOAST_MODIFIERS[type] || '';
    const toastClass = modifier ? `toast ${modifier}` : 'toast';

    const toast = createTag('div', {
      class: toastClass,
      role: 'alert',
      'aria-live': 'assertive',
      'aria-atomic': 'true',
    });

    const iconMarkup = getToastIcon(type);
    if (iconMarkup) toast.insertAdjacentHTML('beforeend', iconMarkup);

    const body = createTag('div', { class: 'toast-body' }, '', { parent: toast });
    createTag('div', { class: 'toast-content' }, message, { parent: body });

    if (button) {
      const buttonEl = createTag('button', {
        class: 'toast-button',
        'daa-ll': button.daaLL,
      }, '', { parent: body });
      createTag('span', { class: 'toast-button-label' }, button.text, { parent: buttonEl });
      buttonEl.addEventListener('click', () => {
        if (button.link) window.location.href = button.link;
      });
    }

    const buttons = createTag('div', { class: 'toast-buttons' }, '', { parent: toast });
    const closeButton = createTag('button', {
      'aria-label': 'close',
      class: 'toast-close',
      label: 'Close',
      'daa-ll': ANALYTICS.CLOSE_FAVORITE_NOTIFICATION,
    }, TOAST_CLOSE_SVG, { parent: buttons });
    closeButton.addEventListener('click', () => toast.remove());

    container.appendChild(toast);
  }

  async copy(text) {
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(text);
        return;
      } catch {
        this.legacyCopy(text);
        return;
      }
    }
    this.legacyCopy(text);
  }

  legacyCopy(text) {
    const textarea = createTag('textarea', {
      value: text,
      style: 'position:fixed;left:-9999px;top:-9999px;',
    });
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand('copy');
    } catch (err) {
      logError(err, 'VideoPlaylist.legacyCopy');
    }
    document.body.removeChild(textarea);
  }
}

export default function init(el) {
  return new VideoPlaylist(el);
}
