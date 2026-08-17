import { expect } from '@esm-bundle/chai';
import { setMetadata } from '../../../event-libs/v1/utils/utils.js';
import BlockMediator from '../../../event-libs/v1/deps/block-mediator.min.js';

// session-store.js holds module-level singleton state (initialized, apiConfig, etc.) that
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

describe('session-store: myData is skipped without an rfAuthToken', () => {
  let originalFetch;
  let myDataCalled;

  before(async () => {
    originalFetch = window.fetch;
    myDataCalled = false;
    window.fetch = async (url) => {
      // jwt exchange returns no recognizable token field — rfAuthToken stays null.
      if (url.includes('/jwt')) {
        return { ok: true, status: 200, json: async () => ({}) };
      }
      if (url.includes('session-catalog')) {
        return { ok: true, status: 200, json: async () => ({ sessions: [], sessionTimes: [], speakers: [] }) };
      }
      myDataCalled = true;
      return { ok: true, status: 200, json: async () => ({ mySchedule: [], sessionInterests: [], loggedInUser: {} }) };
    };

    BlockMediator.set('imsProfile', { first_name: 'Test', account_type: 'type1', userId: 'user-3' });

    setMetadata('tier-1-event-config', JSON.stringify({ rfApiUrl: 'https://mock.example/api' }));
    initSessionState();
    await waitForSessionsReady();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  after(() => {
    window.fetch = originalFetch;
    document.head.querySelector('meta[name="tier-1-event-config"]')?.remove();
    // BlockMediator is a real, shared singleton across test files (unlike session-store.js's
    // cache-busted copy) — reset so this profile doesn't leak into whichever test runs next.
    BlockMediator.set('imsProfile', undefined);
  });

  it('never calls myData when the jwt exchange returns no token', () => {
    expect(myDataCalled).to.be.false;
  });

  it('leaves isRegistered unknown (undefined) rather than asserting false', () => {
    expect(auth.value.isRegistered).to.be.undefined;
  });
});
