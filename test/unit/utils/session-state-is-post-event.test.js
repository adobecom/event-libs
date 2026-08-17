import { expect } from '@esm-bundle/chai';
import { isPostEvent } from '../../../event-libs/v1/utils/session-state.js';

function session(overrides = {}) {
  return {
    startTimeUtc: '2026-01-01T10:00:00.000Z',
    endTimeUtc: '2026-01-01T11:00:00.000Z',
    ...overrides,
  };
}

describe('isPostEvent', () => {
  const noLiveIds = new Set();

  // An empty list can never satisfy "every session is on-demand" (that check requires
  // length > 0), but eventEndMs having passed is still independently sufficient — an
  // empty list isn't a blanket override.
  it('is false for an empty session list with no eventEndMs authored', () => {
    const nowMs = Date.parse('2099-01-01T00:00:00.000Z');
    expect(isPostEvent([], noLiveIds, nowMs, null)).to.equal(false);
  });

  it('is still true for an empty session list once eventEndMs has passed', () => {
    const nowMs = Date.parse('2099-01-01T00:00:00.000Z');
    expect(isPostEvent([], noLiveIds, nowMs, Date.parse('2020-01-01T00:00:00.000Z'))).to.equal(true);
  });

  it('is true once every session has gone on-demand, with no eventEndMs at all', () => {
    const ended = session();
    const nowMs = Date.parse('2026-01-01T12:00:00.000Z');
    expect(isPostEvent([ended], noLiveIds, nowMs, null)).to.equal(true);
  });

  it('is false while a session is still upcoming/live and eventEndMs has not passed', () => {
    const upcoming = session({ startTimeUtc: '2099-01-01T10:00:00.000Z', endTimeUtc: '2099-01-01T11:00:00.000Z' });
    const nowMs = Date.parse('2026-01-01T00:00:00.000Z');
    const eventEndMs = Date.parse('2099-01-02T00:00:00.000Z');
    expect(isPostEvent([upcoming], noLiveIds, nowMs, eventEndMs)).to.equal(false);
  });

  it('is true once eventEndMs has passed, even if a session is technically still "live" by its own times', () => {
    const stillTechnicallyLive = session({ startTimeUtc: '2026-01-01T10:00:00.000Z', endTimeUtc: '2099-01-01T11:00:00.000Z' });
    const eventEndMs = Date.parse('2026-01-01T20:00:00.000Z');
    const nowMs = Date.parse('2026-01-01T21:00:00.000Z');
    expect(isPostEvent([stillTechnicallyLive], noLiveIds, nowMs, eventEndMs)).to.equal(true);
  });

  it('is false exactly before eventEndMs and true exactly at/after it', () => {
    const upcoming = session({ startTimeUtc: '2099-01-01T10:00:00.000Z', endTimeUtc: '2099-01-01T11:00:00.000Z' });
    const eventEndMs = Date.parse('2026-06-01T00:00:00.000Z');
    expect(isPostEvent([upcoming], noLiveIds, eventEndMs - 1, eventEndMs)).to.equal(false);
    expect(isPostEvent([upcoming], noLiveIds, eventEndMs, eventEndMs)).to.equal(true);
  });

  it('treats a falsy eventEndMs (0/null/undefined) as "no cutoff authored"', () => {
    const upcoming = session({ startTimeUtc: '2099-01-01T10:00:00.000Z', endTimeUtc: '2099-01-01T11:00:00.000Z' });
    const nowMs = Date.parse('2026-01-01T00:00:00.000Z');
    expect(isPostEvent([upcoming], noLiveIds, nowMs, 0)).to.equal(false);
    expect(isPostEvent([upcoming], noLiveIds, nowMs, null)).to.equal(false);
    expect(isPostEvent([upcoming], noLiveIds, nowMs, undefined)).to.equal(false);
  });
});
