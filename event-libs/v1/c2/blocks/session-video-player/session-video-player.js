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

  // The DVR/replay player fetches its skin CSS + player.min.js from this separate origin, so
  // warm the DNS/TLS handshake before loadMobileRiderPlayer() mounts the embed.
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

// Strictly onDemand-only: session-times can also carry a `liveStream` (youtube) and a `dvr`
// (mobilerider) entry, and those must NEVER be picked as the on-demand VOD (the liveStream is the
// live broadcast video; DVR is the replay buffer). Only the `kind: 'onDemand'` mpc/youtube entry is
// the durable VOD. Mirrors the eyebrow's hasPlayableVideo() check in session-state-view.js.
function pickEmbeddableVideo(sessionTimes) {
  return findEmbeddableVideos(sessionTimes).find((video) => video.kind === 'onDemand') || null;
}

// session-times page metadata only ever carries a ready-to-embed onDemand-kind entry (see
// README) — it has no representation of a simulive-playing or DVR-buffer video at all. For
// those phases (and as a fallback when session-times has nothing for the on-demand phase
// either), build the same shape directly from the catalog session's raw ids — the same
// pattern session-broadcast's MpcPlayerAdapter/YouTubePlayerAdapter already use.
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

// DVR-buffer plays the dedicated MobileRider DVR/replay asset via the standalone mobile-rider
// block's own init — reused wholesale (script loading, mobilerider.embed()) rather than
// reimplementing that SDK integration here. `dataset.extractedVideoId` is the same seam
// handleAnchorElement() uses to convert an authored link into a MobileRider embed; feeding
// it directly skips the anchor/URL round-trip since we already have the raw video id.
async function loadMobileRiderPlayer(el, video) {
  const { default: initMobileRider } = await import('../mobile-rider/mobile-rider.js');
  el.querySelector('.milo-video')?.remove();
  const rider = createTag('div', { class: 'mobile-rider' }, '', { parent: el });
  rider.dataset.extractedVideoId = video.videoId;
  // Without a skin id, mobilerider.embed() mounts the player but never actually starts
  // playback — this is the session's own authored skin (Kat's real sample: "adobe"), not a
  // hardcoded default.
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

  const authoredMiloVideo = el.querySelector('.milo-video');
  if (authoredMiloVideo) {
    authoredMiloVideo.replaceChildren(iframe);
  } else {
    el.querySelector('.mobile-rider')?.remove();
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

// The playlist block is present on every session page and always resolves to a terminal
// decision (renders rows → announces hasPlaylist:true, or removes itself → false). So the player
// simply WAITS for that announcement — there is no timed fallback that could guess "no playlist"
// before the playlist has decided (which previously stranded the playlist behind a full-width
// player when both blocks resolved on their own timers).
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

// session-times' onDemand-only entry is preferred when present (it may carry provider query
// params/tokens baked in server-side that a client-built URL can't replicate); everything
// else — simulive, dvr-buffer, and on-demand once session-times has nothing — is built
// directly from the catalog session's own ids.
function resolveVideoForPhase(phase, sessionTimes, session) {
  if (phase === PLAYBACK_PHASE.ON_DEMAND) {
    return pickEmbeddableVideo(sessionTimes) || buildVideoFromCatalog(session);
  }
  // DVR_BUFFER plays the dedicated MobileRider DVR/replay asset — a distinct mechanism from
  // buildMiloVideo's iframe embeds (mobilerider.embed(), not a src URL), handled by
  // loadMobileRiderPlayer() instead.
  if (phase === PLAYBACK_PHASE.DVR_BUFFER) {
    if (!session?.mrDvrVideoId) return null;
    return { provider: 'mobilerider', videoId: session.mrDvrVideoId, skinId: session.mrSkinId };
  }
  return null;
}

// pre-event, watch-live AND simulive are deliberately not this block's job — session-broadcast/
// mobile-rider own the live-watching experience, and a simulive "premiere" is watched on the
// Broadcast page (the eyebrow's "Watch now" CTA), not inline here. This block only renders the
// durable on-demand VOD (ON_DEMAND) or the DVR/replay buffer (DVR_BUFFER); a simulive session plays
// here only once it flips to ON_DEMAND after its premiere ends.
const PLAYABLE_PHASES = [PLAYBACK_PHASE.DVR_BUFFER, PLAYBACK_PHASE.ON_DEMAND];

// Reads page metadata once (no catalog fetch). Returns null only for the genuine never-render
// case (no session-id); otherwise the caller re-evaluates the phase on a timer, so pre-event is
// a valid, non-terminal result rather than a reason to remove the block.
function buildRenderModel(el) {
  const config = readAuthoredConfig(el);
  const sessionId = resolveSessionId(config);
  if (!sessionId) {
    logError('no session-id (page metadata or authored) — nothing to render');
    return null;
  }

  // Metadata-only — `custom-attributes`/`session-times` are already authored on this page (same
  // source session-video-playlist.js reads), so this block never waits on the async catalog.
  const sessionTimes = parseJsonMetadata('session-times');
  const session = buildSessionFromMetadata(sessionTimes);

  // Idempotent; other blocks call this defensively too, in case decorateEvent hasn't run it yet
  // — otherwise getEventStartMs() silently returns null and IPOD/live DVR gates never open.
  initTierOneEventConfig();

  return { sessionId, sessionTimes, session };
}

// The current tail of init() — preconnect, layout-decision wait, embed — kept as a one-shot so
// the evaluate loop can call it exactly once at the transition to a playable phase. No loader is
// shown at any point: nothing appears until the player is actually ready to embed.
function loadWhenDecided(el, sessionId, video) {
  preconnectVideoProvider(video.provider);
  // TEMP DEBUG
  console.log('[svp-debug] loadWhenDecided → awaiting layout decision', {
    insidePlaylistContainer: isInsidePlaylistContainer(el),
    existingDecision: BlockMediator.get(VIDEO_LAYOUT_DECISION_KEY),
    video,
  });

  (async () => {
    try {
      const isWinner = await awaitEmbedDecision(el);
      // TEMP DEBUG
      console.log('[svp-debug] layout decision RESOLVED', {
        isWinner,
        insidePlaylistContainer: isInsidePlaylistContainer(el),
        decision: BlockMediator.get(VIDEO_LAYOUT_DECISION_KEY),
      });
      if (!isWinner) return;
      loadVideoPlayer(el, sessionId, video);
      // TEMP DEBUG
      console.log('[svp-debug] loadVideoPlayer CALLED → embedded', { provider: video.provider, embedded: el.dataset.embedded });
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

  // The phase we last embedded a video for (null = nothing embedded yet). Tracked instead of a
  // one-way boolean so a session that moves BETWEEN playable phases re-embeds the right asset —
  // most importantly DVR_BUFFER → ON_DEMAND, where the transient MobileRider DVR/replay asset must
  // be swapped for the durable MPC/YouTube VOD once the DVR window elapses (or the poll drops the
  // stream).
  let embeddedPhase = null;

  // Reacts to a resolved playback phase (delivered by watchPlaybackPhase, which owns both the clock
  // boundary timer and the MobileRider poll — so this block no longer runs its own triggers).
  const onPhase = (phase) => {
    if (!el.isConnected) return;
    const video = PLAYABLE_PHASES.includes(phase)
      ? resolveVideoForPhase(phase, sessionTimes, session)
      : null;
    // TEMP DEBUG
    console.log('[svp-debug] onPhase() from watcher', {
      phase,
      embeddedPhase,
      phaseChanged: phase !== embeddedPhase,
      video,
      insidePlaylistContainer: isInsidePlaylistContainer(el),
      session: {
        mrStreamId: session.mrStreamId,
        mrDvrVideoId: session.mrDvrVideoId,
        mrSkinId: session.mrSkinId,
        mpcId: session.mpcId,
        youTubeId: session.youTubeId,
        dvrDelayHours: session.dvrDelayHours,
      },
    });

    // Already showing the right asset for this phase — nothing to do.
    if (video && phase === embeddedPhase) {
      // TEMP DEBUG
      console.log('[svp-debug] phase unchanged → keep current asset (no-op)', { phase });
      return;
    }

    if (video) {
      const isFirstEmbed = embeddedPhase === null;
      embeddedPhase = phase;
      // On the first embed, announce playable so the playlist renders alongside us on the same tick
      // (before the layout-decision wait the player is about to enter). On a later phase swap the
      // layout is already settled, so just re-embed the new asset in place.
      if (isFirstEmbed) {
        // TEMP DEBUG
        console.log('[svp-debug] FIRST EMBED → firing playable + loadWhenDecided', { phase, video });
        // Both a durable BlockMediator value AND the window event: the value covers a consumer
        // (e.g. the playlist) that inits AFTER this fires and would miss the one-shot event; the
        // event covers one that's already listening.
        BlockMediator.set(VIDEO_PLAYABLE_KEY, { sessionId });
        window.dispatchEvent(new CustomEvent('session-video-player:playable', { detail: { sessionId } }));
        loadWhenDecided(el, sessionId, video);
      } else if (isWinningInstance(el, BlockMediator.get(VIDEO_LAYOUT_DECISION_KEY)?.hasPlaylist)) {
        // TEMP DEBUG
        console.log('[svp-debug] PHASE SWAP → re-embedding new asset in place', { newPhase: phase, video });
        preconnectVideoProvider(video.provider);
        loadVideoPlayer(el, sessionId, video);
      } else {
        // TEMP DEBUG
        console.log('[svp-debug] PHASE SWAP but this instance is NOT the winner → skipping', { phase });
      }
      return;
    }

    // A playable phase that yields no embeddable asset is terminal — nothing will ever appear
    // (e.g. on-demand with no mpc/youtube id and no session-times video; or DVR-buffer with no
    // mrDvrVideoId). Remove the block, as before. Non-playable phases (pre-event / watch-live) are
    // NOT terminal: the block stays (empty) to receive the next phase from the watcher when the
    // session flips to a playable phase. Only remove if nothing has embedded yet — once a video is
    // showing we keep it rather than tearing the player out on a transient no-asset phase.
    if (embeddedPhase === null && PLAYABLE_PHASES.includes(phase)) {
      // TEMP DEBUG
      console.log('[svp-debug] playable phase but NO video + nothing embedded → removing block', { phase });
      logError(`session is in "${phase}" phase with no embeddable video — removing`);
      el.remove();
    } else {
      // TEMP DEBUG
      console.log('[svp-debug] no video, staying mounted (non-playable phase or already embedded)', { phase, embeddedPhase });
    }
  };

  // One shared watcher drives everything: it fires onPhase() now and on every phase change, running
  // a clock-boundary timer for time-based transitions and subscribing to the MobileRider poll for a
  // live session's poll-driven live→DVR→on-demand flips — the same source the eyebrow/playlist use.
  // TEMP DEBUG
  console.log('[svp-debug] init → starting watchPlaybackPhase', {
    sessionId,
    insidePlaylistContainer: isInsidePlaylistContainer(el),
    mrStreamId: session.mrStreamId,
    eventStartMs: getEventStartMs(),
  });
  const stopWatching = watchPlaybackPhase(session, onPhase, { eventStartMs: getEventStartMs() });
  onElementDetached(el, stopWatching);
}

