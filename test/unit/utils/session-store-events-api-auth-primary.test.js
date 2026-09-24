import { expect } from '@esm-bundle/chai';
import { setMetadata } from '../../../event-libs/v1/utils/utils.js';
import BlockMediator from '../../../event-libs/v1/deps/block-mediator.min.js';

// session-store.js holds module-level singleton state (initialized, eventApiConfig, etc.) that
// @web/test-runner does not reliably reset between test files sharing a worker session —
// cache-bust the import so this file gets its own fresh instance regardless.
const {
  initSessionState, sessionsStatus, auth,
} = await import(`../../../event-libs/v1/utils/session-store.js?t=${Math.random()}`);

function waitForSessionsReady() {
  if (sessionsStatus.value === 'ready') return Promise.resolve();
  return new Promise((resolve) => {
    const unsubscribe = sessionsStatus.subscribe((status) => {
      if (status !== 'ready') return;
      unsubscribe();
      resolve();
    });
  });
}

describe('session-store: window.events.getRegistrationDetails — primary path', () => {
  let originalFetch;
  let jwtCalled;
  let myDataRequestUrl;

  before(async () => {
    originalFetch = window.fetch;
    jwtCalled = false;
    window.fetch = async (url) => {
      if (url.includes('/jwt')) {
        jwtCalled = true;
        return { ok: true, status: 200, json: async () => ({ authToken: 'legacy-token' }) };
      }
      if (url.includes('session-catalog')) {
        return { ok: true, status: 200, json: async () => ({ sessions: [], sessionTimes: [], speakers: [] }) };
      }
      myDataRequestUrl = url;
      // Empty loggedInUser: proves a passing isRegistered:true came from the real signal.
      return { ok: true, status: 200, json: async () => ({ mySchedule: [], sessionInterests: [], loggedInUser: {} }) };
    };
    window.events = {
      getRegistrationDetails: () => Promise.resolve({ isRegistered: true, authToken: 'events-api-token', userKey: 'uk-1' }),
    };

    BlockMediator.set('imsProfile', { first_name: 'Test', account_type: 'type1', userId: 'user-1' });

    setMetadata('tier-1-event-config', JSON.stringify({ rfApiUrl: 'https://mock.example/api' }));
    initSessionState();
    await waitForSessionsReady();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  after(() => {
    window.fetch = originalFetch;
    delete window.events;
    document.head.querySelector('meta[name="tier-1-event-config"]')?.remove();
    BlockMediator.set('imsProfile', undefined);
  });

  it('sources isRegistered and rfAuthToken from window.events', () => {
    expect(auth.value.isRegistered).to.be.true;
    expect(myDataRequestUrl).to.include('rfAuthToken=events-api-token');
  });

  it('never calls the legacy /max-api/jwt exchange', () => {
    expect(jwtCalled).to.be.false;
  });
});
