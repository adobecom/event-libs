import { expect } from '@esm-bundle/chai';
import {
  classifySessionPlayback,
  getPlaybackPhase,
  nextPhaseBoundaryMs,
  PLAYBACK_CASE,
  PLAYBACK_PHASE,
} from '../../../../event-libs/v1/c2/utils/video-session.js';

const HOUR = 60 * 60 * 1000;
const NOW = 1_700_000_000_000;
const EVENT_START = NOW - 2 * HOUR;

// Minimal session shape — only the fields classifySessionPlayback/getPlaybackPhase read.
const session = (overrides = {}) => ({
  startTimeUtc: new Date(NOW - HOUR).toISOString(),
  endTimeUtc: new Date(NOW - HOUR / 2).toISOString(),
  mrStreamId: null,
  isLivestreamed: false,
  mpcId: '',
  youTubeId: '',
  mrDvrVideoId: '',
  dvrDelayHours: null,
  ...overrides,
});

const phase = (s, { eventStartMs = EVENT_START, liveIds = new Set() } = {}) => getPlaybackPhase(s, {
  nowMs: NOW, eventStartMs, liveStreamActiveIds: liveIds,
});

describe('classifySessionPlayback — identity + DVR gate, not Format', () => {
  it('classifies a session with live identity as LIVE even when on-demand Format is set', () => {
    const s = session({ isLivestreamed: true, mrStreamId: 'mr-1', hasOnDemandFormat: true, dvrDelayHours: 772 });
    expect(classifySessionPlayback(s)).to.equal(PLAYBACK_CASE.LIVE);
  });

  it('classifies a non-live session with a DVR delay as IPOD', () => {
    const s = session({ mpcId: '123', dvrDelayHours: 772 });
    expect(classifySessionPlayback(s)).to.equal(PLAYBACK_CASE.IPOD);
  });

  it('classifies a non-live session with only an mpc/youtube id as SIMULIVE', () => {
    expect(classifySessionPlayback(session({ mpcId: '123' }))).to.equal(PLAYBACK_CASE.SIMULIVE);
    expect(classifySessionPlayback(session({ youTubeId: 'abc' }))).to.equal(PLAYBACK_CASE.SIMULIVE);
  });

  it('returns null when nothing identifies a playable session', () => {
    expect(classifySessionPlayback(session())).to.equal(null);
    expect(classifySessionPlayback(null)).to.equal(null);
  });
});

describe('simulivePhase — premieres on schedule, flips to on-demand at the scheduled end', () => {
  const simulive = (overrides) => session({ mpcId: '123', dvrDelayHours: null, ...overrides });

  it('is PRE_EVENT before the 5-minute pre-roll window', () => {
    const s = simulive({
      startTimeUtc: new Date(NOW + (10 * 60 * 1000)).toISOString(), // starts in 10 min
      endTimeUtc: new Date(NOW + (30 * 60 * 1000)).toISOString(),
    });
    expect(phase(s)).to.equal(PLAYBACK_PHASE.PRE_EVENT);
  });

  it('is SIMULIVE while now is at/after start and before the scheduled end', () => {
    const s = simulive({
      startTimeUtc: new Date(NOW - (5 * 60 * 1000)).toISOString(), // started 5 min ago
      endTimeUtc: new Date(NOW + (5 * 60 * 1000)).toISOString(), // ends in 5 min
    });
    expect(phase(s)).to.equal(PLAYBACK_PHASE.SIMULIVE);
  });

  it('flips to ON_DEMAND once now is past the scheduled end (plain end time, no post-roll)', () => {
    const s = simulive({
      startTimeUtc: new Date(NOW - (30 * 60 * 1000)).toISOString(),
      endTimeUtc: new Date(NOW - (60 * 1000)).toISOString(), // ended 1 min ago
      videoDuration: '01:00:00', // long video is irrelevant now — the flip is the scheduled end
    });
    expect(phase(s)).to.equal(PLAYBACK_PHASE.ON_DEMAND);
  });
});

