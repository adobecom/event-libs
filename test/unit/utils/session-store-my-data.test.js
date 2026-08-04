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

describe('session-store: myData maps RF sessionTimeID to our session ids', () => {
  let originalFetch;

  before(async () => {
    originalFetch = window.fetch;
    // rfCode 'S001'/'K001' match the mock catalog's session ids 's-001'/'k-001'
    // (event-libs/v1/services/sessions/sessions-api.js) — 'UNKNOWN' has no match.
    window.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        mySchedule: [{ sessionTimeID: 'S001' }],
        sessionInterests: [{ sessionTimeID: 'K001' }, { sessionTimeID: 'UNKNOWN' }],
      }),
    });

    setMetadata('tier-1-event-config', JSON.stringify({ rfApiUrl: 'https://mock.example/api' }));
    initSessionState();
    await waitForSessionsReady();
    // loadMyData() is fire-and-forget, chained after the (already-awaited) sessions fetch —
    // give its own stubbed fetch a tick to resolve and apply.
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  after(() => {
    window.fetch = originalFetch;
  });

  it('resolves the real RF response into apiConfig-backed scheduled/favorited ids', () => {
    expect(getApiConfig().apiUrl).to.equal('https://mock.example/api');
    expect(scheduled.value).to.deep.equal(new Set(['s-001']));
    expect(favorited.value).to.deep.equal(new Set(['k-001']));
  });
});
