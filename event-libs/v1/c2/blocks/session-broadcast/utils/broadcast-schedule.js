import { deriveSessionState, isBroadcastEligible } from '../../../../utils/session-state.js';

// Ticket says 15, PRD says 30 — shipping 15 (see PLAN.md).
export const UP_NEXT_CAP = 15;

// No player ID authored means nothing to click into — checks all three fields so MobileRider
// sessions show for free once that adapter ships.
export function hasPlayableVideoSource(session) {
  return !!(session.youTubeId || session.mpcId || session.mrStreamId);
}

// Alternatives, not a fallback chain — a session belongs to at most one bucket. MobileRider/
// no-player sessions have none but still show via isSessionLiveNow.
export function getSessionBucket(session) {
  if (session.mpcId) return 'mpc';
  if (session.youTubeId) return 'youtube';
  return null;
}

// RF's "Video Duration", HH:MM:SS — minutes can exceed 59 (e.g. "00:60:00"), so this sums
// weighted parts, no range validation.
export function parseVideoDurationMs(videoDuration) {
  if (!videoDuration) return null;
  const parts = videoDuration.split(':').map(Number);
  if (parts.some(Number.isNaN)) return null;
  const [h = 0, m = 0, s = 0] = parts;
  return ((h * 3600) + (m * 60) + s) * 1000;
}

// MPC ends at start + video duration, not endTimeUtc — falls back to the authored window if
// duration is missing. YouTube uses endTimeUtc unchanged.
function sessionEndsAtMs(session) {
  const startMs = Date.parse(session.startTimeUtc);
  if (getSessionBucket(session) === 'mpc') {
    const durMs = parseVideoDurationMs(session.videoDuration);
    return startMs + (durMs ?? (Date.parse(session.endTimeUtc) - startMs));
  }
  return Date.parse(session.endTimeUtc);
}

// The one liveness check used everywhere — dispatches by session shape: MobileRider keeps its
// poll-driven deriveSessionState, on-demand is never live.
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

// Capped, chronological, id-tiebroken for same-start-time ties — random reshuffled every
// re-render since this isn't memoized. Cross-bucket, not part of the advancement model below.
export function getUpNextSessions(sessionList, liveStreamActiveIds, nowMs, { cap = UP_NEXT_CAP } = {}) {
  return sessionList
    .filter((s) => isUpcoming(s, liveStreamActiveIds, nowMs))
    .sort((a, b) => byStartTimeAsc(a, b) || a.id.localeCompare(b.id))
    .slice(0, cap);
}

// Sessions sharing a start time, sorted ascending. Grouped by parsed numeric time, not the raw
// string, so differently-formatted-but-identical timestamps still merge. Exported for
// broadcast-debug.js.
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

