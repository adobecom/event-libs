import { createTag, getMetadata } from '../../../utils/utils.js';
import { getNowMs, getWatchDestination } from '../../../utils/session-state.js';
import { getAttrText, getAttrValues } from '../../utils/custom-attributes.js';
import { renderSchedule } from './schedule.js';

const MAX_TIMEOUT = 2 ** 31 - 1;

const BROADCAST_URL = 'https://www.adobe.com/max/2026/broadcast.html';
const PLAY_ICON = '<svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M4.27412 16.204C3.91596 16.204 3.55825 16.1073 3.23613 15.9148C2.61869 15.5457 2.25 14.8953 2.25 14.1764V3.8246C2.25 3.10565 2.6187 2.45527 3.23613 2.08612C3.85313 1.71786 4.59976 1.6994 5.23345 2.0413L14.8645 7.21719C15.5219 7.57051 15.9302 8.25429 15.9302 9.00049C15.9302 9.74669 15.5219 10.4305 14.8645 10.7838L5.23345 15.9597C4.93066 16.1232 4.60195 16.204 4.27412 16.204ZM4.2772 3.14696C4.1168 3.14696 3.99067 3.20849 3.92871 3.24541C3.82983 3.30429 3.6 3.4792 3.6 3.8246V14.1764C3.6 14.5218 3.82983 14.6967 3.92871 14.7555C4.02758 14.8144 4.28994 14.934 4.59448 14.7714L14.2251 9.59549C14.5455 9.42235 14.5802 9.12176 14.5802 9.00047C14.5802 8.87919 14.5455 8.5786 14.2251 8.40546L4.59448 3.22958C4.48067 3.16894 4.373 3.14696 4.2772 3.14696Z" fill="currentColor"/></svg>';

export function getAllSessionTimes(doc = document) {
  let entries;
  try {
    entries = JSON.parse(getMetadata('session-times', doc) || '[]');
  } catch (e) {
    window.lana?.log(`[session-details] invalid session-times JSON: ${e.message}`);
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

export function nextBoundary(nowMs, slots) {
  const points = [];
  slots.forEach(({ start, end }) => {
    if (nowMs < start) points.push(start);
    if (nowMs <= end) points.push(end);
  });
  return points.length ? Math.min(...points) : null;
}

export function formatDateTime(ms, timeZone) {
  const date = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone }).format(ms);
  const time = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric', minute: '2-digit', hour12: true, timeZoneName: 'short', timeZone,
  }).format(ms);
  return `${date}, ${time}`;
}

const EMBEDDABLE_PROVIDERS = ['mpc', 'youtube'];

export function hasPlayableVideo(doc = document) {
  let entries;
  try {
    entries = JSON.parse(getMetadata('session-times', doc) || '[]');
  } catch {
    return false;
  }
  return (entries || [])
    .flatMap((t) => t?.videos || [])
    .some((v) => EMBEDDABLE_PROVIDERS.includes(v?.provider) && v?.kind === 'onDemand');
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

export function renderStatus(state, times, doc = document) {
  const el = createTag('span', { class: `session-status session-status--${state}` });
  if (state === 'live') {
    el.append(createTag('span', { class: 'session-status-dot', 'aria-hidden': 'true' }));
    el.append(createTag('span', {}, 'Live'));
  } else if (state === 'on-demand') {
    const pending = isIpodSession(doc) && !hasPlayableVideo(doc);
    el.classList.toggle('session-status--coming-soon', pending);
    el.textContent = pending ? 'Coming soon' : 'On-demand';
  } else {
    el.textContent = formatDateTime(times.start, times.timezone);
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

export function mountSessionState({ statusSlot, primaryCtaSlot, ccEl }) {
  const slots = getAllSessionTimes();
  if (!slots.length) return;
  const earliest = slots[0];
  const finalEnd = Math.max(...slots.map(({ end }) => end));

  // An IPOD session is attended in person and posted afterwards, so there is nothing for a
  // remote visitor to be reminded of — the schedule CTA is never offered, and the button is
  // not built at all rather than built and withheld.
  const ipod = isIpodSession();
  const scheduleBtn = ipod ? null : renderSchedule();
  const watchBtn = renderWatchNow();

  const ctaFor = (state, nowMs) => {
    if (state === 'live') return watchBtn;
    return nowMs < finalEnd ? scheduleBtn : null;
  };

  const applyCta = (btn) => {
    if (btn) primaryCtaSlot.replaceChildren(btn);
    else primaryCtaSlot.replaceChildren();
  };

  let pending; // undefined = nothing deferred; null = "clear the CTA"
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

  const apply = (state, nowMs) => {
    if (primaryCtaSlot) setCta(ctaFor(state, nowMs));
    if (statusSlot) statusSlot.replaceChildren(renderStatus(state, earliest));
    if (ccEl) ccEl.hidden = state !== 'on-demand';
  };

  const evaluate = () => {
    const now = getNowMs();
    apply(getState(now, slots), now);
    const boundary = nextBoundary(now, slots);
    if (boundary !== null) setTimeout(evaluate, Math.min((boundary - now) + 500, MAX_TIMEOUT));
  };
  evaluate();
}
