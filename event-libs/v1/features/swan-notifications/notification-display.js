import { upsertEntry, removeEntry } from './notification-store.js';

// Thin, never-throw wrapper around notification-store.js's mutations — a local write can't
// meaningfully fail, but callers only ever see true/false, never a throw, matching the same
// resilience contract as the rest of this feature's fire-and-forget calls.
export function upsertNotification(rfCode, entry) {
  try {
    upsertEntry(rfCode, entry);
    return true;
  } catch (err) {
    window.lana?.log(`[notification-display] failed to upsert notification for ${rfCode}: ${err.message}`);
    return false;
  }
}

export function removeNotification(rfCode) {
  try {
    removeEntry(rfCode);
    return true;
  } catch (err) {
    window.lana?.log(`[notification-display] failed to remove notification for ${rfCode}: ${err.message}`);
    return false;
  }
}
