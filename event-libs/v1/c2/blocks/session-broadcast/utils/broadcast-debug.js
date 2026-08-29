// Dev-only debug aid for building Session Broadcast — not part of the ticket's scope. Gated
// behind `?debug` so it stays silent for real visitors: this is a buildless codebase, so
// whatever's in source ships straight to production with no build step to strip it out. Safe
// to delete once development wraps up.
const DEBUG_ENABLED = new URLSearchParams(window.location.search).has('debug');

function videoType(session) {
  if (session.youTubeId) return 'youtube';
  if (session.mpcId) return 'mpc';
  if (session.mrStreamId) return 'mobile-rider';
  return 'unknown';
}

function toRow(session, role) {
  return {
    role,
    id: session.id,
    rfCode: session.rfCode,
    title: session.title,
    videoType: videoType(session),
    isOnline: !!session.isOnline,
    isLivestreamed: !!session.isLivestreamed,
    startTimeUtc: session.startTimeUtc,
    startMs: Date.parse(session.startTimeUtc),
    endTimeUtc: session.endTimeUtc,
    endMs: Date.parse(session.endTimeUtc),
    primaryTrack: session.primaryTrack,
  };
}

// Logs exactly the sessions that made it onto the page — the already-filtered/aggregated
// schedule session-broadcast is actually rendering (see getBroadcastSchedule/
// isBroadcastEligible), not the raw catalog — with the fields that matter for debugging
// player/timing issues (video type, start/end in both ISO and epoch ms).
export function logBroadcastSchedule(schedule) {
  if (!DEBUG_ENABLED) return;
  const rows = [
    ...(schedule.activeSession ? [toRow(schedule.activeSession, 'active')] : []),
    ...schedule.alsoLive.map((s) => toRow(s, 'alsoLive')),
    ...schedule.upNext.map((s) => toRow(s, 'upNext')),
  ];
  // eslint-disable-next-line no-console
  console.table(rows);
}
