import { signal, batch } from '../../deps/htm-preact.js';
import { getNowMs } from '../../utils/session-state.js';
import { logError, logWarning } from '../../utils/lana-log.js';

const LOCAL_STATE_KEY = 'swan-notification-state-v3';
const STAGE_DISPLAY_PRIORITY = { live: 0, reminder: 1, 'on-demand': 2 };
const STAGE_RANK = { reminder: 1, live: 2, 'on-demand': 3 };

function readLocalState() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(LOCAL_STATE_KEY) || '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('invalid notification state');
    }
    return Object.fromEntries(Object.entries(parsed).filter(([, entry]) => {
      if (entry && typeof entry === 'object' && !Array.isArray(entry)) return true;
      logWarning('notification-store', 'ignoring an invalid notification entry');
      return false;
    }));
  } catch (err) {
    logError('notification-store', 'failed to read local state', err);
    return null;
  }
}

let state = readLocalState() || {};
let mutationDepth = 0;
let storageTimer = null;
let flushPromise = null;
let warnedAboutLocks = false;
const pendingMutations = [];
const removedRfCodes = new Set();

function toList() {
  return Object.entries(state)
    .map(([rfCode, entry]) => ({ ...entry, rfCode }))
    .sort((a, b) => (STAGE_DISPLAY_PRIORITY[a.stage] ?? 99) - (STAGE_DISPLAY_PRIORITY[b.stage] ?? 99)
      || (b.seq || 0) - (a.seq || 0));
}

export const notifications = signal(toList());
export const notificationsReady = signal(false);
let published = JSON.stringify(notifications.value);

function sync() {
  if (mutationDepth) return;
  const entries = toList();
  const serialized = JSON.stringify(entries);
  if (serialized === published) return;
  published = serialized;
  notifications.value = entries;
}

function adopt(next) {
  // A different tab can remove an entry while this page still has it scheduled.
  // Remember the removal only for this page lifetime, not as persisted tombstones.
  Object.keys(state).filter((rfCode) => !(rfCode in next)).forEach((rfCode) => removedRfCodes.add(rfCode));
  state = next;
}

function refreshState() {
  const persisted = readLocalState();
  if (!persisted) return;
  adopt(pendingMutations.reduce((next, mutate) => mutate(next), persisted));
}

function persistPending() {
  const persisted = readLocalState();
  if (!persisted) return false;
  const next = pendingMutations.reduce((value, mutate) => mutate(value), persisted);
  try {
    if (JSON.stringify(next) !== JSON.stringify(persisted)) {
      window.localStorage.setItem(LOCAL_STATE_KEY, JSON.stringify(next));
    }
    pendingMutations.length = 0;
    adopt(next);
    sync();
    return true;
  } catch (err) {
    logError('notification-store', 'failed to persist local state; will retry', err);
    return false;
  }
}

export async function flushNotifications() {
  if (flushPromise) return flushPromise;
  if (!pendingMutations.length) return true;
  // All supporting tabs serialize read-modify-write of the existing single map.
  // Without Web Locks, retain the original synchronous persistence as a fallback.
  if (!navigator.locks?.request) {
    if (!warnedAboutLocks) {
      logWarning('notification-store', 'Web Locks unavailable; concurrent tab writes cannot be serialized');
      warnedAboutLocks = true;
    }
    return persistPending();
  }
  flushPromise = (async () => {
    let saved;
    do {
      saved = await navigator.locks.request(LOCAL_STATE_KEY, persistPending);
    } while (saved && pendingMutations.length);
    return saved;
  })();
  try {
    return await flushPromise;
  } catch (err) {
    logError('notification-store', 'failed to acquire the notification storage lock; will retry', err);
    return false;
  } finally {
    flushPromise = null;
  }
}

function mutateState(mutate) {
  if (!mutationDepth) refreshState();
  const next = mutate(state);
  if (next === state) return false;
  pendingMutations.push(mutate);
  adopt(next);
  sync();
  if (!mutationDepth) flushNotifications();
  return true;
}

export function batchNotifications(callback) {
  if (!mutationDepth) refreshState();
  return batch(() => {
    mutationDepth += 1;
    try {
      return callback();
    } finally {
      mutationDepth -= 1;
      if (!mutationDepth) {
        sync();
        flushNotifications();
      }
    }
  });
}

