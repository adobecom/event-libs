import { expect } from '@esm-bundle/chai';
import { setMetadata } from '../../../event-libs/v1/utils/utils.js';
import BlockMediator from '../../../event-libs/v1/deps/block-mediator.min.js';

// session-store.js's module state isn't reliably reset between test files sharing a worker —
// each test below cache-busts its own import to get a fresh instance.

const EMPTY_CATALOG_RESPONSE = { sessions: [], sessionTimes: [], speakers: [] };

function waitForReady(sessionsStatus) {
  if (sessionsStatus.value === 'ready') return Promise.resolve();
  return new Promise((resolve) => {
    const unsubscribe = sessionsStatus.subscribe((status) => {
      if (status !== 'ready') return;
      unsubscribe();
      resolve();
    });
  });
}

function stubFetch({ onJwt, myDataResponse }) {
  const state = { jwtCalled: false, myDataRequestUrl: null };
  window.fetch = async (url) => {
    if (url.includes('/jwt')) {
      state.jwtCalled = true;
      return { ok: true, status: 200, json: async () => (onJwt || { authToken: 'legacy-token' }) };
    }
    if (url.includes('session-catalog')) {
      return { ok: true, status: 200, json: async () => EMPTY_CATALOG_RESPONSE };
    }
    state.myDataRequestUrl = url;
    return { ok: true, status: 200, json: async () => myDataResponse };
  };
  return state;
}

describe('session-store: window.events.getRegistrationDetails (MWPW-207006)', () => {
  let originalFetch;

  beforeEach(() => { originalFetch = window.fetch; });

  afterEach(() => {
    window.fetch = originalFetch;
    delete window.events;
    document.head.querySelector('meta[name="tier-1-event-config"]')?.remove();
    // BlockMediator is a real shared singleton — reset so it doesn't leak into the next test.
    BlockMediator.set('imsProfile', undefined);
  });

  it('primary path: sources isRegistered and rfAuthToken from window.events, never calls /max-api/jwt', async () => {
    const store = await import(`../../../event-libs/v1/utils/session-store.js?t=${Math.random()}`);
    // Empty loggedInUser: proves a passing isRegistered:true came from the real signal.
    const fetchState = stubFetch({ myDataResponse: { mySchedule: [], sessionInterests: [], loggedInUser: {} } });
    window.events = {
      getRegistrationDetails: () => Promise.resolve({ isRegistered: true, authToken: 'events-api-token', userKey: 'uk-1' }),
    };

    BlockMediator.set('imsProfile', { first_name: 'Test', account_type: 'type1', userId: 'user-1' });
    setMetadata('tier-1-event-config', JSON.stringify({ rfApiUrl: 'https://mock.example/api' }));
    store.initSessionState();
    await waitForReady(store.sessionsStatus);
    await new Promise((resolve) => { setTimeout(resolve, 0); });

    expect(store.auth.value.isRegistered).to.be.true;
    expect(fetchState.myDataRequestUrl).to.include('rfAuthToken=events-api-token');
    expect(fetchState.jwtCalled).to.be.false;
  });

  it('fallback: window.events absent falls back to the legacy jwt exchange', async () => {
    const store = await import(`../../../event-libs/v1/utils/session-store.js?t=${Math.random()}`);
    const fetchState = stubFetch({
      myDataResponse: { mySchedule: [], sessionInterests: [], loggedInUser: { firstName: 'Test' } },
    });

    BlockMediator.set('imsProfile', { first_name: 'Test', account_type: 'type1', userId: 'user-2' });
    setMetadata('tier-1-event-config', JSON.stringify({ rfApiUrl: 'https://mock.example/api' }));
    store.initSessionState();
    await waitForReady(store.sessionsStatus);
    await new Promise((resolve) => { setTimeout(resolve, 0); });

    expect(fetchState.jwtCalled).to.be.true;
    expect(store.auth.value.isRegistered).to.be.true;
  });

  it('fallback: isRegistered resolves but no authToken comes with it — falls back to the jwt exchange for the credential only, keeping the real isRegistered', async () => {
    const store = await import(`../../../event-libs/v1/utils/session-store.js?t=${Math.random()}`);
    // Empty loggedInUser: proves the fallback jwt/myData path doesn't overwrite isRegistered.
    const fetchState = stubFetch({ myDataResponse: { mySchedule: [], sessionInterests: [], loggedInUser: {} } });
    window.events = { getRegistrationDetails: () => Promise.resolve({ isRegistered: true }) };

    BlockMediator.set('imsProfile', { first_name: 'Test', account_type: 'type1', userId: 'user-4' });
    setMetadata('tier-1-event-config', JSON.stringify({ rfApiUrl: 'https://mock.example/api' }));
    store.initSessionState();
    await waitForReady(store.sessionsStatus);
    await new Promise((resolve) => { setTimeout(resolve, 0); });

    expect(fetchState.jwtCalled).to.be.true;
    expect(fetchState.myDataRequestUrl).to.include('rfAuthToken=legacy-token');
    expect(store.auth.value.isRegistered).to.be.true;
  });

  it('fallback: window.events present but getRegistrationDetails rejects demotes to the jwt exchange', async () => {
    const store = await import(`../../../event-libs/v1/utils/session-store.js?t=${Math.random()}`);
    const fetchState = stubFetch({
      myDataResponse: { mySchedule: [], sessionInterests: [], loggedInUser: { firstName: 'Test' } },
    });
    window.events = { getRegistrationDetails: () => Promise.reject(new Error('rf-auth-seq-generic down')) };

    BlockMediator.set('imsProfile', { first_name: 'Test', account_type: 'type1', userId: 'user-3' });
    setMetadata('tier-1-event-config', JSON.stringify({ rfApiUrl: 'https://mock.example/api' }));
    store.initSessionState();
    await waitForReady(store.sessionsStatus);
    await new Promise((resolve) => { setTimeout(resolve, 0); });

    expect(fetchState.jwtCalled).to.be.true;
    expect(store.auth.value.isRegistered).to.be.true;
  });
});
