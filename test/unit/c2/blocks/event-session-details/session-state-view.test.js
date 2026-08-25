import { expect } from '@esm-bundle/chai';
import { setMetadata } from '../../../../../event-libs/v1/utils/utils.js';
import {
  getSessionTimes, getAllSessionTimes, getState, nextBoundary, formatDateTime, renderStatus,
  mountSessionState,
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

    // RainFocus does not order sessionTimes chronologically: 21 of the 40 published
    // multi-slot MAX26 sessions have a first entry that is not the earliest.
    it('returns the earliest slot, not the first in array order', () => {
      setMetadata('session-times', JSON.stringify([
        { startTimeMillis: 5000, endTimeMillis: 6000, timezone: 'UTC' },
        { startTimeMillis: 1000, endTimeMillis: 2000, timezone: 'UTC' },
      ]));
      expect(getSessionTimes()).to.deep.equal({ start: 1000, end: 2000, timezone: 'UTC' });
    });
  });

  describe('getAllSessionTimes', () => {
    it('sorts every slot by start', () => {
      setMetadata('session-times', JSON.stringify([
        { startTimeMillis: 5000, endTimeMillis: 6000, timezone: 'UTC' },
        { startTimeMillis: 1000, endTimeMillis: 2000, timezone: 'UTC' },
        { startTimeMillis: 3000, endTimeMillis: 4000, timezone: 'UTC' },
      ]));
      expect(getAllSessionTimes().map((s) => s.start)).to.deep.equal([1000, 3000, 5000]);
    });

    it('drops slots with no start and applies the length fallback per slot', () => {
      setMetadata('session-times', JSON.stringify([
        { startTimeMillis: 1000, timezone: 'UTC' },
        { endTimeMillis: 9999, timezone: 'UTC' },
      ]));
      setMetadata('session-length-in-minutes', '30');
      expect(getAllSessionTimes()).to.deep.equal([
        { start: 1000, end: 1000 + (30 * 60000), timezone: 'UTC' },
      ]);
    });

    it('returns [] when absent or invalid', () => {
      expect(getAllSessionTimes()).to.deep.equal([]);
      setMetadata('session-times', 'not json');
      expect(getAllSessionTimes()).to.deep.equal([]);
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

    // A 10am session with a 6pm premiere: live inside either slot, on-demand in the gap.
    describe('multiple slots', () => {
      const slots = [{ start: 1000, end: 2000 }, { start: 5000, end: 6000 }];
      it('is upcoming before the earliest start', () => {
        expect(getState(500, slots)).to.equal('upcoming');
      });
      it('is live inside the first slot', () => expect(getState(1500, slots)).to.equal('live'));
      it('is on-demand between the slots', () => {
        expect(getState(2001, slots)).to.equal('on-demand');
        expect(getState(4999, slots)).to.equal('on-demand');
      });
      it('is live again inside the second slot', () => {
        expect(getState(5000, slots)).to.equal('live');
        expect(getState(6000, slots)).to.equal('live');
      });
      it('is on-demand after the final end', () => {
        expect(getState(6001, slots)).to.equal('on-demand');
      });
      it('ignores array order', () => {
        const reversed = [{ start: 5000, end: 6000 }, { start: 1000, end: 2000 }];
        expect(getState(500, reversed)).to.equal('upcoming');
        expect(getState(1500, reversed)).to.equal('live');
      });
    });
  });

  describe('nextBoundary', () => {
    const slots = [{ start: 1000, end: 2000 }, { start: 5000, end: 6000 }];
    it('targets the first start before anything has begun', () => {
      expect(nextBoundary(500, slots)).to.equal(1000);
    });
    it('targets the current slot end while live', () => {
      expect(nextBoundary(1500, slots)).to.equal(2000);
    });
    it('targets the next slot start from inside the gap', () => {
      expect(nextBoundary(2001, slots)).to.equal(5000);
    });
    it('returns null once every slot has ended, so the timer stops', () => {
      expect(nextBoundary(6001, slots)).to.be.null;
    });
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

  describe('renderStatus on-demand: Coming soon for an IPOD session with no recording yet', () => {
    const times = { start: 1794518100000, timezone: 'America/Los_Angeles' };
    // Real page shapes. IPOD = Format carrying both in-person and on-demand-post-event.
    const IPOD = [{ value: 'in-person', label: 'In-Person' }, { value: 'on-demand-post-event', label: 'On demand, post event' }];
    const IN_PERSON_ONLY = [{ value: 'in-person', label: 'In-Person' }];
    const ONLINE = [{ value: 'online', label: 'Online' }];
    const POST_EVENT_ONLY = [{ value: 'on-demand-post-event', label: 'On demand, post event' }];
    const MPC_RECORDING = { provider: 'mpc', url: 'https://video.tv.adobe.com/v/3433462', kind: 'onDemand' };

    const setPage = ({ videos = [], format = [] }) => {
      setMetadata('session-times', JSON.stringify([{ endTimeMillis: 1, videos }]));
      setMetadata('custom-attributes', JSON.stringify([{ name: 'Format', values: format }]));
    };

    it('IPOD with no recording yet -> Coming soon', () => {
      setPage({ videos: [], format: IPOD });
      const el = renderStatus('on-demand', times);
      expect(el.textContent).to.equal('Coming soon');
      expect(el.classList.contains('session-status--coming-soon')).to.be.true;
    });

    it('IPOD once the recording is attached -> On-demand', () => {
      setPage({ videos: [MPC_RECORDING], format: IPOD });
      expect(renderStatus('on-demand', times).textContent).to.equal('On-demand');
    });

    it('IPOD with only a leftover liveStream entry -> Coming soon', () => {
      setPage({
        videos: [{ provider: 'youtube', url: 'https://youtube.com/watch?v=x', kind: 'liveStream' }],
        format: IPOD,
      });
      expect(renderStatus('on-demand', times).textContent).to.equal('Coming soon');
    });

    it('IPOD with a non-embeddable provider only -> Coming soon', () => {
      setPage({ videos: [{ provider: 'mobilerider', url: 'x', kind: 'dvr' }], format: IPOD });
      expect(renderStatus('on-demand', times).textContent).to.equal('Coming soon');
    });

    it('matches the Format slug even with no display label', () => {
      setPage({
        videos: [],
        format: [{ value: 'in-person', label: '' }, { value: 'on-demand-post-event', label: '' }],
      });
      expect(renderStatus('on-demand', times).textContent).to.equal('Coming soon');
    });

    // Everything below is NOT IPOD, so it stays On-demand regardless of video presence.
    it('online/virtual session with no video -> On-demand (not IPOD)', () => {
      setPage({ videos: [], format: ONLINE });
      expect(renderStatus('on-demand', times).textContent).to.equal('On-demand');
    });

    it('on-demand-post-event without in-person -> On-demand (not IPOD)', () => {
      setPage({ videos: [], format: POST_EVENT_ONLY });
      expect(renderStatus('on-demand', times).textContent).to.equal('On-demand');
    });

    it('in-person only, never posted -> On-demand (not IPOD)', () => {
      setPage({ videos: [], format: IN_PERSON_ONLY });
      expect(renderStatus('on-demand', times).textContent).to.equal('On-demand');
    });

    it('no Format attribute at all -> On-demand', () => {
      setPage({ videos: [], format: [] });
      expect(renderStatus('on-demand', times).textContent).to.equal('On-demand');
    });

    // The real template session: youtube liveStream + mpc onDemand + mobilerider dvr.
    it('the real IPOD template session (mpc onDemand present) -> On-demand', () => {
      setPage({
        videos: [
          { provider: 'youtube', url: 'https://www.youtube.com/watch?v=O7z5ufUh8hc', kind: 'liveStream' },
          MPC_RECORDING,
          { provider: 'mobilerider', url: 'https://mobilerider.com/video/0srCQZ5MIu', kind: 'dvr' },
        ],
        format: IPOD,
      });
      expect(renderStatus('on-demand', times).textContent).to.equal('On-demand');
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

    // A 10am session that has finished, with a 6pm premiere still to come. The eyebrow
    // reads On-demand, but Add to schedule comes back because the final end has not passed.
    it('offers Add to schedule in the gap between slots, then Watch now at the premiere', async () => {
      setMetadata('session-id', 'sid');
      const premiere = Date.now() + 150;
      setMetadata('session-times', JSON.stringify([
        { startTimeMillis: premiere, endTimeMillis: premiere + 3600000, timezone: 'UTC' },
        { startTimeMillis: Date.now() - 7200000, endTimeMillis: Date.now() - 3600000, timezone: 'UTC' },
      ]));
      const { statusSlot, primaryCtaSlot } = slots();
      mountSessionState({ statusSlot, primaryCtaSlot });

      expect(statusSlot.textContent).to.equal('On-demand');
      expect(primaryCtaSlot.querySelector('.session-schedule')).to.not.be.null;

      await new Promise((r) => { setTimeout(r, 800); });
      expect(statusSlot.textContent).to.equal('Live');
      expect(primaryCtaSlot.querySelector('.session-watch-now')).to.not.be.null;
      expect(primaryCtaSlot.querySelector('.session-schedule')).to.be.null;
    });

    it('drops the CTA entirely once the final slot has ended', () => {
      setMetadata('session-id', 'sid');
      setMetadata('session-times', JSON.stringify([
        { startTimeMillis: Date.now() - 7200000, endTimeMillis: Date.now() - 3600000, timezone: 'UTC' },
        { startTimeMillis: Date.now() - 3000000, endTimeMillis: Date.now() - 1800000, timezone: 'UTC' },
      ]));
      const { statusSlot, primaryCtaSlot } = slots();
      mountSessionState({ statusSlot, primaryCtaSlot });

      expect(statusSlot.textContent).to.equal('On-demand');
      expect(primaryCtaSlot.children.length).to.equal(0);
    });

    it('still drops the CTA after a single slot ends', () => {
      setMetadata('session-id', 'sid');
      setMetadata('session-times', JSON.stringify([
        { startTimeMillis: Date.now() - 7200000, endTimeMillis: Date.now() - 3600000, timezone: 'UTC' },
      ]));
      const { statusSlot, primaryCtaSlot } = slots();
      mountSessionState({ statusSlot, primaryCtaSlot });

      expect(primaryCtaSlot.children.length).to.equal(0);
    });
  });
});
