import { expect } from '@esm-bundle/chai';
import { resolveViewSelection, visibleViews } from '../../../../../../event-libs/v1/c2/blocks/sessions-guide/components/ViewDropdown.js';
import { toasts } from '../../../../../../event-libs/v1/features/toast/toast.js';
import {
  auth, sessions, sessionsStatus, liveStreamActiveIds,
} from '../../../../../../event-libs/v1/utils/session-store.js';

describe('ViewDropdown resolveViewSelection', () => {
  const eventConfig = { title: 'Adobe MAX 2026', registerUrl: '/register' };

  beforeEach(() => {
    toasts.value = [];
    sessions.value = [];
    sessionsStatus.value = 'idle';
    liveStreamActiveIds.value = new Set();
  });

  it('always allows an ungated view, regardless of auth', () => {
    auth.value = { isLoggedIn: false, isRegistered: false, userFirstName: null };
    expect(resolveViewSelection('live-upcoming', { eventConfig })).to.equal('live-upcoming');
    expect(toasts.value).to.have.lengthOf(0);
  });

  it('lands on the requested gated view when logged in and registered', () => {
    auth.value = { isLoggedIn: true, isRegistered: true, userFirstName: null };
    expect(resolveViewSelection('my-sessions', { eventConfig })).to.equal('my-sessions');
    expect(toasts.value).to.have.lengthOf(0);
  });

  it('redirects to the fallback and shows a login toast when logged out', () => {
    auth.value = { isLoggedIn: false, isRegistered: false, userFirstName: null };
    expect(resolveViewSelection('my-sessions', { eventConfig })).to.equal('live-upcoming');
    expect(toasts.value[0].message).to.equal('Login required to view My sessions');
  });

  it('redirects to the fallback and shows a registration toast when unregistered', () => {
    auth.value = { isLoggedIn: true, isRegistered: false, userFirstName: null };
    expect(resolveViewSelection('my-favorites', { eventConfig })).to.equal('live-upcoming');
    expect(toasts.value[0].message).to.equal('Registration for Adobe MAX 2026 required to view My favorites');
  });
});

// Post-event the store bounces live-upcoming straight back to on-demand, so offering it is a
// dead option — see store/index.js's auto-transition.
describe('ViewDropdown visibleViews', () => {
  const values = (isPost) => visibleViews(isPost).map((v) => v.value);

  it('offers every view during the event', () => {
    expect(values(false)).to.deep.equal(['live-upcoming', 'my-sessions', 'my-favorites', 'on-demand']);
  });

  it('drops Live & upcoming post-event, keeping the rest in order', () => {
    expect(values(true)).to.deep.equal(['my-sessions', 'my-favorites', 'on-demand']);
  });

  it('never offers a view the store would immediately transition away from', () => {
    expect(values(true)).to.not.include('live-upcoming');
  });

  it('keeps on-demand available in both states, since it is the post-event landing view', () => {
    expect(values(false)).to.include('on-demand');
    expect(values(true)).to.include('on-demand');
  });

  it('leaves the shared VIEWS list unmutated between calls', () => {
    visibleViews(true);
    expect(values(false)).to.have.lengthOf(4);
  });
});
