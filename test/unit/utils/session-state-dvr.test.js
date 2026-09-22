import { expect } from '@esm-bundle/chai';
import { dvrAvailableAtMs, isDvrPending } from '../../../event-libs/v1/utils/session-state.js';

// Unlock is anchored on the session's own END time + the authored hours (per team spec). When the
// session has no session-times (no endTimeUtc), it falls back to the event start.
const HOUR = 3_600_000;
const EVENT_START = Date.parse('2026-11-10T14:00:00.000Z');
const SESSION_END = Date.parse('2026-11-12T22:00:00.000Z');
const endUtc = (ms) => new Date(ms).toISOString();

describe('dvrAvailableAtMs', () => {
  it('is the session end plus the authored hours', () => {
    const session = { dvrDelayHours: 772, endTimeUtc: endUtc(SESSION_END) };
    expect(dvrAvailableAtMs(session, EVENT_START)).to.equal(SESSION_END + 772 * HOUR);
  });

  it('falls back to the event start when the session has no end time', () => {
    expect(dvrAvailableAtMs({ dvrDelayHours: 772 }, EVENT_START)).to.equal(EVENT_START + 772 * HOUR);
    expect(dvrAvailableAtMs({ dvrDelayHours: 772, endTimeUtc: '' }, EVENT_START))
      .to.equal(EVENT_START + 772 * HOUR);
  });

  it('is the session end itself for 0 hours', () => {
    const session = { dvrDelayHours: 0, endTimeUtc: endUtc(SESSION_END) };
    expect(dvrAvailableAtMs(session, EVENT_START)).to.equal(SESSION_END);
  });

  it('is null with no DVR timing on the session', () => {
    expect(dvrAvailableAtMs({ dvrDelayHours: null }, EVENT_START)).to.be.null;
    expect(dvrAvailableAtMs({}, EVENT_START)).to.be.null;
  });

  it('is null with neither a session end nor an event start to count from', () => {
    expect(dvrAvailableAtMs({ dvrDelayHours: 772 }, null)).to.be.null;
  });
});

// Not read by the sessions-guide's own filtering (see onDemandSessions() in
// sessions-guide/utils/session-filters.js) — kept as a shared utility for other blocks.
describe('isDvrPending', () => {
  const session = { dvrDelayHours: 10 };

  it('is true before the window opens', () => {
    expect(isDvrPending(session, EVENT_START + 9 * HOUR, EVENT_START)).to.be.true;
  });

  it('is false exactly at the moment it opens', () => {
    expect(isDvrPending(session, EVENT_START + 10 * HOUR, EVENT_START)).to.be.false;
  });

  it('is false after it has opened', () => {
    expect(isDvrPending(session, EVENT_START + 11 * HOUR, EVENT_START)).to.be.false;
  });

  // Fails open — a missing input never withholds a recording that may be there.
  it('is false when either input is missing', () => {
    expect(isDvrPending({ dvrDelayHours: null }, EVENT_START, EVENT_START)).to.be.false;
    expect(isDvrPending(session, EVENT_START, null)).to.be.false;
  });

  // Mobile Rider livestreamed sessions have no delay window to wait out — DVR is available
  // the moment the stream ends, so dvrDelayHours never gates them, even mid-window.
  it('is false for a Mobile Rider livestreamed session, even before its window would open', () => {
    const mrSession = { ...session, mrStreamId: 'QqsopWFnrC' };
    expect(isDvrPending(mrSession, EVENT_START + 9 * HOUR, EVENT_START)).to.be.false;
  });
});
