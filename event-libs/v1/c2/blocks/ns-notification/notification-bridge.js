// Thin, always-delegate wrappers over window.eventNotificationBridge — the proposed
// client-push contract this block calls against (see
// docs/PROPOSED-NOTIFICATION-API-CONTRACT.md). ns-notification.js never touches the
// global directly: swapping the mock for a real implementation only ever touches this
// file and mock-notification-bridge.js.
import { installMockNotificationBridge } from './mock-notification-bridge.js';

function isContractShaped(candidate) {
  return !!candidate
    && typeof candidate.add === 'function'
    && typeof candidate.edit === 'function'
    && typeof candidate.remove === 'function'
    && typeof candidate.list === 'function'
    && typeof candidate.subscribe === 'function';
}

// Installs the mock only if nothing contract-shaped is already present — leaves a real
// implementation (or a manually-defined stub for QA) untouched. This feature-detection
// check is the entire "real path": no other branch in this block needs to know whether
// it's talking to the mock or the real thing.
export function ensureNotificationBridge() {
  if (!isContractShaped(window.eventNotificationBridge)) {
    window.eventNotificationBridge = installMockNotificationBridge();
  }
  return window.eventNotificationBridge;
}

export function add(notification) {
  return window.eventNotificationBridge?.add(notification) ?? false;
}

export function edit(id, patch) {
  return window.eventNotificationBridge?.edit(id, patch) ?? false;
}

export function remove(id) {
  return window.eventNotificationBridge?.remove(id) ?? false;
}

export function list() {
  return window.eventNotificationBridge?.list() ?? [];
}

export function subscribe(fn) {
  return window.eventNotificationBridge?.subscribe(fn) ?? (() => {});
}
