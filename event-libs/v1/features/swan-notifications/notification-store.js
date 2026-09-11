import { signal } from '../../deps/htm-preact.js';

// Single local store: doubles as "what stage is currently registered" (SWAN's own
// forward-only stage guard, see swan-notifications.js) and the notification widget's
// render data — there's no external engine left to keep in sync with, so one
// localStorage-backed map is enough. v2 -> v3: dropped `campaignId` (no more per-stage
// rule ids to track/delete against an engine), added the display fields the widget needs
// (title/times/actionUrl/iconUrl/read/updatedAt/seq).
const LOCAL_STATE_KEY = 'swan-notification-state-v3';

function readLocalState() {
  try {
    return JSON.parse(window.localStorage.getItem(LOCAL_STATE_KEY) || '{}');
  } catch (err) {
    window.lana?.log(`[notification-store] local state was corrupt, resetting: ${err.message}`);
    return {};
  }
}

function writeLocalState(state) {
  try {
    window.localStorage.setItem(LOCAL_STATE_KEY, JSON.stringify(state));
  } catch (err) {
    window.lana?.log(`[notification-store] failed to persist local state: ${err.message}`);
  }
}

function toList(state) {
  return Object.entries(state)
    .map(([rfCode, entry]) => ({ rfCode, ...entry }))
    // `seq`, not `updatedAt`, breaks ties — several entries can share the same
    // Date.now() millisecond (e.g. a reconcile pass touching multiple sessions back to
    // back), which would otherwise make ordering effectively random across ties.
    .sort((a, b) => b.seq - a.seq);
}

let state = readLocalState();
let sequence = Math.max(0, ...Object.values(state).map((entry) => entry.seq || 0));

// The widget's sole data source — a plain Preact signal, no CustomEvent plumbing needed
// since it's imported directly by both swan-notifications.js's write path (via
// notification-display.js) and notification-widget.js's render path, matching
// features/toast/toast.js's existing signal-driven pattern.
export const notifications = signal(toList(state));

function persistAndSync() {
  writeLocalState(state);
  notifications.value = toList(state);
}

export function getEntry(rfCode) {
  return state[rfCode];
}

export function getEntries() {
  return notifications.value;
}

// Marks unread again whenever the stage actually advances (a genuinely new thing to show
// the attendee), but leaves an already-read entry's read flag alone on a no-op re-write.
export function upsertEntry(rfCode, entry) {
  const prev = state[rfCode];
  const stageChanged = !prev || prev.stage !== entry.stage;
  sequence += 1;
  state = {
    ...state,
    [rfCode]: {
      ...prev,
      ...entry,
      read: stageChanged ? false : (prev?.read ?? false),
      updatedAt: Date.now(),
      seq: sequence,
    },
  };
  persistAndSync();
}

export function removeEntry(rfCode) {
  if (!(rfCode in state)) return;
  const next = { ...state };
  delete next[rfCode];
  state = next;
  persistAndSync();
}

export function markRead(rfCode) {
  if (!state[rfCode] || state[rfCode].read) return;
  state = { ...state, [rfCode]: { ...state[rfCode], read: true } };
  persistAndSync();
}

export function markAllRead() {
  const unreadRfCodes = Object.keys(state).filter((rfCode) => !state[rfCode].read);
  if (!unreadRfCodes.length) return;
  const next = { ...state };
  unreadRfCodes.forEach((rfCode) => { next[rfCode] = { ...next[rfCode], read: true }; });
  state = next;
  persistAndSync();
}

// Drops on-demand entries older than persistTillDays so the panel doesn't accumulate
// forever — reminder/live entries are never pruned this way since they're still "current."
export function pruneStale(now, persistTillDays) {
  // `|| 3` would treat an explicit 0 (prune on-demand entries immediately) as falsy and
  // silently substitute the 3-day default instead — only a genuinely invalid value should
  // fall back.
  const days = Number(persistTillDays);
  const effectiveDays = Number.isFinite(days) && days >= 0 ? days : 3;
  const maxAgeMs = effectiveDays * 24 * 60 * 60 * 1000;
  const staleRfCodes = Object.entries(state)
    .filter(([, entry]) => entry.stage === 'on-demand' && now - entry.updatedAt > maxAgeMs)
    .map(([rfCode]) => rfCode);
  if (!staleRfCodes.length) return;
  const next = { ...state };
  staleRfCodes.forEach((rfCode) => { delete next[rfCode]; });
  state = next;
  persistAndSync();
}
