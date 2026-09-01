import { deriveSessionState, isBroadcastEligible } from '../../../../utils/session-state.js';

// Ticket says 15, PRD says 30 — shipping 15 (see PLAN.md); a named constant for a one-line fix.
export const UP_NEXT_CAP = 15;

// A session can be eligible but still have no player ID authored — better to never list it
// than let a viewer click into nothing. Checks all three fields so MobileRider sessions start
// showing for free once that adapter ships.
export function hasPlayableVideoSource(session) {
  return !!(session.youTubeId || session.mpcId || session.mrStreamId);
}

// mpcId/youTubeId are alternatives, not a fallback chain (sessions-api.js) — a session belongs
// to at most one bucket. MobileRider/no-player sessions have no bucket: they never take part in
// automatic group advancement, but still show up in alsoLive/upNext via isSessionLiveNow below.
export function getSessionBucket(session) {
  if (session.mpcId) return 'mpc';
  if (session.youTubeId) return 'youtube';
  return null;
}

// "HH:MM:SS" from RF's "Video Duration" custom attribute — the middle field can exceed 59 (real
// data has been seen as e.g. "00:60:00" for a 60-minute session), so this sums weighted parts
// rather than validating strict HH:MM:SS ranges.
export function parseVideoDurationMs(videoDuration) {
  if (!videoDuration) return null;
  const parts = videoDuration.split(':').map(Number);
  if (parts.some(Number.isNaN)) return null;
  const [h = 0, m = 0, s = 0] = parts;
  return ((h * 3600) + (m * 60) + s) * 1000;
}

// MPC's "on screen until" boundary is start + video duration, not the authored endTimeUtc —
// falls back to the authored start/end window if videoDuration is missing or unparseable.
// YouTube (and anything else) uses its own endTimeUtc, unchanged from today.
function sessionEndsAtMs(session) {
  const startMs = Date.parse(session.startTimeUtc);
  if (getSessionBucket(session) === 'mpc') {
    const durMs = parseVideoDurationMs(session.videoDuration);
    return startMs + (durMs ?? (Date.parse(session.endTimeUtc) - startMs));
  }
  return Date.parse(session.endTimeUtc);
}

// The one "is this session live right now" check used everywhere liveness matters (watch-param
// validation, alsoLive, group resolution) — dispatches by session shape instead of introducing a
// parallel duration-only concept, so MobileRider sessions keep their existing poll-driven
// liveness (deriveSessionState/session-state.js is never modified) and on-demand sessions are
// never live, mirroring deriveSessionState's own precedence.
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

// Upcoming sessions, capped and chronological, with a random tiebreak for same-start-time
// sessions. `random` is injectable so tests can assert a fixed order. Stays cross-bucket and
// untouched by the bucket/group model below — Up Next isn't part of automatic advancement.
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

// Groups = sessions sharing an identical start time, sorted ascending. Grouped by parsed numeric
// time, not the raw string, so two differently-formatted-but-identical timestamps still merge.
// Exported for broadcast-debug.js's console logging — one source of truth for what a "group" is.
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

