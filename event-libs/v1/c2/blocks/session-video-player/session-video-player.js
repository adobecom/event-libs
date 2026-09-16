import { createTag, LIBS } from '../../../utils/utils.js';
import { getEventStartMs, initTierOneEventConfig } from '../../../utils/tier-1-event-config.js';
import BlockMediator from '../../../deps/block-mediator.min.js';
import {
  VIDEO_LAYOUT_DECISION_KEY,
  VIDEO_PLAYABLE_KEY,
  VIDEO_PLAYLIST_CONTAINER_CLASS,
  closestSectionWithStyle,
  getVideoProgress as readVideoProgress,
  saveVideoProgress as saveSharedVideoProgress,
  onElementDetached,
  parseJsonMetadata as parseSharedJsonMetadata,
  findEmbeddableVideos,
  readAuthoredConfig,
  resolveSessionId,
  ensureStylesheet,
  watchPlaybackPhase,
  PLAYBACK_PHASE,
  buildSessionFromMetadata,
} from '../../utils/video-session.js';

const LOG_SCOPE = 'session-video-player';
const BLOCK_CSS_URL = new URL('./session-video-player.css', import.meta.url).href;
const MILO_IFRAME_CSS_URL = `${LIBS}/styles/iframe.css`;

function logError(message) {
  window.lana?.log(`[${LOG_SCOPE}] ${message}`);
}

const parseJsonMetadata = (name) => parseSharedJsonMetadata(name, LOG_SCOPE);

function ensureMiloIframeCss() {
  ensureStylesheet('milo-iframe-css', MILO_IFRAME_CSS_URL);
}

const VIDEO_PROVIDER_ORIGINS = {
  mpc: ['https://video.tv.adobe.com'],

  youtube: ['https://www.youtube.com', 'https://i.ytimg.com', 'https://www.google.com'],

  mobilerider: ['https://assets.mobilerider.com'],
};

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

export const getVideoProgress = (sessionId) => readVideoProgress(sessionId, LOG_SCOPE);

export const saveVideoProgress = (sessionId, secondsWatched, length = null) => saveSharedVideoProgress(sessionId, secondsWatched, length, LOG_SCOPE);

function pickEmbeddableVideo(sessionTimes) {
  return findEmbeddableVideos(sessionTimes).find((video) => video.kind === 'onDemand') || null;
}

function buildVideoFromCatalog(session) {
  if (session?.mpcId) {
    return { provider: 'mpc', url: `${ADOBE_TV_ORIGIN}/v/${session.mpcId}?autoplay=true` };
  }
  if (session?.youTubeId) {
    return { provider: 'youtube', url: session.youTubeId };
  }
  return null;
}

const ADOBE_TV_ORIGIN = 'https://video.tv.adobe.com';
const MPC_MESSAGE_TYPE = 'mpcStatus';
const MPC_ACTION_TYPE = 'mpcAction';
const MPC_STATE_LOAD = 'load';
const MPC_STATE_PAUSE = 'pause';
const MPC_STATE_TICK = 'tick';
const MPC_STATE_COMPLETE = 'complete';

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
      id: youtubeId ? `session-video-player-yt-${youtubeId}` : '',
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
  if (!progress?.length) return;
  if (progress.secondsWatched >= progress.length - RESUME_RESTART_THRESHOLD_SECONDS) return;
  try {
    iframe.contentWindow?.postMessage({
      type: MPC_ACTION_TYPE,
      action: 'play',
      currentTime: Math.floor(progress.secondsWatched),
    }, ADOBE_TV_ORIGIN);
  } catch (error) {

    logError(`could not resume mpc playback: ${error.message}`);
  }
}

export function convertIsoDurationToSeconds(iso) {
  if (!iso || typeof iso !== 'string') return 0;
  const match = iso.match(/P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?/);
  if (!match) return 0;
  const [, , , , hours = '0', minutes = '0', seconds = '0'] = match;
  return (parseInt(hours, 10) * 3600) + (parseInt(minutes, 10) * 60) + parseInt(seconds, 10);
}

const mpcDurationByVideoId = new Map();
const inflightDurationRequests = new Map();
const MPC_DURATION_TIMEOUT_MS = 8000;

