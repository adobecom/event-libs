import { deriveSessionState, isBroadcastEligible } from '../../../../utils/session-state.js';

// Ticket says 15, PRD says 30 — shipping 15 (see PLAN.md).
export const UP_NEXT_CAP = 15;

// A session can be eligible but still have no player ID authored — better to never list it
// than let a viewer click into nothing. Checks all three fields so MobileRider sessions start
// showing for free once that adapter ships.
export function hasPlayableVideoSource(session) {
  return !!(session.youTubeId || session.mpcId || session.mrStreamId);
}

// mpcId/youTubeId are alternatives, not a fallback chain — a session belongs to at most one
// bucket. MobileRider/no-player sessions have no bucket but still show up via isSessionLiveNow.
export function getSessionBucket(session) {
  if (session.mpcId) return 'mpc';
  if (session.youTubeId) return 'youtube';
  return null;
}

// "HH:MM:SS" from RF's "Video Duration" attribute — the middle field can exceed 59 (e.g.
// "00:60:00"), so this sums weighted parts rather than validating strict ranges.
export function parseVideoDurationMs(videoDuration) {
  if (!videoDuration) return null;
  const parts = videoDuration.split(':').map(Number);
  if (parts.some(Number.isNaN)) return null;
  const [h = 0, m = 0, s = 0] = parts;
  return ((h * 3600) + (m * 60) + s) * 1000;
}

// MPC's "on screen until" boundary is start + video duration, not endTimeUtc — falls back to
// the authored window if duration is missing/unparseable. YouTube uses endTimeUtc unchanged.
function sessionEndsAtMs(session) {
  const startMs = Date.parse(session.startTimeUtc);
  if (getSessionBucket(session) === 'mpc') {
    const durMs = parseVideoDurationMs(session.videoDuration);
    return startMs + (durMs ?? (Date.parse(session.endTimeUtc) - startMs));
  }
  return Date.parse(session.endTimeUtc);
}

// The one "is this session live right now" check used everywhere liveness matters — dispatches
// by session shape so MobileRider keeps its existing poll-driven liveness (deriveSessionState)
// and on-demand sessions are never live.
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

// Upcoming sessions, capped and chronological, with a random tiebreak for same-start-time ties.
// `random` is injectable so tests can assert a fixed order. Cross-bucket — not part of the
// automatic advancement model below.
export function getUpNextSessions(sessionList, liveStreamActiveIds, nowMs, {
  cap = UP_NEXT_CAP, random = Math.random,
} = {}) {
  return sessionList
    .filter((s) => isUpcoming(s, liveStreamActiveIds, nowMs))
    .map((session) => ({ session, tiebreak: random() }))
    .sort((a, b) => byStartTimeAsc(a.session, b.session) || (a.tiebreak - b.tiebreak))
    .slice(0, cap)
    .map(({ session }) => session);
}

// Groups = sessions sharing an identical start time, sorted ascending. Grouped by parsed
// numeric time, not the raw string, so differently-formatted-but-identical timestamps still
// merge. Exported for broadcast-debug.js's console logging.
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

