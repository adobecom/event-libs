import { createTag } from '../../../utils/utils.js';
import { deriveSessionState } from '../../../utils/session-state.js';
import {
  favorited,
  scheduled,
  pendingActions,
  liveStreamActiveIds,
  initSessionState,
} from '../../../utils/session-store.js';
import { scheduleWithFeedback, favoriteWithFeedback } from '../../../services/sessions/action-feedback.js';
import { setSessionParam, safeUrl } from '../../../blocks/sessions-guide/utils/url.js';
import MobileRiderController from '../../../services/sessions/mobile-rider-controller.js';

const ROTATE_OUT_MS = 350;
const MR_POLL_INTERVAL_MS = 30_000;

/**
 * Testing-only clock override: `?timing=<epoch-ms>` in the page URL lets QA
 * simulate "now" as any instant (e.g. right before a session starts, or
 * mid-live) without waiting for real time to pass. Read once at module load
 * (not per-call) as an *offset* from the real clock, not a frozen value —
 * `now()` still advances in real time from that point, so setTimeout-based
 * timers and the MR poll keep firing correctly relative to it. Absent or
 * invalid `timing` falls back to the real `Date.now()` exactly as before.
 */
const TIMING_OVERRIDE_OFFSET_MS = (() => {
  const raw = new URLSearchParams(window.location.search).get('timing');
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed - Date.now() : null;
})();

function now() {
  return TIMING_OVERRIDE_OFFSET_MS === null ? Date.now() : Date.now() + TIMING_OVERRIDE_OFFSET_MS;
}

// session-store.js's own liveStreamActiveIds is currently backed by a mocked
// fetchLiveStatus() (services/sessions/mobile-rider.js — always returns
// everything inactive), so it can never report a session live yet. Poll the
// real Mobile Rider endpoint directly instead, via the real
// MobileRiderController (services/sessions/mobile-rider-controller.js, hits
// overlay-admin-integration.mobilerider.com). Kept as our own local Set,
// merged with the shared signal below, so this starts working for free if
// the shared mock is ever replaced with a real implementation.
const mobileRiderController = new MobileRiderController();
const mrActiveIds = new Set();

// scheduleWithFeedback/favoriteWithFeedback need an eventConfig for registration-required
// copy and conflict-modal gating. This block has no authored config surface for those yet
// (see the design doc's open questions) — falls back to sensible defaults.
const EVENT_CONFIG = { title: '', showConflictModal: false, registerUrl: '/register' };

