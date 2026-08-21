import { createTag, getMetadata, LIBS } from '../../../utils/utils.js';
import { getNowMs } from '../../../utils/session-state.js';

const BLOCK_CSS_URL = new URL('./video-player.css', import.meta.url).href;
const MILO_IFRAME_CSS_URL = `${LIBS}/styles/iframe.css`;

// Real adobetv.js/youtube.js autoblocks only ever run via Milo's own block loader, which
// auto-attaches each block's own CSS (adobetv.css itself is just `@import
// url('../../styles/iframe.css');`) as a side effect of loading it — .milo-video's
// aspect-ratio/sizing rules live there, not in this block's own CSS. buildMiloVideo below
// mirrors that markup directly (bypassing the autoblock entirely, since there's no
// authored link for it to decorate), so nothing else ever triggers that load — without
// this, a freshly-built .milo-video has no intrinsic size at all.
function ensureMiloIframeCss() {
  if (document.getElementById('milo-iframe-css')) return;
  createTag('link', { rel: 'stylesheet', href: MILO_IFRAME_CSS_URL, id: 'milo-iframe-css' }, '', { parent: document.head });
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

// Per-session watch progress, keyed by the SESSION's own id rather than any provider's
// video id — only ever written by the session's own page (the only place its video is
// actually embedded), then read by video-playlist.js (a separate block/fragment on this
// same page, and every OTHER session's own page) listing it as a row.
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
    // Derived fresh from THIS secondsWatched every time, never stuck on — a rewatch
    // (e.g. after autoplay moves on and the viewer comes back) must be able to fall
    // back below 100% again.
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

// The CURRENT session's own end time — reads directly off the page's own `session-times`
// metadata (confirmed real shape: an array of entries each carrying their own
// `endTimeMillis`, epoch ms, as a sibling of `videos`), so it's known synchronously at
// init() time — no catalog fetch to wait on. There's no point loading the player for a
// session that hasn't actually ended yet. Permissive when the field is missing/malformed
// rather than hiding a page we can't positively evaluate.
function currentSessionHasEnded(sessionTimes, nowMs) {
  const entry = (sessionTimes || [])[0];
  if (!entry || !Number.isFinite(entry.endTimeMillis)) return true;
  return nowMs >= entry.endTimeMillis;
}

// The Individual Session Page's own `session-times` metadata carries this session's own
// videos[] — entries shaped like { provider: 'mpc', url: 'https://video.tv.adobe.com/v/
// 3458940?autoplay=true&quality=9&end=nothing&learn=on', kind: 'onDemand' } — confirmed
// against real data for 'mpc'. No real 'youtube' sample has been seen yet — its url shape
// (a raw video id? a full watch/embed URL?) isn't confirmed, so buildMiloVideo below
// extracts an id defensively rather than assuming one shape.
const EMBEDDABLE_PROVIDERS = ['mpc', 'youtube'];

// This block only ever shows the on-demand recording, never a live stream — an MPC
// template's own videos[] array order isn't reliable evidence of which one that is (a
// real template has been seen with a `youtube` `liveStream` entry sitting BEFORE the
// `mpc` `onDemand` entry), so `kind` must be checked explicitly rather than trusting
// `.find()`'s first-match order. Falls back to whatever's embeddable if no `onDemand`
// entry exists at all, rather than showing nothing — a session with a real embeddable
// video and no onDemand-kind entry is likely a data gap, not a "no video" case.
function pickEmbeddableVideo(sessionTimes) {
  const videos = (sessionTimes || []).flatMap((t) => t?.videos || [])
    .filter((v) => EMBEDDABLE_PROVIDERS.includes(v.provider));
  return videos.find((v) => v.kind === 'onDemand') || videos[0] || null;
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

// Mirrors Milo's own adobetv.js/youtube.js autoblock output (class names, iframe attrs —
// see node_modules/@adobecom/milo/libs/blocks/{adobetv,youtube}/*.js), and explicitly
// loads the same CSS (see ensureMiloIframeCss above) that output would otherwise only
// ever get via Milo's own block loader. YouTube additionally gets enablejsapi=1 + an id,
// needed to track completion below — Milo's own autoblock doesn't add these since it
// never needs to observe player state.
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

// Resumes playback from a previously-saved position — same postMessage envelope the
// exploratory new-video-playlist branch's startVideoFromSecond used against the real MPC
// player (confirmed working there). Skipped ("start from 0", i.e. a no-op here) when the
// saved position is within RESUME_RESTART_THRESHOLD_SECONDS of the end — resuming a
// session the viewer already finished would just restart 1s before the end.
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

// Fallback only — MPC's own postMessage tick/pause/complete events don't reliably carry
// `length` (confirmed live: a real 'pause' event had `currentTime` but no `length` at
// all). Queried once per MPC video id (cached + in-flight-deduplicated) via MPC's own
// JSON-LD metadata endpoint — same approach the exploratory new-video-playlist branch's
// utils-new.js already used (fetchVideoDuration).
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

// Notifies video-playlist.js (if that block happens to be on the page — a separate
// block/fragment, not something this one imports or references directly) that this
// session's progress changed, so its "now playing" row's progress bar/duration update
// live rather than only reflecting a stale snapshot from page load. Dispatched on
// window, not any shared DOM ancestor — the two blocks may live in entirely separate
// grid-column fragments with no common ancestor below <body>, and video-playlist's own
// row for this session may not exist yet (its catalog fetch is async) at the moment
// this fires, so this can't assume a target element to dispatch from either.
function notifyProgressChanged(sessionId) {
  window.dispatchEvent(new CustomEvent('video-player:progress', { detail: { sessionId } }));
}

// Raw playback state, for any listener on the page to react to independently — this
// block makes no decision about what should happen on 'ended' (e.g. whether to advance
// to another session); that's video-playlist.js's call to make, reading its own "Play
// all" preference and resolving its own next-session target off its own rendered rows.
// This block only reports what the player is doing.
function notifyStateChanged(sessionId, state) {
  window.dispatchEvent(new CustomEvent('video-player:state', { detail: { sessionId, state } }));
}

// MPC doesn't reliably include `length` on any given message — falls back to querying
// it once (cached) from MPC's own JSON-LD metadata endpoint when neither this message
// nor a previously-saved entry for this session already has it.
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

// MPC posts window messages from video.tv.adobe.com — same postMessage envelope this
// codebase's earlier video-playlist attempt already relied on: { type: 'mpcStatus',
// state: 'load'|'pause'|'tick'|'complete', id, currentTime, length }. Progress is saved
// under the CURRENT session's own id (the closure's `sessionId`), not `data.id` — this
// page only ever embeds its own session's video, so which session is playing is already
// known unambiguously, unlike the multi-card-on-one-page model the envelope originally
// came from.
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
        // A tick only ever arrives while actually playing — fired every message
        // (not throttled like the progress save above), since 'play' is a discrete
        // state transition a listener needs promptly, not a value to sample.
        notifyStateChanged(sessionId, 'play');
        break;
      }
      case MPC_STATE_COMPLETE: {
        // Real completion events carry `length`; tests (and possibly real edge cases)
        // may dispatch a bare `state: 'complete'` — only persist when a length is
        // actually known (this event's own, or a prior tick/pause's), so this never
        // clobbers previously-saved progress with a bogus undefined secondsWatched.
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
      // The IFrame API has no continuous "tick" event (unlike MPC's postMessage
      // stream) — poll getCurrentTime()/getDuration() at the same cadence while
      // actually playing, same PROGRESS_TICK_SECONDS cadence as the MPC path.
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

// Loads the current session's own video into THIS block's own element — provider-specific
// tracking, since MPC (postMessage) and YouTube (IFrame API) use entirely different
// state signals. If a `.milo-video`/`.mobile-rider` was already authored here (real pages
// have been seen with either, or nothing at all), it's replaced; otherwise a fresh
// `.milo-video` container is built, mirroring Milo's own autoblock markup. This block only
// reports playback state (see notifyStateChanged) — it makes no decision about what
// should happen on 'ended' (e.g. advancing to another session); that's owned entirely by
// whatever listens for 'video-player:state' (video-playlist.js's own "Play all" logic).
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

// Two separate `.video-player` instances are authored on every session page — one
// inside a full-width, player-only section, one inside a two-column section alongside
// video-playlist (see video-playlist.js's own README) — and only ONE of them should
// ever actually embed/play a video; the other's section is torn down entirely by
// video-playlist.js. Without coordination both would start playing immediately and
// independently, which is exactly the "both players briefly visible" problem this
// resolves: instead of embedding right away, each instance registers as pending and
// waits for the page-wide decision event before deciding whether it's the winner —
// showing a lightweight loader in its own place meanwhile (see init()'s own
// .video-player-loader), since video-playlist.js's catalog fetch driving that decision
// has been measured at ~3.5s and the video area would otherwise sit visually empty.
const DECISION_FALLBACK_MS = 4000;

// Deliberately NOT keyed off an authored marker class (`.video-container`/
// `.video-playlist-container`) — a real page has been seen where that Section
// Metadata Style row was missing/not applied, which silently broke video embedding
// entirely with no visible error. Instead: does a `.video-playlist` block exist
// anywhere in the same GRID section as this player (not just its own immediate
// `.section`, which is only the fragment's own inner wrapper — video-player and
// video-playlist live in sibling fragments, each with their own inner `.section`,
// both nested inside one shared outer grid `.section`). `.grid-column` is that
// fragment-loader wrapper; its own parent is the real shared ancestor to search from.
function isInsidePlaylistContainer(el) {
  const gridColumn = el.closest('.grid-column');
  const outerSection = gridColumn?.parentElement?.closest('.section') || el.closest('.section');
  return Boolean(outerSection?.querySelector('.video-playlist'));
}

// Resolves true/false ("I am the winning instance") exactly once. Milo inits each
// block's own module independently — there's no guarantee this listener is attached
// before video-playlist.js's own init() has already run and announced its decision (a
// transient CustomEvent alone could be missed, stalling the WINNING player behind the
// fallback timeout below). window.__videoPlaylistDecision is checked FIRST as a latch
// covering that race; the event covers the normal case where this listener attaches
// first; DECISION_FALLBACK_MS covers a page with no video-playlist block authored at
// all (only .video-container exists — no decision will ever come, and the full-width
// player must still embed rather than wait forever).
function awaitEmbedDecision(el) {
  if (window.__videoPlaylistDecision != null) {
    return Promise.resolve(isInsidePlaylistContainer(el)
      ? window.__videoPlaylistDecision
      : !window.__videoPlaylistDecision);
  }
  return new Promise((resolve) => {
    let settled = false;
    const settle = (hasPlaylist) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      window.removeEventListener('video-playlist:decision', onDecision);
      resolve(isInsidePlaylistContainer(el) ? hasPlaylist : !hasPlaylist);
    };
    const onDecision = (event) => settle(event.detail.hasPlaylist);
    window.addEventListener('video-playlist:decision', onDecision);
    // Fallback only ever benefits the full-width instance in practice — a
    // video-playlist-container instance with no video-playlist block on the page has
    // nothing to show anyway (that section's whole point is the pairing).
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

  // Page-level metadata (the Individual Session Page's own identity) takes precedence
  // over anything authored on the block itself — session-id no longer needs authoring at
  // all when the page already carries it.
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

  // Shown immediately, in place of the real embed, while awaitEmbedDecision below is
  // still pending (video-playlist.js's own catalog fetch has been measured at ~3.5s) —
  // without this, BOTH sections stay visually empty for that whole window (this page
  // has no other content gating on the same decision, so the rest of the page renders
  // fine; only the video area itself has nothing to show yet), which reads as a blank,
  // broken page rather than "still loading." Removed the moment the real decision
  // lands, whichever way it goes — the winner replaces it with the real embed, the
  // loser's whole section collapses via video-playlist.js's own is-collapsing (which
  // removes this loader along with everything else in that section).
  el.append(createTag('div', { class: 'video-player-loader', 'aria-hidden': 'true' }));

  // Doesn't embed yet — see awaitEmbedDecision above. The LOSING instance's whole
  // section is removed by video-playlist.js itself (see announceVideoDecision there);
  // this instance only ever embeds if it's confirmed the winner, so the loser's iframe
  // never starts loading/playing at all.
  const isWinner = await awaitEmbedDecision(el);
  el.querySelector('.video-player-loader')?.remove();
  if (!isWinner) return;

  loadVideoPlayer(el, sessionId, currentVideo);
}