// Resolves ONE bucket's schedule. Two distinct cases: nothing committed (any live group is fair
// game; falls back to the most recently aired group as a synthesized `endedSession` if nothing's
// live) vs. a committed session that just ended (auto-advance may only go to the next started
// group or to ended state — never back to a still-live sibling in its own group; manual
// selection still can). Stays pure — callers do the actual random pick/ended-session commit
// exactly once (see BroadcastApp.js).
export function resolveBucketSchedule(bucketSessions, committedSession, nowMs, liveStreamActiveIds) {
  if (committedSession && isSessionLiveNow(committedSession, liveStreamActiveIds, nowMs)) {
    return { activeSession: committedSession, pendingCandidates: null, endedSession: null };
  }

  // A committed session that hasn't started yet isn't "ended" — nowMs only moves backward
  // during local ?serverTime= testing, never in production.
  const committedHasStarted = committedSession
    && Date.parse(committedSession.startTimeUtc) <= nowMs;

  if (!committedSession || !committedHasStarted) {
    // A fresh/reset pick, not a "next group" lookup — every currently-live session in the
    // bucket is fair game regardless of group (groups only matter for the transition below).
    const candidates = bucketSessions.filter((m) => isSessionLiveNow(m, liveStreamActiveIds, nowMs));
    if (candidates.length) {
      return { activeSession: null, pendingCandidates: candidates, endedSession: null };
    }

    // Nothing live and no prior commitment: surface the most recently aired group as an ended
    // session instead of a bare page. Any member works as the anchor since group-transition
    // lookups key off its start time, so the walk-forward logic below takes over from here.
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

  // Walk forward to whichever later group is actually live right now, not just the immediate
  // next one — a single-hop lookup gets stuck showing stale "ended" if a backgrounded tab
  // resumes after more than one later group has already started and ended.
  const groups = groupSessionsByStart(bucketSessions);
  const committedStartMs = Date.parse(committedSession.startTimeUtc);
  const laterGroups = groups.filter((g) => g.startMs > committedStartMs);
  const liveLaterGroup = laterGroups.find(
    (g) => g.members.some((m) => isSessionLiveNow(m, liveStreamActiveIds, nowMs)),
  );

  if (!liveLaterGroup) {
    // No later group live: either genuinely waiting (show the committed session as ended —
    // correct for the very next check) or a deep-stale resume where later groups already aired
    // without being shown — catch up to whichever started most recently instead of showing a
    // permanently stale anchor.
    const pastLaterGroups = laterGroups.filter((g) => g.startMs <= nowMs);
    const mostRecentPastGroup = pastLaterGroups[pastLaterGroups.length - 1];
    const endedSession = mostRecentPastGroup ? mostRecentPastGroup.members[0] : committedSession;
    return { activeSession: null, pendingCandidates: null, endedSession };
  }

  const candidates = liveLaterGroup.members.filter((m) => isSessionLiveNow(m, liveStreamActiveIds, nowMs));
  return { activeSession: null, pendingCandidates: candidates, endedSession: null };
}

// `activeSessionId` is bucket-scoped: automatic advancement can move it within its own bucket,
// but only a manual switch (handleSwitchSession) can move it cross-bucket — supersedes the
// earlier "no auto-switching" PRD decision for the in-bucket case (see PLAN.md).
export function getBroadcastSchedule(sessionList, liveStreamActiveIds, nowMs, {
  activeSessionId, cap, random,
} = {}) {
  const validSessions = sessionList.filter((s) => !Number.isNaN(Date.parse(s.startTimeUtc)));
  const eligible = validSessions.filter((s) => isBroadcastEligible(s) && hasPlayableVideoSource(s));
  const upNext = getUpNextSessions(sessionList, liveStreamActiveIds, nowMs, { cap, random });

  const mpcSessions = eligible.filter((s) => getSessionBucket(s) === 'mpc');
  const ytSessions = eligible.filter((s) => getSessionBucket(s) === 'youtube');

  // Resolved against the raw list, keyed only on mpcId/youTubeId — a cancelled session flips
  // isOnline/hasOnDemandFormat but not its player-id fields, so it still resolves to its bucket
  // for normal ended/next-group handling instead of a cross-bucket jump.
  const committedRaw = activeSessionId ? validSessions.find((s) => s.id === activeSessionId) : null;
  const committedBucket = committedRaw ? getSessionBucket(committedRaw) : null;

  let result = { activeSession: null, pendingCandidates: null, endedSession: null };
  if (committedBucket === 'mpc') {
    result = resolveBucketSchedule(mpcSessions, committedRaw, nowMs, liveStreamActiveIds);
  } else if (committedBucket === 'youtube') {
    result = resolveBucketSchedule(ytSessions, committedRaw, nowMs, liveStreamActiveIds);
  } else if (committedRaw && isSessionLiveNow(committedRaw, liveStreamActiveIds, nowMs)) {
    // A committed session with no bucket (MobileRider today) has no group/next-group concept —
    // a still-live commitment is kept as-is; once it stops being live it falls through to the
    // cross-bucket bootstrap below, same as if nothing had ever been committed.
    result = { activeSession: committedRaw, pendingCandidates: null, endedSession: null };
  }

  if (!result.activeSession && !result.pendingCandidates && !result.endedSession) {
    // Nothing committed anywhere — the one legitimate cross-bucket moment, offering candidates
    // from both buckets' live groups combined.
    const mpcBootstrap = resolveBucketSchedule(mpcSessions, null, nowMs, liveStreamActiveIds);
    const ytBootstrap = resolveBucketSchedule(ytSessions, null, nowMs, liveStreamActiveIds);
    const candidates = [...(mpcBootstrap.pendingCandidates || []), ...(ytBootstrap.pendingCandidates || [])];

    if (candidates.length) {
      result = { activeSession: null, pendingCandidates: candidates, endedSession: null };
    } else {
      // Nothing live in either bucket: surface whichever bucket's most-recently-aired group
      // started more recently as the ended session, so a first-time visitor gets Session Ended
      // with a path forward instead of a bare page.
      const endedCandidates = [mpcBootstrap.endedSession, ytBootstrap.endedSession].filter(Boolean);
      const pickedEnded = endedCandidates
        .sort((a, b) => Date.parse(b.startTimeUtc) - Date.parse(a.startTimeUtc))[0] || null;
      result = { activeSession: null, pendingCandidates: null, endedSession: pickedEnded };
    }
  }

  const allLive = eligible.filter((s) => isSessionLiveNow(s, liveStreamActiveIds, nowMs));
  return {
    activeSession: result.activeSession,
    pendingCandidates: result.pendingCandidates,
    alsoLive: allLive.filter((s) => s.id !== result.activeSession?.id),
    upNext,
    endedSession: result.endedSession,
  };
}
