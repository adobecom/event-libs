import { expect } from '@esm-bundle/chai';
import {
  initSessionState, getApiConfig, sessionsStatus,
} from '../../../event-libs/v1/utils/session-store.js';
import { setMetadata } from '../../../event-libs/v1/utils/utils.js';
import { RF_PROFILE_IDS } from '../../../event-libs/v1/services/sessions/rainfocus.js';

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

describe('session-store: tier-1-event-config as the RF config source', () => {
  // initSessionState() is idempotent and reads metadata once — set both the
  // Configurator's consolidated JSON payload and the legacy flat metadata here,
  // before the only call this file makes, so priority can be asserted afterward.
  before(async () => {
    setMetadata('tier-1-event-config', JSON.stringify({
      rfApiUrl: 'https://example.com/from-tier-1-config/',
      rfProfileId: 'profile-from-tier-1-config',
    }));
    setMetadata('rainfocus-api-url', 'https://example.com/from-flat-metadata/');
    setMetadata('rainfocus-api-profile-id', 'profile-from-flat-metadata');
    initSessionState();
    await waitForSessionsReady();
  });

  it('sources apiUrl/profileId from the tier-1-event-config JSON over flat metadata', () => {
    const apiConfig = getApiConfig();
    expect(apiConfig.apiUrl).to.equal('https://example.com/from-tier-1-config/');
    expect(apiConfig.profileId).to.equal('profile-from-tier-1-config');
  });

  it('sanity-checks the fallback default is a real MAX26 profile id, not this test\'s value', () => {
    expect(RF_PROFILE_IDS.max26).to.not.equal('profile-from-tier-1-config');
  });
});
