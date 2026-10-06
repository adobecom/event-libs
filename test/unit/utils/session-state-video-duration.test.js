import { expect } from '@esm-bundle/chai';
import {
  parseVideoDurationMs, getSessionEndMs, deriveSessionState, dvrAvailableAtMs,
} from '../../../event-libs/v1/utils/session-state.js';

const START = Date.parse('2026-11-11T18:00:00.000Z');
const HOUR = 3_600_000;
const session = (overrides = {}) => ({
  startTimeUtc: new Date(START).toISOString(),
  endTimeUtc: new Date(START + HOUR).toISOString(),
  videoDuration: '00:30:00',
  ...overrides,
});
const state = (s, now, ids = new Set()) => deriveSessionState(s, ids, now, 'video-duration');

describe('featured video-duration timing', () => {
  it('parses weighted H:M:S parts, including overflow minutes and seconds', () => {
    expect(parseVideoDurationMs('01:30:00')).to.equal(HOUR * 1.5);
    expect(parseVideoDurationMs('00:60:00')).to.equal(HOUR);
    expect(parseVideoDurationMs(' 00:17:38 ')).to.equal(1_058_000);
    expect(parseVideoDurationMs('0:0:60')).to.equal(60_000);
  });

  it('rejects missing, malformed, non-positive and unsafe durations', () => {
    [
      undefined, null, '', ' ', 1800, {}, '00:00:00', '1', '1:30', '1:30:00:00',
      '1::00', '-1:30:00', '0:1.5:00', 'Infinity:00:00', '1e3:00:00',
      '0: 30:00', '999999999999999999999:00:00',
    ].forEach((value) => expect(parseVideoDurationMs(value)).to.equal(null));
  });

  it('uses video end only when explicitly selected, without mutating scheduled times', () => {
    const s = session();
    expect(getSessionEndMs(s)).to.equal(START + HOUR);
    expect(getSessionEndMs(s, 'video-duration')).to.equal(START + HOUR / 2);
    expect(s.endTimeUtc).to.equal(new Date(START + HOUR).toISOString());
  });

  it('falls back to scheduled end for invalid duration, start or computed timestamp', () => {
    ['', '00:00:00', 'bad', '2400000001:00:00'].forEach((videoDuration) => {
      expect(getSessionEndMs(session({ videoDuration }), 'video-duration')).to.equal(START + HOUR);
    });
    expect(getSessionEndMs(session({ startTimeUtc: 'bad' }), 'video-duration')).to.equal(START + HOUR);
  });

  it('transitions at the exact start and video end for every non-MR provider', () => {
    [{ mpcId: 'mpc-1' }, { youTubeId: 'youtube-1' }, {}, { isLivestreamed: true }]
      .forEach((provider) => {
        const s = session(provider);
        expect(state(s, START - 1)).to.equal('upcoming');
        expect(state(s, START)).to.equal('live');
        expect(state(s, START + HOUR / 2 - 1)).to.equal('live');
        expect(state(s, START + HOUR / 2)).to.equal('on-demand');
      });
  });

  it('stays live beyond scheduled end when video duration is longer', () => {
    const s = session({ videoDuration: '02:00:00' });
    expect(state(s, START + HOUR)).to.equal('live');
    expect(state(s, START + HOUR * 2)).to.equal('on-demand');
  });

  it('uses an exclusive scheduled-end fallback only for the opted-in consumer', () => {
    const s = session({ videoDuration: '' });
    expect(state(s, START + HOUR)).to.equal('on-demand');
    expect(deriveSessionState(s, new Set(), START + HOUR)).to.equal('live');
    expect(deriveSessionState(session(), new Set(), START + HOUR / 2)).to.equal('live');
  });

  it('keeps MR polling authoritative regardless of video and scheduled end', () => {
    const s = session({ mrStreamId: 'mr-1' });
    expect(getSessionEndMs(s, 'video-duration')).to.equal(START + HOUR);
    expect(state(s, START + HOUR * 2, new Set(['mr-1']))).to.equal('live');
    expect(state(s, START, new Set())).to.equal('on-demand');
    expect(state(s, START - 1, new Set(['mr-1']))).to.equal('upcoming');
  });

  it('does not treat an MR DVR recording ID as a Livestream ID', () => {
    expect(state(session({ mrDvrVideoId: 'dvr-1' }), START + HOUR / 2)).to.equal('on-demand');
  });

  it('preserves on-demand-format precedence and scheduled-end DVR unlock', () => {
    expect(state(session({ hasOnDemandFormat: true }), START - 1)).to.equal('on-demand');
    expect(dvrAvailableAtMs(session({ dvrDelayHours: 2 }), START)).to.equal(START + HOUR * 3);
  });
});