// Same SVGs as event-libs/v1/blocks/sessions-guide/components/icons.js, inlined —
// that file exports Preact components (htm-preact), not usable from vanilla JS.
const ICON_CALENDAR_CHECK = '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"><path d="M7.86427 15.7344C7.64161 15.7344 7.43068 15.6357 7.2881 15.4648L3.54103 10.9668C3.27541 10.6484 3.31935 10.1748 3.63673 9.91015C3.95411 9.64453 4.42677 9.68652 4.69337 10.0059L7.84669 13.792L15.2861 4.32323C15.542 3.99706 16.0147 3.94139 16.3389 4.19628C16.665 4.45214 16.7217 4.92382 16.4658 5.24901L8.4541 15.4473C8.31445 15.626 8.10156 15.7314 7.875 15.7344L7.86427 15.7344Z" fill="currentColor"/></svg>';
const ICON_CALENDAR_PLUS = '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"><path d="M8.64355 16.5H4.25C3.83643 16.5 3.5 16.1636 3.5 15.75V8.5H16.5V8.64355C16.5 9.05761 16.8359 9.39355 17.25 9.39355C17.6641 9.39355 18 9.05761 18 8.64355V5.25C18 4.00928 16.9907 3 15.75 3H13.75V2C13.75 1.58594 13.4141 1.25 13 1.25C12.5859 1.25 12.25 1.58594 12.25 2V3H7.75V2C7.75 1.58594 7.41406 1.25 7 1.25C6.58594 1.25 6.25 1.58594 6.25 2V3H4.25C3.00928 3 2 4.00928 2 5.25V15.75C2 16.9907 3.00928 18 4.25 18H8.64355C9.05761 18 9.39355 17.6641 9.39355 17.25C9.39355 16.8359 9.05761 16.5 8.64355 16.5ZM4.25 4.5H6.25V5C6.25 5.41406 6.58594 5.75 7 5.75C7.41406 5.75 7.75 5.41406 7.75 5V4.5H12.25V5C12.25 5.41406 12.5859 5.75 13 5.75C13.4141 5.75 13.75 5.41406 13.75 5V4.5H15.75C16.1636 4.5 16.5 4.83643 16.5 5.25V7H3.5V5.25C3.5 4.83643 3.83643 4.5 4.25 4.5Z" fill="currentColor"/><path d="M15 10.5C12.5147 10.5 10.5 12.5147 10.5 15C10.5 17.4853 12.5147 19.5 15 19.5C17.4853 19.5 19.5 17.4853 19.5 15C19.5 12.5147 17.4853 10.5 15 10.5ZM17.5 15.625H15.625V17.5C15.625 17.8452 15.3452 18.125 15 18.125C14.6548 18.125 14.375 17.8452 14.375 17.5V15.625H12.5C12.1548 15.625 11.875 15.3452 11.875 15C11.875 14.6648 12.1548 14.375 12.5 14.375H14.375V12.5C14.375 12.1548 14.6548 11.875 15 11.875C15.3452 11.875 15.625 12.1548 15.625 12.5V14.375H17.5C17.8452 14.375 18.125 14.6648 18.125 15C18.125 15.3452 17.8452 15.625 17.5 15.625Z" fill="currentColor"/></svg>';
const ICON_HEART_FILLED = '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"><path d="M8.61426 17.5195C9.02246 17.8398 9.51123 18 10 18C10.4888 18 10.9781 17.8398 11.3858 17.5195C12.9732 16.2734 16.5908 13.0039 17.7603 11.0908C18.6929 9.56543 19.0132 7.67773 18.6172 6.04199C18.2774 4.63769 17.4551 3.50488 16.2393 2.76367C14.9116 1.95409 13.2705 1.79003 11.959 2.34179C11.2647 2.63183 10.5698 3.1416 9.99171 3.77148C9.42628 3.17773 8.72316 2.65234 8.063 2.35058C6.78419 1.7666 5.13526 1.9248 3.76124 2.76367C2.54493 3.50488 1.72266 4.63769 1.38282 6.04199C0.98682 7.67773 1.30713 9.56543 2.23975 11.0908C3.41162 13.0078 7.02832 16.2754 8.61426 17.5195Z" fill="currentColor"/></svg>';
const ICON_HEART_OUTLINE = '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"><path d="M10 18C9.51124 18 9.02247 17.8398 8.61427 17.5195C7.02833 16.2754 3.41163 13.0078 2.23976 11.0908C1.30714 9.56542 0.986826 7.67772 1.38283 6.04198C1.72267 4.63768 2.54494 3.50487 3.76125 2.76366C5.13527 1.92479 6.7842 1.76659 8.06301 2.35057C8.72317 2.65233 9.42629 3.17772 9.99172 3.77147C10.5698 3.14159 11.2647 2.63182 11.959 2.34178C13.2705 1.79002 14.9116 1.95408 16.2393 2.76366C17.4551 3.50487 18.2774 4.63768 18.6172 6.04198C19.0132 7.67772 18.6929 9.56542 17.7603 11.0908C16.5908 13.0039 12.9732 16.2734 11.3858 17.5195C10.9781 17.8398 10.4888 18 10 18ZM6.38722 3.49901C5.78077 3.49901 5.13185 3.68456 4.54201 4.04491C3.67287 4.57421 3.08498 5.38671 2.84084 6.39452C2.53615 7.65233 2.79006 9.11522 3.51906 10.3076C4.47218 11.8662 7.66847 14.8711 9.54006 16.3398C9.81057 16.5527 10.189 16.5527 10.4595 16.3398C12.333 14.8691 15.5298 11.8633 16.4805 10.3076C17.21 9.11523 17.4639 7.65234 17.1592 6.39452C16.9151 5.38671 16.3272 4.57421 15.4585 4.04491C14.5327 3.48046 13.4136 3.35839 12.5386 3.7246C11.8565 4.01073 11.1055 4.6621 10.6245 5.38476C10.3462 5.80273 9.65385 5.80273 9.37553 5.38476C8.94047 4.73144 8.12651 4.02929 7.43998 3.71581C7.12162 3.5703 6.7627 3.49901 6.38722 3.49901Z" fill="currentColor"/></svg>';
const ICON_ARROW_RIGHT = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"><path d="M3.5 8H12.5M12.5 8L8.5 4M12.5 8L8.5 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';

