import { createTag, getMetadata, readBlockConfig } from '../../../utils/utils.js';
import { logError } from '../../../utils/lana-log.js';
import { getNowMs, getWatchDestination, isDvrPending } from '../../../utils/session-state.js';
import { getEventStartMs } from '../../../utils/tier-1-event-config.js';
import { getAttrText, getAttrValues } from '../../utils/custom-attributes.js';
import {
  currentSessionHasEnded,
  findEmbeddableVideos,
  watchPlaybackPhase,
  buildSessionFromMetadata,
  parseJsonMetadata,
  PLAYBACK_PHASE,
} from '../../utils/video-session.js';
import { renderSchedule } from './schedule.js';

const MAX_TIMEOUT = 2 ** 31 - 1;

const BROADCAST_URL = 'https://www.adobe.com/max/2026/broadcast.html';
const PLAY_ICON = '<svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M4.27412 16.204C3.91596 16.204 3.55825 16.1073 3.23613 15.9148C2.61869 15.5457 2.25 14.8953 2.25 14.1764V3.8246C2.25 3.10565 2.6187 2.45527 3.23613 2.08612C3.85313 1.71786 4.59976 1.6994 5.23345 2.0413L14.8645 7.21719C15.5219 7.57051 15.9302 8.25429 15.9302 9.00049C15.9302 9.74669 15.5219 10.4305 14.8645 10.7838L5.23345 15.9597C4.93066 16.1232 4.60195 16.204 4.27412 16.204ZM4.2772 3.14696C4.1168 3.14696 3.99067 3.20849 3.92871 3.24541C3.82983 3.30429 3.6 3.4792 3.6 3.8246V14.1764C3.6 14.5218 3.82983 14.6967 3.92871 14.7555C4.02758 14.8144 4.28994 14.934 4.59448 14.7714L14.2251 9.59549C14.5455 9.42235 14.5802 9.12176 14.5802 9.00047C14.5802 8.87919 14.5455 8.5786 14.2251 8.40546L4.59448 3.22958C4.48067 3.16894 4.373 3.14696 4.2772 3.14696Z" fill="currentColor"/></svg>';

export function getAllSessionTimes(doc = document) {
  let entries;
  try {
    entries = JSON.parse(getMetadata('session-times', doc) || '[]');
  } catch (e) {
    logError('session-details', 'invalid session-times JSON', e);
    return [];
  }
  const lengthMs = (Number(getMetadata('session-length-in-minutes', doc)) || 0) * 60000;
  return (Array.isArray(entries) ? entries : [])
    .filter((entry) => entry?.startTimeMillis)
    .map((entry) => {
      const start = Number(entry.startTimeMillis);
      const end = Number(entry.endTimeMillis) || (start + lengthMs) || start;
      return { start, end, timezone: entry.timezone || undefined };
    })
    .sort((a, b) => a.start - b.start);
}

export function getSessionTimes(doc = document) {
  return getAllSessionTimes(doc)[0] || null;
}

export function getState(nowMs, slots) {
  const list = Array.isArray(slots) ? slots : [slots];
  if (!list.length) return 'on-demand';
  if (list.some(({ start, end }) => nowMs >= start && nowMs <= end)) return 'live';
  return nowMs < Math.min(...list.map(({ start }) => start)) ? 'upcoming' : 'on-demand';
}

// Maps the shared playback phase (from watchPlaybackPhase — the same poll-aware engine the video
// player uses) to the eyebrow's status. This keeps the eyebrow and the player in sync: while the
// MobileRider stream is live the phase stays WATCH_LIVE, so the eyebrow reads 'live' instead of
// flipping to 'on-demand' at the authored end time. Once the live stream ends the player switches
// to the DVR replay — per product, the eyebrow reads 'on-demand' from that point on (DVR_BUFFER and
// ON_DEMAND both). SIMULIVE is a premiere, so 'live'.
export function stateForPhase(phase) {
  switch (phase) {
    case PLAYBACK_PHASE.PRE_EVENT: return 'upcoming';
    case PLAYBACK_PHASE.SIMULIVE:
    case PLAYBACK_PHASE.WATCH_LIVE: return 'live';
    case PLAYBACK_PHASE.DVR_BUFFER:
    case PLAYBACK_PHASE.ON_DEMAND: return 'on-demand';
    default: return 'on-demand';
  }
}

