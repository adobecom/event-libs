import { getMetadata } from '../../utils/utils.js';
import { dvrAvailableAtMs } from '../../utils/session-state.js';
import { getAttrText, getAttrValues } from './custom-attributes.js';
import { hasOnDemandFormat, parseDvrDelayHours } from '../../services/sessions/sessions-api.js';

export const VIDEO_LAYOUT_DECISION_KEY = 'videoLayoutDecision';

export const PROGRESS_STORAGE_KEY = 'session-video-playlist:progress';

export const EMBEDDABLE_PROVIDERS = ['mpc', 'youtube'];

export const VIDEO_CONTAINER_CLASS = 'session-video-container';
export const VIDEO_PLAYLIST_CONTAINER_CLASS = 'session-video-playlist-container';

function logError(scope, message) {
  window.lana?.log(`[${scope}] ${message}`);
}

export function sectionHasStyle(section, styleClass) {
  if (!section) return false;
  if (section.classList.contains(styleClass)) return true;

  const metadataBlock = section.querySelector(':scope > .section-metadata');
  if (!metadataBlock) return false;

  return [...metadataBlock.querySelectorAll(':scope > div')].some((row) => {
    const [labelCell, valueCell] = row.querySelectorAll(':scope > div');
    if (labelCell?.textContent.trim().toLowerCase() !== 'style') return false;

    return (valueCell?.textContent || '')
      .split(',')
      .map((style) => style.trim().replaceAll(' ', '-'))
      .filter(Boolean)
      .includes(styleClass);
  });
}

export function closestSectionWithStyle(el, styleClass) {
  let section = el?.closest('.section');
  while (section) {
    if (sectionHasStyle(section, styleClass)) return section;
    section = section.parentElement?.closest('.section');
  }
  return null;
}

export function findSectionWithStyle(styleClass) {
  return [...document.querySelectorAll('.section')]
    .find((section) => sectionHasStyle(section, styleClass)) || null;
}

export function readJsonFromStorage(key, fallback, scope) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (error) {
    logError(scope, `localStorage read failed for "${key}": ${error.message}`);
    return fallback;
  }
}

export function writeJsonToStorage(key, value, scope) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    logError(scope, `localStorage write failed for "${key}": ${error.message}`);
  }
}

export function parseJsonMetadata(name, scope) {
  const raw = getMetadata(name);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (error) {
    logError(scope, `invalid ${name} page metadata: ${error.message}`);
    return null;
  }
}

export function getVideoProgress(sessionId, scope) {
  return readJsonFromStorage(PROGRESS_STORAGE_KEY, {}, scope)[sessionId] || null;
}

// Persists a session's watch progress to the shared progress map. `completed` is derived so the
// playlist's progress bar and the player's resume logic agree on what "watched" means.
export function saveVideoProgress(sessionId, secondsWatched, length = null, scope) {
  if (!sessionId) return;
  const progressBySession = readJsonFromStorage(PROGRESS_STORAGE_KEY, {}, scope);
  const resolvedLength = length ?? progressBySession[sessionId]?.length ?? null;
  progressBySession[sessionId] = {
    secondsWatched,
    length: resolvedLength,
    completed: Boolean(resolvedLength && secondsWatched >= resolvedLength),
  };
  writeJsonToStorage(PROGRESS_STORAGE_KEY, progressBySession, scope);
}

// Runs `teardown` once `element` leaves the DOM. A single shared MutationObserver watches all
// registered elements (cheaper than one observer per element) and disconnects itself once none
// remain. Used by both the player and playlist to clean up listeners/timers on block removal.
const detachWatchers = new Set();
let detachObserver = null;
export function onElementDetached(element, teardown) {
  const watcher = { element, teardown };
  detachWatchers.add(watcher);

  if (!detachObserver) {
    detachObserver = new MutationObserver(() => {
      detachWatchers.forEach((w) => {
        if (w.element.isConnected) return;
        detachWatchers.delete(w);
        // Isolate each teardown: a throw in one watcher must not skip the rest (they share this
        // one callback, unlike the old per-element observers). teardowns are benign cleanup
        // (removeEventListener / clearInterval / unsubscribe), so swallowing here is safe.
        try {
          w.teardown();
        } catch (error) {
          logError('video-session', `element-detached teardown failed: ${error.message}`);
        }
      });
      if (detachWatchers.size === 0) {
        detachObserver.disconnect();
        detachObserver = null;
      }
    });
    detachObserver.observe(document.body, { childList: true, subtree: true });
  }
  return watcher;
}

