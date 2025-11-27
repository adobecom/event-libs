/* utils.js */
import { PLAYLIST_VIDEOS_KEY, AUTOPLAY_PLAYLIST_KEY, VIDEO_ORIGIN } from './constants.js';

/* ---------- localStorage ---------- */
const readJSON = (key, defaultValue) => {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : defaultValue;
  } catch (error) {
    console.error(`localStorage read error for key "${key}":`, error);
    return defaultValue;
  }
};

const writeJSON = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error(`localStorage write error for key "${key}":`, error);
  }
};

export const getLocalStorageVideos=()=>readJSON(PLAYLIST_VIDEOS_KEY,{});
export const saveLocalStorageVideos=(videos)=>writeJSON(PLAYLIST_VIDEOS_KEY,videos);
export const getLocalStorageShouldAutoPlay=()=>readJSON(AUTOPLAY_PLAYLIST_KEY,true);
export const saveShouldAutoPlayToLocalStorage=(v)=>writeJSON(AUTOPLAY_PLAYLIST_KEY,v);

/* ---------- Duration fetching (memoized) ---------- */
const durationCache=new Map(); // id -> seconds
const inflight=new Map(); // id -> Promise<number|null>

const fetchVideoDuration = async (id) => {
  // Return cached duration if available
  if (durationCache.has(id)) {
    return durationCache.get(id);
  }
  
  // Return existing promise if already fetching
  if (inflight.has(id)) {
    return inflight.get(id);
  }
  
  // Create new fetch promise
  const fetchPromise = (async () => {
    try {
      const response = await fetch(`${VIDEO_ORIGIN}/v/${id}?format=json-ld`);
      const json = await response.json();
      const seconds = convertIsoDurationToSeconds(
        json?.jsonLinkedData?.duration || ''
      ) || null;
      
      // Cache the result if valid
      if (seconds != null) {
        durationCache.set(id, seconds);
      }
      
      return seconds;
    } catch (error) {
      console.error(`Failed to fetch video duration for ID "${id}":`, error);
      return null;
    } finally {
      // Clean up inflight tracking
      inflight.delete(id);
    }
  })();
  
  // Track the inflight request
  inflight.set(id, fetchPromise);
  return fetchPromise;
};

export const saveCurrentVideoProgress = async (id, currentTime, length = null) => {
  if (!id && id !== 0) return;
  
  const videos = getLocalStorageVideos();
  const previousVideo = videos[id];

  if (previousVideo) {
    // Update existing video progress
    const completed = previousVideo.completed || Boolean(
      length && currentTime >= length
    );
    videos[id] = {
      ...previousVideo,
      secondsWatched: currentTime,
      completed,
    };
  } else {
    // Create new video entry
    const videoLength = length ?? await fetchVideoDuration(id);
    if (videoLength != null) {
      videos[id] = {
        secondsWatched: currentTime,
        length: videoLength,
      };
    }
  }
  
  saveLocalStorageVideos(videos);
};

/* ---------- Time ---------- */
export const convertIsoDurationToSeconds = (iso) => {
  if (!iso || typeof iso !== 'string') return 0;
  
  // Match ISO 8601 duration format: P[nY][nM][nD][T[nH][nM][nS]]
  const match = iso.match(/P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?/);
  if (!match) return 0;
  
  // Extract hours, minutes, and seconds from match groups
  const hours = parseInt(match[4] || 0, 10);
  const minutes = parseInt(match[5] || 0, 10);
  const seconds = parseInt(match[6] || 0, 10);
  
  return hours * 3600 + minutes * 60 + seconds;
};

/**
 * Converts duration string (HH:MM:SS, MM:SS, or SS) to seconds
 * @param {string} duration - Duration string in format HH:MM:SS, MM:SS, or SS
 * @returns {number} Duration in seconds
 */
