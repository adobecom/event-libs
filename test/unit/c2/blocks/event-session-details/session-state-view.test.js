import { expect } from '@esm-bundle/chai';
import { setMetadata } from '../../../../../event-libs/v1/utils/utils.js';
import {
  getSessionTimes, getState, formatDateTime, renderStatus, mountSessionState,
} from '../../../../../event-libs/v1/c2/blocks/event-session-details/session-state-view.js';

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

  describe('mountSessionState', () => {
    // start 150ms out, end well beyond: mount lands in 'upcoming', then the
    // scheduled boundary flips it to 'live' (the controller adds a 500ms cushion).
    const soonLive = () => {
      const start = Date.now() + 150;
      setMetadata('session-times', JSON.stringify([{
        startTimeMillis: start, endTimeMillis: start + 3600000, timezone: 'UTC',
      }]));
    };
    const slots = () => {
      const statusSlot = document.createElement('span');
      const primaryCtaSlot = document.createElement('span');
      document.body.append(statusSlot, primaryCtaSlot);
      return { statusSlot, primaryCtaSlot };
    };

    beforeEach(() => { document.body.innerHTML = ''; });

    it('does nothing without session-times', () => {
      const { statusSlot, primaryCtaSlot } = slots();
      mountSessionState({ statusSlot, primaryCtaSlot });
      expect(statusSlot.textContent).to.equal('');
      expect(primaryCtaSlot.children.length).to.equal(0);
    });

    it('renders the status and the state-owned CTA on mount', () => {
      setMetadata('session-id', 'sid');
      soonLive();
      const { statusSlot, primaryCtaSlot } = slots();
      mountSessionState({ statusSlot, primaryCtaSlot });
      expect(statusSlot.querySelector('.session-status--upcoming')).to.not.be.null;
      expect(primaryCtaSlot.querySelector('.session-schedule')).to.not.be.null;
    });

    it('defers the CTA swap while the old CTA has focus, then flushes on focusout', async () => {
      setMetadata('session-id', 'sid');
      soonLive();
      const { statusSlot, primaryCtaSlot } = slots();
      const elsewhere = document.createElement('button');
      document.body.append(elsewhere);

      mountSessionState({ statusSlot, primaryCtaSlot });
      primaryCtaSlot.querySelector('.session-schedule').focus();

      // Past the boundary: the status must update, but the focused CTA must stay put.
      await new Promise((r) => { setTimeout(r, 800); });
      expect(statusSlot.textContent).to.equal('Live');
      expect(primaryCtaSlot.querySelector('.session-schedule')).to.not.be.null;
      expect(primaryCtaSlot.querySelector('.session-watch-now')).to.be.null;

      // Focus leaves -> the held swap lands. The explicit dispatch keeps this
      // deterministic: a backgrounded test browser updates document.activeElement
      // but doesn't reliably fire focusout, and the real event (when it does fire)
      // just flushes first, making the dispatch a no-op.
      elsewhere.focus();
      primaryCtaSlot.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
      expect(primaryCtaSlot.querySelector('.session-watch-now')).to.not.be.null;
      expect(primaryCtaSlot.querySelector('.session-schedule')).to.be.null;
    });

    it('swaps immediately when the CTA is not focused', async () => {
      setMetadata('session-id', 'sid');
      soonLive();
      const { statusSlot, primaryCtaSlot } = slots();
      mountSessionState({ statusSlot, primaryCtaSlot });

      await new Promise((r) => { setTimeout(r, 800); });
      expect(statusSlot.textContent).to.equal('Live');
      expect(primaryCtaSlot.querySelector('.session-watch-now')).to.not.be.null;
    });
  });
});
