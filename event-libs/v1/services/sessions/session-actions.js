import {
  auth, sessions, scheduled, pendingActions, liveStreamActiveIds, toggleSchedule, toggleFavorite,
  getEventApiConfig,
} from '../../utils/session-store.js';
import { isPostEvent, getNowMs } from '../../utils/session-state.js';
import { RfAccessError } from './rainfocus.js';

// Discriminated failure reason, kept UI-agnostic — callers decide their own toast/modal.
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
// Post-event, signed-in is enough — registration no longer gates these actions.
export function assertAuthorized() {
  const { isLoggedIn, isRegistered } = auth.value;
  if (isLoggedIn !== true) throw new SessionActionError('auth-required');
  const eventEndMs = getEventApiConfig()?.eventEndMs;
  if (isPostEvent(sessions.value, liveStreamActiveIds.value, getNowMs(), eventEndMs)) return;
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
    // RF can still reject as unregistered even if our own check passed.
    if (err instanceof RfAccessError) throw new SessionActionError('registration-required');
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

// toggleSchedule toggles by current state, so drop+add reuses it without bespoke swap logic.
export async function resolveScheduleConflict(conflict, incoming) {
  await toggleSchedule(conflict);
  await toggleSchedule(incoming);
}
