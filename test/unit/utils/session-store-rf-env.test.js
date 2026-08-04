import { expect } from '@esm-bundle/chai';
import { setMetadata, getEventConfig, updateEventConfig } from '../../../event-libs/v1/utils/utils.js';
import { DEFAULT_RF_API_URL, STAGE_RF_API_URL } from '../../../event-libs/v1/services/sessions/rainfocus.js';

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

describe('session-store: RF endpoint default matches milo\'s real page env', () => {
  let originalConfig;

  before(async () => {
    // getEventConfig() is a real, shared singleton (like BlockMediator) — the global mock sets
    // miloConfig.env.name: 'local' for every test; override to 'prod' just for this one.
    originalConfig = getEventConfig();
    updateEventConfig(originalConfig, { ...originalConfig.miloConfig, env: { name: 'prod' } });

    setMetadata('tier-1-event-config', JSON.stringify({ allowDoubleBooking: true }));
    initSessionState();
    await waitForSessionsReady();
  });

  after(() => {
    updateEventConfig(originalConfig, originalConfig.miloConfig);
    document.head.querySelector('meta[name="tier-1-event-config"]')?.remove();
  });

  it('uses DEFAULT_RF_API_URL (not STAGE_RF_API_URL) when miloConfig.env.name is prod', () => {
    const apiConfig = getApiConfig();
    expect(apiConfig.apiUrl).to.equal(DEFAULT_RF_API_URL);
    expect(apiConfig.apiUrl).to.not.equal(STAGE_RF_API_URL);
  });
});
