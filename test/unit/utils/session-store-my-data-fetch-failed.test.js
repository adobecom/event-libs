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

describe('session-store: myData fetch failure settles isRegistered instead of hanging forever', () => {
  let originalFetch;

  before(async () => {
    originalFetch = window.fetch;
    window.fetch = async (url) => {
      if (url.includes('/jwt')) {
        return { ok: true, status: 200, json: async () => ({ rfAuthToken: 'exchanged-token' }) };
      }
      if (url.includes('session-catalog')) {
        return { ok: true, status: 200, json: async () => ({ sessions: [], sessionTimes: [], speakers: [] }) };
      }
      // A real rfAuthToken was granted, but the myData call itself fails outright (network
      // error, 5xx, etc.) — this is what maybeLoadMyData()'s no-token branch does NOT cover,
      // since a token was obtained; loadMyData()'s own catch is what has to settle isRegistered.
      throw new Error('network error');
    };

    BlockMediator.set('imsProfile', { first_name: 'Test', account_type: 'type1', userId: 'user-4' });

    setMetadata('tier-1-event-config', JSON.stringify({ rfApiUrl: 'https://mock.example/api' }));
    initSessionState();
    await waitForSessionsReady();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  after(() => {
    window.fetch = originalFetch;
    document.head.querySelector('meta[name="tier-1-event-config"]')?.remove();
    BlockMediator.set('imsProfile', undefined);
  });

  it('settles isRegistered to null (checked, unknown) rather than leaving it undefined forever', () => {
    expect(auth.value.isRegistered).to.be.null;
  });
});
