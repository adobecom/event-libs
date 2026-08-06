import { expect } from '@esm-bundle/chai';
import { setMetadata } from '../../../event-libs/v1/utils/utils.js';
import BlockMediator from '../../../event-libs/v1/deps/block-mediator.min.js';

// session-store.js holds module-level singleton state (initialized, apiConfig, etc.) that
// @web/test-runner does not reliably reset between test files sharing a worker session —
// cache-bust the import so this file gets its own fresh instance regardless.
const {
  initSessionState, getApiConfig, sessionsStatus, scheduled, favorited, auth,
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

describe('session-store: myData maps RF sessionTimeID to our session ids', () => {
  let originalFetch;
  let jwtRequestUrl;
  let myDataRequestUrl;

  before(async () => {
    originalFetch = window.fetch;
    // rfCode 'S001'/'K001' come from the stubbed ESL session-catalog response below, mapped
    // to session ids 's-001'/'k-001' by mapEslPayloadToRawSessions() — 'UNKNOWN' has no match.
    window.fetch = async (url) => {
      if (url.includes('/jwt')) {
        jwtRequestUrl = url;
        return { ok: true, status: 200, json: async () => ({ rfAuthToken: 'exchanged-token' }) };
      }
      if (url.includes('session-catalog')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            sessions: [
              { sessionId: 's-001', sessionCode: 'S001' },
              { sessionId: 'k-001', sessionCode: 'K001' },
            ],
            sessionTimes: [],
            speakers: [],
          }),
        };
      }
      myDataRequestUrl = url;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          mySchedule: [{ sessionTimeID: 'S001' }],
          sessionInterests: [{ sessionTimeID: 'K001' }, { sessionTimeID: 'UNKNOWN' }],
          loggedInUser: { firstName: 'Test' },
        }),
      };
    };

    // userId drives the jwt exchange for a real rfAuthToken.
    BlockMediator.set('imsProfile', { first_name: 'Test', account_type: 'type1', userId: 'user-1' });

    setMetadata('tier-1-event-config', JSON.stringify({ rfApiUrl: 'https://mock.example/api' }));
    initSessionState();
    await waitForSessionsReady();
    // loadMyData() is fire-and-forget, chained after the jwt exchange and the (already-awaited)
    // sessions fetch — give both their own stubbed fetches a tick to resolve and apply.
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  after(() => {
    window.fetch = originalFetch;
    document.head.querySelector('meta[name="tier-1-event-config"]')?.remove();
    // BlockMediator is a real, shared singleton across test files (unlike session-store.js's
    // cache-busted copy) — reset so this profile doesn't leak into whichever test runs next.
    BlockMediator.set('imsProfile', undefined);
  });

  it('exchanges the IMS userId for an rfAuthToken and uses it in the myData call', () => {
    expect(jwtRequestUrl).to.include('clientId=user-1');
    expect(myDataRequestUrl).to.include('rfAuthToken=exchanged-token');
  });

  it('resolves the real RF response into apiConfig-backed scheduled/favorited ids', () => {
    expect(getApiConfig().apiUrl).to.equal('https://mock.example/api');
    expect(scheduled.value).to.deep.equal(new Set(['s-001']));
    expect(favorited.value).to.deep.equal(new Set(['k-001']));
  });

  it('derives isRegistered from a populated loggedInUser', () => {
    expect(auth.value.isRegistered).to.be.true;
  });
});
