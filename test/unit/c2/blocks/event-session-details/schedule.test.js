import { expect } from '@esm-bundle/chai';
import { setMetadata } from '../../../../../event-libs/v1/utils/utils.js';
import { renderSchedule } from '../../../../../event-libs/v1/c2/blocks/event-session-details/schedule.js';
import { scheduled, sessions, auth } from '../../../../../event-libs/v1/utils/session-store.js';
import { toast } from '../../../../../event-libs/v1/features/toast/toast.js';

describe('session-details schedule', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
    scheduled.value = new Set();
    sessions.value = [];
    auth.value = { isLoggedIn: null, isRegistered: undefined, userFirstName: null };
    toast.value = null;
  });

  it('returns null without a session id', () => {
    expect(renderSchedule()).to.be.null;
  });

  it('renders an Add to schedule button', () => {
    setMetadata('session-id', 'sid');
    const btn = renderSchedule();
    expect(btn.classList.contains('session-schedule')).to.be.true;
    expect(btn.textContent).to.contain('Add to schedule');
    // The visible label carries the state, so aria-pressed is intentionally absent
    // (setting both would double-announce it).
    expect(btn.hasAttribute('aria-pressed')).to.be.false;
  });

  it('reflects the scheduled signal', () => {
    setMetadata('session-id', 'sid');
    const btn = renderSchedule();
    scheduled.value = new Set(['sid']);
    expect(btn.classList.contains('is-scheduled')).to.be.true;
    expect(btn.textContent).to.contain('Added to schedule');
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

  it('shows a login toast when scheduling while signed out', async () => {
    setMetadata('session-id', 'sid');
    renderSchedule().click();
    await new Promise((r) => { setTimeout(r); });
    expect(toast.value?.message).to.match(/login/i);
  });
});
