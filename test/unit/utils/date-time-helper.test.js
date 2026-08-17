import { expect } from '@esm-bundle/chai';
import { formatCountdown } from '../../../event-libs/v1/utils/date-time-helper.js';

describe('utils/date-time-helper', () => {
  describe('formatCountdown', () => {
    it('formats hours, minutes, and seconds remaining, zero-padded', () => {
      const nowMs = Date.parse('2026-08-20T00:00:00Z');
      const targetMs = nowMs + ((1 * 3600 + 2 * 60 + 3) * 1000);
      expect(formatCountdown(targetMs, nowMs).display).to.equal('01:02:03');
    });

    it('does not wrap hours at 24 for multi-day countdowns', () => {
      const nowMs = Date.parse('2026-08-20T00:00:00Z');
      const targetMs = nowMs + (50 * 3600 * 1000);
      expect(formatCountdown(targetMs, nowMs).display).to.equal('50:00:00');
    });

    it('clamps to zero once the target has passed', () => {
      const nowMs = Date.parse('2026-08-20T00:00:00Z');
      const targetMs = nowMs - 60_000;
      const result = formatCountdown(targetMs, nowMs);
      expect(result.display).to.equal('00:00:00');
      expect(result.remainingMs).to.equal(0);
    });

    it('reports remainingMs alongside the formatted display', () => {
      const nowMs = Date.parse('2026-08-20T00:00:00Z');
      const targetMs = nowMs + 5000;
      expect(formatCountdown(targetMs, nowMs).remainingMs).to.equal(5000);
    });
  });
});
