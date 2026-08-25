import { fetchLiveStatus } from './mobile-rider.js';
import { getApiConfig } from '../../utils/session-store.js';

const POLL_INTERVAL_MS = 30_000;

const refCounts = new Map();
const listeners = new Set();
let intervalId = null;

async function tick() {
  const ids = [...refCounts.keys()];
  if (!ids.length) return;
  try {
    const { active, inactive } = await fetchLiveStatus(ids, getApiConfig()?.mrEnv);
    listeners.forEach((listener) => listener({ active: [...active], inactive: [...inactive] }));
  } catch (error) {
    window.lana?.log(`mobile-rider-poller: poll failed: ${error.message}`);
  }
}

function ensurePolling() {
  if (intervalId) return;
  intervalId = setInterval(tick, POLL_INTERVAL_MS);
  queueMicrotask(tick);
}

function stopPollingIfIdle() {
  if (refCounts.size || !intervalId) return;
  clearInterval(intervalId);
  intervalId = null;
}

export function registerStreamIds(ids) {
  if (!ids?.length) return;
  ids.forEach((id) => refCounts.set(id, (refCounts.get(id) || 0) + 1));
  ensurePolling();
}

export function unregisterStreamIds(ids) {
  if (!ids?.length) return;
  ids.forEach((id) => {
    const count = refCounts.get(id) || 0;
    if (count <= 1) refCounts.delete(id);
    else refCounts.set(id, count - 1);
  });
  stopPollingIfIdle();
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
