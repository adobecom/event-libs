import { createTag, LIBS } from '../../../utils/utils.js';
import { getNowMs } from '../../../utils/session-state.js';
import BlockMediator from '../../../deps/block-mediator.min.js';
import { showVideoLayoutLoader, hideVideoLayoutLoader } from '../../utils/video-layout-loader.js';
import {
  VIDEO_LAYOUT_DECISION_KEY,
  PROGRESS_STORAGE_KEY,
  VIDEO_PLAYLIST_CONTAINER_CLASS,
  readJsonFromStorage,
  writeJsonToStorage,
  parseJsonMetadata as parseSharedJsonMetadata,
  currentSessionHasEnded,
  findOnDemandVideos,
  readAuthoredConfig,
  resolveSessionId,
  ensureStylesheet,
} from '../../utils/video-session.js';

const LOG_SCOPE = 'video-player';
const BLOCK_CSS_URL = new URL('./video-player.css', import.meta.url).href;
const MILO_IFRAME_CSS_URL = `${LIBS}/styles/iframe.css`;

function logError(message) {
  window.lana?.log(`[${LOG_SCOPE}] ${message}`);
}

const parseJsonMetadata = (name) => parseSharedJsonMetadata(name, LOG_SCOPE);

/**
 * Real adobetv.js/youtube.js autoblocks only ever run via Milo's own block loader, which
 * auto-attaches each block's own CSS as a side effect. buildMiloVideo below mirrors that
 * markup directly (bypassing the autoblock, since there's no authored link to decorate),
 * so nothing else triggers that load — without this a freshly built `.milo-video` has no
 * intrinsic size at all.
 */