// Resolves one bucket's schedule. Nothing committed: any live group is fair game, falling back
// to the most recent aired group as a synthesized endedSession. Committed session ended:
// advance only to the next started group or ended state — never back to a still-live sibling
// in its own group (manual selection still can). Pure — callers commit the pick once
// (BroadcastApp.js).
export function resolveBucketSchedule(bucketSessions, committedSession, nowMs, liveStreamActiveIds) {
  if (committedSession && isSessionLiveNow(committedSession, liveStreamActiveIds, nowMs)) {
    return { activeSession: committedSession, pendingCandidates: null, endedSession: null };
  }

  // A committed session that hasn't started yet isn't "ended" — nowMs only moves backward
  // during local ?serverTime= testing, never in production.
  const committedHasStarted = committedSession
    && Date.parse(committedSession.startTimeUtc) <= nowMs;

  if (!committedSession || !committedHasStarted) {
    // A fresh pick, not a "next group" lookup — every currently-live session in the bucket is
    // fair game (groups only matter for the transition below).
    const candidates = bucketSessions.filter((m) => isSessionLiveNow(m, liveStreamActiveIds, nowMs));
    if (candidates.length) {
      return { activeSession: null, pendingCandidates: candidates, endedSession: null };
    }

    // Nothing live, no prior commitment: surface the most recent aired group as ended, not a
    // bare page. Any member works as the anchor since transition lookups key off start time.
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

  // Walks to whichever later group is live now, not just the next one — a single-hop lookup
  // would get stuck stale if a backgrounded tab resumes after several later groups have
  // already come and gone.
  const groups = groupSessionsByStart(bucketSessions);
  const committedStartMs = Date.parse(committedSession.startTimeUtc);
  const laterGroups = groups.filter((g) => g.startMs > committedStartMs);
  const liveLaterGroup = laterGroups.find(
    (g) => g.members.some((m) => isSessionLiveNow(m, liveStreamActiveIds, nowMs)),
  );

  if (!liveLaterGroup) {
    // No later group live: either genuinely waiting, or a deep-stale resume where later groups
    // already aired unseen — catch up to whichever started most recently instead of staying
    // permanently stale.
    const pastLaterGroups = laterGroups.filter((g) => g.startMs <= nowMs);
    const mostRecentPastGroup = pastLaterGroups[pastLaterGroups.length - 1];
    const endedSession = mostRecentPastGroup ? mostRecentPastGroup.members[0] : committedSession;
    return { activeSession: null, pendingCandidates: null, endedSession };
  }

  const candidates = liveLaterGroup.members.filter((m) => isSessionLiveNow(m, liveStreamActiveIds, nowMs));
  return { activeSession: null, pendingCandidates: candidates, endedSession: null };
}

// activeSessionId is bucket-scoped: automatic advancement moves it within its bucket; only a
// manual switch crosses buckets. Supersedes the earlier "no auto-switching" PRD decision
// in-bucket (PLAN.md).
export function getBroadcastSchedule(sessionList, liveStreamActiveIds, nowMs, {
  activeSessionId, cap,
} = {}) {
  const validSessions = sessionList.filter((s) => !Number.isNaN(Date.parse(s.startTimeUtc)));
  const eligible = validSessions.filter((s) => isBroadcastEligible(s) && hasPlayableVideoSource(s));
  const upNext = getUpNextSessions(sessionList, liveStreamActiveIds, nowMs, { cap });

  const mpcSessions = eligible.filter((s) => getSessionBucket(s) === 'mpc');
  const ytSessions = eligible.filter((s) => getSessionBucket(s) === 'youtube');

  // Against the raw list, keyed on mpcId/youTubeId — a cancelled session flips isOnline/
  // hasOnDemandFormat but not its player-id fields, so it still resolves to its bucket instead
  // of jumping cross-bucket.
  const committedRaw = activeSessionId ? validSessions.find((s) => s.id === activeSessionId) : null;
  const committedBucket = committedRaw ? getSessionBucket(committedRaw) : null;

  let result = { activeSession: null, pendingCandidates: null, endedSession: null };
  if (committedBucket === 'mpc') {
    result = resolveBucketSchedule(mpcSessions, committedRaw, nowMs, liveStreamActiveIds);
  } else if (committedBucket === 'youtube') {
    result = resolveBucketSchedule(ytSessions, committedRaw, nowMs, liveStreamActiveIds);
  } else if (committedRaw && isSessionLiveNow(committedRaw, liveStreamActiveIds, nowMs)) {
    // No-bucket commitment (MobileRider today) has no group concept — kept as-is while live;
    // once it ends, falls through to the bootstrap below as if nothing was ever committed.
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
      // Nothing live anywhere: surface whichever bucket aired most recently as ended, so a
      // first-time visitor gets a path forward instead of a bare page.
      const endedCandidates = [mpcBootstrap.endedSession, ytBootstrap.endedSession].filter(Boolean);
      const pickedEnded = endedCandidates
        .sort((a, b) => Date.parse(b.startTimeUtc) - Date.parse(a.startTimeUtc))[0] || null;
      result = { activeSession: null, pendingCandidates: null, endedSession: pickedEnded };
    }
  }

  const allLive = eligible.filter((s) => isSessionLiveNow(s, liveStreamActiveIds, nowMs));
  // Excludes activeSession and every pendingCandidate — otherwise the about-to-commit session
  // briefly renders in both places for one render before BroadcastApp's effect flushes.
  const pendingIds = new Set((result.pendingCandidates || []).map((s) => s.id));
  return {
    activeSession: result.activeSession,
    pendingCandidates: result.pendingCandidates,
    alsoLive: allLive.filter((s) => s.id !== result.activeSession?.id && !pendingIds.has(s.id)),
    upNext,
    endedSession: result.endedSession,
  };
}
