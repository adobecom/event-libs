import { deriveSessionState, isBroadcastEligible } from '../../../../utils/session-state.js';

export const UP_NEXT_CAP = 15;

// Checks all three player-id fields so MobileRider sessions show once that adapter ships.
export function hasPlayableVideoSource(session) {
  return !!(session.youTubeId || session.mpcId || session.mrStreamId);
}

// A session belongs to at most one bucket; MobileRider sessions have none.
export function getSessionBucket(session) {
  if (session.mpcId) return 'mpc';
  if (session.youTubeId) return 'youtube';
  return null;
}

// RF's Video Duration (HH:MM:SS); minutes can exceed 59, so parts are summed with no range check.
export function parseVideoDurationMs(videoDuration) {
  if (!videoDuration) return null;
  const parts = videoDuration.split(':').map(Number);
  if (parts.some(Number.isNaN)) return null;
  const [h = 0, m = 0, s = 0] = parts;
  return ((h * 3600) + (m * 60) + s) * 1000;
}

// MPC ends at start+videoDuration (falls back to endTimeUtc); YouTube always uses endTimeUtc.
export function sessionEndsAtMs(session) {
  const startMs = Date.parse(session.startTimeUtc);
  if (getSessionBucket(session) === 'mpc') {
    const durMs = parseVideoDurationMs(session.videoDuration);
    return startMs + (durMs ?? (Date.parse(session.endTimeUtc) - startMs));
  }
  return Date.parse(session.endTimeUtc);
}

// The one liveness check used everywhere; MobileRider defers to poll-driven deriveSessionState.
export function isSessionLiveNow(session, liveStreamActiveIds, nowMs) {
  if (session.hasOnDemandFormat) return false;
  if (session.mrStreamId) return deriveSessionState(session, liveStreamActiveIds, nowMs) === 'live';
  const startMs = Date.parse(session.startTimeUtc);
  return nowMs >= startMs && nowMs < sessionEndsAtMs(session);
}

function isUpcoming(session, liveStreamActiveIds, nowMs) {
  return isBroadcastEligible(session)
    && hasPlayableVideoSource(session)
    && deriveSessionState(session, liveStreamActiveIds, nowMs) === 'upcoming';
}

function byStartTimeAsc(a, b) {
  return Date.parse(a.startTimeUtc) - Date.parse(b.startTimeUtc);
}

// Cross-bucket list, capped and chronological; not part of the per-bucket advancement model below.
export function getUpNextSessions(sessionList, liveStreamActiveIds, nowMs, { cap = UP_NEXT_CAP } = {}) {
  return sessionList
    .filter((s) => isUpcoming(s, liveStreamActiveIds, nowMs))
    .sort((a, b) => byStartTimeAsc(a, b) || a.id.localeCompare(b.id))
    .slice(0, cap);
}

// Groups by parsed numeric start time so equal-but-differently-formatted timestamps still merge.
export function groupSessionsByStart(bucketSessions) {
  const map = new Map();
  bucketSessions.forEach((session) => {
    const startMs = Date.parse(session.startTimeUtc);
    if (!map.has(startMs)) map.set(startMs, []);
    map.get(startMs).push(session);
  });
  return [...map.entries()]
    .map(([startMs, members]) => ({ startMs, members }))
    .sort((a, b) => a.startMs - b.startMs);
}

// Resolves one bucket's schedule: advances forward only, never back to a live sibling once committed.
export function resolveBucketSchedule(bucketSessions, committedSession, nowMs, liveStreamActiveIds) {
  if (committedSession && isSessionLiveNow(committedSession, liveStreamActiveIds, nowMs)) {
    return { activeSession: committedSession, pendingCandidates: null, endedSession: null };
  }

  // A committed session that hasn't started yet isn't "ended" (nowMs never moves backward in prod).
  const committedHasStarted = committedSession
    && Date.parse(committedSession.startTimeUtc) <= nowMs;

  if (!committedSession || !committedHasStarted) {
    // A fresh pick - every currently-live session in the bucket is fair game here.
    const candidates = bucketSessions.filter((m) => isSessionLiveNow(m, liveStreamActiveIds, nowMs));
    if (candidates.length) {
      return { activeSession: null, pendingCandidates: candidates, endedSession: null };
    }

    // Surfaces the most recent aired group as ended instead of a bare page.
    if (!committedSession) {
      const groups = groupSessionsByStart(bucketSessions);
      const pastGroups = groups.filter((g) => g.startMs <= nowMs);
      const lastPastGroup = pastGroups[pastGroups.length - 1];
      if (lastPastGroup) {
        return { activeSession: null, pendingCandidates: null, endedSession: lastPastGroup.members[0] };
      }
    }

    return { activeSession: null, pendingCandidates: null, endedSession: null };
  }

  // Walks to whichever later group is live now, not just the next one, to survive a backgrounded tab.
  const groups = groupSessionsByStart(bucketSessions);
  const committedStartMs = Date.parse(committedSession.startTimeUtc);
  const laterGroups = groups.filter((g) => g.startMs > committedStartMs);
  const liveLaterGroup = laterGroups.find(
    (g) => g.members.some((m) => isSessionLiveNow(m, liveStreamActiveIds, nowMs)),
  );

  if (!liveLaterGroup) {
    // Catches up to whichever later group started most recently instead of staying permanently stale.
    const pastLaterGroups = laterGroups.filter((g) => g.startMs <= nowMs);
    const mostRecentPastGroup = pastLaterGroups[pastLaterGroups.length - 1];
    const endedSession = mostRecentPastGroup ? mostRecentPastGroup.members[0] : committedSession;
    return { activeSession: null, pendingCandidates: null, endedSession };
  }

  const candidates = liveLaterGroup.members.filter((m) => isSessionLiveNow(m, liveStreamActiveIds, nowMs));
  return { activeSession: null, pendingCandidates: candidates, endedSession: null };
}