async function fetchMpcVideoDuration(mpcVideoId) {
  if (!mpcVideoId) return null;
  if (mpcDurationByVideoId.has(mpcVideoId)) return mpcDurationByVideoId.get(mpcVideoId);
  if (inflightDurationRequests.has(mpcVideoId)) return inflightDurationRequests.get(mpcVideoId);

  const request = (async () => {
    try {

      const response = await fetch(
        `${ADOBE_TV_ORIGIN}/v/${mpcVideoId}?format=json-ld`,
        { signal: AbortSignal.timeout(MPC_DURATION_TIMEOUT_MS) },
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      const seconds = convertIsoDurationToSeconds(payload?.jsonLinkedData?.duration || '') || null;
      mpcDurationByVideoId.set(mpcVideoId, seconds);
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
  window.dispatchEvent(new CustomEvent('session-video-player:progress', { detail: { sessionId } }));
}

function notifyStateChanged(sessionId, state) {
  window.dispatchEvent(new CustomEvent('session-video-player:state', { detail: { sessionId, state } }));
}

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

function watchMpcPlayback(sessionId, iframe) {

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

      logError(`could not handle mpc "${event.data.state}" message: ${error.message}`);
    }
  };

  window.addEventListener('message', handleMessage);
  onElementDetached(iframe, () => window.removeEventListener('message', handleMessage));
}

const YOUTUBE_IFRAME_API_URL = 'https://www.youtube.com/iframe_api';
const YOUTUBE_API_TIMEOUT_MS = 10000;

let youTubeApiReady = null;

function ensureYouTubeIframeApi() {
  if (window.YT?.Player) return Promise.resolve();
  if (youTubeApiReady) return youTubeApiReady;

  youTubeApiReady = new Promise((resolve, reject) => {
    const previousHandler = window.onYouTubeIframeAPIReady;
    const timeoutId = setTimeout(() => {

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

    logError(`youtube playback tracking unavailable: ${error.message}`);
    return;
  }

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

  onElementDetached(iframe, stopProgressPolling);

  const handleStateChange = (event) => {
    const { PlayerState } = window.YT;

    stopProgressPolling();

    if (event.data === PlayerState.PLAYING) {

      progressIntervalId = setInterval(
        () => saveCurrentProgress(event.target),
        PROGRESS_TICK_SECONDS * 1000,
      );
      notifyStateChanged(sessionId, 'play');
      return;
    }
    if (event.data === PlayerState.PAUSED) {
      saveCurrentProgress(event.target);
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
    // eslint-disable-next-line no-new -- the YT.Player manages itself via its event callbacks

    new window.YT.Player(iframe.id, {
      events: {
        onReady: (event) => {
          resumeYouTubeVideo(event.target, sessionId);
          const duration = event.target?.getDuration?.();
          if (duration) {
            saveVideoProgress(sessionId, getVideoProgress(sessionId)?.secondsWatched ?? 0, duration);
            notifyProgressChanged(sessionId);
          }
        },
        onStateChange: handleStateChange,
        onError: (event) => logError(`youtube player reported error code ${event.data}`),
      },
    });
  } catch (error) {
    stopProgressPolling();
    logError(`could not attach youtube player: ${error.message}`);
  }
}

async function loadMobileRiderPlayer(el, video) {
  const { default: initMobileRider } = await import('../mobile-rider/mobile-rider.js');
  el.querySelector('.milo-video')?.remove();
  const rider = createTag('div', { class: 'mobile-rider' }, '', { parent: el });
  rider.dataset.extractedVideoId = video.videoId;
  if (video.skinId) rider.dataset.extractedSkinId = video.skinId;
  rider.dataset.extractedAutoplay = 'true';
  initMobileRider(rider);
  el.dataset.embedded = 'true';
}

function loadVideoPlayer(el, sessionId, video) {
  if (video.provider === 'mobilerider') {
    loadMobileRiderPlayer(el, video).catch((error) => {
      logError(`could not load MobileRider DVR player: ${error.message}`);
    });
    return;
  }

  const builtContainer = buildMiloVideo(video);
  const iframe = builtContainer.firstElementChild;

  // A prior phase may have mounted the MobileRider DVR player; always clear it before mounting the
  // iframe so a DVR_BUFFER → ON_DEMAND swap replaces the old player rather than stacking beside it.
  el.querySelector('.mobile-rider')?.remove();

  const authoredMiloVideo = el.querySelector('.milo-video');
  if (authoredMiloVideo) {
    authoredMiloVideo.replaceChildren(iframe);
  } else {
    el.append(builtContainer);
  }

  if (video.provider === 'youtube') watchYouTubePlayback(sessionId, iframe);
  else watchMpcPlayback(sessionId, iframe);

  el.dataset.embedded = 'true';
}

function isInsidePlaylistContainer(el) {

  return Boolean(closestSectionWithStyle(el, VIDEO_PLAYLIST_CONTAINER_CLASS));
}

function isWinningInstance(el, hasPlaylist) {
  return isInsidePlaylistContainer(el) ? hasPlaylist : !hasPlaylist;
}

function awaitEmbedDecision(el) {
  const existingDecision = BlockMediator.get(VIDEO_LAYOUT_DECISION_KEY);
  if (existingDecision != null) {
    return Promise.resolve(isWinningInstance(el, existingDecision.hasPlaylist));
  }

  return new Promise((resolve) => {
    const unsubscribe = BlockMediator.subscribe(VIDEO_LAYOUT_DECISION_KEY, ({ newValue }) => {
      if (newValue == null) return;
      unsubscribe();
      resolve(isWinningInstance(el, Boolean(newValue.hasPlaylist)));
    });
  });
}

function resolveVideoForPhase(phase, sessionTimes, session) {
  if (phase === PLAYBACK_PHASE.ON_DEMAND) {
    return pickEmbeddableVideo(sessionTimes) || buildVideoFromCatalog(session);
  }
  if (phase === PLAYBACK_PHASE.DVR_BUFFER) {
    if (!session?.mrDvrVideoId) return null;
    return { provider: 'mobilerider', videoId: session.mrDvrVideoId, skinId: session.mrSkinId };
  }
  return null;
}

const PLAYABLE_PHASES = [PLAYBACK_PHASE.DVR_BUFFER, PLAYBACK_PHASE.ON_DEMAND];

function buildRenderModel(el) {
  const config = readAuthoredConfig(el);
  const sessionId = resolveSessionId(config);
  if (!sessionId) {
    logError('no session-id (page metadata or authored) — nothing to render');
    return null;
  }

  const sessionTimes = parseJsonMetadata('session-times');
  const session = buildSessionFromMetadata(sessionTimes);

  initTierOneEventConfig();

  return { sessionId, sessionTimes, session };
}

function loadWhenDecided(el, sessionId, video) {
  preconnectVideoProvider(video.provider);

  (async () => {
    try {
      const isWinner = await awaitEmbedDecision(el);
      if (!isWinner) return;
      loadVideoPlayer(el, sessionId, video);
    } catch (error) {
      logError(`could not resolve the video layout decision: ${error.message}`);
    }
  })();
}

export default async function init(el) {
  ensureStylesheet('session-video-player-css', BLOCK_CSS_URL);

  const model = buildRenderModel(el);
  if (!model) {
    el.remove();
    return;
  }
  const { sessionId, session, sessionTimes } = model;

  let embeddedPhase = null;

  const onPhase = (phase) => {
    if (!el.isConnected) return;
    const video = PLAYABLE_PHASES.includes(phase)
      ? resolveVideoForPhase(phase, sessionTimes, session)
      : null;

    if (video && phase === embeddedPhase) {
      return;
    }

    if (video) {
      const isFirstEmbed = embeddedPhase === null;
      embeddedPhase = phase;
      if (isFirstEmbed) {
        // eslint-disable-next-line no-console
        console.log('[svp-debug] player emitting playable', { sessionId, phase });
        BlockMediator.set(VIDEO_PLAYABLE_KEY, { sessionId });
        window.dispatchEvent(new CustomEvent('session-video-player:playable', { detail: { sessionId } }));
        loadWhenDecided(el, sessionId, video);
      } else if (isWinningInstance(el, BlockMediator.get(VIDEO_LAYOUT_DECISION_KEY)?.hasPlaylist)) {
        preconnectVideoProvider(video.provider);
        loadVideoPlayer(el, sessionId, video);
      }
      return;
    }

    if (embeddedPhase === null && PLAYABLE_PHASES.includes(phase)) {
      logError(`session is in "${phase}" phase with no embeddable video — removing`);
      el.remove();
    }
  };

  const stopWatching = watchPlaybackPhase(session, onPhase, { eventStartMs: getEventStartMs() });
  onElementDetached(el, stopWatching);
}

