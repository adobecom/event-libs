import { createTag, getMetadata, LIBS } from '../../../utils/utils.js';
import { getNowMs } from '../../../utils/session-state.js';
import BlockMediator from '../../../deps/block-mediator.min.js';
import { showVideoLayoutLoader, hideVideoLayoutLoader } from '../../utils/video-layout-loader.js';

// Shared getter/setter/subscriber store (same imsProfile/rsvpData pattern
// session-store.js already uses) — video-playlist.js sets this once it knows whether it
// has anything to show; both video-player instances on the page read/subscribe to it to
// decide which one actually embeds. Replaces a prior window.__videoPlaylistDecision
// latch + CustomEvent pair with the same mechanism the rest of the codebase already uses
// for this kind of cross-block signal.
const VIDEO_LAYOUT_DECISION_KEY = 'videoLayoutDecision';

const BLOCK_CSS_URL = new URL('./video-player.css', import.meta.url).href;
const MILO_IFRAME_CSS_URL = `${LIBS}/styles/iframe.css`;

function ensureMiloIframeCss() {
  if (document.getElementById('milo-iframe-css')) return;
  createTag('link', { rel: 'stylesheet', href: MILO_IFRAME_CSS_URL, id: 'milo-iframe-css' }, '', { parent: document.head });
}

const VIDEO_PROVIDER_ORIGINS = {
  mpc: ['https://video.tv.adobe.com'],
  // Real YouTube embeds also connect to i.ytimg.com (thumbnails) and
  // googlevideo.com (the actual media stream) — preconnecting all three gets the
  // TCP/TLS handshake for each origin out of the way before the iframe itself even
  // starts requesting them.
  youtube: ['https://www.youtube.com', 'https://i.ytimg.com', 'https://www.google.com'],
};

// Warms the connection to whichever provider's origin(s) this session's video actually
// needs, as early as init() knows `currentVideo.provider` — well before the
// layout-decision/loader gating below, so by the time the winning instance's
// loadVideoPlayer() actually sets the iframe's src, the DNS/TCP/TLS handshake for that
// origin is already underway (or done) instead of starting cold at that later point.
// Deduped by id so re-running init() (or the same origin needed by both instances on a
// page) never appends the same <link> twice.
function preconnectVideoProvider(provider) {
  (VIDEO_PROVIDER_ORIGINS[provider] || []).forEach((origin) => {
    const id = `preconnect-${origin.replace(/[^a-z0-9]/gi, '-')}`;
    if (document.getElementById(id)) return;
    createTag('link', {
      rel: 'preconnect', href: origin, crossorigin: '', id,
    }, '', { parent: document.head });
  });
}

const PROGRESS_STORAGE_KEY = 'video-playlist:progress';
const PROGRESS_TICK_SECONDS = 5;
const RESUME_RESTART_THRESHOLD_SECONDS = 30;

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    window.lana?.log(`[video-player] localStorage read failed for "${key}": ${e.message}`);
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    window.lana?.log(`[video-player] localStorage write failed for "${key}": ${e.message}`);
  }
}

export function getVideoProgress(sessionId) {
  return readJson(PROGRESS_STORAGE_KEY, {})[sessionId] || null;
}

export function saveVideoProgress(sessionId, secondsWatched, length = null) {
  if (!sessionId) return;
  const all = readJson(PROGRESS_STORAGE_KEY, {});
  const previous = all[sessionId];
  const resolvedLength = length ?? previous?.length ?? null;
  all[sessionId] = {
    secondsWatched,
    length: resolvedLength,
    completed: Boolean(resolvedLength && secondsWatched >= resolvedLength),
  };
  writeJson(PROGRESS_STORAGE_KEY, all);
}

// Individual Session Pages carry several JSON blobs as page metadata (custom-attributes,
// session-times) — same parse-with-guard shape each time.
function parseJsonMetadata(name) {
  const raw = getMetadata(name);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (e) {
    window.lana?.log(`[video-player] invalid ${name} page metadata: ${e.message}`);
    return null;
  }
}

function currentSessionHasEnded(sessionTimes, nowMs) {
  const entry = (sessionTimes || [])[0];
  if (!entry || !Number.isFinite(entry.endTimeMillis)) return true;
  return nowMs >= entry.endTimeMillis;
}

const EMBEDDABLE_PROVIDERS = ['mpc', 'youtube'];

function pickEmbeddableVideo(sessionTimes) {
  const videos = (sessionTimes || []).flatMap((t) => t?.videos || [])
    .filter((v) => EMBEDDABLE_PROVIDERS.includes(v.provider));
  return videos.find((v) => v.kind === 'onDemand') || null;
}