function ensureMiloIframeCss() {
  ensureStylesheet('milo-iframe-css', MILO_IFRAME_CSS_URL);
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

const PROGRESS_TICK_SECONDS = 5;
const RESUME_RESTART_THRESHOLD_SECONDS = 30;

export function getVideoProgress(sessionId) {
  return readJsonFromStorage(PROGRESS_STORAGE_KEY, {}, LOG_SCOPE)[sessionId] || null;
}

/**
 * `completed` is derived fresh from THIS secondsWatched every time, never latched on — a
 * rewatch (e.g. after autoplay moves on and the viewer comes back) must be able to fall
 * back below 100%. `length` falls back to any previously saved value, since MPC's own
 * events don't reliably carry it.
 */
export function saveVideoProgress(sessionId, secondsWatched, length = null) {
  if (!sessionId) return;
  const progressBySession = readJsonFromStorage(PROGRESS_STORAGE_KEY, {}, LOG_SCOPE);
  const resolvedLength = length ?? progressBySession[sessionId]?.length ?? null;
  progressBySession[sessionId] = {
    secondsWatched,
    length: resolvedLength,
    completed: Boolean(resolvedLength && secondsWatched >= resolvedLength),
  };
  writeJsonToStorage(PROGRESS_STORAGE_KEY, progressBySession, LOG_SCOPE);
}

/**
 * The one on-demand recording this block will embed. An MPC template's own `videos[]`
 * order isn't reliable evidence of which entry that is (a real template has been seen
 * with a `youtube` `liveStream` entry ahead of the `mpc` `onDemand` one), so `kind` is
 * matched explicitly rather than trusting first-match order.
 */
function pickEmbeddableVideo(sessionTimes) {
  return findOnDemandVideos(sessionTimes)[0] || null;
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

/**
 * Resumes playback from a previously saved position. Skipped when that position is within
 * RESUME_RESTART_THRESHOLD_SECONDS of the end — resuming a session the viewer already
 * finished would just restart it a second before the credits.
 */
export function resumeMpcVideo(iframe, progress) {
  if (!progress?.length) return;
  if (progress.secondsWatched >= progress.length - RESUME_RESTART_THRESHOLD_SECONDS) return;
  try {
    iframe.contentWindow?.postMessage({
      type: MPC_ACTION_TYPE,
      action: 'play',
      currentTime: Math.floor(progress.secondsWatched),
    }, ADOBE_TV_ORIGIN);
  } catch (error) {
    // A cross-origin frame can throw on access if the player navigated away.
    logError(`could not resume mpc playback: ${error.message}`);
  }
}

/** ISO-8601 duration ("PT40M40S") → seconds. Returns 0 for anything unparseable. */
export function convertIsoDurationToSeconds(iso) {
  if (!iso || typeof iso !== 'string') return 0;
  const match = iso.match(/P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?/);
  if (!match) return 0;
  const [, , , , hours = '0', minutes = '0', seconds = '0'] = match;
  return (parseInt(hours, 10) * 3600) + (parseInt(minutes, 10) * 60) + parseInt(seconds, 10);
}

const mpcDurationByVideoId = new Map(); // mpcVideoId -> seconds
const inflightDurationRequests = new Map(); // mpcVideoId -> Promise<number|null>
const MPC_DURATION_TIMEOUT_MS = 8000;

/**
 * Fallback source for a video's length, queried once per MPC video id (cached, and
 * deduplicated while in flight) from MPC's own JSON-LD metadata endpoint.
 */
async function fetchMpcVideoDuration(mpcVideoId) {
  if (!mpcVideoId) return null;
  if (mpcDurationByVideoId.has(mpcVideoId)) return mpcDurationByVideoId.get(mpcVideoId);
  if (inflightDurationRequests.has(mpcVideoId)) return inflightDurationRequests.get(mpcVideoId);

  const request = (async () => {
    try {
      // Raw fetch has no timeout of its own — without this a hung request would keep its
      // in-flight entry (and this promise) alive for the life of the page.
      const response = await fetch(
        `${ADOBE_TV_ORIGIN}/v/${mpcVideoId}?format=json-ld`,
        { signal: AbortSignal.timeout(MPC_DURATION_TIMEOUT_MS) },
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      const seconds = convertIsoDurationToSeconds(payload?.jsonLinkedData?.duration || '') || null;
      if (seconds != null) mpcDurationByVideoId.set(mpcVideoId, seconds);
      return seconds;
    } catch (error) {
      logError(`could not fetch mpc video duration for "${mpcVideoId}": ${error.message}`);
      return null;
    } finally {
      inflightDurationRequests.delete(mpcVideoId);
    }
  })();

  inflightDurationRequests.set(mpcVideoId, request);
  return request;
}


function notifyProgressChanged(sessionId) {
  window.dispatchEvent(new CustomEvent('video-player:progress', { detail: { sessionId } }));
}

function notifyStateChanged(sessionId, state) {
  window.dispatchEvent(new CustomEvent('video-player:state', { detail: { sessionId, state } }));
}

/**
 * MPC's own messages don't reliably carry `length` (confirmed live: a real 'pause' event
 * had `currentTime` but no `length` at all), so it's backfilled once from MPC's metadata
 * endpoint when neither this message nor previously saved progress already has it.
 */
function ensureMpcLength(sessionId, mpcVideoId, currentTime, length) {
  if (length != null) return;
  if (getVideoProgress(sessionId)?.length != null) return;
  fetchMpcVideoDuration(mpcVideoId)
    .then((fetchedLength) => {
      if (fetchedLength == null) return;
      const latest = getVideoProgress(sessionId);
      saveVideoProgress(sessionId, latest?.secondsWatched ?? currentTime, fetchedLength);
      notifyProgressChanged(sessionId);
    })
    .catch((error) => logError(`could not backfill mpc duration: ${error.message}`));
}

/**
 * Runs `teardown` once the element leaves the document, so a player's own listeners and
 * timers don't outlive the DOM node that owns them. Needed because a losing instance's
 * `.video-player` is removed by video-playlist.js (see collapseAndRemove there) well
 * after this block already attached its playback watchers — and because Milo can
 * re-decorate an area, running init() again over a fresh element.
 */
function onDetached(element, teardown) {
  const observer = new MutationObserver(() => {
    if (element.isConnected) return;
    observer.disconnect();
    teardown();
  });
  observer.observe(document.body, { childList: true, subtree: true });
  return observer;
}

/**
 * MPC posts window messages from video.tv.adobe.com shaped as
 * `{ type: 'mpcStatus', state: 'load'|'pause'|'tick'|'complete', id, currentTime, length }`.
 * Progress is always keyed on the CLOSURE's `sessionId`, never `data.id` — this page only
 * ever embeds its own session's video, so which session is playing is unambiguous.
 */
function watchMpcPlayback(sessionId, iframe) {
  // Throttles the ~per-frame tick stream down to one save per PROGRESS_TICK_SECONDS.
  let lastSavedTickSecond = null;

  const saveTickProgress = ({ mpcVideoId, currentTime, length }) => {
    const tickSecond = Math.floor(currentTime);
    const isNewSecond = tickSecond !== lastSavedTickSecond;
    if (!isNewSecond || tickSecond % PROGRESS_TICK_SECONDS !== 0) return;
    lastSavedTickSecond = tickSecond;
    saveVideoProgress(sessionId, currentTime, length);
    notifyProgressChanged(sessionId);
    ensureMpcLength(sessionId, mpcVideoId, currentTime, length);
  };

  const handleComplete = ({ length }) => {
    // Real completion events carry `length`; a bare `state: 'complete'` must not clobber
    // saved progress with an undefined secondsWatched, so only persist a known length.
    const finalLength = length ?? getVideoProgress(sessionId)?.length ?? null;
    if (finalLength != null) {
      saveVideoProgress(sessionId, finalLength, finalLength);
      notifyProgressChanged(sessionId);
    }
    notifyStateChanged(sessionId, 'ended');
  };

  const handlers = {
    [MPC_STATE_LOAD]: (payload) => {
      resumeMpcVideo(iframe, getVideoProgress(sessionId));
      ensureMpcLength(sessionId, payload.mpcVideoId, payload.currentTime, payload.length);
    },
    [MPC_STATE_PAUSE]: (payload) => {
      saveVideoProgress(sessionId, payload.currentTime, payload.length);
      notifyProgressChanged(sessionId);
      notifyStateChanged(sessionId, 'pause');
      ensureMpcLength(sessionId, payload.mpcVideoId, payload.currentTime, payload.length);
    },
    [MPC_STATE_TICK]: (payload) => {
      saveTickProgress(payload);
      // A tick only ever arrives while actually playing. Fired on every message (not
      // throttled like the save above) since 'play' is a discrete transition a listener
      // needs promptly, not a value to sample.
      notifyStateChanged(sessionId, 'play');
    },
    [MPC_STATE_COMPLETE]: handleComplete,
  };

  const handleMessage = (event) => {
    if (event.origin !== ADOBE_TV_ORIGIN) return;
    if (event.data?.type !== MPC_MESSAGE_TYPE) return;

    const handler = handlers[event.data.state];
    if (!handler) return;

    try {
      handler({
        mpcVideoId: event.data.id,
        currentTime: event.data.currentTime,
        length: event.data.length,
      });
    } catch (error) {
      // A malformed message must not take down the listener for every later one.
      logError(`could not handle mpc "${event.data.state}" message: ${error.message}`);
    }
  };

  window.addEventListener('message', handleMessage);
  onDetached(iframe, () => window.removeEventListener('message', handleMessage));
}

const YOUTUBE_IFRAME_API_URL = 'https://www.youtube.com/iframe_api';
const YOUTUBE_API_TIMEOUT_MS = 10000;

/**
 * One shared load promise for the whole page. Two concurrent callers previously each
 * overwrote `window.onYouTubeIframeAPIReady` while capturing a different `previous`, so
 * the last write won and the earlier caller's promise never resolved. Caching the promise
 * means the global is installed exactly once, no matter how many players wait on it.
 */
let youTubeApiReady = null;

function ensureYouTubeIframeApi() {
  if (window.YT?.Player) return Promise.resolve();
  if (youTubeApiReady) return youTubeApiReady;

  youTubeApiReady = new Promise((resolve, reject) => {
    const previousHandler = window.onYouTubeIframeAPIReady;
    const timeoutId = setTimeout(() => {
      // Never resolving would leave watchYouTubePlayback awaiting forever, silently
      // dropping all playback tracking for this session.
      youTubeApiReady = null;
      reject(new Error(`YouTube IFrame API did not load within ${YOUTUBE_API_TIMEOUT_MS}ms`));
    }, YOUTUBE_API_TIMEOUT_MS);

    window.onYouTubeIframeAPIReady = () => {
      clearTimeout(timeoutId);
      previousHandler?.();
      resolve();
    };

    const alreadyRequested = [...document.scripts]
      .some((script) => script.src.includes('youtube.com/iframe_api'));
    if (!alreadyRequested) {
      const script = createTag('script', { src: YOUTUBE_IFRAME_API_URL }, '', { parent: document.head });
      script.addEventListener('error', () => {
        clearTimeout(timeoutId);
        youTubeApiReady = null;
        reject(new Error('YouTube IFrame API script failed to load'));
      }, { once: true });
    }
  });

  return youTubeApiReady;
}

/** Seeks to the last-watched position, unless the viewer already finished the video. */
function resumeYouTubeVideo(player, sessionId) {
  const saved = getVideoProgress(sessionId);
  const duration = player?.getDuration?.();
  if (!saved?.length || !duration) return;
  if (saved.secondsWatched >= duration - RESUME_RESTART_THRESHOLD_SECONDS) return;
  try {
    player.seekTo(saved.secondsWatched, true);
  } catch (error) {
    logError(`could not resume youtube playback: ${error.message}`);
  }
}

async function watchYouTubePlayback(sessionId, iframe) {
  try {
    await ensureYouTubeIframeApi();
  } catch (error) {
    // Playback still works — the embed is a plain iframe — only progress tracking and
    // resume are lost, so this degrades rather than breaking the player.
    logError(`youtube playback tracking unavailable: ${error.message}`);
    return;
  }
  // Set only when a real 11-char video id was extracted; without it YT.Player has no
  // element to bind to.
  if (!iframe.id) return;

  let progressIntervalId = null;
  const stopProgressPolling = () => {
    if (progressIntervalId == null) return;
    clearInterval(progressIntervalId);
    progressIntervalId = null;
  };

  const saveCurrentProgress = (player) => {
    const currentTime = player?.getCurrentTime?.();
    const duration = player?.getDuration?.();
    if (currentTime == null || duration == null) return;
    saveVideoProgress(sessionId, currentTime, duration);
    notifyProgressChanged(sessionId);
  };

  // Without this, a player removed mid-playback (exactly what happens to the losing
  // instance — see video-playlist.js's collapseAndRemove) keeps its interval alive
  // forever, polling a detached player and writing progress for a video nobody is
  // watching.
  onDetached(iframe, stopProgressPolling);

  const handleStateChange = (event) => {
    const { PlayerState } = window.YT;
    // Every branch stops polling first: PLAYING restarts it, the rest leave it stopped.
    stopProgressPolling();

    if (event.data === PlayerState.PLAYING) {
      // The IFrame API has no continuous "tick" event (unlike MPC's postMessage stream),
      // so progress is sampled on the same cadence the MPC path uses.
      progressIntervalId = setInterval(
        () => saveCurrentProgress(event.target),
        PROGRESS_TICK_SECONDS * 1000,
      );
      notifyStateChanged(sessionId, 'play');
      return;
    }
    if (event.data === PlayerState.PAUSED) {
      notifyStateChanged(sessionId, 'pause');
      return;
    }
    if (event.data === PlayerState.ENDED) {
      const duration = event.target?.getDuration?.();
      if (duration) {
        saveVideoProgress(sessionId, duration, duration);
        notifyProgressChanged(sessionId);
      }
      notifyStateChanged(sessionId, 'ended');
    }
  };

  try {
    // eslint-disable-next-line no-new -- the player instance manages itself via the
    // events callbacks; nothing here needs to hold a reference to it afterward.
    new window.YT.Player(iframe.id, {
      events: {
        onReady: (event) => resumeYouTubeVideo(event.target, sessionId),
        onStateChange: handleStateChange,
        onError: (event) => logError(`youtube player reported error code ${event.data}`),
      },
    });
  } catch (error) {
    stopProgressPolling();
    logError(`could not attach youtube player: ${error.message}`);
  }
}

/**
 * Embeds the video into this block and starts provider-appropriate playback tracking
 * (MPC and YouTube expose completely different state signals).
 */
function loadVideoPlayer(el, sessionId, video) {
  const builtContainer = buildMiloVideo(video);
  const iframe = builtContainer.firstElementChild;

  // Real pages have been seen with an authored `.milo-video`, with only a
  // `.mobile-rider` (which can't host either embed as-is), or with nothing at all.
  const authoredMiloVideo = el.querySelector('.milo-video');
  if (authoredMiloVideo) {
    authoredMiloVideo.replaceChildren(iframe);
  } else {
    el.querySelector('.mobile-rider')?.remove();
    el.append(builtContainer);
  }

  if (video.provider === 'youtube') watchYouTubePlayback(sessionId, iframe);
  else watchMpcPlayback(sessionId, iframe);

  // Marks this instance as having actually committed and embedded a real video — read
  // by video-playlist.js's own announceVideoDecision() so a LATE-arriving decision
  // (e.g. the session catalog fetch that decision depends on responding after this
  // instance's own DECISION_FALLBACK_MS timeout already resolved it as the winner)
  // never tears out an already-playing video with nothing to replace it. Set only here
  // — after the embed has actually started — not any earlier "decided to try" point.
  el.dataset.embedded = 'true';
}

const DECISION_FALLBACK_MS = 4000;

/**
 * Which of the two authored layouts this instance sits in, per the author-applied marker
 * class on its containing section (see the README's Authoring section) rather than any
 * inferred DOM structure — a prior `.grid-column`/`.closest('.section')` walk broke
 * outright once the two columns turned out to be separate `.fragment > .section` trees.
 */
function isInsidePlaylistContainer(el) {
  return Boolean(el.closest(`.${VIDEO_PLAYLIST_CONTAINER_CLASS}`));
}

/** Whether THIS instance embeds, given the page-wide decision. */
function isWinningInstance(el, hasPlaylist) {
  return isInsidePlaylistContainer(el) ? hasPlaylist : !hasPlaylist;
}

/**
 * Resolves once the page-wide layout decision is known. Reads any decision already made
 * (covering the race where video-playlist.js announced before this block's own init ran),
 * otherwise subscribes and races a fallback timer so a page with no video-playlist block
 * at all — or a stalled session-catalog fetch — still resolves instead of waiting forever.
 */
function awaitEmbedDecision(el) {
  const existingDecision = BlockMediator.get(VIDEO_LAYOUT_DECISION_KEY);
  if (existingDecision != null) {
    return Promise.resolve(isWinningInstance(el, existingDecision.hasPlaylist));
  }

  return new Promise((resolve) => {
    let settled = false;
    let unsubscribe = () => {};

    const settle = (hasPlaylist) => {
      if (settled) return;
      settled = true;
      clearTimeout(fallbackTimer);
      unsubscribe();
      resolve(isWinningInstance(el, hasPlaylist));
    };

    unsubscribe = BlockMediator.subscribe(VIDEO_LAYOUT_DECISION_KEY, ({ newValue }) => {
      // Guarded: a store cleared to undefined would otherwise throw inside this
      // subscriber, and BlockMediator.set rethrows whatever its subscribers throw.
      if (newValue == null) return;
      settle(Boolean(newValue.hasPlaylist));
    });

    const fallbackTimer = setTimeout(() => settle(false), DECISION_FALLBACK_MS);
  });
}

/**
 * Everything this block needs from the page, or null when any gate fails. Kept separate
 * from init()'s own side effects so the "should we render at all" decision reads as one
 * sequence of named checks.
 */
function resolveRenderContext(el) {
  const config = readAuthoredConfig(el);

  const sessionId = resolveSessionId(config);
  if (!sessionId) {
    logError('no session-id (page metadata or authored) — nothing to render');
    return null;
  }

  const sessionTimes = parseJsonMetadata('session-times');

  const currentVideo = pickEmbeddableVideo(sessionTimes);
  if (!currentVideo) {
    logError('no embeddable video in session-times — nothing to render');
    return null;
  }

  // No recording to show for a session that hasn't actually ended yet — checked
  // synchronously off the page's own session-times metadata, not any catalog fetch.
  if (!currentSessionHasEnded(sessionTimes, getNowMs())) {
    logError('current session has not ended yet — nothing to render');
    return null;
  }

  return { sessionId, currentVideo };
}

export default async function init(el) {
  ensureStylesheet('video-player-css', BLOCK_CSS_URL);

  const context = resolveRenderContext(el);
  if (!context) {
    el.remove();
    return;
  }
  const { sessionId, currentVideo } = context;

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

  // Deliberately NOT awaited: Milo's loadArea() decorates sections sequentially, so
  // awaiting this would stall every later section (and page-wide deferred features) for
  // however long the decision takes — up to DECISION_FALLBACK_MS. init() returns as soon
  // as the loader is up; the embed continues in this detached flow.
  (async () => {
    try {
      const isWinner = await awaitEmbedDecision(el);
      hideVideoLayoutLoader();
      if (!isWinner) return;
      loadVideoPlayer(el, sessionId, currentVideo);
    } catch (error) {
      // Nothing above is expected to reject, but an unhandled rejection here would be
      // invisible — the video area would just stay on its loader forever.
      hideVideoLayoutLoader();
      logError(`could not resolve the video layout decision: ${error.message}`);
    }
  })();
}