/** Adapts a raw catalog session object into the shape `deriveSessionState` expects. */
function toDerivedInput(session) {
  const { sessionTime } = session;
  return {
    startTimeUtc: sessionTime ? new Date(sessionTime.startTimeMillis).toISOString() : null,
    endTimeUtc: sessionTime ? new Date(sessionTime.endTimeMillis).toISOString() : null,
    // If the authored session has a Mobile Rider id, deriveSessionState's
    // MR branch kicks in and checks the merged active-ids set below instead
    // of the pure time-window fallback.
    mrStreamId: session.mrStreamId,
  };
}

function liveActiveIds() {
  return new Set([...liveStreamActiveIds.value, ...mrActiveIds]);
}

/**
 * Wraps deriveSessionState for this block's own needs: for an MR session,
 * deriveSessionState reports 'on-demand' the moment the scheduled start time
 * passes without MR confirming active (its "no real end signal yet" fallback
 * — reasonable for Session Guide's own On Demand view, wrong here). Until MR
 * actually confirms the stream is live, keep routing/behaving as 'upcoming'
 * (session-guide) rather than treating the card as ended. The card only
 * leaves the row via scheduleStateTimers's scheduled-end-time removal, or
 * once MR genuinely reports active (-> 'live', watch/broadcast routing).
 */
function currentState(session) {
  const state = deriveSessionState(toDerivedInput(session), liveActiveIds(), now());
  if (session.mrStreamId && state === 'on-demand') return 'upcoming';
  return state;
}

function formatTimeRange(session) {
  const { sessionTime } = session;
  if (!sessionTime) return '';
  const options = { hour: 'numeric', minute: '2-digit', hour12: true };
  if (sessionTime.timezone) options.timeZone = sessionTime.timezone;
  try {
    const start = new Date(sessionTime.startTimeMillis).toLocaleTimeString('en-US', options);
    const end = new Date(sessionTime.endTimeMillis).toLocaleTimeString('en-US', options);
    return `${start} - ${end}`;
  } catch (error) {
    window.lana?.log(`upcoming-sessions: time format failed: ${error.message}`);
    return '';
  }
}

/** `track` matches sessions-guide.js's own field name/shape (flat string, not a delimited list). */
function primaryCategory(session) {
  return session.track || '';
}

/** session-store/session-actions expect `.id`/`.rfCode`/`.startTimeUtc`/`.endTimeUtc`. */
function toRfSession(session) {
  const derived = toDerivedInput(session);
  return {
    id: session.sessionId,
    rfCode: session.sessionCode,
    startTimeUtc: derived.startTimeUtc,
    endTimeUtc: derived.endTimeUtc,
  };
}

/**
 * Pure decision for what a card click should do, given the session's current
 * state. Kept separate from the actual navigation effect so it's testable
 * without touching browser navigation APIs.
 * @returns {{ type: 'session-guide', sessionId: string } | { type: 'watch', url: string } | { type: 'none' }}
 */
