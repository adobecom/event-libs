// Pure, network-free functions for classifying a scheduled session into SWAN's
// reminder/live/on-demand notification lifecycle. Builds on top of deriveSessionState()
// (../../../utils/session-state.js) for the live/on-demand boundary — that function is
// already MR-livestream-poll-aware, hasOnDemandFormat-aware, and DVR-relevant, and every
// other consumer of session lifecycle state in this repo relies on it; reimplementing
// that boundary here would silently diverge from it. This module only adds what
// deriveSessionState doesn't have: a "reminder" sub-state for the lead-time window
// before start, which deriveSessionState folds into a single coarse 'upcoming' bucket.
import { deriveSessionState } from '../../../utils/session-state.js';

export const REMINDER_STATES = {
  IDLE: 'idle',
  REMINDER: 'reminder',
  LIVE: 'live',
  ON_DEMAND: 'on-demand',
};

function minutesToMs(minutes) {
  return minutes * 60_000;
}

export function classifyReminderState(session, liveStreamActiveIds, leadTimeMinutes, nowMs) {
  const state = deriveSessionState(session, liveStreamActiveIds, nowMs);
  if (state === 'on-demand') return REMINDER_STATES.ON_DEMAND;
  if (state === 'live') return REMINDER_STATES.LIVE;

  // state === 'upcoming' — deriveSessionState() guarantees nowMs < startTimeUtc here,
  // for both MR and non-MR sessions.
  const start = Date.parse(session.startTimeUtc);
  if (nowMs >= start - minutesToMs(leadTimeMinutes)) return REMINDER_STATES.REMINDER;
  return REMINDER_STATES.IDLE;
}

// ms until this session's next relevant boundary, or null once there's nothing to wait
// for via a clock-based timer. Used to schedule a single self-rescheduling timer instead
// of polling on a fixed interval.
export function computeNextTransitionMs(session, liveStreamActiveIds, leadTimeMinutes, nowMs) {
  const state = deriveSessionState(session, liveStreamActiveIds, nowMs);

  if (state === 'on-demand') return null; // nothing left to wait for

  if (state === 'live') {
    // Non-MR sessions transition to on-demand at a deterministic clock boundary
    // (endTimeUtc) — safe to schedule directly. MR sessions transition when the
    // media-relay poll deactivates, not at a clock time; scheduling a wake-up at
    // endTimeUtc for those would refire every tick at 0ms until the poll catches up.
    // That transition is already covered by the sessionStateVersion subscription in
    // ns-notification.js (session-state-ticker.js re-derives state on every poll tick).
    if (session.mrStreamId) return null;
    return Date.parse(session.endTimeUtc) - nowMs;
  }

  // state === 'upcoming'
  const start = Date.parse(session.startTimeUtc);
  const reminderAt = start - minutesToMs(leadTimeMinutes);
  if (nowMs >= reminderAt) return start - nowMs; // wake at start to reclassify live/on-demand
  return reminderAt - nowMs; // wake at the reminder boundary
}

export function buildNotificationPayload(session, state, eventConfig = {}) {
  return {
    id: session.id,
    label: state,
    title: eventConfig.title || 'Adobe Event Session',
    message: session.title || '',
    url: session.sessionPageUrl || session.cardUrl || '',
    startTimeUtc: session.startTimeUtc,
    endTimeUtc: session.endTimeUtc,
    createdAt: Date.now(),
  };
}

// previousById/nextById: Map<session.id, ReminderState>. Anything in previousById but
// missing from nextById — unscheduled, or dropped from the catalog entirely — is an
// orphan to remove, even though it was never "desired" this pass.
export function diffNotificationState(previousById, nextById, sessionsById, eventConfig) {
  const toAdd = [];
  const toEdit = [];

  nextById.forEach((state, id) => {
    const session = sessionsById.get(id);
    if (!session) return;
    if (!previousById.has(id)) {
      toAdd.push(buildNotificationPayload(session, state, eventConfig));
    } else if (previousById.get(id) !== state) {
      toEdit.push({ id, patch: buildNotificationPayload(session, state, eventConfig) });
    }
  });

  const toRemove = [...previousById.keys()].filter((id) => !nextById.has(id));

  return { toAdd, toEdit, toRemove };
}
