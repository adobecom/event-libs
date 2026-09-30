import { signal, batch } from '../../deps/htm-preact.js';
import { getNowMs } from '../../utils/session-state.js';
import { logError } from '../../utils/lana-log.js';

const LOCAL_STATE_PREFIX = 'swan-notification-state-v4:';
const STAGE_DISPLAY_PRIORITY = { live: 0, reminder: 1, 'on-demand': 2 };
const STAGE_RANK = { reminder: 1, live: 2, 'on-demand': 3 };

let scopePrefix = null;
let state = {};
let sequence = 0;
let storageTimer = null;
let published = '[]';
let mutationDepth = 0;
let syncPending = false;
const pendingWrites = new Map();

export const notifications = signal([]);
export const notificationsReady = signal(false);

function entryKey(rfCode) {
  return `${scopePrefix}${encodeURIComponent(rfCode)}:entry`;
}

function flagKey(rfCode, stage, flag) {
  return `${scopePrefix}${encodeURIComponent(rfCode)}:${stage}:${flag}`;
}

function storageKeys(prefix) {
  return [...new Set([
    ...Array.from({ length: window.localStorage.length }, (_, index) => window.localStorage.key(index)),
    ...pendingWrites.keys(),
  ])].filter((key) => key?.startsWith(prefix));
}

function read(key) {
  return pendingWrites.has(key) ? pendingWrites.get(key) : window.localStorage.getItem(key);
}

function toList() {
  return Object.entries(state)
    .filter(([, entry]) => !entry.unscheduled && !entry.expired)
    .map(([rfCode, entry]) => ({ ...entry, rfCode }))
    .sort((a, b) => (STAGE_DISPLAY_PRIORITY[a.stage] ?? 99) - (STAGE_DISPLAY_PRIORITY[b.stage] ?? 99)
      || b.seq - a.seq);
}

function sync() {
  if (mutationDepth) {
    syncPending = true;
    return;
  }
  sequence = Math.max(sequence, ...Object.values(state).map((entry) => entry.seq || 0));
  const entries = toList();
  const serialized = JSON.stringify(entries);
  if (serialized === published) return;
  published = serialized;
  notifications.value = entries;
}

function readEntry(rfCode) {
  const raw = read(entryKey(rfCode));
  if (raw === null) return undefined;
  try {
    const entry = JSON.parse(raw);
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)
      || (!entry.unscheduled && !STAGE_RANK[entry.stage])) {
      throw new Error('invalid notification entry');
    }
    return {
      ...entry,
      read: read(flagKey(rfCode, entry.stage, 'read')) === 'true',
      dismissed: read(flagKey(rfCode, entry.stage, 'dismissed')) === 'true',
    };
  } catch (err) {
    logError('notification-store', 'ignoring corrupt notification entry', err);
    return undefined;
  }
}

function refreshEntry(rfCode) {
  if (!scopePrefix) return undefined;
  try {
    const entry = readEntry(rfCode);
    if (entry) {
      state[rfCode] = entry;
      sequence = Math.max(sequence, entry.seq || 0);
    } else {
      delete state[rfCode];
    }
    return entry;
  } catch (err) {
    logError('notification-store', 'failed to read notification entry', err);
    return state[rfCode];
  }
}

function refreshState() {
  if (!scopePrefix) return;
  try {
    const next = {};
    storageKeys(scopePrefix).filter((key) => key.endsWith(':entry')).forEach((key) => {
      try {
        const rfCode = decodeURIComponent(key.slice(scopePrefix.length, -':entry'.length));
        const entry = readEntry(rfCode);
        if (entry) next[rfCode] = entry;
      } catch (err) {
        logError('notification-store', 'ignoring corrupt notification entry', err);
      }
    });
    state = next;
  } catch (err) {
    logError('notification-store', 'failed to read local state', err);
  }
}

function write(key, value) {
  try {
    window.localStorage.setItem(key, value);
    pendingWrites.delete(key);
  } catch (err) {
    pendingWrites.set(key, value);
    logError('notification-store', 'failed to persist local state', err);
  }
}

function retryPendingWrites() {
  pendingWrites.forEach((value, key) => write(key, value));
}

export function batchNotifications(callback) {
  retryPendingWrites();
  return batch(() => {
    mutationDepth += 1;
    try {
      return callback();
    } finally {
      mutationDepth -= 1;
      if (!mutationDepth && syncPending) {
        syncPending = false;
        sync();
      }
    }
  });
}

// No unscoped hydration: the legacy v3 map has no reliable event/attendee ownership.
export function setNotificationScope(eventId, userId, environment) {
  const next = eventId && userId && environment
    ? `${LOCAL_STATE_PREFIX}${encodeURIComponent(JSON.stringify([eventId, userId, environment]))}:`
    : null;
  if (next === scopePrefix) return;
  retryPendingWrites();
  clearTimeout(storageTimer);
  storageTimer = null;
  notificationsReady.value = false;
  scopePrefix = next;
  state = {};
  sequence = 0;
  refreshState();
  sync();
}

