import { expect } from '@esm-bundle/chai';
import { setMetadata } from '../../../../../event-libs/v1/utils/utils.js';
import { renderSchedule } from '../../../../../event-libs/v1/c2/blocks/session-details/schedule.js';
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
    expect(btn.getAttribute('aria-pressed')).to.equal('false');
    expect(btn.textContent).to.contain('Add to schedule');
  });

  it('reflects the scheduled signal', () => {
    setMetadata('session-id', 'sid');
    const btn = renderSchedule();
    scheduled.value = new Set(['sid']);
    expect(btn.classList.contains('is-scheduled')).to.be.true;
    expect(btn.getAttribute('aria-pressed')).to.equal('true');
    expect(btn.textContent).to.contain('Added to schedule');
  });

  it('shows a login toast when scheduling while signed out', async () => {
    setMetadata('session-id', 'sid');
    renderSchedule().click();
    await new Promise((r) => { setTimeout(r); });
    expect(toast.value?.message).to.match(/login/i);
  });
});
