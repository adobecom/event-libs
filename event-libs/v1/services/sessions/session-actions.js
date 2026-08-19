import {
  auth, sessions, scheduled, pendingActions, toggleSchedule, toggleFavorite,
} from '../../utils/session-store.js';

// Discriminated failure reason so callers can decide their own UI (toast copy,
// login/register CTA, conflict modal) without this module knowing about any of it —
// it has to stay UI-agnostic since both Preact and vanilla blocks call it.
export class SessionActionError extends Error {
  constructor(reason, meta = {}) {
    super(reason);
    this.reason = reason; // 'auth-required' | 'registration-required' | 'conflict' | 'network'
    this.meta = meta;
  }
}

export function hasTimeConflict(a, b) {
  const aStart = Date.parse(a.startTimeUtc);
  const aEnd = Date.parse(a.endTimeUtc);
  const bStart = Date.parse(b.startTimeUtc);
  const bEnd = Date.parse(b.endTimeUtc);
  return aStart < bEnd && aEnd > bStart;
}

function findScheduleConflict(incoming, allSessions, scheduledIds) {
  return allSessions.find(
    (s) => s.id !== incoming.id && scheduledIds.has(s.id) && hasTimeConflict(s, incoming),
  ) || null;
}

// Exported so action-feedback.js's checkViewAccess() can reuse the same check.
export function assertAuthorized() {
  const { isLoggedIn, isRegistered } = auth.value;
  if (isLoggedIn !== true) throw new SessionActionError('auth-required');
  if (isRegistered !== true) throw new SessionActionError('registration-required');
}

export async function toggleScheduleAction(session, { showConflictModal = false } = {}) {
  assertAuthorized();
  if (pendingActions.value.has(session.id)) return;

  const isScheduled = scheduled.value.has(session.id);
  if (!isScheduled && showConflictModal) {
    const conflict = findScheduleConflict(session, sessions.value, scheduled.value);
    if (conflict) throw new SessionActionError('conflict', { conflict, incoming: session });
  }

  try {
    await toggleSchedule(session);
  } catch (err) {
    throw new SessionActionError('network', { cause: err });
  }
}

export async function toggleFavoriteAction(session) {
  assertAuthorized();
  if (pendingActions.value.has(session.id)) return;

  try {
    await toggleFavorite(session);
  } catch (err) {
    throw new SessionActionError('network', { cause: err });
  }
}

// Used by a caller's conflict-modal "keep incoming" confirm handler — toggleSchedule
// toggles based on current state, so removing the conflict then adding the incoming
// session reuses the same mutator without bespoke swap logic.
export async function resolveScheduleConflict(conflict, incoming) {
  await toggleSchedule(conflict);
  await toggleSchedule(incoming);
}
