import { expect } from '@esm-bundle/chai';
import {
  initSessionState, getApiConfig, sessionsStatus,
} from '../../../event-libs/v1/utils/session-store.js';
import { setMetadata } from '../../../event-libs/v1/utils/utils.js';
import { DEFAULT_RF_API_URL, DEFAULT_RF_PROFILE_ID } from '../../../event-libs/v1/services/sessions/rainfocus.js';

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

  it('falls back to DEFAULT_RF_API_URL/DEFAULT_RF_PROFILE_ID', () => {
    const apiConfig = getApiConfig();
    expect(apiConfig.apiUrl).to.equal(DEFAULT_RF_API_URL);
    expect(apiConfig.profileId).to.equal(DEFAULT_RF_PROFILE_ID);
  });
});
