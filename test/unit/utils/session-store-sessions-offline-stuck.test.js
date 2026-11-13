import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { setMetadata } from '../../../event-libs/v1/utils/utils.js';

// Fresh module instance per file: session-store.js keeps module-level state.
const {
  initSessionState, sessionsStatus, SESSIONS_RETRY_DELAYS_MS, SESSIONS_OFFLINE_RETRY_MS,
} = await import(`../../../event-libs/v1/utils/session-store.js?t=${Math.random()}`);

// Real-time wait: the fetch path awaits a real dynamic import, which fake timers don't advance.
function flush(ms = 150) {
  return new Promise((resolve) => {
    const id = setInterval(() => { clearInterval(id); resolve(); }, ms);
  });
}

async function waitFor(predicate) {
  for (let i = 0; i < 40 && !predicate(); i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await flush();
  }
}

describe('session-store: session-catalog load with navigator.onLine stuck offline (MWPW-213410)', () => {
  let clock;
  let originalFetch;
  let catalogCalls;
  let lanaLogStub;
  const statuses = [];

  before(async () => {
    clock = sinon.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    lanaLogStub = sinon.stub(window.lana, 'log');
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
    originalFetch = window.fetch;
    catalogCalls = 0;
    window.fetch = async (url) => {
      if (!String(url).includes('/event-stuck/session-catalog')) return { ok: true, status: 200, json: async () => ({}) };
      catalogCalls += 1;
      return { ok: false, status: 503, json: async () => ({}) };
    };
    sessionsStatus.subscribe((status) => statuses.push(status));

    setMetadata('tier-1-event-config', JSON.stringify({ eventId: 'event-stuck' }));
    initSessionState();
    await waitFor(() => catalogCalls === 1);
    await flush();
  });

  after(() => {
    clock.restore();
    lanaLogStub.restore();
    window.fetch = originalFetch;
    delete navigator.onLine;
    document.head.querySelector('meta[name="tier-1-event-config"]')?.remove();
  });

  it('retries on the fallback timer, counting each one as an attempt', async () => {
    for (let i = 1; i <= SESSIONS_RETRY_DELAYS_MS.length; i += 1) {
      expect(sessionsStatus.value).to.equal('loading');
      clock.tick(SESSIONS_OFFLINE_RETRY_MS - 1);
      // eslint-disable-next-line no-await-in-loop
      await flush();
      expect(catalogCalls).to.equal(i);
      clock.tick(1);
      // eslint-disable-next-line no-await-in-loop
      await waitFor(() => catalogCalls === i + 1);
    }
  });

  it('settles to error once the attempts run out, instead of loading forever', async () => {
    await waitFor(() => sessionsStatus.value === 'error');
    expect(sessionsStatus.value).to.equal('error');
    expect(catalogCalls).to.equal(1 + SESSIONS_RETRY_DELAYS_MS.length);
    const errors = lanaLogStub.getCalls().filter((call) => call.args[1]?.severity === 'error');
    expect(errors).to.have.lengthOf(1);
    expect(errors[0].args[1].tags).to.equal('session-store,sessions');
  });

  it('leaves no listener or timer behind', async () => {
    window.dispatchEvent(new Event('online'));
    clock.tick(SESSIONS_OFFLINE_RETRY_MS * 2);
    await flush();
    expect(catalogCalls).to.equal(1 + SESSIONS_RETRY_DELAYS_MS.length);
    expect(statuses.filter((s) => s === 'error')).to.have.lengthOf(1);
  });
});
