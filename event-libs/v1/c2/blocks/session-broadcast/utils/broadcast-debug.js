// Dev-only, gated behind `?debug` — safe to delete once development wraps up.
import { isBroadcastEligible } from '../../../../utils/session-state.js';
import {
  hasPlayableVideoSource, getSessionBucket, isSessionLiveNow, groupSessionsByStart, sessionEndsAtMs,
  parseVideoDurationMs,
} from './broadcast-schedule.js';

const DEBUG_ENABLED = new URLSearchParams(window.location.search).has('debug');

function groupStatus(group, liveStreamActiveIds, nowMs) {
  if (group.members.some((m) => isSessionLiveNow(m, liveStreamActiveIds, nowMs))) return 'live';
  return group.startMs > nowMs ? 'upcoming' : 'ended';
}

// "hh:mm:ss" until start, sign-prefixed once passed — e.g. "-01:02:15" = started 1h2m15s ago.
function formatRelativeTime(deltaMs) {
  const sign = deltaMs < 0 ? '-' : '';
  const totalSeconds = Math.round(Math.abs(deltaMs) / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${sign}${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

// Mirrors sessionEndsAtMs's own branching -- 'videoDuration' only when the mpc bucket actually
// has a usable Video Duration; a bucketed-mpc session with a missing/invalid one still falls
// back to endTimeUtc there, so it must report 'endTime' here too. Named for the field it reads
// (session.videoDuration), not the unrelated session.duration (sessionLengthInMinutes) --
// printing the bare word "duration" here would be ambiguous against that other field.
function endSource(session) {
  if (getSessionBucket(session) === 'mpc' && parseVideoDurationMs(session.videoDuration) != null) return 'videoDuration';
  return 'endTime';
}

function groupRow(group, index, liveStreamActiveIds, nowMs) {
  return {
    group: index + 1,
    status: groupStatus(group, liveStreamActiveIds, nowMs),
    relativeTime: formatRelativeTime(group.startMs - nowMs),
    startTimeUtc: new Date(group.startMs).toISOString(),
    startMs: group.startMs,
    // sessionEndsAtMs is the same MPC-video-duration-aware boundary isSessionLiveNow()
    // itself uses to decide when a session stops counting as live.
    members: group.members.map(
      (m) => `${m.title} (ends ${formatRelativeTime(sessionEndsAtMs(m) - nowMs)}, via ${endSource(m)})`,
    ),
  };
}

// Every bucket's groups from the raw catalog, independent of what's committed — sanity-checks
// resolveBucketSchedule's "next group" logic.
export function logBucketGroups(sessionList, liveStreamActiveIds, nowMs) {
  if (!DEBUG_ENABLED) return;
  const eligible = sessionList.filter((s) => isBroadcastEligible(s) && hasPlayableVideoSource(s));

  ['mpc', 'youtube'].forEach((bucket) => {
    const bucketSessions = eligible.filter((s) => getSessionBucket(s) === bucket);
    const groups = groupSessionsByStart(bucketSessions)
      .map((g, i) => groupRow(g, i, liveStreamActiveIds, nowMs));

    // eslint-disable-next-line no-console
    console.group(`[broadcast-debug] ${bucket} bucket — ${groups.length} group(s), now = ${new Date(nowMs).toISOString()}`);
    // eslint-disable-next-line no-console
    console.table(groups);

    const upcoming = groups.filter((g) => g.status === 'upcoming');
    // eslint-disable-next-line no-console
    console.log(`[broadcast-debug] ${bucket} upcoming groups (${upcoming.length}):`, upcoming);
    // eslint-disable-next-line no-console
    console.groupEnd();
  });
}

// Brackets one tick's worth of logBucketGroups/logActiveSession output -- SCHEDULE_REFRESH_MS
// (BroadcastApp.js) re-fires these every 5s, so without a visible boundary each tick's console
// output blurs into the previous one.
const TICK_DIVIDER = '='.repeat(20);

export function logTickStart(nowMs) {
  if (!DEBUG_ENABLED) return;
  // eslint-disable-next-line no-console
  console.log(`\n${TICK_DIVIDER}\n[broadcast-debug] TICK ${new Date(nowMs).toISOString()}\n${TICK_DIVIDER}`);
}

export function logTickEnd() {
  if (!DEBUG_ENABLED) return;
  // eslint-disable-next-line no-console
  console.log(`${TICK_DIVIDER}\n`);
}

// The committed/selected session (whichever of the two the schedule is actually surfacing) and
// its relative time to the *next* state — "ends" while still playing, "next session" once it
// has ended and something else is queued up in upNext.
export function logActiveSession(schedule, nowMs) {
  if (!DEBUG_ENABLED) return;

  if (schedule.activeSession) {
    const s = schedule.activeSession;
    // eslint-disable-next-line no-console
    console.log(`[broadcast-debug] active: "${s.title}" — ends ${formatRelativeTime(sessionEndsAtMs(s) - nowMs)} (via ${endSource(s)})`);
    return;
  }

  if (schedule.endedSession) {
    const s = schedule.endedSession;
    const next = schedule.upNext?.[0];
    const nextLabel = next
      ? `next session "${next.title}" in ${formatRelativeTime(Date.parse(next.startTimeUtc) - nowMs)}`
      : 'no upcoming session';
    // eslint-disable-next-line no-console
    console.log(`[broadcast-debug] ended: "${s.title}" — ${nextLabel}`);
  }
}