export function resolveClickAction(session) {
  const state = currentState(session);
  if (state === 'upcoming') return { type: 'session-guide', sessionId: session.sessionId };
  if (state === 'live') {
    // Live sessions route to wherever the session is actually streaming
    // (homepage or Session Broadcast) via the authored watchUrl — never the
    // session's own detail-page `url`, which isn't a stream destination.
    const url = safeUrl(session.watchUrl);
    return url ? { type: 'watch', url } : { type: 'none' };
  }
  // 'on-demand' is unreachable by click — the card has already rotated out.
  return { type: 'none' };
}

/** Mirrors SessionCard/LiveCard's own `?session=` deep-link mechanism in sessions-guide. */
function openSessionGuideDetail(sessionId) {
  window.history.pushState({}, '', setSessionParam(sessionId));
  window.dispatchEvent(new PopStateEvent('popstate'));
}

function routeCardClick(session) {
  const action = resolveClickAction(session);
  if (action.type === 'session-guide') openSessionGuideDetail(action.sessionId);
  else if (action.type === 'watch') window.location.assign(action.url);
}

/** Builds an sg-icon-btn (same classes/markup shape as sessions-guide's IconButton.js). */
function buildIconButton({
  iconSvg, label, pressed, disabled, extraClass, onClick,
}) {
  const btn = createTag('button', {
    class: ['sg-icon-btn', 'sg-icon-btn--solid', 'sg-icon-btn--on-light', 'sg-icon-btn--md', extraClass].filter(Boolean).join(' '),
    type: 'button',
    'aria-label': label,
    'aria-pressed': String(pressed),
  });
  if (disabled) btn.disabled = true;
  createTag('span', { class: 'sg-icon-btn__icon', 'aria-hidden': 'true' }, iconSvg, { parent: btn });
  btn.addEventListener('click', onClick);
  return btn;
}

async function handleSchedule(e, session, isScheduled, btn) {
  e.stopPropagation();
  btn.disabled = true;
  try {
    await scheduleWithFeedback(toRfSession(session), { eventConfig: EVENT_CONFIG, isScheduled });
  } finally {
    btn.disabled = false;
  }
}

async function handleFavorite(e, session, isFavorited, btn) {
  e.stopPropagation();
  btn.disabled = true;
  try {
    await favoriteWithFeedback(toRfSession(session), { eventConfig: EVENT_CONFIG, isFavorited });
  } finally {
    btn.disabled = false;
  }
}

