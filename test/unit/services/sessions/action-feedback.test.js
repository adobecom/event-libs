import { expect } from '@esm-bundle/chai';

import { runSessionAction } from '../../../../event-libs/v1/services/sessions/action-feedback.js';
import { SessionActionError } from '../../../../event-libs/v1/services/sessions/session-actions.js';
import { toast } from '../../../../event-libs/v1/features/toast/toast.js';
import { conflict } from '../../../../event-libs/v1/features/conflict-modal/conflict-modal.js';

describe('services/sessions/action-feedback', () => {
  const eventConfig = { title: 'Adobe MAX 2026', registerUrl: '/register' };
  let loggedMessages;
  let originalLog;

  beforeEach(() => {
    toast.value = null;
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
    expect(toast.value.message).to.equal('Added to schedule');
    expect(toast.value.variant).to.equal('positive');
  });

  it('shows nothing when the action resolves without a successMessage', async () => {
    await runSessionAction(() => Promise.resolve(), { eventConfig, actionLabel: 'add to schedule' });
    expect(toast.value).to.be.null;
  });

  it('shows a login-required toast on auth-required', async () => {
    const actionFn = () => Promise.reject(new SessionActionError('auth-required'));
    await runSessionAction(actionFn, { eventConfig, actionLabel: 'add to schedule' });
    expect(toast.value.message).to.equal('Login required to add to schedule');
    expect(toast.value.ctaLabel).to.equal('Login to Adobe');
    expect(toast.value.duration).to.be.null;
  });

  it('shows a registration-required toast including the event title', async () => {
    const actionFn = () => Promise.reject(new SessionActionError('registration-required'));
    await runSessionAction(actionFn, { eventConfig, actionLabel: 'add to favorites' });
    expect(toast.value.message).to.equal('Registration for Adobe MAX 2026 required to add to favorites');
    expect(toast.value.ctaLabel).to.equal('Register');
    expect(toast.value.ctaHref).to.equal('/register');
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
    expect(toast.value).to.be.null;
  });

  it('shows a generic error toast and logs on any other failure', async () => {
    const actionFn = () => Promise.reject(new SessionActionError('network', { cause: new Error('boom') }));
    await runSessionAction(actionFn, { eventConfig, actionLabel: 'add to schedule' });
    expect(toast.value.message).to.equal('Something went wrong. Please try again.');
    expect(toast.value.variant).to.equal('negative');
    expect(loggedMessages[0]).to.include('add to schedule failed');
  });
});