// Resolves ONE bucket's schedule. Genuinely different cases, not one uniform "find any live
// group" scan:
//  - Nothing committed in this bucket: a fresh/reset pick — any currently-live group is fair
//    game. If nothing's live either, and nothing was ever committed, fall back to the most
//    recently aired group as a synthesized `endedSession` (see below) instead of showing nothing.
//  - A committed session just ended: automatic advancement may ONLY go to the next group (by
//    start time) once its start has been reached or passed, or to ended state. It must never
//    fall back to a still-live sibling in the committed session's own group (explicit product
//    rule) — manual selection can still pick a sibling directly, this only constrains the
//    automatic path.
// Callers do the actual random pick among `pendingCandidates` exactly once, and commit a
// synthesized `endedSession` the same way (see BroadcastApp.js) — this function stays pure so
// it's safe to call on every render.
export function resolveBucketSchedule(bucketSessions, committedSession, nowMs, liveStreamActiveIds) {
  if (committedSession && isSessionLiveNow(committedSession, liveStreamActiveIds, nowMs)) {
    return { activeSession: committedSession, pendingCandidates: null, endedSession: null };
  }

  // A committed session that hasn't started yet isn't "ended" — nowMs only moves backward in
  // local testing (?serverTime= jumping to an earlier point while a later commitment is still
  // in sessionStorage/history.state), never in production, but treating it as ended would
  // otherwise surface a nonsensical "session ended" screen for something that hasn't aired.
  const committedHasStarted = committedSession
    && Date.parse(committedSession.startTimeUtc) <= nowMs;

  if (!committedSession || !committedHasStarted) {
    // A fresh/reset pick, not a "next group" lookup — every currently-live session in the
    // bucket is fair game, regardless of which group it belongs to (groups only matter for the
    // post-ending transition below).
    const candidates = bucketSessions.filter((m) => isSessionLiveNow(m, liveStreamActiveIds, nowMs));
    if (candidates.length) {
      return { activeSession: null, pendingCandidates: candidates, endedSession: null };
    }

    // Nothing live right now. For a genuine first-time visitor (no prior commitment at all —
    // excludes the backward-time-travel case above, which already has a real, later commitment
    // to resume instead), surface the most recently aired group as an ended session instead of a
    // bare page. Any member works as the anchor: group-transition lookups only key off its own
    // start time, so once BroadcastApp.js commits this pick, the ordinary walk-forward logic
    // below takes over exactly as if it had been a real commitment all along.
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

  // Walk forward to whichever later group is actually live right now — not just the immediate
  // next one. A single-hop "check only the next group" lookup gets stuck showing the stale
  // committed session as ended if more than one later group has already both started and ended
  // by the time this re-evaluates (e.g. a backgrounded/suspended tab resuming after a while, or
  // local ?serverTime= testing jumping further ahead than one group). Groups are still never
  // considered out of order and the committed session's own group is still excluded (startMs
  // strictly greater), preserving the same-group-sibling rule above.
  const groups = groupSessionsByStart(bucketSessions);
  const committedStartMs = Date.parse(committedSession.startTimeUtc);
  const laterGroups = groups.filter((g) => g.startMs > committedStartMs);
  const liveLaterGroup = laterGroups.find(
    (g) => g.members.some((m) => isSessionLiveNow(m, liveStreamActiveIds, nowMs)),
  );

  if (!liveLaterGroup) {
    // No later group is live right now — either genuinely waiting (nothing later has started
    // yet), or a deep-stale resume where one or more later groups have already both started and
    // ended without ever being shown. For the waiting case, showing the original committed
    // session as ended is exactly right — it just ended, this is the very next check. For the
    // deep-stale case, that would perpetually show a stale anchor no matter how far time moves
    // on; catch up to whichever later group most recently started instead, same as the
    // first-time-visitor synthesis above (consistent behavior, not two different rules for what
    // is conceptually the same "nothing to show but something already aired" situation).
    const pastLaterGroups = laterGroups.filter((g) => g.startMs <= nowMs);
    const mostRecentPastGroup = pastLaterGroups[pastLaterGroups.length - 1];
    const endedSession = mostRecentPastGroup ? mostRecentPastGroup.members[0] : committedSession;
    return { activeSession: null, pendingCandidates: null, endedSession };
  }

  const candidates = liveLaterGroup.members.filter((m) => isSessionLiveNow(m, liveStreamActiveIds, nowMs));
  return { activeSession: null, pendingCandidates: candidates, endedSession: null };
}

// `activeSessionId` is a bucket-scoped commitment: automatic advancement (see
// resolveBucketSchedule) may move it forward within its own bucket, but only a manual selection
// (BroadcastApp's handleSwitchSession) can move it to a different bucket. This intentionally
// supersedes the earlier "no auto-switching" PRD decision (see PLAN.md) for the in-bucket case.
export function getBroadcastSchedule(sessionList, liveStreamActiveIds, nowMs, {
  activeSessionId, cap, random,
} = {}) {
  const validSessions = sessionList.filter((s) => !Number.isNaN(Date.parse(s.startTimeUtc)));
  const eligible = validSessions.filter((s) => isBroadcastEligible(s) && hasPlayableVideoSource(s));
  const upNext = getUpNextSessions(sessionList, liveStreamActiveIds, nowMs, { cap, random });

  const mpcSessions = eligible.filter((s) => getSessionBucket(s) === 'mpc');
  const ytSessions = eligible.filter((s) => getSessionBucket(s) === 'youtube');

  // Resolved against the raw (pre-eligibility) list, keyed only on mpcId/youTubeId — a cancelled
  // session typically flips isOnline/hasOnDemandFormat (dropping it out of `eligible`), not its
  // player-id fields, and must still resolve to its bucket so cancellation gets the same
  // in-bucket ended/next-group handling as a normal ending, not a cross-bucket jump.
  const committedRaw = activeSessionId ? validSessions.find((s) => s.id === activeSessionId) : null;
  const committedBucket = committedRaw ? getSessionBucket(committedRaw) : null;

  let result = { activeSession: null, pendingCandidates: null, endedSession: null };
  if (committedBucket === 'mpc') {
    result = resolveBucketSchedule(mpcSessions, committedRaw, nowMs, liveStreamActiveIds);
  } else if (committedBucket === 'youtube') {
    result = resolveBucketSchedule(ytSessions, committedRaw, nowMs, liveStreamActiveIds);
  } else if (committedRaw && isSessionLiveNow(committedRaw, liveStreamActiveIds, nowMs)) {
    // A committed session with no bucket at all (MobileRider today; any future player type that
    // never gets its own bucket/group model) — there's no group/next-group concept for it, so
    // none of the walk-forward logic above applies, but a still-live commitment must not be
    // silently discarded either. Once it stops being live, there's nothing to walk forward to,
    // so it correctly falls through to the ordinary cross-bucket bootstrap below, same as if
    // nothing had ever been committed.
    result = { activeSession: committedRaw, pendingCandidates: null, endedSession: null };
  }

  if (!result.activeSession && !result.pendingCandidates && !result.endedSession) {
    // Nothing committed anywhere (fresh load, cleared watch param, garbage persisted id, or a
    // committed session with no bucket at all) — the one legitimate cross-bucket moment, offering
    // candidates from both buckets' live groups combined.
    const mpcBootstrap = resolveBucketSchedule(mpcSessions, null, nowMs, liveStreamActiveIds);
    const ytBootstrap = resolveBucketSchedule(ytSessions, null, nowMs, liveStreamActiveIds);
    const candidates = [...(mpcBootstrap.pendingCandidates || []), ...(ytBootstrap.pendingCandidates || [])];

    if (candidates.length) {
      result = { activeSession: null, pendingCandidates: candidates, endedSession: null };
    } else {
      // Nothing live in either bucket either — if one or both buckets have a most-recently-aired
      // group, surface that as the ended session (see resolveBucketSchedule) so a first-time
      // visitor gets Session Ended with a path to whatever comes next, not a bare page. Prefer
      // whichever bucket's last group started more recently — likelier to have its own next
      // group coming up sooner.
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
