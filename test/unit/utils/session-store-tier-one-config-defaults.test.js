import { expect } from '@esm-bundle/chai';
import { setMetadata } from '../../../event-libs/v1/utils/utils.js';
import { DEFAULT_RF_API_URL, DEFAULT_RF_PROFILE_ID } from '../../../event-libs/v1/services/sessions/rainfocus.js';

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
  before(async () => {
    setMetadata('tier-1-event-config', JSON.stringify({ allowDoubleBooking: true }));
    initSessionState();
    await waitForSessionsReady();
  });

  after(() => {
    document.head.querySelector('meta[name="tier-1-event-config"]')?.remove();
  });

  it('falls back to DEFAULT_RF_API_URL/DEFAULT_RF_PROFILE_ID', () => {
    const apiConfig = getApiConfig();
    expect(apiConfig.apiUrl).to.equal(DEFAULT_RF_API_URL);
    expect(apiConfig.profileId).to.equal(DEFAULT_RF_PROFILE_ID);
  });
});
