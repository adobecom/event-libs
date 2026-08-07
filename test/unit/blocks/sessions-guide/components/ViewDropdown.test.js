import { expect } from '@esm-bundle/chai';
import { resolveViewSelection } from '../../../../../event-libs/v1/blocks/sessions-guide/components/ViewDropdown.js';
import { toast } from '../../../../../event-libs/v1/features/toast/toast.js';
import {
  auth, sessions, sessionsStatus, liveStreamActiveIds,
} from '../../../../../event-libs/v1/utils/session-store.js';

describe('ViewDropdown resolveViewSelection', () => {
  const eventConfig = { title: 'Adobe MAX 2026', registerUrl: '/register' };

  beforeEach(() => {
    toast.value = null;
    sessions.value = [];
    sessionsStatus.value = 'idle';
    liveStreamActiveIds.value = new Set();
  });

  it('always allows an ungated view, regardless of auth', () => {
    auth.value = { isLoggedIn: false, isRegistered: false, userFirstName: null };
    expect(resolveViewSelection('live-upcoming', { eventConfig })).to.equal('live-upcoming');
    expect(toast.value).to.be.null;
  });

  it('lands on the requested gated view when logged in and registered', () => {
    auth.value = { isLoggedIn: true, isRegistered: true, userFirstName: null };
    expect(resolveViewSelection('my-sessions', { eventConfig })).to.equal('my-sessions');
    expect(toast.value).to.be.null;
  });

  it('redirects to the fallback and shows a login toast when logged out', () => {
    auth.value = { isLoggedIn: false, isRegistered: false, userFirstName: null };
    expect(resolveViewSelection('my-sessions', { eventConfig })).to.equal('live-upcoming');
    expect(toast.value.message).to.equal('Login required to view My sessions');
  });

  it('redirects to the fallback and shows a registration toast when unregistered', () => {
    auth.value = { isLoggedIn: true, isRegistered: false, userFirstName: null };
    expect(resolveViewSelection('my-favorites', { eventConfig })).to.equal('live-upcoming');
    expect(toast.value.message).to.equal('Registration for Adobe MAX 2026 required to view My favorites');
  });
});
