import { fetchLiveStatus } from './mobile-rider.js';
import { getApiConfig } from '../../utils/session-store.js';

const DEFAULT_POLL_INTERVAL_MS = 30_000;

const groups = new Map();
const listeners = new Set();

function group(intervalMs) {
  let g = groups.get(intervalMs);
  if (!g) {
    g = { refCounts: new Map(), intervalId: null };
    groups.set(intervalMs, g);
  }
  return g;
}

async function tick(g) {
  const ids = [...g.refCounts.keys()];
  if (!ids.length) return;
  try {
    const { active, inactive } = await fetchLiveStatus(ids, getApiConfig()?.mrEnv);
    const result = { active: [...active], inactive: [...inactive] };
    listeners.forEach((entry) => entry.notify(result, ids));
  } catch (error) {
    window.lana?.log(`poller: poll failed: ${error.message}`);
  }
}

function ensurePolling(g, intervalMs) {
  if (g.intervalId) return;
  g.intervalId = setInterval(() => tick(g), intervalMs);
  queueMicrotask(() => tick(g));
}

function stopPollingIfIdle(g, intervalMs) {
  if (g.refCounts.size || !g.intervalId) return;
  clearInterval(g.intervalId);
  g.intervalId = null;
  groups.delete(intervalMs);
}

export function registerStreamIds(ids, { intervalMs = DEFAULT_POLL_INTERVAL_MS } = {}) {
  if (!ids?.length) return;
  const g = group(intervalMs);
  ids.forEach((id) => g.refCounts.set(id, (g.refCounts.get(id) || 0) + 1));
  ensurePolling(g, intervalMs);
}

export function unregisterStreamIds(ids, { intervalMs = DEFAULT_POLL_INTERVAL_MS } = {}) {
  if (!ids?.length) return;
  const g = groups.get(intervalMs);
  if (!g) return;
  ids.forEach((id) => {
    const count = g.refCounts.get(id) || 0;
    if (count <= 1) g.refCounts.delete(id);
    else g.refCounts.set(id, count - 1);
  });
  stopPollingIfIdle(g, intervalMs);
}

export function subscribe(listener, watchIds) {
  const watchSet = watchIds ? new Set(watchIds) : null;
  const entry = {
    notify(result, queriedIds) {
      if (!watchSet) {
        listener(result);
        return;
      }
      if (!queriedIds.some((id) => watchSet.has(id))) return;
      listener({
        active: result.active.filter((id) => watchSet.has(id)),
        inactive: result.inactive.filter((id) => watchSet.has(id)),
      });
    },
  };
  listeners.add(entry);
  return () => listeners.delete(entry);
}

// Thin adapter over the registry above, preserving the call shape session-store.js already
// uses. Lets session-store.js batch into the same underlying fetchLiveStatus() call as
// upcoming-sessions.js/session-routing.js when they share the default interval, while still
// allowing a custom intervalMs (as this module's own tests do) for a fast, independent poll
// group.
let activeIds = [];
let activeIntervalMs = null;
let unsubscribe = null;

export function startPolling(mrSessions, env, onUpdate, intervalMs = DEFAULT_POLL_INTERVAL_MS) {
  stopPolling();

  const ids = mrSessions.map((s) => s.mrStreamId).filter(Boolean);
  if (!ids.length) return null;

  activeIds = ids;
  activeIntervalMs = intervalMs;

  unsubscribe = subscribe(({ active, inactive }) => {
    onUpdate(new Set(active), new Set(inactive), Date.now());
    if (ids.every((id) => inactive.includes(id))) stopPolling();
  }, ids);

  registerStreamIds(ids, { intervalMs });
  return intervalMs;
}

export function stopPolling() {
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
  if (activeIds.length) unregisterStreamIds(activeIds, { intervalMs: activeIntervalMs });
  activeIds = [];
  activeIntervalMs = null;
}