const ADOBE_TV_ORIGIN = 'https://video.tv.adobe.com';
const MPC_MESSAGE_TYPE = 'mpcStatus';
const MPC_ACTION_TYPE = 'mpcAction';
const MPC_STATE_LOAD = 'load';
const MPC_STATE_PAUSE = 'pause';
const MPC_STATE_TICK = 'tick';
const MPC_STATE_COMPLETE = 'complete';

// Best-effort extraction of a bare YouTube video id from whatever shape the (unconfirmed)
// url comes in — an embed URL, a watch URL, or a bare id.
function extractYouTubeId(url) {
  const embedMatch = url.match(/youtube(?:-nocookie)?\.com\/embed\/([a-zA-Z0-9_-]{11})/);
  if (embedMatch) return embedMatch[1];
  const watchMatch = url.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
  if (watchMatch) return watchMatch[1];
  const bareMatch = url.match(/^([a-zA-Z0-9_-]{11})$/);
  return bareMatch ? bareMatch[1] : null;
}

function buildMiloVideo(video) {
  ensureMiloIframeCss();
  const container = createTag('div', { class: 'milo-video' });
  if (video.provider === 'youtube') {
    const youtubeId = extractYouTubeId(video.url);
    const src = youtubeId
      ? `https://www.youtube.com/embed/${youtubeId}?enablejsapi=1&origin=${window.location.origin}&autoplay=1`
      : video.url;
    createTag('iframe', {
      src,
      class: 'youtube',
      id: youtubeId ? `video-player-yt-${youtubeId}` : '',
      webkitallowfullscreen: '',
      mozallowfullscreen: '',
      allowfullscreen: '',
      scrolling: 'no',
      allow: 'encrypted-media; accelerometer; gyroscope; picture-in-picture',
      title: 'YouTube video player',
    }, '', { parent: container });
    return container;
  }
  createTag('iframe', {
    src: video.url,
    class: 'adobetv',
    webkitallowfullscreen: '',
    mozallowfullscreen: '',
    allowfullscreen: '',
    scrolling: 'no',
    allow: 'encrypted-media',
    title: 'Adobe Video Publishing Cloud Player',
    loading: 'lazy',
  }, '', { parent: container });
  return container;
}

export function resumeMpcVideo(iframe, progress) {
  if (!progress || !progress.length) return;
  if (progress.secondsWatched >= progress.length - RESUME_RESTART_THRESHOLD_SECONDS) return;
  iframe.contentWindow?.postMessage({
    type: MPC_ACTION_TYPE,
    action: 'play',
    currentTime: Math.floor(progress.secondsWatched),
  }, ADOBE_TV_ORIGIN);
}

// ISO-8601 duration ("PT40M40S") → seconds — same parser the exploratory
// new-video-playlist branch's utils-new.js used for the same purpose.
export function convertIsoDurationToSeconds(iso) {
  if (!iso || typeof iso !== 'string') return 0;
  const match = iso.match(/P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?/);
  if (!match) return 0;
  const hours = parseInt(match[4] || 0, 10);
  const minutes = parseInt(match[5] || 0, 10);
  const seconds = parseInt(match[6] || 0, 10);
  return (hours * 3600) + (minutes * 60) + seconds;
}

const mpcDurationCache = new Map(); // mpcVideoId -> seconds
const mpcDurationInflight = new Map(); // mpcVideoId -> Promise<number|null>


async function fetchMpcVideoDuration(mpcVideoId) {
  if (!mpcVideoId) return null;
  if (mpcDurationCache.has(mpcVideoId)) return mpcDurationCache.get(mpcVideoId);
  if (mpcDurationInflight.has(mpcVideoId)) return mpcDurationInflight.get(mpcVideoId);

  const promise = (async () => {
    try {
      const response = await fetch(`${ADOBE_TV_ORIGIN}/v/${mpcVideoId}?format=json-ld`);
      const json = await response.json();
      const seconds = convertIsoDurationToSeconds(json?.jsonLinkedData?.duration || '') || null;
      if (seconds != null) mpcDurationCache.set(mpcVideoId, seconds);
      return seconds;
    } catch (e) {
      window.lana?.log(`[video-player] could not fetch mpc video duration for "${mpcVideoId}": ${e.message}`);
      return null;
    } finally {
      mpcDurationInflight.delete(mpcVideoId);
    }
  })();
  mpcDurationInflight.set(mpcVideoId, promise);
  return promise;
}


