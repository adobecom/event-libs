import { expect } from '@esm-bundle/chai';

import { runSessionAction, toggleScheduleWithFeedback, checkViewAccess } from '../../../../event-libs/v1/services/sessions/action-feedback.js';
import { SessionActionError } from '../../../../event-libs/v1/services/sessions/session-actions.js';
import { toasts } from '../../../../event-libs/v1/features/toast/toast.js';
import { conflict } from '../../../../event-libs/v1/features/conflict-modal/conflict-modal.js';
import {
  auth, sessions, sessionsStatus, liveStreamActiveIds, scheduled, pendingActions,
} from '../../../../event-libs/v1/utils/session-store.js';

describe('services/sessions/action-feedback', () => {
  const eventConfig = { title: 'Adobe MAX 2026', registerUrl: '/register' };
  let loggedMessages;
  let originalLog;

  beforeEach(() => {
    toasts.value = [];
    conflict.value = null;
    loggedMessages = [];
    originalLog = window.lana.log;
    window.lana.log = (msg) => loggedMessages.push(msg);
  });

  afterEach(() => {
    window.lana.log = originalLog;
  });

  it('shows the success toast when the action resolves', async () => {
    await runSessionAction(() => Promise.resolve(), {
      eventConfig, actionLabel: 'add to schedule', successMessage: 'Added to schedule', successVariant: 'positive',
    });
    expect(toasts.value[0].message).to.equal('Added to schedule');
    expect(toasts.value[0].variant).to.equal('positive');
  });

  it('shows nothing when the action resolves without a successMessage', async () => {
    await runSessionAction(() => Promise.resolve(), { eventConfig, actionLabel: 'add to schedule' });
    expect(toasts.value).to.have.lengthOf(0);
  });

  it('shows a login-required toast on auth-required', async () => {
    const actionFn = () => Promise.reject(new SessionActionError('auth-required'));
    await runSessionAction(actionFn, { eventConfig, actionLabel: 'add to schedule' });
    expect(toasts.value[0].message).to.equal('Login required to add to schedule');
    expect(toasts.value[0].ctaLabel).to.equal('Login to Adobe');
    expect(toasts.value[0].duration).to.be.null;
  });

  it('shows a registration-required toast including the event title', async () => {
    const actionFn = () => Promise.reject(new SessionActionError('registration-required'));
    await runSessionAction(actionFn, { eventConfig, actionLabel: 'add to favorites' });
    expect(toasts.value[0].message).to.equal('Registration for Adobe MAX 2026 required to add to favorites');
    expect(toasts.value[0].ctaLabel).to.equal('Register');
    expect(toasts.value[0].ctaHref).to.equal('/register');
  });

  it('shows the shared conflict modal on a scheduling conflict', async () => {
    const existingSession = { id: 'existing' };
    const incoming = { id: 'incoming' };
    const actionFn = () => Promise.reject(
      new SessionActionError('conflict', { conflict: existingSession, incoming }),
    );
    await runSessionAction(actionFn, { eventConfig, actionLabel: 'add to schedule' });
    expect(conflict.value.existing).to.equal(existingSession);
    expect(conflict.value.incoming).to.equal(incoming);
    expect(conflict.value.onConfirm).to.be.a('function');
    expect(toasts.value).to.have.lengthOf(0);
  });

  it('shows a generic error toast and logs on any other failure', async () => {
    const actionFn = () => Promise.reject(new SessionActionError('network', { cause: new Error('boom') }));
    await runSessionAction(actionFn, { eventConfig, actionLabel: 'add to schedule' });
    expect(toasts.value[0].message).to.equal('Something went wrong. Please try again.');
    expect(toasts.value[0].variant).to.equal('negative');
    expect(loggedMessages[0]).to.include('add to schedule failed');
  });

  // No tier-1-event-config metadata authored anywhere in this file, so
  // getAllowDoubleBooking() defaults to false — mirrors a page that hasn't set the
  // flag, where a genuine time conflict must still block scheduling.
  it('toggleScheduleWithFeedback surfaces the conflict modal for a real time conflict when allowDoubleBooking is unset', async () => {
    auth.value = { isLoggedIn: true, isRegistered: true, userFirstName: null };
    pendingActions.value = new Set();
    const existingSession = {
      id: 'existing', startTimeUtc: '2026-10-28T16:00:00Z', endTimeUtc: '2026-10-28T17:00:00Z',
    };
    const incoming = {
      id: 'incoming', startTimeUtc: '2026-10-28T16:30:00Z', endTimeUtc: '2026-10-28T17:30:00Z',
    };
    sessions.value = [existingSession, incoming];
    scheduled.value = new Set(['existing']);

    await toggleScheduleWithFeedback(incoming, { eventConfig, isScheduled: false });

    expect(conflict.value.existing).to.equal(existingSession);
    expect(conflict.value.incoming).to.equal(incoming);
  });

  describe('checkViewAccess', () => {
    afterEach(() => {
      sessions.value = [];
      sessionsStatus.value = 'idle';
      liveStreamActiveIds.value = new Set();
    });

    it('allows an ungated view regardless of auth, with no toast', () => {
      auth.value = { isLoggedIn: false, isRegistered: false, userFirstName: null };
      const fallback = checkViewAccess('live-upcoming', { eventConfig });
      expect(fallback).to.be.null;
      expect(toasts.value).to.have.lengthOf(0);
    });

    it('allows a gated view when logged in and registered, with no toast', () => {
      auth.value = { isLoggedIn: true, isRegistered: true, userFirstName: null };
      const fallback = checkViewAccess('my-sessions', { eventConfig });
      expect(fallback).to.be.null;
      expect(toasts.value).to.have.lengthOf(0);
    });

    it('blocks with a login toast when logged out', () => {
      auth.value = { isLoggedIn: false, isRegistered: false, userFirstName: null };
      const fallback = checkViewAccess('my-sessions', { eventConfig });
      expect(fallback).to.equal('live-upcoming');
      expect(toasts.value[0].message).to.equal('Login required to view My sessions');
      expect(toasts.value[0].ctaLabel).to.equal('Login to Adobe');
    });

    it('blocks with a registration toast (including event title) when logged in but not registered', () => {
      auth.value = { isLoggedIn: true, isRegistered: false, userFirstName: null };
      const fallback = checkViewAccess('my-favorites', { eventConfig });
      expect(fallback).to.equal('live-upcoming');
      expect(toasts.value[0].message).to.equal('Registration for Adobe MAX 2026 required to view My favorites');
      expect(toasts.value[0].ctaLabel).to.equal('Register');
      expect(toasts.value[0].ctaHref).to.equal('/register');
    });

    it('falls back to live-upcoming when sessions have not loaded yet', () => {
      auth.value = { isLoggedIn: false, isRegistered: false, userFirstName: null };
      sessionsStatus.value = 'loading';
      sessions.value = [];
      expect(checkViewAccess('my-sessions', { eventConfig })).to.equal('live-upcoming');
    });

    it('falls back to on-demand once every session has ended (post-event)', () => {
      auth.value = { isLoggedIn: false, isRegistered: false, userFirstName: null };
      sessionsStatus.value = 'ready';
      sessions.value = [
        { id: 's-1', startTimeUtc: '2020-01-01T00:00:00Z', endTimeUtc: '2020-01-01T01:00:00Z' },
      ];
      liveStreamActiveIds.value = new Set();
      expect(checkViewAccess('my-sessions', { eventConfig })).to.equal('on-demand');
    });

    it('falls back to live-upcoming while any session is still live or upcoming', () => {
      auth.value = { isLoggedIn: false, isRegistered: false, userFirstName: null };
      sessionsStatus.value = 'ready';
      sessions.value = [
        { id: 's-1', startTimeUtc: '2099-01-01T00:00:00Z', endTimeUtc: '2099-01-01T01:00:00Z' },
      ];
      liveStreamActiveIds.value = new Set();
      expect(checkViewAccess('my-sessions', { eventConfig })).to.equal('live-upcoming');
    });
  });
});
