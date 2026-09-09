// Dev-only, gated behind `?debug`.
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

// Mirrors sessionEndsAtMs's branching to report which field ('videoDuration'/'endTime') was used.
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
    // sessionEndsAtMs is the same boundary isSessionLiveNow() uses to decide liveness.
    members: group.members.map(
      (m) => `${m.title} (ends ${formatRelativeTime(sessionEndsAtMs(m) - nowMs)}, via ${endSource(m)})`,
    ),
  };
}

// Sanity-checks resolveBucketSchedule's "next group" logic against the raw catalog.
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

// Brackets one tick's console output so repeated 5s ticks don't blur together.
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

// Logs the active/ended session and its relative time to the next state transition.
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
