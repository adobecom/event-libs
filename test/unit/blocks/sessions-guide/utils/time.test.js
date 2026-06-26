import { expect } from '@esm-bundle/chai';
import {
  detectUserTimezone,
  formatSessionTime,
  formatSessionDate,
  formatDuration,
  isSessionLive,
  isSessionUpcoming,
  isSessionOnDemand,
  allSessionsEnded,
  getSessionDayKey,
} from '../../../../../event-libs/v1/blocks/sessions-guide/utils/time.js';

const TZ = 'America/Los_Angeles';
const SESSION = {
  startTimeUtc: '2026-10-28T17:00:00Z',
  endTimeUtc: '2026-10-28T18:00:00Z',
};
const START = Date.parse(SESSION.startTimeUtc);
const END = Date.parse(SESSION.endTimeUtc);

describe('utils/time', () => {
  describe('detectUserTimezone', () => {
    it('returns a non-empty string', () => {
      const tz = detectUserTimezone();
      expect(tz).to.be.a('string').and.not.empty;
    });

    it('returns fallback when Intl is unavailable', () => {
      const tz = detectUserTimezone('UTC');
      expect(tz).to.be.a('string');
    });
  });

  describe('formatSessionTime', () => {
    it('returns a non-empty string for valid input', () => {
      const result = formatSessionTime(SESSION.startTimeUtc, TZ);
      expect(result).to.be.a('string').and.not.empty;
    });
  });

  describe('formatSessionDate', () => {
    it('returns a non-empty string for valid input', () => {
      const result = formatSessionDate(SESSION.startTimeUtc, TZ);
      expect(result).to.be.a('string').and.not.empty;
    });
  });

  describe('isSessionLive', () => {
    it('returns true when nowMs is within session window', () => {
      const mid = START + 30 * 60 * 1000;
      expect(isSessionLive(SESSION, mid)).to.be.true;
    });

    it('returns false before session start', () => {
      expect(isSessionLive(SESSION, START - 1)).to.be.false;
    });

    it('returns false after session end', () => {
      expect(isSessionLive(SESSION, END + 1)).to.be.false;
    });
  });

  describe('isSessionUpcoming', () => {
    it('returns true before session start', () => {
      expect(isSessionUpcoming(SESSION, START - 1)).to.be.true;
    });

    it('returns false at or after start', () => {
      expect(isSessionUpcoming(SESSION, START)).to.be.false;
    });
  });

  describe('isSessionOnDemand', () => {
    it('returns true after session end', () => {
      expect(isSessionOnDemand(SESSION, END + 1)).to.be.true;
    });

    it('returns false before end', () => {
      expect(isSessionOnDemand(SESSION, END)).to.be.false;
    });
  });

  describe('allSessionsEnded', () => {
    const sessions = [
      { startTimeUtc: '2026-10-28T16:00:00Z', endTimeUtc: '2026-10-28T17:00:00Z' },
      { startTimeUtc: '2026-10-28T17:00:00Z', endTimeUtc: '2026-10-28T18:00:00Z' },
    ];
    const lastEnd = Date.parse('2026-10-28T18:00:00Z');

    it('returns true when all sessions are past', () => {
      expect(allSessionsEnded(sessions, lastEnd + 1)).to.be.true;
    });

    it('returns false when any session is not yet ended', () => {
      expect(allSessionsEnded(sessions, lastEnd)).to.be.false;
    });

    it('returns false for empty array', () => {
      expect(allSessionsEnded([], Date.now())).to.be.false;
    });
  });

  describe('getSessionDayKey', () => {
    it('returns an ISO date string in YYYY-MM-DD format', () => {
      const key = getSessionDayKey(SESSION, TZ);
      expect(key).to.match(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('returns the correct date for the given timezone', () => {
      // 2026-10-28T17:00:00Z = 2026-10-28T10:00:00-07:00 in LA
      const key = getSessionDayKey(SESSION, TZ);
      expect(key).to.equal('2026-10-28');
    });
  });

  describe('formatDuration', () => {
    it('formats minutes only', () => {
      expect(formatDuration('2026-10-28T17:00:00Z', '2026-10-28T17:30:00Z')).to.equal('30 min');
    });
    it('formats whole hours', () => {
      expect(formatDuration('2026-10-28T17:00:00Z', '2026-10-28T18:00:00Z')).to.equal('1 hr');
    });
    it('formats hours and minutes', () => {
      expect(formatDuration('2026-10-28T17:00:00Z', '2026-10-28T18:45:00Z')).to.equal('1 hr 45 min');
    });
    it('formats multiple whole hours', () => {
      expect(formatDuration('2026-10-28T17:00:00Z', '2026-10-28T19:00:00Z')).to.equal('2 hr');
    });
  });
});
