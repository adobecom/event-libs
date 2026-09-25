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

describe('session-store: window.events.getRegistrationDetails — rejects', () => {
  let originalFetch;
  let jwtCalled;

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
      return { ok: true, status: 200, json: async () => ({ mySchedule: [], sessionInterests: [], loggedInUser: { firstName: 'Test' } }) };
    };
    window.events = { getRegistrationDetails: () => Promise.reject(new Error('rf-auth-seq-generic down')) };

    BlockMediator.set('imsProfile', { first_name: 'Test', account_type: 'type1', userId: 'user-4' });

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

  it('demotes to the legacy jwt exchange', () => {
    expect(jwtCalled).to.be.true;
  });

  it('still derives isRegistered via the myData heuristic', () => {
    expect(auth.value.isRegistered).to.be.true;
  });
});