export function setNotificationsReady(ready) {
  const next = !!scopePrefix && ready;
  if (next !== notificationsReady.value) notificationsReady.value = next;
}

// A queued StorageEvent's newValue may predate this tab's own dismissal. Always read
// current storage instead. Separate entry/flag keys prevent unrelated writes, or a
// stage refresh in another tab, from overwriting read/dismiss actions.
window.addEventListener('storage', (e) => {
  if (!scopePrefix || (e.storageArea && e.storageArea !== window.localStorage)) return;
  if (e.key !== null && !e.key.startsWith(scopePrefix)) return;
  if (storageTimer !== null) return;
  storageTimer = setTimeout(() => {
    storageTimer = null;
    refreshState();
    sync();
  }, 0);
});

export function getEntry(rfCode) {
  return refreshEntry(rfCode);
}

export function getEntries() {
  refreshState();
  return toList();
}

export function upsertEntry(rfCode, entry) {
  if (!scopePrefix) throw new Error('notification scope is not initialized');
  const prev = getEntry(rfCode);
  if (prev?.unscheduled || STAGE_RANK[prev?.stage] > STAGE_RANK[entry.stage]) return;
  const stageChanged = !prev || prev.stage !== entry.stage;
  sequence += 1;
  const next = {
    ...prev,
    ...entry,
    read: stageChanged ? false : (prev?.read ?? false),
    dismissed: stageChanged ? false : (prev?.dismissed ?? false),
    expired: stageChanged ? false : (prev?.expired ?? false),
    updatedAt: getNowMs(),
    seq: sequence,
  };
  state = { ...state, [rfCode]: next };
  write(entryKey(rfCode), JSON.stringify(next));
  sync();
}

export function removeEntry(rfCode) {
  if (!scopePrefix) return;
  try {
    storageKeys(`${scopePrefix}${encodeURIComponent(rfCode)}:`)
      .forEach((key) => {
        window.localStorage.removeItem(key);
        pendingWrites.delete(key);
      });
  } catch (err) {
    logError('notification-store', 'failed to remove local state', err);
  }
  const next = { ...state };
  delete next[rfCode];
  state = next;
  sync();
}

// Keep an unschedule tombstone so a different tab's stale scheduled set cannot
// recreate the entry. Only a successful fresh schedule or explicit add clears it.
export function setSessionScheduled(rfCode, isScheduled) {
  const existing = getEntry(rfCode);
  if (isScheduled) {
    if (existing?.unscheduled) removeEntry(rfCode);
    return;
  }
  if (!scopePrefix || existing?.unscheduled) return;
  const next = { unscheduled: true, updatedAt: getNowMs() };
  state = { ...state, [rfCode]: next };
  write(entryKey(rfCode), JSON.stringify(next));
  sync();
}

function setFlag(rfCode, flag) {
  const entry = getEntry(rfCode);
  if (!entry || entry.unscheduled || entry[flag]) return;
  state = { ...state, [rfCode]: { ...entry, [flag]: true } };
  write(flagKey(rfCode, entry.stage, flag), 'true');
  sync();
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

export function expireEntry(rfCode) {
  const entry = getEntry(rfCode);
  if (!entry || entry.expired || entry.unscheduled) return;
  const next = { ...entry, expired: true };
  state = { ...state, [rfCode]: next };
  write(entryKey(rfCode), JSON.stringify(next));
  sync();
}

export function daysToMs(days, fallbackDays) {
  const n = Number(days);
  return (Number.isFinite(n) && n >= 0 ? n : fallbackDays) * 24 * 60 * 60 * 1000;
}

export function pruneStale(now, persistTillDays, expirationDays) {
  const onDemandMaxAgeMs = daysToMs(persistTillDays, 3);
  const allStageMaxAgeMs = daysToMs(expirationDays, 14);
  // Unscheduled tombstones stay until a fresh schedule can confirm membership.
  const staleEntries = getEntries().filter((entry) => {
    const anchor = Number.isFinite(entry.endTimeMs) ? entry.endTimeMs : entry.updatedAt;
    if (entry.stage === 'on-demand' && now - anchor > onDemandMaxAgeMs) return true;
    return now - entry.updatedAt > allStageMaxAgeMs;
  });
  if (!staleEntries.length) return;
  staleEntries.forEach((entry) => {
    // Retain the stage guard even after display expiry, including the safety-net
    // expiry of a live/reminder entry whose catalog record stopped updating.
    const next = { ...entry, expired: true };
    state = { ...state, [entry.rfCode]: next };
    write(entryKey(entry.rfCode), JSON.stringify(next));
  });
  sync();
}
