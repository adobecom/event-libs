// Dev-only, gated behind `?debug` — safe to delete once development wraps up.
import { isBroadcastEligible } from '../../../../utils/session-state.js';
import {
  hasPlayableVideoSource, getSessionBucket, isSessionLiveNow, groupSessionsByStart,
} from './broadcast-schedule.js';

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
    videoDuration: session.videoDuration || '',
    primaryTrack: session.primaryTrack,
  };
}

// Logs only the sessions actually rendered (the filtered schedule), not the raw catalog.
export function logBroadcastSchedule(schedule) {
  if (!DEBUG_ENABLED) return;
  const rows = [
    ...(schedule.activeSession ? [toRow(schedule.activeSession, 'active')] : []),
    ...(schedule.pendingCandidates || []).map((s) => toRow(s, 'pendingCandidate')),
    ...schedule.alsoLive.map((s) => toRow(s, 'alsoLive')),
    ...schedule.upNext.map((s) => toRow(s, 'upNext')),
  ];
  // eslint-disable-next-line no-console
  console.table(rows);
}

function groupStatus(group, liveStreamActiveIds, nowMs) {
  if (group.members.some((m) => isSessionLiveNow(m, liveStreamActiveIds, nowMs))) return 'live';
  return group.startMs > nowMs ? 'upcoming' : 'ended';
}

// "mm:ss" until start, sign-prefixed once passed — e.g. "-02:15" = started 2m15s ago.
function formatRelativeTime(deltaMs) {
  const sign = deltaMs < 0 ? '-' : '';
  const totalSeconds = Math.round(Math.abs(deltaMs) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${sign}${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function groupRow(group, index, liveStreamActiveIds, nowMs) {
  return {
    group: index + 1,
    status: groupStatus(group, liveStreamActiveIds, nowMs),
    relativeTime: formatRelativeTime(group.startMs - nowMs),
    startTimeUtc: new Date(group.startMs).toISOString(),
    startMs: group.startMs,
    members: group.members.map((m) => m.title).join(', '),
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
