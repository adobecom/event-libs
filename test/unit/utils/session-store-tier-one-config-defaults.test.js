import { expect } from '@esm-bundle/chai';
import { setMetadata } from '../../../event-libs/v1/utils/utils.js';
import { STAGE_RF_API_URL, DEFAULT_RF_PROFILE_ID } from '../../../event-libs/v1/services/sessions/rainfocus.js';

// session-store.js holds module-level singleton state (initialized, apiConfig, etc.) that
// @web/test-runner does not reliably reset between test files sharing a worker session —
// cache-bust the import so this file gets its own fresh instance regardless.
const {
  initSessionState, getApiConfig, sessionsStatus,
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

describe('session-store: RF defaults when tier-1-event-config omits them', () => {
  let originalFetch;

  before(async () => {
    // Only apiConfig is under test here, not the session catalog — stub the real ESL
    // fetch (event-id is unset, so it'd otherwise hit the network) with an empty payload.
    originalFetch = window.fetch;
    window.fetch = async () => new Response(JSON.stringify({ sessions: [], sessionTimes: [], speakers: [] }));

    setMetadata('tier-1-event-config', JSON.stringify({ allowDoubleBooking: true }));
    initSessionState();
    await waitForSessionsReady();
  });

  after(() => {
    window.fetch = originalFetch;
    document.head.querySelector('meta[name="tier-1-event-config"]')?.remove();
  });

  // The test harness's global miloConfig mock (test/unit/scripts/mocks/event-config.js) sets
  // env.name: 'local' — the same non-prod IMS environment a real local dev session would have
  // — so the env-aware default correctly resolves to the stage RF endpoint here, not the prod
  // one (see session-store-rf-env.test.js for the 'prod' branch).
  it('falls back to STAGE_RF_API_URL/DEFAULT_RF_PROFILE_ID/the hardcoded register default/null eventEndMs', () => {
    const apiConfig = getApiConfig();
    expect(apiConfig.apiUrl).to.equal(STAGE_RF_API_URL);
    expect(apiConfig.profileId).to.equal(DEFAULT_RF_PROFILE_ID);
    expect(apiConfig.registerUrl).to.equal('/register');
    expect(apiConfig.eventEndMs).to.equal(null);
  });
});
