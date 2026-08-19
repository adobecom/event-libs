/*
 * Session state view (MWPW-200288) — the time-driven Pre-Live / Live / On-Demand
 * layer of session-details.
 *
 * Per the ticket, state is a pure client-side time comparison against the
 * session's own start/end time (no status field), so we read `session-times`
 * from page metadata rather than the async RainFocus catalog. On each state it
 * updates three things: the eyebrow status, the primary CTA, and closed-caption
 * visibility (CC shows only On-Demand). Transitions happen with no reload via a
 * setTimeout scheduled at the next boundary.
 */
import { createTag, getMetadata } from '../../../utils/utils.js';
import { getNowMs, getWatchDestination } from '../../../utils/session-state.js';
import { getAttrText, getAttrValues } from '../../utils/custom-attributes.js';
import { renderSchedule } from './schedule.js';

// setTimeout clamps to a 32-bit delay; for far-future sessions we re-arm instead
// of overflowing (which would fire immediately).
const MAX_TIMEOUT = 2 ** 31 - 1;

// Fallback only. getWatchDestination() (Daniel Oliva's helper, session-state.js) is
// the source of the live watch link — driven by our pure-time state. Daniel will
// source the real URL from config inside it; until then it returns a generic path,
// and we fall back to this if it yields nothing (e.g. no livestream/online flags).
const BROADCAST_URL = 'https://www.adobe.com/max/2026/broadcast.html';
// Figma "watch now" glyph (play). fill: currentColor so it reads white on the
// dark CTA pill.
const PLAY_ICON = '<svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M4.27412 16.204C3.91596 16.204 3.55825 16.1073 3.23613 15.9148C2.61869 15.5457 2.25 14.8953 2.25 14.1764V3.8246C2.25 3.10565 2.6187 2.45527 3.23613 2.08612C3.85313 1.71786 4.59976 1.6994 5.23345 2.0413L14.8645 7.21719C15.5219 7.57051 15.9302 8.25429 15.9302 9.00049C15.9302 9.74669 15.5219 10.4305 14.8645 10.7838L5.23345 15.9597C4.93066 16.1232 4.60195 16.204 4.27412 16.204ZM4.2772 3.14696C4.1168 3.14696 3.99067 3.20849 3.92871 3.24541C3.82983 3.30429 3.6 3.4792 3.6 3.8246V14.1764C3.6 14.5218 3.82983 14.6967 3.92871 14.7555C4.02758 14.8144 4.28994 14.934 4.59448 14.7714L14.2251 9.59549C14.5455 9.42235 14.5802 9.12176 14.5802 9.00047C14.5802 8.87919 14.5455 8.5786 14.2251 8.40546L4.59448 3.22958C4.48067 3.16894 4.373 3.14696 4.2772 3.14696Z" fill="currentColor"/></svg>';

// Reads the session's start/end from `session-times` page metadata (first entry).
// Falls back to session-length-in-minutes for the end when it's absent.
export function getSessionTimes(doc = document) {
  let entry;
  try {
    [entry] = JSON.parse(getMetadata('session-times', doc) || '[]');
  } catch (e) {
    window.lana?.log(`[session-details] invalid session-times JSON: ${e.message}`);
    return null;
  }
  if (!entry?.startTimeMillis) return null;
  const start = Number(entry.startTimeMillis);
  const lengthMs = (Number(getMetadata('session-length-in-minutes', doc)) || 0) * 60000;
  const end = Number(entry.endTimeMillis) || (start + lengthMs) || start;
  return { start, end, timezone: entry.timezone || undefined };
}

export function getState(nowMs, { start, end }) {
  if (nowMs < start) return 'upcoming';
  if (nowMs <= end) return 'live';
  return 'on-demand';
}

// e.g. "Nov 11, 9:00 AM PST" — short month, no year, in the session's timezone.
export function formatDateTime(ms, timeZone) {
  const date = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone }).format(ms);
  const time = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric', minute: '2-digit', hour12: true, timeZoneName: 'short', timeZone,
  }).format(ms);
  return `${date}, ${time}`;
}

export function renderStatus(state, times) {
  const el = createTag('span', { class: `session-status session-status--${state}` });
  if (state === 'live') {
    el.append(createTag('span', { class: 'session-status-dot', 'aria-hidden': 'true' }));
    el.append(createTag('span', {}, 'Live'));
  } else if (state === 'on-demand') {
    el.textContent = 'On-demand';
  } else {
    el.textContent = formatDateTime(times.start, times.timezone);
  }
  return el;
}

// The fields getWatchDestination() reads, sourced from PAGE METADATA (not the async
// catalog) so the live watch link stays on our pure-time, no-catalog path:
//   isLivestreamed <- "Livestreamed Content" custom attribute (= "live")
//   isOnline       <- "Format" custom attribute (includes "online")
//   sessionPageUrl <- the session's own url (on-demand destination)
function getWatchSession(doc = document) {
  return {
    isLivestreamed: getAttrText('Livestreamed Content', doc).toLowerCase() === 'live',
    isOnline: getAttrValues('Format', doc).some((v) => (v.value || '').toLowerCase() === 'online'),
    sessionPageUrl: getMetadata('url', doc) || '',
  };
}

// Watch now only renders in the live state, so resolve the destination for 'live'
// via getWatchDestination; fall back to BROADCAST_URL until Daniel's URL source lands.
function renderWatchNow() {
  const href = getWatchDestination(getWatchSession(), 'live') || BROADCAST_URL;
  const a = createTag('a', { class: 'session-primary-cta-btn session-watch-now', href });
  a.innerHTML = `${PLAY_ICON}<span>Watch now</span>`;
  return a;
}

// Wires the reactive controller: computes the state now and re-applies at each
// boundary. Slots/elements are created by session-details.js and mutated here.
export function mountSessionState({ statusSlot, primaryCtaSlot, ccEl }) {
  const times = getSessionTimes();
  if (!times) return;

  // Built once; moved in/out of the primary-cta slot per state (keeps listeners).
  const scheduleBtn = renderSchedule();
  const watchBtn = renderWatchNow();

  // The CTA a given state owns (null = no CTA). scheduleBtn is null without a
  // session id, which correctly collapses to "no CTA".
  const ctaFor = (state) => {
    if (state === 'upcoming') return scheduleBtn;
    if (state === 'live') return watchBtn;
    return null;
  };

  const applyCta = (btn) => {
    if (btn) primaryCtaSlot.replaceChildren(btn);
    else primaryCtaSlot.replaceChildren();
  };

  // A boundary can fire while the user is on the CTA. Replacing it then would
  // remove the focused element and drop focus to <body> (WCAG 2.4.3), so hold the
  // swap until focus leaves the slot. The eyebrow status is a live region, so the
  // new state is still announced immediately either way.
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

  const apply = (state) => {
    // CTA before status, so the announcement lands on a DOM that already offers it.
    if (primaryCtaSlot) setCta(ctaFor(state));
    if (statusSlot) statusSlot.replaceChildren(renderStatus(state, times));
    if (ccEl) ccEl.hidden = state !== 'on-demand';
  };

  const evaluate = () => {
    const now = getNowMs();
    const state = getState(now, times);
    apply(state);
    const boundary = now < times.start ? times.start : (now <= times.end ? times.end : null);
    if (boundary) setTimeout(evaluate, Math.min((boundary - now) + 500, MAX_TIMEOUT));
  };
  evaluate();
}
