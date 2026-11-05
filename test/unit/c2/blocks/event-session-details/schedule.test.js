import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { setMetadata } from '../../../../../event-libs/v1/utils/utils.js';
import { renderSchedule } from '../../../../../event-libs/v1/c2/blocks/event-session-details/schedule.js';
import {
  scheduled, sessions, sessionsStatus, auth, initSessionState, sessionStateVersion,
} from '../../../../../event-libs/v1/utils/session-store.js';
import { toasts } from '../../../../../event-libs/v1/features/toast/toast.js';

describe('session-details schedule', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
    scheduled.value = new Set();
    sessions.value = [];
    auth.value = { isLoggedIn: null, isRegistered: undefined, userFirstName: null };
    toasts.value = [];
  });

  it('returns null without a session id', () => {
    expect(renderSchedule()).to.be.null;
  });

  it('renders an Add to schedule button', () => {
    setMetadata('session-id', 'sid');
    const btn = renderSchedule();
    expect(btn.classList.contains('session-schedule')).to.be.true;
    expect(btn.textContent).to.contain('Add to schedule');
    // The visible label states a state, not an action, so aria-pressed carries the toggle
    // affordance. No aria-label, so the visible text stays the accessible name (2.5.3).
    expect(btn.getAttribute('aria-pressed')).to.equal('false');
    expect(btn.hasAttribute('aria-label')).to.be.false;
  });

  it('reflects the scheduled signal', () => {
    setMetadata('session-id', 'sid');
    const btn = renderSchedule();
    scheduled.value = new Set(['sid']);
    expect(btn.classList.contains('is-scheduled')).to.be.true;
    expect(btn.textContent).to.contain('Added to schedule');
  });

  // The visible label is a state ("Added to schedule"), so aria-pressed is what tells a
  // screen-reader user the button toggles back off. Matches sessions-guide.
  it('exposes toggle state via aria-pressed', () => {
    setMetadata('session-id', 'sid');
    const btn = renderSchedule();
    expect(btn.getAttribute('aria-pressed')).to.equal('false');
    scheduled.value = new Set(['sid']);
    expect(btn.getAttribute('aria-pressed')).to.equal('true');
    scheduled.value = new Set();
    expect(btn.getAttribute('aria-pressed')).to.equal('false');
  });

  // The visible label flips to "Added to schedule", and Milo only auto-tags once at
  // decoration, so daa-ll is repainted alongside it. Labels match sessions-guide's LiveCard.
  it('tracks add vs remove in daa-ll and updates it on toggle', () => {
    setMetadata('session-id', 'sid');
    const btn = renderSchedule();
    expect(btn.getAttribute('daa-ll')).to.equal('Add-to-Schedule');
    scheduled.value = new Set(['sid']);
    expect(btn.getAttribute('daa-ll')).to.equal('Remove-from-Schedule');
    scheduled.value = new Set();
    expect(btn.getAttribute('daa-ll')).to.equal('Add-to-Schedule');
  });

  it('shows a register/sign-in toast when scheduling while signed out', async () => {
    setMetadata('session-id', 'sid');
    renderSchedule().click();
    await new Promise((r) => { setTimeout(r); });
    expect(toasts.value[0]?.message).to.match(/register or sign in/i);
  });

  describe('repeated sessions', () => {
    let fetchStub;
    let cards;

    beforeEach(async () => {
      fetchStub = sinon.stub(window, 'fetch').callsFake(async () => ({
        ok: true,
        json: async () => ({ sessions: [], sessionTimes: [], responseCode: '0' }),
      }));
      setMetadata('tier-1-event-config', JSON.stringify({ eventId: 'schedule-repeat' }));
      initSessionState();
      if (sessionsStatus.value !== 'ready') {
        await new Promise((resolve) => {
          const unsubscribe = sessionsStatus.subscribe((status) => {
            if (status !== 'ready') return;
            unsubscribe();
            resolve();
          });
        });
      }
      setMetadata('session-id', 'sid');
      auth.value = { isLoggedIn: true, isRegistered: true };
      cards = [
        {
          id: 'sid', sessionId: 'sid', sessionTimeId: 'past-time', rfCode: 'past',
          startTimeUtc: '2000-01-01T10:00:00Z', endTimeUtc: '2000-01-01T11:00:00Z',
        },
        {
          id: 'sid', sessionId: 'sid', sessionTimeId: 'next-time', rfCode: 'next',
          startTimeUtc: '2099-01-01T10:00:00Z', endTimeUtc: '2099-01-01T11:00:00Z',
        },
        {
          id: 'sid', sessionId: 'sid', sessionTimeId: 'later-time', rfCode: 'later',
          startTimeUtc: '2099-01-02T10:00:00Z', endTimeUtc: '2099-01-02T11:00:00Z',
        },
      ];
      sessions.value = cards;
      fetchStub.resetHistory();
    });

    afterEach(() => {
      fetchStub.restore();
    });

    it('schedules the next future slot, not the earliest past slot', async () => {
      const btn = renderSchedule();
      btn.click();
      await new Promise((resolve) => { setTimeout(resolve); });
      const request = fetchStub.getCalls().find((call) => call.args[0].includes('addSession'));
      expect(new URL(request.args[0]).searchParams.get('sessionTimeId')).to.equal('next');
      expect(scheduled.value).to.deep.equal(new Set(['next-time']));
      expect(btn.getAttribute('aria-pressed')).to.equal('true');
    });

    it('reflects and removes an already scheduled future slot instead of adding another', async () => {
      scheduled.value = new Set(['later-time']);
      const btn = renderSchedule();
      expect(btn.getAttribute('aria-pressed')).to.equal('true');
      btn.click();
      await new Promise((resolve) => { setTimeout(resolve); });
      const request = fetchStub.getCalls().find((call) => call.args[0].includes('removeSession'));
      expect(new URL(request.args[0]).searchParams.get('sessionTimeId')).to.equal('later');
      expect(scheduled.value.size).to.equal(0);
    });

    it('resolves cards arriving after the button renders and disables expired repeats', () => {
      sessions.value = [];
      const btn = renderSchedule();
      scheduled.value = new Set(['next-time']);
      sessions.value = cards;
      expect(btn.getAttribute('aria-pressed')).to.equal('true');
      sessions.value = [
        cards[0],
        { ...cards[0], sessionTimeId: 'other-time', rfCode: 'other' },
      ];
      sessionStateVersion.value += 1;
      expect(btn.disabled).to.be.true;
    });
  });
});