// Automatic advancement stays within a session's bucket; only a manual switch crosses buckets.
export function getBroadcastSchedule(sessionList, liveStreamActiveIds, nowMs, {
  activeSessionId, cap,
} = {}) {
  const validSessions = sessionList.filter((s) => !Number.isNaN(Date.parse(s.startTimeUtc)));
  const eligible = validSessions.filter((s) => isBroadcastEligible(s) && hasPlayableVideoSource(s));
  const upNext = getUpNextSessions(sessionList, liveStreamActiveIds, nowMs, { cap });

  const mpcSessions = eligible.filter((s) => getSessionBucket(s) === 'mpc');
  const ytSessions = eligible.filter((s) => getSessionBucket(s) === 'youtube');

  // Keyed on mpcId/youTubeId so a cancelled session still resolves to its own bucket.
  const committedRaw = activeSessionId ? validSessions.find((s) => s.id === activeSessionId) : null;
  const committedBucket = committedRaw ? getSessionBucket(committedRaw) : null;

  let result = { activeSession: null, pendingCandidates: null, endedSession: null };
  if (committedBucket === 'mpc') {
    result = resolveBucketSchedule(mpcSessions, committedRaw, nowMs, liveStreamActiveIds);
  } else if (committedBucket === 'youtube') {
    result = resolveBucketSchedule(ytSessions, committedRaw, nowMs, liveStreamActiveIds);
  } else if (committedRaw && isSessionLiveNow(committedRaw, liveStreamActiveIds, nowMs)) {
    // No-bucket commitment (MobileRider) has no group concept; falls through once it ends.
    result = { activeSession: committedRaw, pendingCandidates: null, endedSession: null };
  }

  if (!result.activeSession && !result.pendingCandidates && !result.endedSession) {
    // Nothing committed anywhere - the one legitimate cross-bucket moment.
    const mpcBootstrap = resolveBucketSchedule(mpcSessions, null, nowMs, liveStreamActiveIds);
    const ytBootstrap = resolveBucketSchedule(ytSessions, null, nowMs, liveStreamActiveIds);
    const candidates = [...(mpcBootstrap.pendingCandidates || []), ...(ytBootstrap.pendingCandidates || [])];

    if (candidates.length) {
      result = { activeSession: null, pendingCandidates: candidates, endedSession: null };
    } else {
      // Surfaces whichever bucket aired most recently as ended, instead of a bare page.
      const endedCandidates = [mpcBootstrap.endedSession, ytBootstrap.endedSession].filter(Boolean);
      const pickedEnded = endedCandidates
        .sort((a, b) => Date.parse(b.startTimeUtc) - Date.parse(a.startTimeUtc))[0] || null;
      result = { activeSession: null, pendingCandidates: null, endedSession: pickedEnded };
    }
  }

  const allLive = eligible.filter((s) => isSessionLiveNow(s, liveStreamActiveIds, nowMs));
  // Excludes activeSession/pendingCandidates so a session doesn't briefly render in both places.
  const pendingIds = new Set((result.pendingCandidates || []).map((s) => s.id));
  return {
    activeSession: result.activeSession,
    pendingCandidates: result.pendingCandidates,
    alsoLive: allLive.filter((s) => s.id !== result.activeSession?.id && !pendingIds.has(s.id)),
    upNext,
    endedSession: result.endedSession,
  };
}