/** Mirrors sessions-guide's LiveCard/SessionCard markup and classes (sg-live-card family). */
export function buildCard(session) {
  const state = currentState(session);
  const isScheduled = scheduled.value.has(session.sessionId);
  const isFavorited = favorited.value.has(session.sessionId);
  const isPending = pendingActions.value.has(session.sessionId);

  const cardClass = [
    'sg-live-card',
    'upcoming-sessions-card',
    isScheduled ? 'is-scheduled' : '',
    isFavorited ? 'is-favorited' : '',
    isPending ? 'is-pending' : '',
  ].filter(Boolean).join(' ');

  const card = createTag('div', {
    class: cardClass,
    'data-session-id': session.sessionId,
    'data-state': state,
    role: 'button',
    tabindex: '0',
    'aria-label': `${session.enTitle}, ${state === 'live' ? 'Live Now' : formatTimeRange(session)}`,
  });

  const content = createTag('div', { class: 'sg-live-card__content' }, '', { parent: card });

  // Title first, then the badge/time row below it — matches the Figma reference
  // (title at top, "<icon> Design and illustration ... 9:15AM - 9:45AM" beneath).
  createTag('p', { class: 'sg-live-card__title' }, session.enTitle, { parent: content });

  const meta = createTag('div', { class: 'sg-live-card__meta' }, '', { parent: content });
  const trackRow = createTag('div', { class: 'sg-live-card__track-row' }, '', { parent: meta });

  const category = primaryCategory(session);
  if (category) {
    const badge = createTag('span', { class: 'sg-category-badge sg-category-badge--sm' }, '', { parent: trackRow });
    createTag('span', { class: 'sg-category-badge__label' }, category, { parent: badge });
  }

  createTag('p', { class: 'sg-live-card__time' }, state === 'live' ? 'Live Now' : formatTimeRange(session), { parent: meta });

  // Sibling of .sg-live-card__content, not nested inside it — matches the Figma
  // structure (Frame 2147229141 text block + Frame 2147228840 icon column as
  // siblings inside the card's own row-direction flex layout on desktop).
  const actions = createTag('div', { class: 'sg-live-card__actions' }, '', { parent: card });
  actions.addEventListener('click', (e) => e.stopPropagation());

  if (state !== 'live') {
    const scheduleBtn = buildIconButton({
      iconSvg: isScheduled ? ICON_CALENDAR_CHECK : ICON_CALENDAR_PLUS,
      label: isScheduled ? 'Remove from schedule' : 'Add to schedule',
      pressed: isScheduled,
      disabled: isPending,
      extraClass: 'sg-live-card__btn--schedule',
      onClick: (e) => handleSchedule(e, session, isScheduled, scheduleBtn),
    });
    actions.append(scheduleBtn);
  }

  const favoriteBtn = buildIconButton({
    iconSvg: isFavorited ? ICON_HEART_FILLED : ICON_HEART_OUTLINE,
    label: isFavorited ? 'Remove from favorites' : 'Add to favorites',
    pressed: isFavorited,
    disabled: isPending,
    extraClass: 'sg-live-card__btn--favorite',
    onClick: (e) => handleFavorite(e, session, isFavorited, favoriteBtn),
  });
  actions.append(favoriteBtn);

  const activate = () => routeCardClick(session);
  card.addEventListener('click', activate);
  card.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      activate();
    }
  });

  return card;
}

function buildCarouselControls(track) {
  const controls = createTag('div', { class: 'upcoming-sessions-controls' });
  // Same right-arrow icon for both — "prev" is rotated 180deg via CSS,
  // matching the Figma "ControlButton" component (one icon asset, two directions).
  const prev = createTag('button', {
    class: 'upcoming-sessions-arrow upcoming-sessions-arrow--prev',
    type: 'button',
    'aria-label': 'Scroll to previous sessions',
  }, ICON_ARROW_RIGHT, { parent: controls });
  const next = createTag('button', {
    class: 'upcoming-sessions-arrow upcoming-sessions-arrow--next',
    type: 'button',
    'aria-label': 'Scroll to next sessions',
  }, ICON_ARROW_RIGHT, { parent: controls });

  function scrollBy(direction) {
    const card = track.querySelector('.upcoming-sessions-card');
    const step = card ? card.getBoundingClientRect().width + 16 : track.clientWidth * 0.8;
    track.scrollBy({
      left: direction * step,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    });
  }

  prev.addEventListener('click', () => scrollBy(-1));
  next.addEventListener('click', () => scrollBy(1));

  return controls;
}

function removeCard(el, sessionId) {
  const card = el.querySelector(`[data-session-id="${sessionId}"]`);
  if (!card) return;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduceMotion) {
    card.remove();
    return;
  }
  card.classList.add('upcoming-sessions-card--rotating-out');
  setTimeout(() => card.remove(), ROTATE_OUT_MS);
}

// Live/favorite/schedule updates rebuild every card from scratch (state is
// derived fresh per render, not diffed) — preserve scroll position across
// that rebuild so a background update (e.g. a session going live) doesn't
// yank a mid-browse user back to the start of the carousel.
function renderTrack(track, sessions) {
  const { scrollLeft } = track;
  track.innerHTML = '';
  sessions.forEach((session) => track.append(buildCard(session)));
  track.scrollLeft = scrollLeft;
}

