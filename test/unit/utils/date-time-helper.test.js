import { expect } from '@esm-bundle/chai';
import { formatCountdown, getRelativeTime } from '../../../event-libs/v1/utils/date-time-helper.js';

describe('utils/date-time-helper', () => {
  describe('getRelativeTime', () => {
    const nowMs = Date.parse('2026-08-20T12:00:00Z');

    it('reports "now" for anything under a minute old', () => {
      expect(getRelativeTime(nowMs - 30_000, 'en-US', nowMs)).to.equal('now');
    });

    it('reports minutes for the 1-59 minute bucket', () => {
      expect(getRelativeTime(nowMs - 5 * 60_000, 'en-US', nowMs)).to.equal('5 minutes ago');
    });

    it('reports hours once at least 60 minutes old', () => {
      expect(getRelativeTime(nowMs - 3 * 3600_000, 'en-US', nowMs)).to.equal('3 hours ago');
    });

    it('reports days once at least 24 hours old', () => {
      expect(getRelativeTime(nowMs - 2 * 86400_000, 'en-US', nowMs)).to.equal('2 days ago');
    });

    it('localizes the phrasing for a non-English locale', () => {
      expect(getRelativeTime(nowMs - 5 * 60_000, 'es-ES', nowMs)).to.equal('hace 5 minutos');
    });

    it('returns an empty string for a non-finite timestamp instead of throwing', () => {
      expect(getRelativeTime(NaN, 'en-US', nowMs)).to.equal('');
    });
  });

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
