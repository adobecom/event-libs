import { expect } from '@esm-bundle/chai';
import {
  initSessionState, getApiConfig, sessionsStatus,
} from '../../../event-libs/v1/utils/session-store.js';
import { setMetadata } from '../../../event-libs/v1/utils/utils.js';
import { DEFAULT_RF_PROFILE_ID } from '../../../event-libs/v1/services/sessions/rainfocus.js';

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

describe('session-store: RF config fallback chain without a tier-1-event-config payload', () => {
  // No tier-1-event-config metadata authored here — only the legacy flat rainfocus-api-url
  // metadata, with rainfocus-api-profile-id left unset, to exercise both fallback rungs.
  before(async () => {
    setMetadata('rainfocus-api-url', 'https://example.com/from-flat-metadata/');
    initSessionState();
    await waitForSessionsReady();
  });

  it('falls back to flat rainfocus-api-url metadata when no tier-1-event-config is authored', () => {
    expect(getApiConfig().apiUrl).to.equal('https://example.com/from-flat-metadata/');
  });

  it('falls back to DEFAULT_RF_PROFILE_ID when no profile id is authored anywhere', () => {
    expect(getApiConfig().profileId).to.equal(DEFAULT_RF_PROFILE_ID);
  });
});
