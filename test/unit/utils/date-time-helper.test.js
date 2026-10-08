import { expect } from '@esm-bundle/chai';
import {
  formatCountdown,
  getRelativeTime,
  getTimeFormatSettings,
  createSmartDateRange,
  createTemplatedDateRange,
  convertUtcTimestampToLocalDateTime,
} from '../../../event-libs/v1/utils/date-time-helper.js';
import { setMetadata } from '../../../event-libs/v1/utils/utils.js';

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

  describe('time-format / time-suffix metadata', () => {
    // 2026-03-10 13:00-14:45 Berlin (CET, UTC+1)
    const start = Date.UTC(2026, 2, 10, 12, 0);
    const end = Date.UTC(2026, 2, 10, 13, 45);
    const tz = 'Europe/Berlin';

    beforeEach(() => {
      document.head.innerHTML = '';
    });

    after(() => {
      document.head.innerHTML = '';
    });

    it('getTimeFormatSettings is off by default', () => {
      expect(getTimeFormatSettings()).to.deep.equal({ is24h: false, suffix: '' });
    });

    it('getTimeFormatSettings ignores the suffix unless 24h is on', () => {
      setMetadata('time-suffix', 'Uhr');
      expect(getTimeFormatSettings()).to.deep.equal({ is24h: false, suffix: '' });
    });

    it('getTimeFormatSettings is case-insensitive and trims', () => {
      setMetadata('time-format', ' 24H ');
      setMetadata('time-suffix', ' Uhr ');
      expect(getTimeFormatSettings()).to.deep.equal({ is24h: true, suffix: 'Uhr' });
    });

    it('getTimeFormatSettings can be forced on without metadata', () => {
      expect(getTimeFormatSettings(true)).to.deep.equal({ is24h: true, suffix: '' });
    });

    it('no metadata: createSmartDateRange keeps the 12h output', () => {
      const result = createSmartDateRange(start, end, 'en-US', tz, true);
      expect(result).to.match(/1:00 PM/);
      expect(result).to.match(/2:45 PM/);
      expect(result).to.not.match(/Uhr/);
    });

    it('no metadata: {timeRange} keeps the default output', () => {
      const result = createTemplatedDateRange(start, end, 'en-US', '{timeRange}', tz);
      expect(result).to.match(/01:00 PM - 02:45 PM/i);
    });

    it('24h + suffix: createSmartDateRange puts the suffix once after the end time', () => {
      setMetadata('time-format', '24h');
      setMetadata('time-suffix', 'Uhr');
      const result = createSmartDateRange(start, end, 'de-DE', tz, true);
      expect(result).to.contain('13:00');
      expect(result).to.contain('14:45 Uhr');
      expect(result.match(/Uhr/g)).to.have.length(1);
      expect(result).to.not.match(/AM|PM/i);
    });

    it('24h without suffix: no suffix is added', () => {
      setMetadata('time-format', '24h');
      const result = createSmartDateRange(start, end, 'de-DE', tz, true);
      expect(result).to.contain('14:45');
      expect(result).to.not.match(/Uhr/);
    });

    it('24h + suffix: {timeRange} renders 13:00 - 14:45 Uhr', () => {
      setMetadata('time-format', '24h');
      setMetadata('time-suffix', 'Uhr');
      expect(createTemplatedDateRange(start, end, 'de-DE', '{timeRange}', tz)).to.equal('13:00 - 14:45 Uhr');
    });

    it('24h forces 24h output even for an en-US locale', () => {
      setMetadata('time-format', '24h');
      expect(createTemplatedDateRange(start, end, 'en-US', '{timeRange}', tz)).to.equal('13:00 - 14:45');
    });

    it('24h renders midnight as 00:xx, not 24:xx', () => {
      setMetadata('time-format', '24h');
      const midnight = Date.UTC(2026, 2, 9, 23, 5); // 00:05 Berlin on the 10th
      const result = createTemplatedDateRange(midnight, midnight + 3600_000, 'en-US', '{timeRange}', tz);
      expect(result).to.equal('00:05 - 01:05');
    });

    it('24h + suffix: convertUtcTimestampToLocalDateTime appends the suffix after the minutes', () => {
      setMetadata('time-format', '24h');
      setMetadata('time-suffix', 'Uhr');
      const result = convertUtcTimestampToLocalDateTime(start, 'de-DE', tz, true);
      expect(result).to.contain('13:00 Uhr');
      expect(result).to.not.match(/AM|PM/i);
    });

    it('24h + suffix: multi-day range gets the suffix on each time', () => {
      setMetadata('time-format', '24h');
      setMetadata('time-suffix', 'Uhr');
      const result = createSmartDateRange(start, end + 86400_000, 'de-DE', tz, true);
      expect(result).to.contain('13:00 Uhr');
      expect(result).to.contain('14:45 Uhr');
    });
  });
});