function scheduleStateTimers(el, track, sessions) {
  const timers = [];

  sessions.forEach((session) => {
    const { sessionTime } = session;
    if (!sessionTime) return;

    // upcoming -> live: simple scheduled timer against the baked-in start time.
    const untilStart = sessionTime.startTimeMillis - now();
    if (untilStart > 0) {
      timers.push(setTimeout(() => renderTrack(track, sessions), untilStart));
    }

    // live/upcoming -> on-demand: rotate out once the scheduled end passes.
    // For a non-MR (e.g. YouTube) session this is the only end signal there
    // is — start/end time is authoritative. For an MR session this is just a
    // fallback safety net; the real end signal is startMobileRiderPolling's
    // active -> inactive transition (onMobileRiderEnded), which fires
    // independently of this timer and usually removes the card first.
    const untilEnd = sessionTime.endTimeMillis - now();
    if (untilEnd > 0) {
      timers.push(setTimeout(() => removeCard(el, session.sessionId), untilEnd));
    } else if (currentState(session) === 'on-demand') {
      removeCard(el, session.sessionId);
    }
  });

  return timers;
}

/** §8 of the design doc: overlay on the preceding block only if it opts in. */
function attachToPrecedingBlock(el) {
  const previous = el.previousElementSibling;
  if (previous?.classList.contains('attach-upcoming')) {
    el.classList.add('upcoming-sessions--attached');
    previous.classList.add('attach-upcoming--has-overlay');
  }
}

/**
 * Reads a key/value row from the sibling `.section-metadata` block in the
 * same section — the session array is authored there (not in this block's
 * own table), since Milo's section-metadata block only handles a fixed set
 * of known keys internally and doesn't expose arbitrary custom keys anywhere
 * else for a sibling block to read.
 */
function readSectionMetadata(el, key) {
  const metadataBlock = el.closest('.section')?.querySelector(':scope > .section-metadata');
  if (!metadataBlock) return null;
  const rows = metadataBlock.querySelectorAll(':scope > div');
  for (const row of rows) {
    const cells = row.querySelectorAll(':scope > div');
    const rowKey = cells[0]?.textContent?.trim().toLowerCase();
    if (rowKey === key) return cells[1]?.textContent?.trim() ?? '';
  }
  return null;
}

/**
 * Polls the real Mobile Rider endpoint (services/sessions/mobile-rider-
 * controller.js) for any authored session that has an mrStreamId, rather
 * than relying on session-store.js's currently-mocked poller. Keeps
 * polling every MR_POLL_INTERVAL_MS once a session's own scheduled start time
 * arrives — never before — since MR has nothing to report on a session that
 * hasn't started yet, and polls continue afterward (a session can go
 * active/inactive more than once: under-run before the real start, post-run
 * lingering after).
 *
 * `onEnded(endedIds)` fires with the mrStreamIds that just flipped from
 * active -> inactive — MR's only real "this session is actually done"
 * signal, independent of the scheduled-end-time fallback timer.
 */
function startMobileRiderPolling(sessions, onEnded) {
  const mrSessions = sessions.filter((s) => s.mrStreamId);
  if (!mrSessions.length) return null;

  function dueIds(nowMs) {
    return [...new Set(
      mrSessions
        .filter((s) => (s.sessionTime?.startTimeMillis ?? 0) <= nowMs)
        .map((s) => s.mrStreamId),
    )];
  }

  async function tick() {
    const ids = dueIds(now());
    if (!ids.length) return;
    try {
      const { active } = await mobileRiderController.getMediaStatus(ids);
      const nextActive = new Set(active);
      const endedIds = ids.filter((id) => mrActiveIds.has(id) && !nextActive.has(id));
      const gainedIds = ids.some((id) => nextActive.has(id) && !mrActiveIds.has(id));
      if (!endedIds.length && !gainedIds) return;
      ids.forEach((id) => mrActiveIds.delete(id));
      nextActive.forEach((id) => mrActiveIds.add(id));
      onEnded(endedIds);
    } catch (error) {
      window.lana?.log(`upcoming-sessions: mobile rider poll failed: ${error.message}`);
    }
  }

  // A per-session kick exactly at its own start time, so polling begins the
  // instant the session starts rather than waiting for the next 30s interval
  // boundary — plus the immediate tick() below for sessions already underway.
  const startTimers = mrSessions
    .map((s) => (s.sessionTime?.startTimeMillis ?? 0) - now())
    .filter((untilStart) => untilStart > 0)
    .map((untilStart) => setTimeout(tick, untilStart));

  tick();
  const intervalId = setInterval(tick, MR_POLL_INTERVAL_MS);

  return () => {
    startTimers.forEach(clearTimeout);
    clearInterval(intervalId);
  };
}

