import { expect } from '@esm-bundle/chai';

// session-store.js holds module-level singleton state (initialized, eventApiConfig, etc.) that
// @web/test-runner does not reliably reset between test files sharing a worker session —
// cache-bust the import so this file gets its own fresh instance regardless.
const { initSessionState, getEventApiConfig } = await import(`../../../event-libs/v1/utils/session-store.js?t=${Math.random()}`);

describe('session-store: no tier-1-event-config authored', () => {
  before(() => {
    // Defends against a tier-1-event-config <meta> left behind by another test file
    // sharing this document — this test's premise is that the metadata is absent.
    document.head.querySelector('meta[name="tier-1-event-config"]')?.remove();
  });

  it('no-ops without initializing eventApiConfig', () => {
    initSessionState();
    expect(getEventApiConfig()).to.be.null;
  });
});
