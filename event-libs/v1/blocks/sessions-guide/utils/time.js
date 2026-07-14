// Promoted to ../../../utils/session-state.js since the shared session-state-ticker
// needs it and utils/ shouldn't reach back into this block's directory. Re-exported here
// so existing call sites in this block don't need to change their import path.
export { getNowMs } from '../../../utils/session-state.js';

export function detectUserTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

// Some real sessions (canceled, TBD, overflow-room placeholders) have no scheduled
// sessionTime yet, so startTimeUtc/endTimeUtc can be ''. Intl.DateTimeFormat.format()
// throws RangeError on an Invalid Date rather than degrading gracefully like
// Date.parse() (used by isSessionLive() etc. below) — this keeps every formatter here
// call-site-safe without requiring every caller to guard first.
function safeDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatSessionTime(utcIso, userTz) {
  const date = safeDate(utcIso);
  if (!date) return '';
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: userTz,
    timeZoneName: 'short',
  }).format(date);
}

export function formatShortTime(utcIso, userTz) {
  const date = safeDate(utcIso);
  if (!date) return '';
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: userTz,
  }).format(date);
}

export function formatSessionDate(utcIso, userTz) {
  const date = safeDate(utcIso);
  if (!date) return '';
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: userTz,
  }).format(date);
}

export function isSessionLive(session, nowMs) {
  const start = Date.parse(session.startTimeUtc);
  const end = Date.parse(session.endTimeUtc);
  return nowMs >= start && nowMs <= end;
}

export function isSessionUpcoming(session, nowMs) {
  return nowMs < Date.parse(session.startTimeUtc);
}

export function isSessionOnDemand(session, nowMs) {
  return nowMs > Date.parse(session.endTimeUtc);
}

export function allSessionsEnded(sessions, nowMs) {
  return sessions.length > 0 && sessions.every((s) => nowMs > Date.parse(s.endTimeUtc));
}

export function formatDuration(startUtc, endUtc) {
  const totalMin = Math.round((Date.parse(endUtc) - Date.parse(startUtc)) / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} hr`;
  return `${h} hr ${m} min`;
}

// Returns null for a session with no valid startTimeUtc, so callers comparing against a
// real day key (e.g. sessionsForDay()) naturally exclude it instead of crashing.
export function getSessionDayKey(session, userTz) {
  const date = safeDate(session.startTimeUtc);
  if (!date) return null;
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: userTz,
  }).format(date);
}
