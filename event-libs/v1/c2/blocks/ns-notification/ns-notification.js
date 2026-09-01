import { readBlockConfig, getMetadata } from '../../../utils/utils.js';
import {
  sessions, scheduled, liveStreamActiveIds, sessionStateVersion, initSessionState,
} from '../../../utils/session-store.js';
import { getNowMs } from '../../../utils/session-state.js';
import {
  classifyReminderState, computeNextTransitionMs, diffNotificationState, REMINDER_STATES,
} from './reminder-state.js';
import { ensureNotificationBridge, add, edit, remove } from './notification-bridge.js';

const DEFAULT_LEAD_TIME_MINUTES = 5;

// setTimeout delays are stored as a 32-bit signed int; anything past ~24.8 days overflows
// and fires near-immediately. Cap reschedules well under that so a session scheduled
// (RainFocus registration typically opens weeks ahead) far in the future just gets
// re-checked periodically instead of overflowing into a busy-refire loop.
const MAX_TIMER_MS = 24 * 60 * 60 * 1000;

function readLeadTimeMinutes(el) {
  const config = readBlockConfig(el);
  const parsed = Number(config['lead-time-minutes']);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_LEAD_TIME_MINUTES;
}

function getScheduledSessions() {
  const scheduledIds = scheduled.value;
  return sessions.value.filter((session) => scheduledIds.has(session.id));
}

// Headless: this block renders nothing of its own (see ns-notification.css) — its
// presence on the page is the opt-in signal, mirroring northstar's `.ns-notifications`
// DOM-marker convention. Its only job is to keep window.eventNotificationBridge in sync
// with the current user's scheduled sessions as they move through
// reminder -> live -> on-demand.
export default async function init(el) {
  el._nsNotificationCleanup?.();

  const leadTimeMinutes = readLeadTimeMinutes(el);
  const eventConfig = { title: getMetadata('event-title') || '' };

  ensureNotificationBridge();
  initSessionState();

  let lastPushed = new Map();
  let timerId = null;
  let initialRecomputeDone = false;

  function recompute(scheduledSessions) {
    const sessionsById = new Map(scheduledSessions.map((session) => [session.id, session]));
    const nowMs = getNowMs();

    const desired = new Map();
    scheduledSessions.forEach((session) => {
      const state = classifyReminderState(session, liveStreamActiveIds.value, leadTimeMinutes, nowMs);
      if (state !== REMINDER_STATES.IDLE) desired.set(session.id, state);
    });

    const { toAdd, toEdit, toRemove } = diffNotificationState(
      lastPushed, desired, sessionsById, eventConfig,
    );

    // Only record a transition as "pushed" if the bridge actually confirmed it — an
    // add()/edit() that returns false (rejected write, or the user dismissed the entry
    // so the id no longer exists) must not get baked into lastPushed, or the next cycle
    // would keep calling edit() against an id that's never coming back. Dropping it here
    // instead makes the next cycle retry with a fresh add() — self-healing.
    const confirmed = new Map(lastPushed);
    toAdd.forEach((payload) => {
      if (add(payload)) confirmed.set(payload.id, payload.label);
    });
    toEdit.forEach(({ id, patch }) => {
      if (edit(id, patch)) confirmed.set(id, patch.label);
      else confirmed.delete(id);
    });
    toRemove.forEach((id) => {
      remove(id);
      confirmed.delete(id);
    });

    lastPushed = confirmed;
  }

  function scheduleNextRecompute(scheduledSessions) {
    clearTimeout(timerId);
    const nowMs = getNowMs();
    const nextMs = scheduledSessions
      .map((session) => computeNextTransitionMs(session, liveStreamActiveIds.value, leadTimeMinutes, nowMs))
      .filter((ms) => ms != null)
      .reduce((min, ms) => Math.min(min, ms), Infinity);

    if (!Number.isFinite(nextMs)) return;
    const delay = Math.min(Math.max(nextMs, 0), MAX_TIMER_MS);
    timerId = setTimeout(recomputeAndReschedule, delay);
  }

  function recomputeAndReschedule() {
    initialRecomputeDone = true;
    const scheduledSessions = getScheduledSessions();
    recompute(scheduledSessions);
    scheduleNextRecompute(scheduledSessions);
  }

  // scheduled fires immediately on subscribe (see ../../../utils/SHARED-STATE-USAGE.md),
  // which doubles as the initial run — no separate "run once" call needed. sessionStateVersion
  // also fires immediately on subscribe, but by the time it's set up below, the scheduled
  // subscription above has already run the initial pass synchronously — the guard skips
  // that redundant second one, while still reacting to every real transition after.
  const unsubscribeScheduled = scheduled.subscribe(recomputeAndReschedule);
  const unsubscribeSessionState = sessionStateVersion.subscribe(() => {
    if (!initialRecomputeDone) return;
    recomputeAndReschedule();
  });

  // A backgrounded/throttled tab can suspend or delay setTimeout — recompute on return
  // to visible rather than trusting the timer alone, same pattern as upcoming-sessions.js.
  function onVisibilityChange() {
    if (document.visibilityState === 'visible') recomputeAndReschedule();
  }
  document.addEventListener('visibilitychange', onVisibilityChange);

  el._nsNotificationCleanup = () => {
    clearTimeout(timerId);
    unsubscribeScheduled();
    unsubscribeSessionState();
    document.removeEventListener('visibilitychange', onVisibilityChange);
  };
}