export default async function init(el) {
  performance.mark('upcoming-sessions:init-start');
  try {
    await decorate(el);
  } finally {
    performance.mark('upcoming-sessions:init-end');
    performance.measure('upcoming-sessions:init', 'upcoming-sessions:init-start', 'upcoming-sessions:init-end');
  }
}

async function decorate(el) {
  attachToPrecedingBlock(el);

  const rows = el.querySelectorAll(':scope > div');
  const heading = rows[0]?.textContent?.trim();
  const payload = readSectionMetadata(el, 'upcoming-sessions');

  let sessions = [];
  try {
    sessions = payload ? JSON.parse(payload) : [];
  } catch (error) {
    window.lana?.log(`upcoming-sessions: failed to parse session payload: ${error.message}`);
    el.remove();
    return;
  }

  if (!sessions.length) {
    el.remove();
    return;
  }

  initSessionState();

  el.innerHTML = '';
  el.setAttribute('role', 'region');
  if (heading) el.setAttribute('aria-label', heading);
  // Desktop hides the scroll arrows entirely when there's nothing to scroll to.
  el.dataset.fewSessions = String(sessions.length <= 3);

  const track = createTag('div', { class: 'upcoming-sessions-track' });
  renderTrack(track, sessions);

  const header = createTag('div', { class: 'upcoming-sessions-header' }, '', { parent: el });
  if (heading) createTag('h6', { class: 'upcoming-sessions-heading' }, heading, { parent: header });
  header.append(buildCarouselControls(track));

  el.append(track);

  let timers = scheduleStateTimers(el, track, sessions);

  // session-store.js's shared liveStreamActiveIds is currently backed by a
  // mocked fetchLiveStatus() that never reports anything active/ended — kept
  // subscribed so this starts reacting for free once that mock is replaced.
  function onLiveSignalChange() {
    renderTrack(track, sessions);
  }

  // Real MR end signal: a session that was active and just flipped inactive
  // (post-run) is genuinely over — remove it immediately rather than waiting
  // on the scheduled-end-time fallback timer.
  function onMobileRiderEnded(endedIds) {
    if (endedIds.length) {
      sessions
        .filter((session) => endedIds.includes(session.mrStreamId))
        .forEach((session) => removeCard(el, session.sessionId));
    }
    renderTrack(track, sessions);
  }

  const unsubscribeLive = liveStreamActiveIds.subscribe(onLiveSignalChange);
  const stopMobileRiderPolling = startMobileRiderPolling(sessions, onMobileRiderEnded);
  const unsubscribeFavorited = favorited.subscribe(() => renderTrack(track, sessions));
  const unsubscribeScheduled = scheduled.subscribe(() => renderTrack(track, sessions));
  const unsubscribePending = pendingActions.subscribe(() => renderTrack(track, sessions));

  function onVisibilityChange() {
    if (document.visibilityState !== 'visible') return;
    timers.forEach(clearTimeout);
    timers = scheduleStateTimers(el, track, sessions);
    renderTrack(track, sessions);
  }
  document.addEventListener('visibilitychange', onVisibilityChange);

  el._upcomingSessionsCleanup = () => {
    timers.forEach(clearTimeout);
    if (stopMobileRiderPolling) stopMobileRiderPolling();
    unsubscribeLive();
    unsubscribeFavorited();
    unsubscribeScheduled();
    unsubscribePending();
    document.removeEventListener('visibilitychange', onVisibilityChange);
  };
}
