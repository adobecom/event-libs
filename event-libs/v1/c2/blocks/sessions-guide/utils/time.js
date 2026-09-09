// Re-exported so existing call sites in this block don't need to change their import path.
export { getNowMs } from '../../../../utils/session-state.js';
export { formatDuration } from '../../../../utils/date-time-helper.js';

export function detectUserTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

// Guards against '' startTimeUtc/endTimeUtc: Intl.DateTimeFormat throws RangeError on an Invalid Date.
function safeDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

// Builds "11:00am" from parts; matches on "blank" since ICU's AM/PM separator isn't always an ASCII space.
function joinTimeParts(parts) {
  return parts.reduce((out, part, i) => {
    if (part.type === 'literal' && part.value.trim() === '' && parts[i + 1]?.type === 'dayPeriod') return out;
    return out + (part.type === 'dayPeriod' ? part.value.toLowerCase() : part.value);
  }, '');
}

export function formatSessionTime(utcIso, userTz) {
  const date = safeDate(utcIso);
  if (!date) return '';
  const parts = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: userTz,
    timeZoneName: 'short',
  }).formatToParts(date);
  return joinTimeParts(parts);
}

export function formatShortTime(utcIso, userTz) {
  const date = safeDate(utcIso);
  if (!date) return '';
  const parts = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: userTz,
  }).formatToParts(date);
  return joinTimeParts(parts);
}

export function formatTimezoneAbbr(utcIso, userTz) {
  const date = safeDate(utcIso);
  if (!date) return '';
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: userTz,
    timeZoneName: 'short',
  }).formatToParts(date);
  return parts.find((p) => p.type === 'timeZoneName')?.value || '';
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

// Returns null for a session with no valid startTimeUtc so day-key comparisons exclude it instead of crashing.
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