describe('livePhase — poll-driven live, sessionEnd-anchored DVR', () => {
  const live = (overrides) => session({ mrStreamId: 'mr-1', dvrDelayHours: 5, ...overrides });

  it('is PRE_EVENT before the scheduled start', () => {
    const s = live({ startTimeUtc: new Date(NOW + HOUR).toISOString() });
    expect(phase(s)).to.equal(PLAYBACK_PHASE.PRE_EVENT);
  });

  it('is WATCH_LIVE while the MR poll lists the stream active', () => {
    expect(phase(live(), { liveIds: new Set(['mr-1']) })).to.equal(PLAYBACK_PHASE.WATCH_LIVE);
  });

  it('stays WATCH_LIVE past the scheduled end while the poll is still active (over-run)', () => {
    const s = live({ endTimeUtc: new Date(NOW - HOUR).toISOString() });
    expect(phase(s, { liveIds: new Set(['mr-1']) })).to.equal(PLAYBACK_PHASE.WATCH_LIVE);
  });

  it('is DVR_BUFFER when the poll reports inactive inside the window (poll is authoritative — no "waiting for stream" grace)', () => {
    // First land during the live window, poll says not active → we do NOT hold on WATCH_LIVE;
    // resolve DVR/on-demand from the timings. Here sessionEnd(future) + 5h is still ahead → DVR.
    const s = live({ endTimeUtc: new Date(NOW + HOUR).toISOString() });
    expect(phase(s, { liveIds: new Set() })).to.equal(PLAYBACK_PHASE.DVR_BUFFER);
  });

  it('is DVR_BUFFER for a late arrival: scheduled window has passed and now < sessionEnd + dvrDelayHours', () => {
    // end is in the past (window over) but sessionEnd(−0.5h) + 5h is still future, so DVR applies.
    expect(phase(live())).to.equal(PLAYBACK_PHASE.DVR_BUFFER);
  });

  it('is ON_DEMAND once now >= sessionEnd + dvrDelayHours', () => {
    // sessionEnd = NOW − 2h, + 1h delay = NOW − 1h → elapsed.
    const s = live({ endTimeUtc: new Date(NOW - 2 * HOUR).toISOString(), dvrDelayHours: 1 });
    expect(phase(s)).to.equal(PLAYBACK_PHASE.ON_DEMAND);
  });

  it('is ON_DEMAND straight away when no dvrDelayHours is authored and the window has ended', () => {
    expect(phase(live({ dvrDelayHours: null }))).to.equal(PLAYBACK_PHASE.ON_DEMAND);
  });
});

describe('nextPhaseBoundaryMs — the clock boundaries the shared watcher schedules against', () => {
  it('returns the scheduled start when the session is still upcoming', () => {
    const s = session({
      startTimeUtc: new Date(NOW + HOUR).toISOString(),
      endTimeUtc: new Date(NOW + 2 * HOUR).toISOString(),
    });
    // start (+1h) and the simulive pre-roll (start − 5min) are both future; pre-roll is nearest.
    const preRoll = (NOW + HOUR) - (5 * 60 * 1000);
    expect(nextPhaseBoundaryMs(s, { nowMs: NOW })).to.equal(preRoll);
  });

  it('returns the scheduled end when the session is currently within its window', () => {
    const end = NOW + HOUR;
    const s = session({
      startTimeUtc: new Date(NOW - HOUR).toISOString(),
      endTimeUtc: new Date(end).toISOString(),
    });
    expect(nextPhaseBoundaryMs(s, { nowMs: NOW })).to.equal(end);
  });

  it('includes the DVR-availability gate (sessionEnd + dvrDelayHours) as a boundary', () => {
    const eventStartMs = NOW - HOUR;
    const sessionEnd = NOW - 2 * HOUR;
    const s = session({
      startTimeUtc: new Date(NOW - 3 * HOUR).toISOString(),
      endTimeUtc: new Date(sessionEnd).toISOString(),
      dvrDelayHours: 5,
    });
    // Only future boundary is sessionEnd + 5h (= NOW + 3h); start/end are in the past.
    expect(nextPhaseBoundaryMs(s, { nowMs: NOW, eventStartMs })).to.equal(sessionEnd + 5 * HOUR);
  });

  it('returns null once every boundary is in the past (fully settled)', () => {
    const s = session({
      startTimeUtc: new Date(NOW - 3 * HOUR).toISOString(),
      endTimeUtc: new Date(NOW - 2 * HOUR).toISOString(),
      dvrDelayHours: null,
    });
    expect(nextPhaseBoundaryMs(s, { nowMs: NOW })).to.equal(null);
  });

  it('anchors the DVR gate on sessionEnd even when eventStartMs is unknown', () => {
    const sessionEnd = NOW - 2 * HOUR;
    const s = session({
      startTimeUtc: new Date(NOW - 3 * HOUR).toISOString(),
      endTimeUtc: new Date(sessionEnd).toISOString(),
      dvrDelayHours: 5,
    });
    // No eventStartMs, but sessionEnd is present, so the gate = sessionEnd + 5h (= NOW + 3h).
    expect(nextPhaseBoundaryMs(s, { nowMs: NOW })).to.equal(sessionEnd + 5 * HOUR);
  });

  it('ignores the DVR gate when there is no sessionEnd and no eventStartMs', () => {
    const s = session({
      startTimeUtc: '',
      endTimeUtc: '',
      dvrDelayHours: 5,
    });
    // Neither anchor available → DVR gate can't be computed → no future boundary.
    expect(nextPhaseBoundaryMs(s, { nowMs: NOW })).to.equal(null);
  });
});
