// Mode router — the only entry point session-store.js imports. The `swan-notifications`
// metadata flag selects which underlying implementation actually runs:
// 'feds' -> swan-notifications-feds.js (this repo's local widget)
// 'unc'  -> swan-notifications-unc.js (milo gnav's own UNC engine, ported from PR #276)
// anything else ('off', missing, garbage) -> no-op
import { getSwanMode } from './swan-config.js';
import * as feds from './swan-notifications-feds.js';
import * as unc from './swan-notifications-unc.js';

function impl() {
  const mode = getSwanMode();
  if (mode === 'feds') return feds;
  if (mode === 'unc') return unc;
  return null;
}

export function notifySessionScheduled(session) {
  return impl()?.notifySessionScheduled(session);
}

export function notifySessionUnscheduled(session) {
  return impl()?.notifySessionUnscheduled(session);
}

// isScheduleKnown is feds mode's orphan-cleanup gate only — unc mode's implementation takes
// just two params and ignores the extra argument.
export function reconcileSwanNotifications(getSessions, getScheduled, isScheduleKnown) {
  return impl()?.reconcileSwanNotifications(getSessions, getScheduled, isScheduleKnown);
}
