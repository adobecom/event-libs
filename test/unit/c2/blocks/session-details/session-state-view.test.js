import { expect } from '@esm-bundle/chai';
import { setMetadata } from '../../../../../event-libs/v1/utils/utils.js';
import {
  getSessionTimes, getState, formatDateTime, renderStatus,
} from '../../../../../event-libs/v1/c2/blocks/session-details/session-state-view.js';

const SESSION_TIMES = '[{"startTimeMillis":1794518100000,"endTimeMillis":1794520800000,"timezone":"America/Los_Angeles","sessionId":"x"}]';

describe('session-state-view', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
  });

  describe('getSessionTimes', () => {
    it('parses start/end/timezone from session-times metadata', () => {
      setMetadata('session-times', SESSION_TIMES);
      expect(getSessionTimes()).to.deep.equal({
        start: 1794518100000, end: 1794520800000, timezone: 'America/Los_Angeles',
      });
    });

    it('falls back to session-length-in-minutes for the end', () => {
      setMetadata('session-times', '[{"startTimeMillis":1000,"timezone":"UTC"}]');
      setMetadata('session-length-in-minutes', '45');
      expect(getSessionTimes()).to.deep.equal({ start: 1000, end: 1000 + (45 * 60000), timezone: 'UTC' });
    });

    it('returns null when absent or invalid', () => {
      expect(getSessionTimes()).to.be.null;
      setMetadata('session-times', 'not json');
      expect(getSessionTimes()).to.be.null;
    });
  });

  describe('getState', () => {
    const times = { start: 1000, end: 2000 };
    it('is upcoming before start', () => expect(getState(500, times)).to.equal('upcoming'));
    it('is live from start to end inclusive', () => {
      expect(getState(1000, times)).to.equal('live');
      expect(getState(1500, times)).to.equal('live');
      expect(getState(2000, times)).to.equal('live');
    });
    it('is on-demand after end', () => expect(getState(2001, times)).to.equal('on-demand'));
  });

  describe('formatDateTime', () => {
    it('formats short month + time + tz abbreviation', () => {
      expect(formatDateTime(1794518100000, 'America/Los_Angeles')).to.equal('Nov 12, 1:15 PM PST');
    });
  });

  describe('renderStatus', () => {
    const times = { start: 1794518100000, timezone: 'America/Los_Angeles' };

    it('upcoming renders the date/time', () => {
      const el = renderStatus('upcoming', times);
      expect(el.classList.contains('session-status--upcoming')).to.be.true;
      expect(el.textContent).to.equal('Nov 12, 1:15 PM PST');
    });

    it('live renders a dot + Live', () => {
      const el = renderStatus('live', times);
      expect(el.classList.contains('session-status--live')).to.be.true;
      expect(el.querySelector('.session-status-dot')).to.not.be.null;
      expect(el.textContent).to.equal('Live');
    });

    it('on-demand renders On-demand', () => {
      const el = renderStatus('on-demand', times);
      expect(el.textContent).to.equal('On-demand');
    });
  });
});