export function nextBoundary(nowMs, slots) {
  const points = [];
  slots.forEach(({ start, end }) => {
    if (nowMs < start) points.push(start);
    if (nowMs <= end) points.push(end);
  });
  return points.length ? Math.min(...points) : null;
}

export function formatDateTime(ms) {
  const date = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(ms);
  const time = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric', minute: '2-digit', hour12: true, timeZoneName: 'short',
  }).format(ms);
  return `${date}, ${time}`;
}

export function hasPlayableVideo(doc = document) {
  let entries;
  try {
    entries = JSON.parse(getMetadata('session-times', doc) || '[]');
  } catch {
    return false;
  }
  if (!currentSessionHasEnded(entries, getNowMs())) return false;
  if (findEmbeddableVideos(entries).length === 0) return false;
  // Honor the DVR delay: an IPOD/MPC on-demand video isn't "available" until the DVR window has
  // elapsed (same gate the player uses). Without this the eyebrow flipped to "On-demand" the moment
  // the session ended, ignoring dvrDelayHours.
  const session = buildSessionFromMetadata(entries);
  return !isDvrPending(session, getNowMs(), getEventStartMs());
}

const normalizeAttr = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

function hasFormat(doc, normalized) {
  return getAttrValues('Format', doc)
    .some(({ label, value }) => normalizeAttr(value) === normalized
      || normalizeAttr(label) === normalized);
}

function isIpodSession(doc = document) {
  return hasFormat(doc, 'inperson') && hasFormat(doc, 'ondemandpostevent');
}

function isSchedulableSession(doc = document) {
  return hasFormat(doc, 'online');
}

function isInPersonIpodSession(doc = document) {
  return isIpodSession(doc) && !isSchedulableSession(doc);
}

export const DEFAULT_STATUS_LABELS = { live: 'Live', onDemand: 'On-demand', ipodPending: 'Available soon' };

const STATUS_LABEL_ROWS = { live: 'live-label', onDemand: 'on-demand-label', ipodPending: 'ipod-pending-label' };

export function readStatusLabels(el) {
  const config = readBlockConfig(el);
  const labels = { ...DEFAULT_STATUS_LABELS };
  Object.entries(STATUS_LABEL_ROWS).forEach(([k, key]) => {
    const authored = new DOMParser()
      .parseFromString(config[key] || '', 'text/html').body.textContent.trim();
    if (authored) labels[k] = authored;
  });
  return labels;
}

export function renderStatus(state, times, labels = DEFAULT_STATUS_LABELS, doc = document) {
  if (isInPersonIpodSession(doc)) {
    const available = hasPlayableVideo(doc);
    const el = createTag('span', {
      class: `session-status session-status--${available ? 'on-demand' : 'ipod-pending'}`,
    });
    el.textContent = available ? labels.onDemand : labels.ipodPending;
    return el;
  }
  const el = createTag('span', { class: `session-status session-status--${state}` });
  if (state === 'live') {
    el.append(createTag('span', { class: 'session-status-dot', 'aria-hidden': 'true' }));
    const liveLabel = createTag('span');
    liveLabel.textContent = labels.live;
    el.append(liveLabel);
  } else if (state === 'on-demand') {
    el.textContent = labels.onDemand;
  } else {
    el.textContent = formatDateTime(times.start);
  }
  return el;
}

function getWatchSession(doc = document) {
  return {
    isLivestreamed: getAttrText('Livestreamed Content', doc).toLowerCase() === 'live',
    isOnline: getAttrValues('Format', doc).some((v) => (v.value || '').toLowerCase() === 'online'),
    sessionPageUrl: getMetadata('url', doc) || '',
  };
}

