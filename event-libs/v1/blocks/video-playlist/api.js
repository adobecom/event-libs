/**
 * @file api.js
 * @desc Single entry point for every backend call the video-playlist block makes.
 *       Adapter pattern: real endpoints auto-selected when `window.northstar.api` is
 *       available, mock fixtures served from this folder otherwise. When the real
 *       APIs land, fill in `realAdapter` and delete `mockAdapter` + mock-*.json.
 */

const hasRealApi = () => Boolean(window?.northstar?.api);

/* ---------- real adapter (placeholder until backend is wired) ---------- */
function realAdapter() {
  const notWired = () => { throw new Error('Real API not wired'); };
  return {
    getSessions: notWired,
    getUserAuthoredPlaylist: notWired,
    getChimeraFeaturedCards: notWired,
    isUserRegistered: notWired,
    getFavorites: notWired,
    toggleFavorite: notWired,
  };
}

/* ---------- mock adapter ---------- */
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const FAVORITES_LS_KEY = 'mockFavorites';
const DEFAULT_FAVORITES = ['sess_001', 'sess_003'];

const getMockFileUrl = (filename) => {
  const moduleUrl = new URL(import.meta.url);
  const baseDir = moduleUrl.pathname.substring(0, moduleUrl.pathname.lastIndexOf('/'));
  return `${moduleUrl.origin}${baseDir}/${filename}`;
};

const extractFromArbitrary = (arbitrary, key) => {
  if (!Array.isArray(arbitrary)) return null;
  const entry = arbitrary.find((item) => item && typeof item === 'object' && key in item);
  return entry ? entry[key] : null;
};

const transformEntityCard = (item) => {
  const arbitrary = item.arbitrary || [];

  const search = {
    thumbnailUrl: extractFromArbitrary(arbitrary, 'thumbnailUrl') || item.thumbnail?.url || '',
    videoDuration: extractFromArbitrary(arbitrary, 'videoDuration') || item.cardData?.details || '',
    mpcVideoId: extractFromArbitrary(arbitrary, 'mpcVideoId') || '',
    videoId: extractFromArbitrary(arbitrary, 'videoId') || extractFromArbitrary(arbitrary, 'mpcVideoId') || '',
    videoService: extractFromArbitrary(arbitrary, 'videoService') || 'adobeTv',
    sessionId: extractFromArbitrary(arbitrary, 'sessionId') || '',
    sessionCode: extractFromArbitrary(arbitrary, 'sessionCode') || '',
    sessionTimeId: extractFromArbitrary(arbitrary, 'sessionTimeID') || '',
  };

  let contentUrl = item.cardData?.cta?.primaryCta?.url || item.url || '';
  if (contentUrl && !contentUrl.startsWith('http') && contentUrl.startsWith('/')) {
    contentUrl = `https://www.adobe.com${contentUrl}`;
  }

  return {
    id: item.entityId || item.contentId || '',
    search,
    contentArea: {
      title: item.cardData?.headline || item.title || '',
      description: item.description
        || item.cardData?.description
        || extractFromArbitrary(arbitrary, 'sessionDescription')
        || '',
      url: contentUrl,
    },
    overlayLink: contentUrl,
  };
};

const favoritesRead = () => {
  try {
    const raw = localStorage.getItem(FAVORITES_LS_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set(DEFAULT_FAVORITES);
  } catch {
    return new Set(DEFAULT_FAVORITES);
  }
};

const favoritesWrite = (set) => {
  try {
    localStorage.setItem(FAVORITES_LS_KEY, JSON.stringify([...set]));
  } catch {
    /* ignore */
  }
};

function mockAdapter() {
  return {
    async getSessions() {
      await delay(100);
      const response = await fetch(getMockFileUrl('mock-chimera-response.json'));
      if (!response.ok) throw new Error('Failed to load mock-chimera-response.json');
      return response.json();
    },

    async getUserAuthoredPlaylist(config) {
      await delay(150);
      const response = await fetch(getMockFileUrl('mock-entity-lookup-response.json'));
      if (!response.ok) throw new Error('Failed to load mock-entity-lookup-response.json');
      const lookupData = await response.json();
      const paths = (config.sessionPath || '').split(',').map((s) => s.trim()).filter(Boolean);
      const sessions = lookupData.slice(0, paths.length).map((item, i) => ({
        sessionCode: extractFromArbitrary(item.arbitrary || [], 'sessionCode') || `S${6000 + i}`,
        entityId: item.entityId || item.contentId || '',
        sessionPath: paths[i] || '',
      }));
      return {
        playlistID: config.playlistId || '123',
        playlistTitle: config.playlistTitle || 'Sample playlistTitle',
        topicEyebrow: config.topicEyebrow || 'Eyebrow text',
        sessions,
      };
    },

    async getChimeraFeaturedCards(entityIds) {
      await delay(200);
      const response = await fetch(getMockFileUrl('mock-featured-cards-response.json'));
      if (!response.ok) throw new Error('Failed to load mock-featured-cards-response.json');
      const featuredData = await response.json();
      const cards = featuredData
        .slice(0, entityIds.length)
        .map(transformEntityCard)
        .filter((card) => card.search?.thumbnailUrl);
      return { cards };
    },

    async isUserRegistered() {
      await delay(100);
      return true;
    },

    async getFavorites() {
      await delay(50);
      const set = favoritesRead();
      return {
        sessionInterests: [...set].map((id) => ({ sessionID: id })),
        responseCode: '0',
      };
    },

    // eslint-disable-next-line no-unused-vars
    async toggleFavorite(sessionTimeId, sessionId) {
      await delay(100);
      const set = favoritesRead();
      if (set.has(sessionId)) set.delete(sessionId);
      else set.add(sessionId);
      favoritesWrite(set);
      return { success: true, responseCode: '0' };
    },
  };
}

const api = hasRealApi() ? realAdapter() : mockAdapter();

const invoke = async (method, ...args) => {
  try {
    return await api[method](...args);
  } catch (err) {
    window.lana?.log(`[VideoPlaylist.api] ${method} failed: ${err.message}`);
    throw err;
  }
};

/* ---------- public entry ---------- */
export const getSessions = () => invoke('getSessions');
export const getUserAuthoredPlaylist = (config) => invoke('getUserAuthoredPlaylist', config);
export const getChimeraFeaturedCards = (entityIds) => invoke('getChimeraFeaturedCards', entityIds);
export const isUserRegistered = () => invoke('isUserRegistered');
export const getFavorites = () => invoke('getFavorites');
export const toggleFavorite = (sessionTimeId, sessionId) => invoke('toggleFavorite', sessionTimeId, sessionId);
