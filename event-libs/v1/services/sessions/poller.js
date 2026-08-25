import { registerStreamIds, unregisterStreamIds, subscribe } from './mobile-rider-poller.js';

// Thin adapter over the shared mobile-rider-poller.js registry, preserving the
// startPolling/stopPolling call shape session-store.js already uses. Lets session-store.js
// batch into the same underlying fetchLiveStatus() call as upcoming-sessions.js/
// session-routing.js when they share the default interval, while still allowing a custom
// intervalMs (as this module's own tests do) for a fast, independent poll group.
let activeIds = [];
let activeIntervalMs = null;
let unsubscribe = null;

export function startPolling(mrSessions, env, onUpdate, intervalMs = 30_000) {
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