export function setNotificationsReady(ready) {
  if (ready !== notificationsReady.value) notificationsReady.value = ready;
}

window.addEventListener('storage', (e) => {
  if (e.storageArea && e.storageArea !== window.localStorage) return;
  if (e.key !== null && e.key !== LOCAL_STATE_KEY) return;
  if (storageTimer !== null) return;
  storageTimer = setTimeout(() => {
    storageTimer = null;
    // newValue can be an older queued snapshot than the value now in storage.
    refreshState();
    sync();
  }, 0);
});

export function getEntry(rfCode) {
  if (!mutationDepth) refreshState();
  return state[rfCode];
}

export function getEntries() {
  if (!mutationDepth) refreshState();
  return toList();
}

export function allowNotification(rfCode) {
  removedRfCodes.delete(rfCode);
}

export function wasNotificationRemoved(rfCode) {
  return removedRfCodes.has(rfCode);
}

export function upsertEntry(rfCode, entry) {
  const now = getNowMs();
  const expectedExisting = !!getEntry(rfCode);
  allowNotification(rfCode);
  mutateState((current) => {
    const prev = current[rfCode];
    // An advancement computed before another tab's removal must not recreate it.
    if ((expectedExisting && !prev) || STAGE_RANK[prev?.stage] > STAGE_RANK[entry.stage]) return current;
    const sequence = Math.max(0, ...Object.values(current).map((value) => value.seq || 0)) + 1;
    return {
      ...current,
      [rfCode]: {
        ...prev,
        ...entry,
        // One entry per session: a stage advance keeps the user's read/dismiss choice.
        read: prev?.read ?? false,
        dismissed: prev?.dismissed ?? false,
        updatedAt: now,
        seq: sequence,
      },
    };
  });
}

// Timing corrections are not new notifications. Compare the observed payload again
// under the storage lock, but merge the latest read/dismiss flags from other tabs.
export function correctEntry(rfCode, entry, expected) {
  const changed = mutateState((current) => {
    const prev = current[rfCode];
    if (!prev || !expected) return current;
    const keys = new Set([...Object.keys(prev), ...Object.keys(expected)]);
    keys.delete('read');
    keys.delete('dismissed');
    if ([...keys].some((key) => JSON.stringify(prev[key]) !== JSON.stringify(expected[key]))) return current;
    const next = { ...current };
    if (entry) next[rfCode] = { ...prev, ...entry };
    else delete next[rfCode];
    return next;
  });
  // A premature entry must become eligible again when its reminder window arrives.
  if (changed && !entry) allowNotification(rfCode);
  return changed;
}

export function removeEntry(rfCode) {
  mutateState((current) => {
    if (!(rfCode in current)) return current;
    const next = { ...current };
    delete next[rfCode];
    return next;
  });
}

function setFlag(rfCode, flag) {
  mutateState((current) => {
    const entry = current[rfCode];
    if (!entry || entry[flag]) return current;
    return { ...current, [rfCode]: { ...entry, [flag]: true } };
  });
}

export function dismissEntry(rfCode) {
  setFlag(rfCode, 'dismissed');
}

export function markRead(rfCode) {
  setFlag(rfCode, 'read');
}

export function markAllRead() {
  batchNotifications(() => getEntries().forEach((entry) => markRead(entry.rfCode)));
}

export function daysToMs(days, fallbackDays) {
  const n = Number(days);
  return (Number.isFinite(n) && n >= 0 ? n : fallbackDays) * 24 * 60 * 60 * 1000;
}

export function pruneStale(now, persistTillDays, expirationDays) {
  const onDemandMaxAgeMs = daysToMs(persistTillDays, 3);
  const allStageMaxAgeMs = daysToMs(expirationDays, 14);
  mutateState((current) => {
    const staleRfCodes = Object.keys(current).filter((rfCode) => {
      const entry = current[rfCode];
      const anchor = Number.isFinite(entry.endTimeMs) ? entry.endTimeMs : entry.updatedAt;
      if (now - anchor > onDemandMaxAgeMs && (entry.stage === 'on-demand' || Number.isFinite(entry.endTimeMs))) return true;
      return now - entry.updatedAt > allStageMaxAgeMs;
    });
    if (!staleRfCodes.length) return current;
    const next = { ...current };
    staleRfCodes.forEach((rfCode) => { delete next[rfCode]; });
    return next;
  });
}