function notifyProgressChanged(sessionId) {
  window.dispatchEvent(new CustomEvent('video-player:progress', { detail: { sessionId } }));
}

function notifyStateChanged(sessionId, state) {
  window.dispatchEvent(new CustomEvent('video-player:state', { detail: { sessionId, state } }));
}

function ensureMpcLength(sessionId, mpcVideoId, currentTime, length) {
  if (length != null) return;
  if (getVideoProgress(sessionId)?.length != null) return;
  fetchMpcVideoDuration(mpcVideoId).then((fetchedLength) => {
    if (fetchedLength == null) return;
    const latest = getVideoProgress(sessionId);
    saveVideoProgress(sessionId, latest?.secondsWatched ?? currentTime, fetchedLength);
    notifyProgressChanged(sessionId);
  });
}

function watchMpcPlayback(sessionId, iframe) {
  let lastTickSecond = null;
  const handler = (event) => {
    if (event.origin !== ADOBE_TV_ORIGIN) return;
    if (event.data?.type !== MPC_MESSAGE_TYPE) return;
    const {
      state, id: mpcVideoId, currentTime, length,
    } = event.data;
    switch (state) {
      case MPC_STATE_LOAD:
        resumeMpcVideo(iframe, getVideoProgress(sessionId));
        ensureMpcLength(sessionId, mpcVideoId, currentTime, length);
        break;
      case MPC_STATE_PAUSE:
        saveVideoProgress(sessionId, currentTime, length);
        notifyProgressChanged(sessionId);
        notifyStateChanged(sessionId, 'pause');
        ensureMpcLength(sessionId, mpcVideoId, currentTime, length);
        break;
      case MPC_STATE_TICK: {
        const tickSecond = Math.floor(currentTime);
        if (tickSecond !== lastTickSecond && tickSecond % PROGRESS_TICK_SECONDS === 0) {
          lastTickSecond = tickSecond;
          saveVideoProgress(sessionId, currentTime, length);
          notifyProgressChanged(sessionId);
          ensureMpcLength(sessionId, mpcVideoId, currentTime, length);
        }
        notifyStateChanged(sessionId, 'play');
        break;
      }
      case MPC_STATE_COMPLETE: {
        const finalLength = length ?? getVideoProgress(sessionId)?.length ?? null;
        if (finalLength != null) {
          saveVideoProgress(sessionId, finalLength, finalLength);
          notifyProgressChanged(sessionId);
        }
        notifyStateChanged(sessionId, 'ended');
        break;
      }
      default:
        break;
    }
  };
  window.addEventListener('message', handler);
}

function ensureYouTubeIframeApi() {
  if (window.YT?.Player) return Promise.resolve();
  const hasScript = [...document.scripts].some((s) => s.src.includes('youtube.com/iframe_api'));
  if (!hasScript) {
    createTag('script', { src: 'https://www.youtube.com/iframe_api' }, '', { parent: document.head });
  }
  return new Promise((resolve) => {
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      resolve();
    };
  });
}

async function watchYouTubePlayback(sessionId, iframe) {
  await ensureYouTubeIframeApi();
  if (!iframe.id) return;
  let progressInterval = null;
  const stopProgressPolling = () => {
    if (progressInterval == null) return;
    clearInterval(progressInterval);
    progressInterval = null;
  };
  // eslint-disable-next-line no-new -- the player instance manages itself via the events
  // callbacks; nothing here needs to hold a reference to it afterward.
  new window.YT.Player(iframe.id, {
    events: {
      onReady: (event) => {
        const saved = getVideoProgress(sessionId);
        const duration = event.target?.getDuration?.();
        if (saved?.length && duration && saved.secondsWatched < duration - RESUME_RESTART_THRESHOLD_SECONDS) {
          event.target.seekTo(saved.secondsWatched, true);
        }
      },
      onStateChange: (event) => {
        if (event.data === window.YT.PlayerState.PLAYING) {
          stopProgressPolling();
          progressInterval = setInterval(() => {
            const currentTime = event.target?.getCurrentTime?.();
            const duration = event.target?.getDuration?.();
            if (currentTime != null && duration != null) {
              saveVideoProgress(sessionId, currentTime, duration);
              notifyProgressChanged(sessionId);
            }
          }, PROGRESS_TICK_SECONDS * 1000);
          notifyStateChanged(sessionId, 'play');
        } else if (event.data === window.YT.PlayerState.PAUSED) {
          stopProgressPolling();
          notifyStateChanged(sessionId, 'pause');
        } else if (event.data === window.YT.PlayerState.ENDED) {
          stopProgressPolling();
          const duration = event.target?.getDuration?.();
          if (duration) {
            saveVideoProgress(sessionId, duration, duration);
            notifyProgressChanged(sessionId);
          }
          notifyStateChanged(sessionId, 'ended');
        } else {
          stopProgressPolling();
        }
      },
    },
  });
}

