// Read once at module load — frozen for the lifetime of the page.
const SERVER_TIME = (() => {
  try {
    const raw = new URLSearchParams(window.location.search).get('serverTime');
    const ms = raw ? parseInt(raw, 10) : NaN;
    return Number.isFinite(ms) ? ms : null;
  } catch {
    return null;
  }
})();

export function getNowMs() {
  return SERVER_TIME ?? Date.now();
}

export function detectUserTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export function formatSessionTime(utcIso, userTz) {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: userTz,
    timeZoneName: 'short',
  }).format(new Date(utcIso));
}

export function formatShortTime(utcIso, userTz) {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: userTz,
  }).format(new Date(utcIso));
}

export function formatSessionDate(utcIso, userTz) {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: userTz,
  }).format(new Date(utcIso));
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

export function getSessionDayKey(session, userTz) {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: userTz,
  }).format(new Date(session.startTimeUtc));
}