export function currentSessionHasEnded(sessionTimes, nowMs) {
  const firstEntry = (sessionTimes || [])[0];
  if (!firstEntry || !Number.isFinite(firstEntry.endTimeMillis)) return false;
  return nowMs >= firstEntry.endTimeMillis;
}

export function findEmbeddableVideos(sessionTimes) {
  return (sessionTimes || [])
    .flatMap((entry) => entry?.videos || [])
    .filter((video) => EMBEDDABLE_PROVIDERS.includes(video?.provider));
}

export function readAuthoredConfig(el) {
  return [...el.querySelectorAll(':scope > div > div:first-child')].reduce((config, labelCell) => {
    const key = labelCell.textContent.trim().toLowerCase().replace(/ /g, '-');
    return { ...config, [key]: labelCell.nextElementSibling?.textContent?.trim() || '' };
  }, {});
}

export function resolveSessionId(config) {
  return getMetadata('session-id') || config['session-id'] || '';
}

export function ensureStylesheet(id, href) {
  if (document.getElementById(id)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  link.id = id;
  document.head.append(link);
}

// --- Playback classification (IPOD / Simulive / Live) ---------------------------------
//
// Three fundamentally different kinds of session content, each with its own pre-event /
// playable / not-ready-yet timeline. Confirmed with the RF PM (Kat):
//   - IPOD ("On-Demand Post Event"): hasOnDemandFormat. Has its own sessionStart/sessionEnd.
//     DVR timing (dvrDelayHours) is authored large (e.g. 772h) and REMOVED once the
//     on-demand video is actually available — so its absence is a ready-now signal, not
//     just "no delay configured".
//   - Simulive (Adobe Live/Luminary/online sessions): has mpcId/youTubeId + a schedule, but
//     no live-stream identity. Typically no dvrDelayHours at all (a 5-minute default covers
//     the gap between "video finished" and "on-demand ready").
//   - Live (Sneaks/Keynotes/Super Creativity/GS/AL/SS): has mrStreamId and/or isLivestreamed.
//     HP livestreamed sessions have BOTH dvrDelayHours and an mpcId (the eventual VOD) — once
//     dvrDelayHours is removed from the catalog, that itself signals the MPC video is ready,
//     overriding whatever the clock math would otherwise say.
export const PLAYBACK_CASE = { IPOD: 'ipod', SIMULIVE: 'simulive', LIVE: 'live' };

export const PLAYBACK_PHASE = {
  PRE_EVENT: 'pre-event',
  SIMULIVE: 'simulive',
  WATCH_LIVE: 'watch-live',
  DVR_BUFFER: 'dvr-buffer',
  ON_DEMAND: 'on-demand',
};

const MINUTE_MS = 60_000;

// Classification is driven by the session's own identity + DVR gate, NOT the authored Format
// attribute. Live identity wins first: a session with a livestream/DVR identity runs the full
// Live→DVR→On-Demand lifecycle (livePhase ends in ON_DEMAND once dvrDelayHours is removed or the
// window elapses) even if it also happens to carry an on-demand-post-event Format — Format must
// not flatten that lifecycle. IPOD is a non-live post-event recording, identified by its
// DVR-availability gate (dvrDelayHours present, e.g. 772): ipodPhase holds it PRE_EVENT until
// now > eventStart + dvrDelayHours, then plays the VOD. Everything else with an embeddable asset
// is a scheduled SIMULIVE premiere that ends in On-Demand.
export function classifySessionPlayback(session) {
  if (!session) return null;
  if (session.mrStreamId || session.isLivestreamed) return PLAYBACK_CASE.LIVE;
  if (session.dvrDelayHours != null) return PLAYBACK_CASE.IPOD;
  if (session.mpcId || session.youTubeId) return PLAYBACK_CASE.SIMULIVE;
  return null;
}

// RF's "Video Duration", HH:MM:SS — minutes can exceed 59 (e.g. "00:60:00"), so this sums
// weighted parts, no range validation. Duplicated from session-broadcast/utils/
// broadcast-schedule.js's parseVideoDurationMs — kept local so this shared C2 util doesn't
// depend on a specific block's utils.
function parseVideoDurationMs(videoDuration) {
  if (!videoDuration) return null;
  const parts = videoDuration.split(':').map(Number);
  if (parts.some(Number.isNaN)) return null;
  const [h = 0, m = 0, s = 0] = parts;
  return ((h * 3600) + (m * 60) + s) * 1000;
}

// dvrDelayHours is authored large (e.g. 772h) and REMOVED once the on-demand asset is
// actually available — so once the session's own window has closed, its absence IS the
// ready-now signal, same as Live's post-broadcast gate. Its presence still gates by
// dvrAvailableAtMs; an unconfirmed availability time (dvrDelayHours set but eventStartMs
// unknown) keeps the session pre-event rather than assuming ready.
function ipodPhase(session, nowMs, eventStartMs) {
  const start = Date.parse(session.startTimeUtc) || null;
  const end = Date.parse(session.endTimeUtc) || null;

  // Not started yet (or the event hasn't, for a session with no schedule of its own).
  const gateStart = start ?? eventStartMs;
  if (gateStart && nowMs < gateStart) return PLAYBACK_PHASE.PRE_EVENT;

  // Still running — nothing to watch yet regardless of DVR delay.
  if (end && nowMs < end) return PLAYBACK_PHASE.PRE_EVENT;

  if (session.dvrDelayHours == null) return PLAYBACK_PHASE.ON_DEMAND;
  const availableAt = dvrAvailableAtMs(session, eventStartMs);
  if (availableAt == null || nowMs < availableAt) return PLAYBACK_PHASE.PRE_EVENT;
  return PLAYBACK_PHASE.ON_DEMAND;
}

const SIMULIVE_PRE_ROLL_MIN = 5;
const SIMULIVE_DEFAULT_DELAY_MIN = 5;

function simulivePhase(session, nowMs) {
  const start = Date.parse(session.startTimeUtc) || null;
  // No schedule at all means nothing to gate on — treat as already available.
  if (start == null) return PLAYBACK_PHASE.ON_DEMAND;

  if (nowMs < start - (SIMULIVE_PRE_ROLL_MIN * MINUTE_MS)) return PLAYBACK_PHASE.PRE_EVENT;

  const end = Date.parse(session.endTimeUtc) || null;
  const durationMs = parseVideoDurationMs(session.videoDuration);
  // "Start time + how long the video is" or the official session end time, whichever applies.
  const contentEndMs = durationMs != null ? start + durationMs : (end ?? start);

  // A simulive session never carries a DVR delay — anything with dvrDelayHours classifies as
  // IPOD/LIVE upstream (classifySessionPlayback), so this is always the default post-roll.
  if (nowMs < contentEndMs + (SIMULIVE_DEFAULT_DELAY_MIN * MINUTE_MS)) return PLAYBACK_PHASE.SIMULIVE;
  return PLAYBACK_PHASE.ON_DEMAND;
}

function livePhase(session, nowMs, eventStartMs, liveStreamActiveIds) {
  const start = Date.parse(session.startTimeUtc) || null;
  if (start && nowMs < start) return PLAYBACK_PHASE.PRE_EVENT;

  // "Is it live right now" is the MobileRider poll alone — it goes inactive promptly when the
  // stream really ends, whereas the authored endTime is unreliable (a session can end early or
  // run long). So we do NOT gate live on the clock; an over-running broadcast stays WATCH_LIVE
  // until the poll drops. (A livestreamed session without an mrStreamId has no poll to consult,
  // so it falls back to the scheduled window.)
  const end = Date.parse(session.endTimeUtc) || null;
  const isLiveNow = session.mrStreamId
    ? Boolean(liveStreamActiveIds?.has(session.mrStreamId))
    : (end == null || nowMs < end);
  if (isLiveNow) return PLAYBACK_PHASE.WATCH_LIVE;

  // Stream is off air. DVR window, when authored, is event-wide and measured from eventStart —
  // the same convention ipodPhase/dvrAvailableAtMs use (NOT the unreliable session endTime):
  // before eventStart + dvrDelayHours → still buffering (play the DVR asset), after → the MPC VOD.
  if (session.dvrDelayHours != null) {
    const availableAt = dvrAvailableAtMs(session, eventStartMs);
    if (availableAt != null && nowMs < availableAt) return PLAYBACK_PHASE.DVR_BUFFER;
    return PLAYBACK_PHASE.ON_DEMAND;
  }

  // No DVR delay authored: the VOD is ready as soon as the stream is off air (isLiveNow already
  // false at this point), so go straight to on-demand — the MPC video's presence is the signal.
  return PLAYBACK_PHASE.ON_DEMAND;
}

// The single entry point consumers should use: classifies the session, then resolves which
// of the five playback phases applies right now. Returns null if the session doesn't fit any
// of the three cases (no on-demand format, no live identity, no mpc/youtube id) — callers
// should treat that as "nothing to render".
export function getPlaybackPhase(session, {
  nowMs, eventStartMs = null, liveStreamActiveIds = null,
} = {}) {
  const playbackCase = classifySessionPlayback(session);
  if (playbackCase === PLAYBACK_CASE.IPOD) return ipodPhase(session, nowMs, eventStartMs);
  if (playbackCase === PLAYBACK_CASE.SIMULIVE) return simulivePhase(session, nowMs);
  if (playbackCase === PLAYBACK_CASE.LIVE) return livePhase(session, nowMs, eventStartMs, liveStreamActiveIds);
  return null;
}

// --- Metadata-driven session shape (no catalog fetch) -----------------------------------
//
// `custom-attributes` (the raw RF/ESP attribute array) is already authored as page metadata
// on an Individual Session Page, sibling to `session-times` — session-video-playlist.js
// already reads it this same way (`extractCustomAttributeSlugs`/`extractCustomAttributeValue`
// against `{ customAttributes: pageCustomAttributes }`). This builds the subset of fields
// classifySessionPlayback()/getPlaybackPhase() need, directly from that page metadata, so a
// single-session consumer never has to wait on the async session catalog just to learn about
// the one session its own page is already about.
export function buildSessionFromMetadata(sessionTimes) {
  const firstEntry = (sessionTimes || [])[0] || null;
  const formatValues = getAttrValues('Format').map((v) => v.label || v.value);

  return {
    startTimeUtc: firstEntry?.startTimeMillis ? new Date(firstEntry.startTimeMillis).toISOString() : '',
    endTimeUtc: firstEntry?.endTimeMillis ? new Date(firstEntry.endTimeMillis).toISOString() : '',
    hasOnDemandFormat: hasOnDemandFormat(formatValues),
    isLivestreamed: getAttrValues('Livestreamed Content').some((v) => (v.label || v.value) === 'Live'),
    mrStreamId: getAttrText('Mobilerider Video ID (Livestream)') || null,
    mpcId: getAttrText('MPC ID'),
    youTubeId: getAttrText('YouTube ID'),
    mrDvrVideoId: getAttrText('Mobilerider Video ID (DVR)'),
    mrSkinId: getAttrText('SkinID') || getAttrText('Skin ID'),
    videoDuration: getAttrText('Video Duration') || getAttrText('Video Duration (hr:min:sec)'),
    dvrDelayHours: parseDvrDelayHours(getAttrText('DVR Timing (in hours)')),
  };
}