export const convertDurationStringToSeconds = (duration) => {
  if (!duration || typeof duration !== 'string') return 0;
  const parts = duration.split(':').map(Number);
  
  if (parts.length === 3) {
    // HH:MM:SS format
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  if (parts.length === 2) {
    // MM:SS format
    return parts[0] * 60 + parts[1];
  }
  // SS format or single number
  return parts[0] || 0;
};

/* ---------- Player helpers ---------- */
export const findVideoIdFromIframeSrc = (src = '') => {
  if (!src) return null;
  
  // MPC: https://video.tv.adobe.com/v/12345?...  -> 12345
  const mpcMatch = src.match(/\/v\/(\d+)\b/);
  if (mpcMatch) return mpcMatch[1];
  
  // YouTube embed/nocookie: youtube.com/embed/VIDEO_ID
  const youtubeEmbedMatch = src.match(/youtube(?:-nocookie)?\.com\/embed\/([a-zA-Z0-9_-]{11})/);
  if (youtubeEmbedMatch) return youtubeEmbedMatch[1];
  
  // Fallback: v= param on YouTube watch URLs
  const youtubeParamMatch = src.match(/[?&#]v=([a-zA-Z0-9_-]{11})/);
  return youtubeParamMatch ? youtubeParamMatch[1] : null;
};

export const startVideoFromSecond = (container, seconds = 0) => {
  const iframe = container?.querySelector('iframe');
  const iframeWindow = iframe?.contentWindow;
  
  if (!iframeWindow || Number.isNaN(seconds)) return;
  
  iframeWindow.postMessage(
    {
      type: 'mpcAction',
      action: 'play',
      currentTime: Math.floor(seconds),
    },
    VIDEO_ORIGIN
  );
};

/* ---------- Type Normalization ---------- */
/**
 * Normalizes video ID to string for consistent comparison
 * Handles both string and number types
 * @param {string|number|null|undefined} id - Video ID to normalize
 * @returns {string|null} Normalized video ID as string, or null if invalid
 */
export const normalizeVideoId = (id) => {
  if (id == null) return null;
  const str = String(id).trim();
  return str || null;
};

/**
 * Compares two video IDs for equality, handling type mismatches
 * @param {string|number} id1 - First video ID
 * @param {string|number} id2 - Second video ID
 * @returns {boolean} True if IDs match (after normalization)
 */
export const compareVideoIds = (id1, id2) => {
  const normalized1 = normalizeVideoId(id1);
  const normalized2 = normalizeVideoId(id2);
  if (!normalized1 || !normalized2) return false;
  return normalized1 === normalized2;
};

/**
 * Finds a card by video ID, checking both mpcVideoId and videoId fields
 * @param {Array} cards - Array of card objects
 * @param {string|number} videoId - Video ID to find
 * @returns {Object|null} Matching card or null
 */
export const findCardByVideoId = (cards, videoId) => {
  if (!Array.isArray(cards) || !videoId) return null;
  const normalizedId = normalizeVideoId(videoId);
  if (!normalizedId) return null;
  
  return cards.find(
    (card) =>
      compareVideoIds(card?.search?.mpcVideoId, normalizedId) ||
      compareVideoIds(card?.search?.videoId, normalizedId)
  ) || null;
};

/* ---------- Error Handling ---------- */
/**
 * Safe error logging with optional context
 * @param {Error|string} error - Error object or message
 * @param {string} context - Context where error occurred
 * @param {Object} metadata - Additional metadata
 */
export const logError = (error, context = 'VideoPlaylist', metadata = {}) => {
  const message = error instanceof Error ? error.message : String(error);
  const errorData = {
    message,
    context,
    ...metadata,
  };
  
  if (window.lana?.log) {
    window.lana.log(JSON.stringify(errorData));
  } else {
    console.error(`[${context}]`, message, metadata);
  }
};

/**
 * Wraps async function with error handling
 * @param {Function} fn - Async function to wrap
 * @param {string} context - Context for error logging
 * @param {*} defaultValue - Default value to return on error
 * @returns {Function} Wrapped function
 */
export const withErrorHandling = (fn, context, defaultValue = null) => {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (error) {
      logError(error, context, { args });
      return defaultValue;
    }
  };
};
