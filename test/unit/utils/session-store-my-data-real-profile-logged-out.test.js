import { expect } from '@esm-bundle/chai';
import { setMetadata } from '../../../event-libs/v1/utils/utils.js';
import BlockMediator from '../../../event-libs/v1/deps/block-mediator.min.js';

// session-store.js holds module-level singleton state (initialized, apiConfig, etc.) that
// @web/test-runner does not reliably reset between test files sharing a worker session —
// cache-bust the import so this file gets its own fresh instance regardless.
const {
  initSessionState, getApiConfig, sessionsStatus, scheduled, favorited,
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

describe('session-store: myData is skipped when a real IMS profile confirms logged-out', () => {
  let originalFetch;
  let originalLocalStorage;
  let myDataCalled;

  before(async () => {
    // A real, resolved profile that isn't signed in — distinct from the "no profile captured
    // yet" case: this exercises realAuthConfirmed=true with isLoggedIn=false, not just an
    // absent BlockMediator key. Also resets rsvpData in case another test file left one.
    BlockMediator.set('imsProfile', { noProfile: true });
    BlockMediator.set('rsvpData', undefined);

    // localStorage is real, shared, browser-wide state — seedDevData()/loadPersisted() would
    // otherwise read whatever another test file's run happened to leave behind. Swap in an
    // in-memory stub scoped to this page with known values, so myData not firing can be
    // verified precisely (an empty store isn't "untouched" — seedDevData() unconditionally
    // seeds a mock schedule/favorites into any store that doesn't already have one).
    originalLocalStorage = window.localStorage;
    const store = new Map([
      ['sessions:scheduled', JSON.stringify(['k-001'])],
      ['sessions:favorited', JSON.stringify(['s-001'])],
    ]);
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key) => store.get(key) ?? null,
        setItem: (key, value) => store.set(key, String(value)),
        removeItem: (key) => store.delete(key),
      },
    });

    originalFetch = window.fetch;
    myDataCalled = false;
    window.fetch = async (url) => {
      if (url.includes('myData')) myDataCalled = true;
      return { ok: true, status: 200, json: async () => ({ mySchedule: [], sessionInterests: [] }) };
    };

    setMetadata('tier-1-event-config', JSON.stringify({ rfApiUrl: 'https://mock.example/api' }));
    initSessionState();
    await waitForSessionsReady();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  after(() => {
    window.fetch = originalFetch;
    Object.defineProperty(window, 'localStorage', { configurable: true, value: originalLocalStorage });
    document.head.querySelector('meta[name="tier-1-event-config"]')?.remove();
  });

  it('still loads the ESL session catalog', () => {
    expect(getApiConfig().apiUrl).to.equal('https://mock.example/api');
    expect(sessionsStatus.value).to.equal('ready');
  });

  it('never calls myData, leaving persisted scheduled/favorited untouched', () => {
    expect(myDataCalled).to.be.false;
    expect(scheduled.value).to.deep.equal(new Set(['k-001']));
    expect(favorited.value).to.deep.equal(new Set(['s-001']));
  });
});
