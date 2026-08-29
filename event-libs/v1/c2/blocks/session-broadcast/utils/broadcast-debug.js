import { deriveSessionState, isBroadcastEligible } from '../../../../utils/session-state.js';

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

// `role` is where the session actually landed in the rendered schedule (active/alsoLive/
// upNext); `state` is what deriveSessionState() says regardless of role, so an upcoming
// session that fell outside the Up Next cap (or an on-demand one that's aired and dropped
// off entirely) is still visible instead of silently disappearing from this table.
function toRow(session, role, state) {
  return {
    role,
    state,
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

function roleFor(session, state, schedule) {
  if (session.id === schedule?.activeSession?.id) return 'active';
  if (schedule?.alsoLive?.some((s) => s.id === session.id)) return 'alsoLive';
  if (schedule?.upNext?.some((s) => s.id === session.id)) return 'upNext';
  if (state === 'upcoming') return 'upcoming (beyond Up Next cap)';
  if (state === 'on-demand') return 'on-demand (already aired)';
  return state;
}

// Logs every session that *could* play on this page — the full isBroadcastEligible pool from
// the raw catalog (mainstage/keynote sessions excluded, same as the real filtering), not just
// whichever subset is currently rendered as active/alsoLive/upNext. `schedule` (the output of
// getBroadcastSchedule) is only used to label each row's role; passing it is optional.
export function logBroadcastSchedule(sessionList, liveStreamActiveIds, nowMs, schedule) {
  if (!DEBUG_ENABLED) return;
  const rows = sessionList
    .filter(isBroadcastEligible)
    .map((session) => {
      const state = deriveSessionState(session, liveStreamActiveIds, nowMs);
      return toRow(session, roleFor(session, state, schedule), state);
    })
    .sort((a, b) => a.startMs - b.startMs);
  // eslint-disable-next-line no-console
  console.table(rows);
}
