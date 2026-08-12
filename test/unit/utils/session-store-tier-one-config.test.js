import { expect } from '@esm-bundle/chai';
import { setMetadata } from '../../../event-libs/v1/utils/utils.js';

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

describe('session-store: RF config sourced from tier-1-event-config', () => {
  let originalFetch;

  before(async () => {
    // Only apiConfig is under test here, not the session catalog — stub the real ESL
    // fetch (event-id is unset, so it'd otherwise hit the network) with an empty payload.
    originalFetch = window.fetch;
    window.fetch = async () => new Response(JSON.stringify({ sessions: [], sessionTimes: [], speakers: [] }));

    setMetadata('tier-1-event-config', JSON.stringify({
      rfApiUrl: 'https://example.com/from-tier-1-config/',
      rfProfileId: 'profile-from-tier-1-config',
      registerUrl: '/from-tier-1-config/register',
    }));
    initSessionState();
    await waitForSessionsReady();
  });

  after(() => {
    window.fetch = originalFetch;
    document.head.querySelector('meta[name="tier-1-event-config"]')?.remove();
  });

  it('reads apiUrl/profileId/registerUrl from the tier-1-event-config payload', () => {
    const apiConfig = getApiConfig();
    expect(apiConfig.apiUrl).to.equal('https://example.com/from-tier-1-config/');
    expect(apiConfig.profileId).to.equal('profile-from-tier-1-config');
    expect(apiConfig.registerUrl).to.equal('/from-tier-1-config/register');
  });
});
