import { expect } from '@esm-bundle/chai';
import { deriveSessionState, isInLiveNow } from '../../../event-libs/v1/utils/session-state.js';

// On-demand-only sessions may carry a scheduled slot, but the guide never surfaces them as
// airing — their state is on-demand no matter what the clock or the Mobile Rider poll says.
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

  // isInLiveNow is MR-only and deliberately left untouched: such a session can
  // legitimately carry a live stream now that the Format value alone decides placement, so the
  // view filters (liveSessions) are what keep it out of Live Now.
  it('leaves an ordinary upcoming session unaffected', () => {
    const scheduled = onDemandFormatSession({ hasOnDemandFormat: false });
    expect(deriveSessionState(scheduled, noLiveIds, BEFORE)).to.equal('upcoming');
    expect(deriveSessionState(scheduled, noLiveIds, DURING)).to.equal('live');
    expect(isInLiveNow(scheduled, noLiveIds, DURING)).to.equal(false);
  });
});
