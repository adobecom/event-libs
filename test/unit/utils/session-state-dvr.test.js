import { expect } from '@esm-bundle/chai';
import { dvrAvailableAtMs, isDvrPending } from '../../../event-libs/v1/utils/session-state.js';

// `DVR Timing (in hours)` counts from the event's start, not the session's own end — every
// session in the audited catalog carries the same value (772), an event-wide policy stamped
// onto each row rather than a per-session offset.
const HOUR = 3_600_000;
const EVENT_START = Date.parse('2026-11-10T14:00:00.000Z');

describe('dvrAvailableAtMs', () => {
  it('is the event start plus the authored hours', () => {
    expect(dvrAvailableAtMs({ dvrDelayHours: 772 }, EVENT_START)).to.equal(EVENT_START + 772 * HOUR);
  });

  it('is the event start itself for 0 hours', () => {
    expect(dvrAvailableAtMs({ dvrDelayHours: 0 }, EVENT_START)).to.equal(EVENT_START);
  });

  it('is null with no DVR timing on the session', () => {
    expect(dvrAvailableAtMs({ dvrDelayHours: null }, EVENT_START)).to.be.null;
    expect(dvrAvailableAtMs({}, EVENT_START)).to.be.null;
  });

  it('is null with no authored event start to count from', () => {
    expect(dvrAvailableAtMs({ dvrDelayHours: 772 }, null)).to.be.null;
  });
});

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

  // Fails open — a missing input never withholds a recording that may well be there.
  it('is false when either input is missing', () => {
    expect(isDvrPending({ dvrDelayHours: null }, EVENT_START, EVENT_START)).to.be.false;
    expect(isDvrPending(session, EVENT_START, null)).to.be.false;
  });
});