function loadVideoPlayer(el, sessionId, video) {
  const built = buildMiloVideo(video);
  const iframe = built.firstElementChild;

  const existingMiloVideo = el.querySelector('.milo-video');
  if (existingMiloVideo) {
    existingMiloVideo.replaceChildren(iframe);
  } else {
    el.querySelector('.mobile-rider')?.remove();
    el.append(built);
  }

  if (video.provider === 'youtube') watchYouTubePlayback(sessionId, iframe);
  else watchMpcPlayback(sessionId, iframe);
}

const DECISION_FALLBACK_MS = 4000;

function isInsidePlaylistContainer(el) {
  const gridColumn = el.closest('.grid-column');
  const outerSection = gridColumn?.parentElement?.closest('.section') || el.closest('.section');
  return Boolean(outerSection?.querySelector('.video-playlist'));
}

function awaitEmbedDecision(el) {
  const existing = BlockMediator.get(VIDEO_LAYOUT_DECISION_KEY);
  if (existing != null) {
    return Promise.resolve(isInsidePlaylistContainer(el) ? existing.hasPlaylist : !existing.hasPlaylist);
  }
  return new Promise((resolve) => {
    let settled = false;
    const settle = (hasPlaylist) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      unsubscribe();
      resolve(isInsidePlaylistContainer(el) ? hasPlaylist : !hasPlaylist);
    };
    const unsubscribe = BlockMediator.subscribe(
      VIDEO_LAYOUT_DECISION_KEY,
      ({ newValue }) => settle(newValue.hasPlaylist),
    );
    const timer = setTimeout(() => settle(false), DECISION_FALLBACK_MS);
  });
}

export default async function init(el) {
  if (!document.getElementById('video-player-css')) {
    createTag('link', { rel: 'stylesheet', href: BLOCK_CSS_URL, id: 'video-player-css' }, '', { parent: document.head });
  }

  const cfg = [...el.querySelectorAll(':scope > div > div:first-child')].reduce((acc, div) => {
    const key = div.textContent.trim().toLowerCase().replace(/ /g, '-');
    acc[key] = div.nextElementSibling?.textContent?.trim() || '';
    return acc;
  }, {});
  console.log('[video-player] cfg', cfg);
  const sessionId = getMetadata('session-id') || cfg['session-id'];
  if (!sessionId) {
    window.lana?.log('[video-player] no session-id (page metadata or authored) — nothing to render');
    el.remove();
    return;
  }

  const sessionTimes = parseJsonMetadata('session-times');
  const currentVideo = pickEmbeddableVideo(sessionTimes);
  if (!currentVideo) {
    window.lana?.log('[video-player] no embeddable video in session-times — nothing to render');
    el.remove();
    return;
  }

  // No recording to show for a session that hasn't actually ended yet — checked
  // synchronously off the page's own session-times metadata, not any catalog fetch.
  if (!currentSessionHasEnded(sessionTimes, getNowMs())) {
    window.lana?.log('[video-player] current session has not ended yet — nothing to render');
    el.remove();
    return;
  }

  // Fired here, not inside loadVideoPlayer() — this runs on BOTH instances
  // (win-or-lose is still unknown at this point), well before the layout-decision wait
  // below, so the connection is warming during that wait instead of only starting once
  // the winner is confirmed and the iframe's src is actually set.
  preconnectVideoProvider(currentVideo.provider);

  // Owned by a shared module (video-layout-loader.js), not this instance's own el —
  // exactly one loader shows page-wide regardless of how many .video-player instances
  // are waiting on the same decision. Still only requested by the non-playlist-container
  // instance (the more likely winner — see awaitEmbedDecision's own comment) so it
  // appears where the video is actually more likely to land, not both places at once.
  if (!isInsidePlaylistContainer(el)) {
    showVideoLayoutLoader(el);
  }

  (async () => {
    const isWinner = await awaitEmbedDecision(el);
    hideVideoLayoutLoader();
    if (!isWinner) return;
    loadVideoPlayer(el, sessionId, currentVideo);
  })();
}
