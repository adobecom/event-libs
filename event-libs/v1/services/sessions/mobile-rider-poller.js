import { fetchLiveStatus } from './mobile-rider.js';
import { getApiConfig } from '../../utils/session-store.js';

const DEFAULT_POLL_INTERVAL_MS = 30_000;

// Grouped by intervalMs so every real (default-cadence) consumer batches into one shared
// fetchLiveStatus() call, while a caller needing a different cadence (e.g. a fast-ticking
// test) gets its own independent group/interval without disturbing the default one.
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
    window.lana?.log(`mobile-rider-poller: poll failed: ${error.message}`);
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

// `watchIds`, when given, scopes this listener to ticks whose queried id set overlaps it —
// based on what was queried, not what came back, so a real "queried but absent from either
// list" result still notifies (unlike a tick from a wholly unrelated group/interval, which
// never does). The listener itself still only ever sees `{ active, inactive }`, pre-filtered
// down to just its own ids. Omit `watchIds` to get every tick's raw, unfiltered result.
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
