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

// Live always sorts above Upcoming/On-Demand regardless of recency, matching legacy SWAN
// 1.0's resortSwanNotifications() — a live session shouldn't get buried under an on-demand
// entry that merely happened to update more recently.
const STAGE_DISPLAY_PRIORITY = { live: 0, reminder: 1, 'on-demand': 2 };

function toList(state) {
  return Object.entries(state)
    .map(([rfCode, entry]) => ({ rfCode, ...entry }))
    .sort((a, b) => {
      const priorityDiff = (STAGE_DISPLAY_PRIORITY[a.stage] ?? 99) - (STAGE_DISPLAY_PRIORITY[b.stage] ?? 99);
      if (priorityDiff !== 0) return priorityDiff;
      // `seq`, not `updatedAt`, breaks ties — several entries can share the same
      // Date.now() millisecond (e.g. a reconcile pass touching multiple sessions back to
      // back), which would otherwise make ordering effectively random across ties.
      return b.seq - a.seq;
    });
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

// Cross-tab sync: a `storage` event fires in every OTHER tab of the same origin whenever one
// tab writes this key (never in the tab that made the write), so read/dismiss actions taken
// in one tab reflect live in any other open tab, without a page reload. Free with the
// existing localStorage writes — no BroadcastChannel needed.
window.addEventListener('storage', (e) => {
  if (e.key !== LOCAL_STATE_KEY) return;
  try {
    const parsed = JSON.parse(e.newValue || '{}');
    // JSON.parse('null')/('42')/('"x"') all succeed without throwing — only a genuine
    // object is a valid state shape; anything else would otherwise crash every later
    // Object.values(state)/state[rfCode] access for the rest of the page session.
    state = (parsed && typeof parsed === 'object') ? parsed : {};
  } catch (err) {
    window.lana?.log(`[notification-store] cross-tab storage event carried corrupt state, resetting: ${err.message}`);
    state = {};
  }
  sequence = Math.max(0, ...Object.values(state).map((entry) => entry.seq || 0));
  notifications.value = toList(state);
});

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

function daysToMs(days, fallbackDays) {
  // `|| fallbackDays` would treat an explicit 0 (prune immediately) as falsy and silently
  // substitute the fallback instead — only a genuinely invalid value should fall back.
  const n = Number(days);
  const effectiveDays = Number.isFinite(n) && n >= 0 ? n : fallbackDays;
  return effectiveDays * 24 * 60 * 60 * 1000;
}

// Drops on-demand entries older than persistTillDays so the panel doesn't accumulate forever,
// plus a stage-independent safety-net wipe at expirationDays (mirroring legacy SWAN 1.0's
// event-wide notifExpirationDate) for any entry — reminder or live included — that never gets
// reconciled further, e.g. a session whose catalog record silently stops updating.
export function pruneStale(now, persistTillDays, expirationDays) {
  const onDemandMaxAgeMs = daysToMs(persistTillDays, 3);
  const allStageMaxAgeMs = daysToMs(expirationDays, 14);
  const staleRfCodes = Object.entries(state)
    .filter(([, entry]) => {
      const age = now - entry.updatedAt;
      if (entry.stage === 'on-demand' && age > onDemandMaxAgeMs) return true;
      return age > allStageMaxAgeMs;
    })
    .map(([rfCode]) => rfCode);
  if (!staleRfCodes.length) return;
  const next = { ...state };
  staleRfCodes.forEach((rfCode) => { delete next[rfCode]; });
  state = next;
  persistAndSync();
}
