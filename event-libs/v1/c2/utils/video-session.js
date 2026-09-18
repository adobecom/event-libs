import { getMetadata } from '../../utils/utils.js';
import { dvrAvailableAtMs, getNowMs } from '../../utils/session-state.js';
import { getAttrText, getAttrValues } from './custom-attributes.js';
import { hasOnDemandFormat, parseDvrDelayHours } from '../../services/sessions/sessions-api.js';
import { getEventStartMs } from '../../utils/tier-1-event-config.js';
import {
  registerStreamIds, unregisterStreamIds, subscribe as subscribeToPoller,
} from '../../services/sessions/poller.js';

export const VIDEO_LAYOUT_DECISION_KEY = 'videoLayoutDecision';

export const VIDEO_PLAYABLE_KEY = 'videoPlayable';

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

export function findEmbeddableVideos(sessionTimes) {
  return (sessionTimes || [])
    .flatMap((entry) => entry?.videos || [])
    .filter((video) => EMBEDDABLE_PROVIDERS.includes(video?.provider));
}

export function currentSessionHasEnded(sessionTimes, nowMs) {
  const firstEntry = (sessionTimes || [])[0];
  if (!firstEntry || !Number.isFinite(firstEntry.endTimeMillis)) return true;
  return nowMs >= firstEntry.endTimeMillis;
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

export const PLAYBACK_CASE = { IPOD: 'ipod', SIMULIVE: 'simulive', LIVE: 'live' };

export const PLAYBACK_PHASE = {
  PRE_EVENT: 'pre-event',
  SIMULIVE: 'simulive',
  WATCH_LIVE: 'watch-live',
  DVR_BUFFER: 'dvr-buffer',
  ON_DEMAND: 'on-demand',
};

const MINUTE_MS = 60_000;

export function classifySessionPlayback(session) {
  if (!session) return null;
  if (session.mrStreamId || session.isLivestreamed) return PLAYBACK_CASE.LIVE;
  if (session.dvrDelayHours != null) return PLAYBACK_CASE.IPOD;
  if (session.mpcId || session.youTubeId) return PLAYBACK_CASE.SIMULIVE;
  return null;
}

function ipodPhase(session, nowMs, eventStartMs) {
  const start = Date.parse(session.startTimeUtc) || null;
  const end = Date.parse(session.endTimeUtc) || null;

  const gateStart = start ?? eventStartMs;
  if (gateStart && nowMs < gateStart) return PLAYBACK_PHASE.PRE_EVENT;

  if (end && nowMs < end) return PLAYBACK_PHASE.PRE_EVENT;

  if (session.dvrDelayHours == null) return PLAYBACK_PHASE.ON_DEMAND;
  const availableAt = dvrAvailableAtMs(session, eventStartMs);
  if (availableAt == null || nowMs < availableAt) return PLAYBACK_PHASE.PRE_EVENT;
  return PLAYBACK_PHASE.ON_DEMAND;
}

const SIMULIVE_PRE_ROLL_MIN = 5;

function simulivePhase(session, nowMs) {
  const start = Date.parse(session.startTimeUtc) || null;
  if (start == null) return PLAYBACK_PHASE.ON_DEMAND;

  if (nowMs < start - (SIMULIVE_PRE_ROLL_MIN * MINUTE_MS)) return PLAYBACK_PHASE.PRE_EVENT;

  const end = Date.parse(session.endTimeUtc) || null;
  if (end != null && nowMs > end) return PLAYBACK_PHASE.ON_DEMAND;
  return PLAYBACK_PHASE.SIMULIVE;
}

function livePhase(session, nowMs, eventStartMs, liveStreamActiveIds, streamWasEverActive) {
  const start = Date.parse(session.startTimeUtc) || null;
  if (start && nowMs < start) return PLAYBACK_PHASE.PRE_EVENT;

  const end = Date.parse(session.endTimeUtc) || null;

  const isLiveNow = session.mrStreamId
    ? Boolean(liveStreamActiveIds?.has(session.mrStreamId))
    : (end == null || nowMs < end);
  if (isLiveNow) return PLAYBACK_PHASE.WATCH_LIVE;

  if (session.mrStreamId && !streamWasEverActive && end != null && nowMs < end) {
    return PLAYBACK_PHASE.WATCH_LIVE;
  }

  if (session.dvrDelayHours != null) {
    const availableAt = dvrAvailableAtMs(session, eventStartMs);
    if (availableAt != null && nowMs < availableAt) return PLAYBACK_PHASE.DVR_BUFFER;
    return PLAYBACK_PHASE.ON_DEMAND;
  }

  return PLAYBACK_PHASE.ON_DEMAND;
}

export function getPlaybackPhase(session, {
  nowMs, eventStartMs = null, liveStreamActiveIds = null, streamWasEverActive = false,
} = {}) {
  const playbackCase = classifySessionPlayback(session);
  if (playbackCase === PLAYBACK_CASE.IPOD) return ipodPhase(session, nowMs, eventStartMs);
  if (playbackCase === PLAYBACK_CASE.SIMULIVE) return simulivePhase(session, nowMs);
  if (playbackCase === PLAYBACK_CASE.LIVE) {
    return livePhase(session, nowMs, eventStartMs, liveStreamActiveIds, streamWasEverActive);
  }
  return null;
}

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

const HOUR_MS = 60 * 60 * 1000;

export function nextPhaseBoundaryMs(session, { nowMs, eventStartMs = null } = {}) {
  const candidates = [];
  const start = Date.parse(session.startTimeUtc) || null;
  const end = Date.parse(session.endTimeUtc) || null;
  if (start != null) {
    candidates.push(start);
    candidates.push(start - (SIMULIVE_PRE_ROLL_MIN * MINUTE_MS));
  }
  if (end != null) candidates.push(end);
  if (session.dvrDelayHours != null && eventStartMs != null) {
    candidates.push(eventStartMs + session.dvrDelayHours * HOUR_MS);
  }
  const future = candidates.filter((ms) => ms > nowMs);
  return future.length ? Math.min(...future) : null;
}

export function watchPlaybackPhase(session, onChange, { eventStartMs } = {}) {
  if (!session) return () => {};
  const resolveEventStartMs = () => (eventStartMs != null ? eventStartMs : getEventStartMs());

  let liveStreamActiveIds = new Set();
  let streamWasEverActive = false;
  let lastPhase;
  let timerId = null;
  let stopped = false;

  const emitIfChanged = () => {
    if (stopped) return;
    const phase = getPlaybackPhase(session, {
      nowMs: getNowMs(),
      eventStartMs: resolveEventStartMs(),
      liveStreamActiveIds,
      streamWasEverActive,
    });
    if (phase !== lastPhase) {
      lastPhase = phase;
      onChange(phase);
    }
  };

  const scheduleNextClockTick = () => {
    if (timerId != null) { clearTimeout(timerId); timerId = null; }
    const nowMs = getNowMs();
    const boundary = nextPhaseBoundaryMs(session, { nowMs, eventStartMs: resolveEventStartMs() });
    if (boundary == null) return;
    const delay = Math.min((boundary - nowMs) + 500, 2 ** 31 - 1);
    timerId = setTimeout(() => { emitIfChanged(); scheduleNextClockTick(); }, delay);
  };

  let unsubscribePoll = () => {};
  if (session.mrStreamId) {
    unsubscribePoll = subscribeToPoller(({ active }) => {
      liveStreamActiveIds = new Set(active);
      if (liveStreamActiveIds.has(session.mrStreamId)) streamWasEverActive = true;
      emitIfChanged();
    }, [session.mrStreamId]);
    registerStreamIds([session.mrStreamId]);
  }

  emitIfChanged();
  scheduleNextClockTick();

  return function stop() {
    stopped = true;
    if (timerId != null) { clearTimeout(timerId); timerId = null; }
    if (session.mrStreamId) {
      unsubscribePoll();
      unregisterStreamIds([session.mrStreamId]);
    }
  };
}
