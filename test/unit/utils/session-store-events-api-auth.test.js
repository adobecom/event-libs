import { expect } from '@esm-bundle/chai';
import { setMetadata } from '../../../event-libs/v1/utils/utils.js';
import BlockMediator from '../../../event-libs/v1/deps/block-mediator.min.js';

// MWPW-207006: window.events.getRegistrationDetails() (da-events' registration-cache.js) is
// now the primary source of both isRegistered and the RF auth token, replacing the /max-api/jwt
// exchange as the default. The exchange itself stays in session-store.js as a fallback for pages
// missing da-events' event-code metadata (see the dependency note in the MWPW-207006 plan doc).
//
// session-store.js holds module-level singleton state (initialized, eventApiConfig, etc.) that
// @web/test-runner does not reliably reset between test files sharing a worker session — each
// describe block below cache-busts its own import so it gets a fresh instance regardless.

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
    // BlockMediator is a real, shared singleton across test files (unlike session-store.js's
    // cache-busted copy) — reset so this profile doesn't leak into whichever test runs next.
    BlockMediator.set('imsProfile', undefined);
  });

  it('primary path: sources isRegistered and rfAuthToken from window.events, never calls /max-api/jwt', async () => {
    const store = await import(`../../../event-libs/v1/utils/session-store.js?t=${Math.random()}`);
    // loggedInUser is deliberately empty — the legacy heuristic would read this as
    // isRegistered:false, so a passing "isRegistered:true" here proves the real signal won,
    // not a coincidence of both paths agreeing.
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
    // window.events intentionally not set.

    BlockMediator.set('imsProfile', { first_name: 'Test', account_type: 'type1', userId: 'user-2' });
    setMetadata('tier-1-event-config', JSON.stringify({ rfApiUrl: 'https://mock.example/api' }));
    store.initSessionState();
    await waitForReady(store.sessionsStatus);
    await new Promise((resolve) => { setTimeout(resolve, 0); });

    expect(fetchState.jwtCalled).to.be.true;
    expect(store.auth.value.isRegistered).to.be.true;
  });

  // Reproduced live on broadcast-dev (2026-09): da-events' own cache can answer isRegistered
  // from localStorage while its sessionStorage-scoped auth cache is stale/missing, so
  // getRegistrationDetails() resolves successfully with no authToken at all.
  it('fallback: isRegistered resolves but no authToken comes with it — falls back to the jwt exchange for the credential only, keeping the real isRegistered', async () => {
    const store = await import(`../../../event-libs/v1/utils/session-store.js?t=${Math.random()}`);
    // loggedInUser is deliberately empty — if the legacy heuristic were allowed to overwrite
    // isRegistered once the fallback jwt/myData completes, this would flip it to false.
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
