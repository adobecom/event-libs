import { getMetadata } from '../../utils/utils.js';
import { dvrAvailableAtMs } from '../../utils/session-state.js';

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
const HOUR_MS = 3_600_000;

// Live-stream identity always wins: HP livestreamed sessions carry an mpcId (the eventual
// VOD asset) alongside mrStreamId/isLivestreamed, but that mpcId is not a simulive video.
export function classifySessionPlayback(session) {
  if (!session) return null;
  if (session.hasOnDemandFormat) return PLAYBACK_CASE.IPOD;
  if (session.mrStreamId || session.isLivestreamed) return PLAYBACK_CASE.LIVE;
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

  const delayMs = session.dvrDelayHours != null
    ? session.dvrDelayHours * HOUR_MS
    : SIMULIVE_DEFAULT_DELAY_MIN * MINUTE_MS;

  if (nowMs < contentEndMs + delayMs) return PLAYBACK_PHASE.SIMULIVE;
  return PLAYBACK_PHASE.ON_DEMAND;
}

function livePhase(session, nowMs, liveStreamActiveIds) {
  const start = Date.parse(session.startTimeUtc) || null;
  if (start && nowMs < start) return PLAYBACK_PHASE.PRE_EVENT;

  const end = Date.parse(session.endTimeUtc) || null;
  const isLiveNow = session.mrStreamId
    ? Boolean(liveStreamActiveIds?.has(session.mrStreamId)) && (!end || nowMs < end)
    : (end == null || nowMs < end);
  if (isLiveNow) return PLAYBACK_PHASE.WATCH_LIVE;

  // Removal of dvrDelayHours is itself the "the MPC video is available" signal — skip
  // straight to on-demand rather than falling back to the default DVR-buffer window.
  if (session.dvrDelayHours == null) return PLAYBACK_PHASE.ON_DEMAND;

  const delayMs = session.dvrDelayHours * HOUR_MS;
  const bufferStart = end ?? nowMs;
  if (nowMs < bufferStart + delayMs) return PLAYBACK_PHASE.DVR_BUFFER;
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
  if (playbackCase === PLAYBACK_CASE.LIVE) return livePhase(session, nowMs, liveStreamActiveIds);
  return null;
}
