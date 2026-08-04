import { expect } from '@esm-bundle/chai';
import {
  initSessionState, getApiConfig, sessionsStatus, scheduled, favorited,
} from '../../../event-libs/v1/utils/session-store.js';
import { setMetadata } from '../../../event-libs/v1/utils/utils.js';

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

describe('session-store: myData is skipped for a logged-out/unregistered visitor', () => {
  let originalFetch;
  let originalLocalStorage;
  let myDataCalled;

  before(async () => {
    // localStorage is shared browser-wide, including with other test files running
    // concurrently — a real sg:dev-auth write here would race with them. Swap the whole
    // object for an in-memory stub scoped to this page instead of touching the real one.
    const store = new Map([
      ['sg:dev-auth', JSON.stringify({ isLoggedIn: false, isRegistered: false })],
      ['sessions:scheduled', JSON.stringify(['k-001'])],
      ['sessions:favorited', JSON.stringify(['s-001'])],
    ]);
    originalLocalStorage = window.localStorage;
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
