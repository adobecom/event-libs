import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { setMetadata } from '../../../event-libs/v1/utils/utils.js';

// Fresh module instance per file: session-store.js keeps module-level state.
const {
  initSessionState, sessions, sessionsStatus, SESSIONS_RETRY_DELAYS_MS, SESSIONS_OFFLINE_RETRY_MS,
} = await import(`../../../event-libs/v1/utils/session-store.js?t=${Math.random()}`);

const CATALOG = {
  sessions: [{
    sessionId: 's-1',
    sessionCode: 'OS1',
    localizations: { 'en-US': { title: 'Loaded after reconnecting' } },
    customAttributes: [{ name: 'Format', values: [{ value: 'Online' }] }],
  }],
  sessionTimes: [],
  speakers: [],
};

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

describe('session-store: session-catalog load while offline (MWPW-213410)', () => {
  let clock;
  let originalFetch;
  let catalogCalls;
  let online;
  let lanaLogStub;
  const statuses = [];

  before(async () => {
    clock = sinon.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    lanaLogStub = sinon.stub(window.lana, 'log');
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => online });
    online = false;
    originalFetch = window.fetch;
    catalogCalls = 0;
    window.fetch = async (url) => {
      if (!String(url).includes('/event-offline/session-catalog')) return { ok: true, status: 200, json: async () => ({}) };
      catalogCalls += 1;
      // Call 1 fails offline, call 2 fails right after reconnecting, call 3 succeeds.
      if (catalogCalls < 3) throw new TypeError('Load failed');
      return { ok: true, status: 200, json: async () => CATALOG };
    };
    sessionsStatus.subscribe((status) => statuses.push(status));

    setMetadata('tier-1-event-config', JSON.stringify({ eventId: 'event-offline' }));
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

  it('does not use up retries while the browser is offline', async () => {
    clock.tick(SESSIONS_OFFLINE_RETRY_MS - 1);
    await flush();
    expect(catalogCalls).to.equal(1);
    expect(sessionsStatus.value).to.equal('loading');
  });

  it('repeats the same attempt once back online, then retries on the normal schedule', async () => {
    online = true;
    window.dispatchEvent(new Event('online'));
    await waitFor(() => catalogCalls === 2);
    await flush();
    expect(sessionsStatus.value).to.equal('loading');

    clock.tick(SESSIONS_RETRY_DELAYS_MS[0]);
    await waitFor(() => sessionsStatus.value === 'ready');
    expect(catalogCalls).to.equal(3);
    expect(sessions.value.map((s) => s.id)).to.deep.equal(['s-1']);
  });

  it('cancels the offline fallback once the online event has fired', async () => {
    clock.tick(SESSIONS_OFFLINE_RETRY_MS * 2);
    await flush();
    expect(catalogCalls).to.equal(3);
  });

  it('never reports error, and logs the offline wait without counting it as an attempt', () => {
    expect(statuses).to.not.include('error');
    const storeCalls = lanaLogStub.getCalls().filter((call) => call.args[1]?.tags === 'session-store,sessions');
    expect(storeCalls.map((call) => call.args[1].severity)).to.deep.equal(['warning', 'warning']);
    expect(storeCalls[0].args[0]).to.include('(attempt 1), offline; retrying when back online');
    expect(storeCalls[1].args[0]).to.include('(attempt 1), retrying');
    const errors = lanaLogStub.getCalls().filter((call) => call.args[1]?.severity === 'error');
    expect(errors).to.have.lengthOf(0);
  });
});