function renderWatchNow() {
  const href = getWatchDestination(getWatchSession(), 'live') || BROADCAST_URL;
  const a = createTag('a', {
    class: 'session-primary-cta-btn session-watch-now', href, 'daa-ll': 'Watch-Now',
  });
  a.innerHTML = `${PLAY_ICON}<span>Watch now</span>`;
  return a;
}

export function mountSessionState({
  statusSlot, primaryCtaSlot, ccEl, statusLabels = DEFAULT_STATUS_LABELS,
}) {
  const slots = getAllSessionTimes();
  if (!slots.length) return;
  const earliest = slots[0];

  if (isInPersonIpodSession()) {
    if (primaryCtaSlot) primaryCtaSlot.replaceChildren();
    if (statusSlot) statusSlot.replaceChildren(renderStatus(null, earliest, statusLabels));
    if (ccEl) ccEl.hidden = !hasPlayableVideo();
    return;
  }

  const finalEnd = Math.max(...slots.map(({ end }) => end));

  const scheduleBtn = isSchedulableSession() ? renderSchedule() : null;
  const watchBtn = renderWatchNow();

  // 'live' → Watch now. Otherwise Add to schedule only while a session slot is still to come
  // (nowMs < finalEnd). `phaseDriven` is true for the mrStreamId poll path, where DVR_BUFFER maps
  // to an 'on-demand' state before the scheduled end: there we must follow the state (no schedule
  // once we've left 'live'/'upcoming'), not the clock, or a DVR replay before finalEnd would still
  // wrongly offer Add to schedule.
  const ctaFor = (state, nowMs, phaseDriven = false) => {
    if (state === 'live') return watchBtn;
    if (phaseDriven) return state === 'upcoming' ? scheduleBtn : null;
    return nowMs < finalEnd ? scheduleBtn : null;
  };

  const applyCta = (btn) => {
    if (btn) primaryCtaSlot.replaceChildren(btn);
    else primaryCtaSlot.replaceChildren();
  };

  let pending;
  const flushCta = () => {
    if (pending === undefined) return;
    const btn = pending;
    pending = undefined;
    applyCta(btn);
  };
  const setCta = (btn) => {
    if (primaryCtaSlot.contains(document.activeElement)) {
      pending = btn;
      primaryCtaSlot.addEventListener('focusout', flushCta, { once: true });
      return;
    }
    applyCta(btn);
  };

  const apply = (state, nowMs, phaseDriven = false) => {
    if (primaryCtaSlot) setCta(ctaFor(state, nowMs, phaseDriven));
    if (statusSlot) statusSlot.replaceChildren(renderStatus(state, earliest, statusLabels));
    if (ccEl) ccEl.hidden = state !== 'on-demand';
  };

  const session = buildSessionFromMetadata(parseJsonMetadata('session-times', 'session-details'));

  // A livestreamed session (mrStreamId) is driven by the same poll-aware engine the video player
  // uses (watchPlaybackPhase), so the eyebrow and player never disagree: while the MobileRider
  // stream is live the phase stays WATCH_LIVE and the eyebrow reads 'live' rather than flipping to
  // 'on-demand' at the authored end time. Non-live sessions keep the simple clock-based loop.
  if (session?.mrStreamId) {
    const stop = watchPlaybackPhase(session, (phase) => {
      const now = getNowMs();
      const state = phase == null ? getState(now, slots) : stateForPhase(phase);
      apply(state, now, phase != null);
    });
    return stop;
  }

  const evaluate = () => {
    const now = getNowMs();
    apply(getState(now, slots), now);
    const boundary = nextBoundary(now, slots);
    if (boundary !== null) setTimeout(evaluate, Math.min((boundary - now) + 500, MAX_TIMEOUT));
  };
  evaluate();
  return undefined;
}
