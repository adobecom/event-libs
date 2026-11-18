import { expect } from '@esm-bundle/chai';
import { setMetadata } from '../../../event-libs/v1/utils/utils.js';
import BlockMediator from '../../../event-libs/v1/deps/block-mediator.min.js';

// session-store.js holds module-level singleton state (initialized, eventApiConfig, etc.) that
// @web/test-runner does not reliably reset between test files sharing a worker session —
// cache-bust the import so this file gets its own fresh instance regardless.
const {
  initSessionState, sessionsStatus, auth, rfAuthStatus,
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

// Reproduced live on broadcast-dev: da-events' own cache can answer isRegistered from
// localStorage while its sessionStorage-scoped auth cache is stale/missing, so
// getRegistrationDetails() resolves successfully with no authToken at all.
describe('session-store: window.events.getRegistrationDetails — resolves without a token', () => {
  let originalFetch;
  let jwtCalls;
  let myDataRequestUrl;
  let resolveJwt;
  let pendingAuth;
  let initialRfStatus;

  before(async () => {
    originalFetch = window.fetch;
    jwtCalls = 0;
    let markJwtStarted;
    const jwtStarted = new Promise((resolve) => { markJwtStarted = resolve; });
    const jwtResponse = new Promise((resolve) => { resolveJwt = resolve; });
    window.fetch = async (url) => {
      if (url.includes('/jwt')) {
        jwtCalls += 1;
        markJwtStarted();
        await jwtResponse;
        return { ok: true, status: 200, json: async () => ({ authToken: 'legacy-token', responseCode: '200' }) };
      }
      if (url.includes('session-catalog')) {
        return { ok: true, status: 200, json: async () => ({ sessions: [], sessionTimes: [], speakers: [] }) };
      }
      myDataRequestUrl = url;
      // Empty loggedInUser: proves the fallback jwt/myData path doesn't overwrite isRegistered.
      return { ok: true, status: 200, json: async () => ({ mySchedule: [], sessionInterests: [], loggedInUser: {} }) };
    };
    window.events = { getRegistrationDetails: () => Promise.resolve({ isRegistered: true }) };

    BlockMediator.set('imsProfile', null);

    setMetadata('tier-1-event-config', JSON.stringify({ rfApiUrl: 'https://mock.example/api' }));
    initSessionState();
    await waitForSessionsReady();
    await new Promise((resolve) => setTimeout(resolve, 0));
    initialRfStatus = rfAuthStatus.value;
    BlockMediator.set('imsProfile', { first_name: 'Test', account_type: 'type1', userId: 'user-3' });
    await jwtStarted;
    pendingAuth = { isLoggedIn: auth.value.isLoggedIn, status: rfAuthStatus.value };
    resolveJwt();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  after(() => {
    resolveJwt();
    window.fetch = originalFetch;
    delete window.events;
    document.head.querySelector('meta[name="tier-1-event-config"]')?.remove();
    BlockMediator.set('imsProfile', undefined);
  });

  it('waits for the first signed-in credential lookup instead of reporting missing credentials', () => {
    expect(initialRfStatus).to.equal('missing');
    expect(pendingAuth).to.deep.equal({ isLoggedIn: true, status: 'loading' });
  });

  it('falls back to the jwt exchange for the credential only', () => {
    expect(jwtCalls).to.equal(1);
    expect(myDataRequestUrl).to.include('rfAuthToken=legacy-token');
    expect(rfAuthStatus.value).to.equal('ready');
  });

  it('keeps the real isRegistered instead of the myData heuristic', () => {
    expect(auth.value.isRegistered).to.be.true;
  });

  it('retains available credentials when the same account signs out and back in without reloading', async () => {
    BlockMediator.set('imsProfile', null);
    await new Promise((resolve) => setTimeout(resolve, 0));
    const signedOutAuth = { isLoggedIn: auth.value.isLoggedIn, status: rfAuthStatus.value };
    BlockMediator.set('imsProfile', { first_name: 'Test', account_type: 'type1', userId: 'user-3' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(signedOutAuth).to.deep.equal({ isLoggedIn: false, status: 'ready' });
    expect(auth.value.isLoggedIn).to.be.true;
    expect(rfAuthStatus.value).to.equal('ready');
    expect(jwtCalls).to.equal(1);
    expect(myDataRequestUrl).to.include('rfAuthToken=legacy-token');
  });
});
