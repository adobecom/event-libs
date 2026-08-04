import { expect } from '@esm-bundle/chai';
import { initSessionState, getApiConfig } from '../../../event-libs/v1/utils/session-store.js';

describe('session-store: no tier-1-event-config authored', () => {
  it('no-ops without initializing apiConfig', () => {
    initSessionState();
    expect(getApiConfig()).to.be.null;
  });
});
