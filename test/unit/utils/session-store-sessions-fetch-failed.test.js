import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { setMetadata } from '../../../event-libs/v1/utils/utils.js';

// session-store.js holds module-level singleton state (initialized, apiConfig, etc.) that
// @web/test-runner does not reliably reset between test files sharing a worker session —
// cache-bust the import so this file gets its own fresh instance regardless.
const {
  initSessionState, sessionsStatus, SESSIONS_RETRY_DELAYS_MS,
} = await import(`../../../event-libs/v1/utils/session-store.js?t=${Math.random()}`);

// Real-time wait (setInterval isn't faked): the fetch path awaits a real dynamic import.
function flush(ms = 150) {
  return new Promise((resolve) => {
    const id = setInterval(() => { clearInterval(id); resolve(); }, ms);
  });
}

// Every attempt fails, so the store only settles to 'error' after the last retry (MWPW-213410).
async function runUntilSessionsError(clock) {
  for (let i = 0; i < 40 && sessionsStatus.value !== 'error'; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await flush();
    clock.tick(Math.max(...SESSIONS_RETRY_DELAYS_MS));
  }
}

describe('session-store: session-catalog fetch failure reports to lana, not console', () => {
  let originalFetch;
  let lanaLogStub;
  let consoleErrorSpy;
  let clock;
  let catalogCalls = 0;

  before(async () => {
    clock = sinon.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    originalFetch = window.fetch;
    window.fetch = async (url) => {
      if (url.includes('session-catalog')) {
        catalogCalls += 1;
        throw new Error('network error');
      }
      return { ok: true, status: 200, json: async () => ({}) };
    };

    lanaLogStub = sinon.stub(window.lana, 'log');
    consoleErrorSpy = sinon.spy(console, 'error');

    setMetadata('tier-1-event-config', JSON.stringify({ eventId: 'event-99' }));
    initSessionState();
    await runUntilSessionsError(clock);
  });

  after(() => {
    clock.restore();
    window.fetch = originalFetch;
    lanaLogStub.restore();
    consoleErrorSpy.restore();
    document.head.querySelector('meta[name="tier-1-event-config"]')?.remove();
  });

  it('does not fall back to console.error', () => {
    expect(consoleErrorSpy.called).to.equal(false);
  });

  it('tries the first request plus every scheduled retry', () => {
    expect(catalogCalls).to.equal(1 + SESSIONS_RETRY_DELAYS_MS.length);
  });

  it('reports the final failure to lana as an error with the eventId and env for triage', () => {
    // sessions-api.js logs each raw fetch failure; session-store.js adds eventId/env context:
    // warnings while it can still retry, one error once the retries run out.
    const storeCalls = lanaLogStub.getCalls().filter((call) => call.args[1]?.tags === 'session-store,sessions');
    expect(storeCalls).to.have.lengthOf(1 + SESSIONS_RETRY_DELAYS_MS.length);
    storeCalls.slice(0, -1).forEach((call) => expect(call.args[1].severity).to.equal('warning'));
    const [message, options] = storeCalls[storeCalls.length - 1].args;
    expect(message).to.include('sessions fetch failed');
    expect(message).to.include('event-99');
    expect(message).to.include('network error');
    expect(message).to.include(`(attempt ${1 + SESSIONS_RETRY_DELAYS_MS.length})`);
    expect(options).to.include({ tags: 'session-store,sessions', severity: 'error' });
  });

  it('settles sessionsStatus to error', () => {
    expect(sessionsStatus.value).to.equal('error');
  });
});
