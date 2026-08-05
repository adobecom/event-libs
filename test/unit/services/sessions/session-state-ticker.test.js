import { expect } from '@esm-bundle/chai';
import {
  startSessionStateTicker, stopSessionStateTicker,
} from '../../../../event-libs/v1/services/sessions/session-state-ticker.js';

const HOUR = 3_600_000;

describe('services/sessions/session-state-ticker', () => {
  afterEach(() => {
    stopSessionStateTicker();
  });

  it('notifies once immediately with the initial classification', async () => {
    let changeCount = 0;
    const session = { id: 's-1', startTimeUtc: '2026-11-10T18:00:00Z', endTimeUtc: '2026-11-10T19:00:00Z' };
    let now = Date.parse('2026-11-10T17:00:00Z'); // upcoming

    startSessionStateTicker(
      () => [session],
      () => new Set(),
      () => { changeCount += 1; },
      { intervalMs: 60_000, getNow: () => now },
    );

    expect(changeCount).to.equal(1);
  });

  it('does not notify again on ticks where nothing changed', async () => {
    let changeCount = 0;
    const session = { id: 's-1', startTimeUtc: '2026-11-10T18:00:00Z', endTimeUtc: '2026-11-10T19:00:00Z' };
    const now = Date.parse('2026-11-10T17:00:00Z'); // stays upcoming every tick

    startSessionStateTicker(
      () => [session],
      () => new Set(),
      () => { changeCount += 1; },
      { intervalMs: 30, getNow: () => now },
    );
    expect(changeCount).to.equal(1);

    await new Promise((r) => setTimeout(r, 100));
    expect(changeCount).to.equal(1);
  });

  it('notifies again when a session transitions from upcoming to live', async () => {
    let changeCount = 0;
    const session = { id: 's-1', startTimeUtc: '2026-11-10T18:00:00Z', endTimeUtc: '2026-11-10T19:00:00Z' };
    let now = Date.parse('2026-11-10T17:00:00Z'); // upcoming

    startSessionStateTicker(
      () => [session],
      () => new Set(),
      () => { changeCount += 1; },
      { intervalMs: 30, getNow: () => now },
    );
    expect(changeCount).to.equal(1);

    now = Date.parse('2026-11-10T18:30:00Z'); // now live
    await new Promise((r) => setTimeout(r, 100));
    expect(changeCount).to.equal(2);
  });

  it('self-stops once every session is on-demand', async () => {
    let changeCount = 0;
    const session = { id: 's-1', startTimeUtc: '2026-11-10T18:00:00Z', endTimeUtc: '2026-11-10T19:00:00Z' };
    let now = Date.parse('2026-11-10T19:30:00Z'); // already on-demand at start

    startSessionStateTicker(
      () => [session],
      () => new Set(),
      () => { changeCount += 1; },
      { intervalMs: 30, getNow: () => now },
    );
    expect(changeCount).to.equal(1);

    now += HOUR; // time keeps moving, but state can't change further — ticker should be stopped
    await new Promise((r) => setTimeout(r, 100));
    expect(changeCount).to.equal(1);
  });

  it('stopSessionStateTicker clears the interval', async () => {
    let changeCount = 0;
    const session = { id: 's-1', startTimeUtc: '2026-11-10T18:00:00Z', endTimeUtc: '2026-11-10T19:00:00Z' };
    let now = Date.parse('2026-11-10T17:00:00Z');

    startSessionStateTicker(
      () => [session],
      () => new Set(),
      () => { changeCount += 1; },
      { intervalMs: 30, getNow: () => now },
    );
    expect(changeCount).to.equal(1);
    stopSessionStateTicker();

    now = Date.parse('2026-11-10T18:30:00Z');
    await new Promise((r) => setTimeout(r, 100));
    expect(changeCount).to.equal(1);
  });
});
