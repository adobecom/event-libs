import { expect } from '@esm-bundle/chai';
import { setMetadata } from '../../../event-libs/v1/utils/utils.js';
import BlockMediator from '../../../event-libs/v1/deps/block-mediator.min.js';
import {
  initSessionState, auth, sessions, scheduled, getSessionAuthGeneration, SessionAuthChangedError,
} from '../../../event-libs/v1/utils/session-store.js';
import { resolveScheduleConflict } from '../../../event-libs/v1/services/sessions/session-actions.js';
import { toggleScheduleWithFeedback, toggleFavoriteWithFeedback } from '../../../event-libs/v1/services/sessions/action-feedback.js';
import { toasts } from '../../../event-libs/v1/features/toast/toast.js';
import { stopSessionStateTicker } from '../../../event-libs/v1/services/sessions/session-state-ticker.js';
import { setNotificationScope } from '../../../event-libs/v1/features/swan-notifications/notification-store.js';

async function waitFor(predicate) {
  const deadline = Date.now() + 2000;
  while (!predicate() && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  expect(predicate()).to.equal(true);
}

describe('session-store: memoized primary auth and conflict actions stay attendee-bound', () => {
  let originalFetch;
  let originalEvents;
  let primaryCalls = 0;
  const myDataTokens = [];
  const actionRequests = [];
  let resolveRemove;

  before(() => {
    originalFetch = window.fetch;
    originalEvents = window.events;
    const cachedDetails = Promise.resolve({ isRegistered: true, authToken: 'token-a' });
    window.events = {
      getRegistrationDetails: () => {
        primaryCalls += 1;
        return cachedDetails;
      },
    };
    window.fetch = async (url) => {
      const parsed = new URL(url, location.origin);
      if (parsed.pathname.endsWith('/jwt')) {
        const userId = parsed.searchParams.get('clientId');
        expect(['user-a', 'user-b']).to.include(userId);
        return { ok: true, json: async () => ({ rfAuthToken: userId === 'user-a' ? 'token-a' : 'token-b' }) };
      }
      if (url.includes('session-catalog')) {
        return {
          ok: true,
          json: async () => ({
            sessions: ['conflict', 'incoming'].map((id) => ({
              sessionId: id, sessionCode: id, externalSessionId: `rf-${id}`,
              customAttributes: [{ name: 'Format', values: [{ label: 'Online', value: 'online' }] }],
            })),
            sessionTimes: ['conflict', 'incoming'].map((id) => ({
              sessionId: id, externalSessionTimeId: `rf-${id}-time`,
              startTimeMillis: Date.now() - 60_000, endTimeMillis: Date.now() + 1_800_000,
            })),
            speakers: [],
          }),
        };
      }
      if (parsed.pathname.endsWith('/myData')) {
        myDataTokens.push(parsed.searchParams.get('rfAuthToken'));
        return {
          ok: true,
          json: async () => ({
            mySchedule: [{ sessionTimeID: 'conflict-time' }],
            sessionInterests: [],
            loggedInUser: { firstName: 'Test' },
          }),
        };
      }
      actionRequests.push(url);
      if (parsed.pathname.endsWith('/removeSession')) {
        return new Promise((resolve) => {
          resolveRemove = () => resolve({ ok: true, json: async () => ({ responseCode: '0' }) });
        });
      }
      return { ok: true, json: async () => ({ responseCode: '0' }) };
    };
    setMetadata('swan-notifications', 'feds');
    setMetadata('tier-1-event-config', JSON.stringify({
      eventId: 'test-memoized-primary', rfApiUrl: 'https://mock.example/api',
    }));
  });

  after(() => {
    window.fetch = originalFetch;
    window.events = originalEvents;
    stopSessionStateTicker();
    BlockMediator.set('imsProfile', null);
    ['swan-notifications', 'tier-1-event-config'].forEach((name) => {
      document.head.querySelector(`meta[name="${name}"]`)?.remove();
    });
    setNotificationScope(null, null, null);
  });

  it('does not reuse account A\'s cached token for B or continue A/B conflict operations after a switch', async () => {
    // da-events may have cached A before this store initializes without a profile.
    BlockMediator.set('imsProfile', null);
    initSessionState();
    await waitFor(() => sessions.value.length === 2);
    BlockMediator.set('imsProfile', { userId: 'user-b', account_type: 'type1' });
    await waitFor(() => scheduled.value.has('conflict') && auth.value.isRegistered === true);
    expect(myDataTokens).to.deep.equal(['token-b']);
    expect(primaryCalls).to.equal(0);
    BlockMediator.set('imsProfile', { userId: 'user-a', account_type: 'type1' });
    await waitFor(() => myDataTokens.length === 2 && auth.value.isRegistered === true);
    const generationA = getSessionAuthGeneration();
    const conflict = sessions.value.find((session) => session.id === 'conflict');
    const incoming = sessions.value.find((session) => session.id === 'incoming');

    BlockMediator.set('imsProfile', { userId: 'user-b', account_type: 'type1' });
    await waitFor(() => myDataTokens.length === 3 && auth.value.isRegistered === true);
    expect(myDataTokens).to.deep.equal(['token-b', 'token-a', 'token-b']);
    expect(primaryCalls).to.equal(0);
    let obsoleteModalError;
    try {
      await resolveScheduleConflict(conflict, incoming, generationA);
    } catch (err) {
      obsoleteModalError = err;
    }
    expect(obsoleteModalError).to.be.instanceOf(SessionAuthChangedError);
    expect(actionRequests).to.have.lengthOf(0);

    // This is the generation captured before a card's 450ms dismissal delay.
    toasts.value = [];
    await toggleScheduleWithFeedback(incoming, {
      eventConfig: {}, isScheduled: true, generation: generationA,
    });
    await toggleFavoriteWithFeedback(incoming, {
      eventConfig: {}, isFavorited: true, generation: generationA,
    });
    expect(actionRequests).to.have.lengthOf(0);
    expect(toasts.value).to.have.lengthOf(0);

    let cancelled;
    const resolution = resolveScheduleConflict(conflict, incoming)
      .catch((err) => { cancelled = err; });
    await waitFor(() => !!resolveRemove);
    BlockMediator.set('imsProfile', { userId: 'user-a', account_type: 'type1' });
    await waitFor(() => myDataTokens.length === 4 && auth.value.isRegistered === true);
    resolveRemove();
    await resolution;
    expect(cancelled).to.be.instanceOf(SessionAuthChangedError);
    expect(actionRequests).to.have.lengthOf(1);
    expect(actionRequests[0]).to.include('removeSession');
    expect(actionRequests[0]).to.include('rfAuthToken=token-b');
    expect(myDataTokens).to.deep.equal(['token-b', 'token-a', 'token-b', 'token-a']);
  });
});
