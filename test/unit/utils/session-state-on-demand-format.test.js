import { expect } from '@esm-bundle/chai';
import {
  deriveSessionState, isInLiveNow, hasMultipleSessionTimes, getSessionKey,
} from '../../../event-libs/v1/utils/session-state.js';

// These may carry a scheduled slot, but are never surfaced as airing — on-demand whatever
// the clock or the Mobile Rider poll says.
function onDemandFormatSession(overrides = {}) {
  return {
    startTimeUtc: '2026-11-11T15:30:00.000Z',
    endTimeUtc: '2026-11-11T16:15:00.000Z',
    mrStreamId: null,
    hasOnDemandFormat: true,
    ...overrides,
  };
}

const BEFORE = Date.parse('2026-11-01T00:00:00.000Z');
const DURING = Date.parse('2026-11-11T15:45:00.000Z');
const AFTER = Date.parse('2026-12-01T00:00:00.000Z');

describe('deriveSessionState — sessions carrying the on-demand Format', () => {
  const noLiveIds = new Set();

  it('is on-demand well before the scheduled slot', () => {
    expect(deriveSessionState(onDemandFormatSession(), noLiveIds, BEFORE)).to.equal('on-demand');
  });

  describe('repeated MR session time cards', () => {
    const first = {
      id: 'repeat',
      sessionId: 'repeat',
      sessionTimeId: 'first-time',
      mrStreamId: 'shared-stream',
      sessionTimes: [
        { sessionTimeId: 'first-time', startTimeMillis: Date.parse('2026-11-11T15:00:00Z'), endTimeMillis: Date.parse('2026-11-11T16:00:00Z') },
        { sessionTimeId: 'second-time', startTimeMillis: Date.parse('2026-11-11T17:00:00Z'), endTimeMillis: Date.parse('2026-11-11T18:00:00Z') },
      ],
      startTimeUtc: '2026-11-11T15:00:00.000Z',
      endTimeUtc: '2026-11-11T16:00:00.000Z',
    };
    const second = {
      ...first,
      sessionTimeId: 'second-time',
      startTimeUtc: '2026-11-11T17:00:00.000Z',
      endTimeUtc: '2026-11-11T18:00:00.000Z',
    };

    it('only surfaces the current time card as live regardless of shared poll status', () => {
      const now = Date.parse('2026-11-11T17:30:00Z');
      [new Set(), new Set(['shared-stream'])].forEach((active) => {
        expect(deriveSessionState(first, active, now)).to.equal('on-demand');
        expect(deriveSessionState(second, active, now)).to.equal('live');
        expect(isInLiveNow(first, active, now)).to.be.false;
        expect(isInLiveNow(second, active, now)).to.be.true;
      });
    });

    it('retains the gap between repeats instead of extending the first airing', () => {
      const now = Date.parse('2026-11-11T16:30:00Z');
      const active = new Set(['shared-stream']);
      expect(deriveSessionState(first, active, now)).to.equal('on-demand');
      expect(deriveSessionState(second, active, now)).to.equal('upcoming');
      expect(isInLiveNow(first, active, now)).to.be.false;
      expect(isInLiveNow(second, active, now)).to.be.false;
    });

    it('retains poll-driven MR behavior for a single-time session', () => {
      const single = { ...first, sessionTimes: [first.sessionTimes[0]] };
      const now = Date.parse('2026-11-11T17:30:00Z');
      expect(deriveSessionState(single, new Set(['shared-stream']), now)).to.equal('live');
      expect(deriveSessionState(single, new Set(), now)).to.equal('on-demand');
      expect(isInLiveNow(single, new Set(), now)).to.be.false;
    });

    it('does not infer replay windows from distinct time IDs with the same window', () => {
      const duplicated = {
        ...first,
        sessionTimes: [
          first.sessionTimes[0],
          { ...first.sessionTimes[0], sessionTimeId: 'another-time' },
        ],
      };
      expect(hasMultipleSessionTimes(duplicated)).to.be.false;
      expect(deriveSessionState(duplicated, new Set(), DURING)).to.equal('on-demand');
      expect(deriveSessionState(duplicated, new Set(['shared-stream']), AFTER)).to.equal('live');
      expect(isInLiveNow(duplicated, new Set(), DURING)).to.be.false;
    });

    it('ignores malformed windows instead of treating absent or invalid times as a replay', () => {
      expect(hasMultipleSessionTimes({ sessionTimes: [
        first.sessionTimes[0], {}, { startTimeMillis: NaN, endTimeMillis: Infinity },
      ] })).to.be.false;
      expect(hasMultipleSessionTimes(null)).to.be.false;
    });

    it('uses only actual time IDs and tolerates empty selections and legacy fixtures', () => {
      expect(getSessionKey(first)).to.equal('first-time');
      expect(getSessionKey({ id: 'legacy', rfCode: 'rf-time', sessionTimeId: '' })).to.equal('legacy');
      expect(getSessionKey(null)).to.equal(undefined);
      expect(getSessionKey(undefined)).to.equal(undefined);
    });
  });

  it('is on-demand inside the scheduled slot', () => {
    expect(deriveSessionState(onDemandFormatSession(), noLiveIds, DURING)).to.equal('on-demand');
  });

  it('is on-demand after the scheduled slot, like any ended session', () => {
    expect(deriveSessionState(onDemandFormatSession(), noLiveIds, AFTER)).to.equal('on-demand');
  });

  it('stays on-demand even when its stream is active in the MR poll', () => {
    const session = onDemandFormatSession({ mrStreamId: 'stream-1' });
    expect(deriveSessionState(session, new Set(['stream-1']), DURING)).to.equal('on-demand');
  });

  // isInLiveNow stays MR-only: such a session can legitimately carry a live stream, so the
  // view filters (liveSessions) are what keep it out of Live Now.
  it('leaves an ordinary upcoming session unaffected', () => {
    const scheduled = onDemandFormatSession({ hasOnDemandFormat: false });
    expect(deriveSessionState(scheduled, noLiveIds, BEFORE)).to.equal('upcoming');
    expect(deriveSessionState(scheduled, noLiveIds, DURING)).to.equal('live');
    expect(isInLiveNow(scheduled, noLiveIds, DURING)).to.equal(false);
  });
});
