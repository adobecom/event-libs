import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { setMetadata } from '../../../event-libs/v1/utils/utils.js';

// session-store.js holds module-level singleton state (initialized, apiConfig, etc.) that
// @web/test-runner does not reliably reset between test files sharing a worker session —
// cache-bust the import so this file gets its own fresh instance regardless.
const {
  initSessionState, sessionsStatus,
} = await import(`../../../event-libs/v1/utils/session-store.js?t=${Math.random()}`);

function waitForSessionsError() {
  if (sessionsStatus.value === 'error') return Promise.resolve();
  return new Promise((resolve) => {
    const unsubscribe = sessionsStatus.subscribe((status) => {
      if (status !== 'error') return;
      unsubscribe();
      resolve();
    });
  });
}

describe('session-store: session-catalog fetch failure reports to lana, not console', () => {
  let originalFetch;
  let lanaLogStub;
  let consoleErrorSpy;

  before(async () => {
    originalFetch = window.fetch;
    window.fetch = async (url) => {
      if (url.includes('session-catalog')) throw new Error('network error');
      return { ok: true, status: 200, json: async () => ({}) };
    };

    lanaLogStub = sinon.stub(window.lana, 'log');
    consoleErrorSpy = sinon.spy(console, 'error');

    setMetadata('tier-1-event-config', JSON.stringify({ eventId: 'event-99' }));
    initSessionState();
    await waitForSessionsError();
  });

  after(() => {
    window.fetch = originalFetch;
    lanaLogStub.restore();
    consoleErrorSpy.restore();
    document.head.querySelector('meta[name="tier-1-event-config"]')?.remove();
  });

  it('does not fall back to console.error', () => {
    expect(consoleErrorSpy.called).to.equal(false);
  });

  it('reports the failure to lana with the eventId and env for triage', () => {
    expect(lanaLogStub.calledOnce).to.equal(true);
    const [message] = lanaLogStub.firstCall.args;
    expect(message).to.include('[session-store] sessions fetch failed');
    expect(message).to.include('event-99');
    expect(message).to.include('network error');
  });

  it('settles sessionsStatus to error', () => {
    expect(sessionsStatus.value).to.equal('error');
  });
});
