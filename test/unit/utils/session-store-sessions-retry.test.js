import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { setMetadata } from '../../../event-libs/v1/utils/utils.js';

// session-store.js keeps module-level state, so each file needs its own instance; see
// session-store-sessions-fetch-failed.test.js for the path where every retry fails.
const {
  initSessionState, sessions, sessionsStatus, SESSIONS_RETRY_DELAYS_MS,
} = await import(`../../../event-libs/v1/utils/session-store.js?t=${Math.random()}`);

const CATALOG = {
  sessions: [{
    sessionId: 's-1',
    sessionCode: 'OS1',
    localizations: { 'en-US': { title: 'Retried session' } },
    customAttributes: [{ name: 'Format', values: [{ value: 'Online' }] }],
  }],
  sessionTimes: [],
  speakers: [],
};

// Real-time wait (setInterval isn't faked): the fetch path awaits a real dynamic import.
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

describe('session-store: session-catalog retry (MWPW-213410)', () => {
  let clock;
  let originalFetch;
  let catalogCalls;
  let failNext;
  let lanaLogStub;
  const statuses = [];

  before(async () => {
    clock = sinon.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    lanaLogStub = sinon.stub(window.lana, 'log');
    originalFetch = window.fetch;
    catalogCalls = 0;
    failNext = 2;
    window.fetch = async (url) => {
      if (!String(url).includes('/event-retry/session-catalog')) return { ok: true, status: 200, json: async () => ({}) };
      catalogCalls += 1;
      if (failNext > 0) {
        failNext -= 1;
        throw new TypeError('Load failed');
      }
      return { ok: true, status: 200, json: async () => CATALOG };
    };
    sessionsStatus.subscribe((status) => statuses.push(status));

    setMetadata('tier-1-event-config', JSON.stringify({ eventId: 'event-retry' }));
    initSessionState();
    await waitFor(() => catalogCalls === 1);
    await flush();
  });

  after(() => {
    clock.restore();
    lanaLogStub.restore();
    window.fetch = originalFetch;
    document.head.querySelector('meta[name="tier-1-event-config"]')?.remove();
  });

  it('keeps loading after the first failure instead of showing an error', () => {
    expect(catalogCalls).to.equal(1);
    expect(sessionsStatus.value).to.equal('loading');
  });

  it('retries after each backoff delay and populates sessions once one succeeds', async () => {
    clock.tick(SESSIONS_RETRY_DELAYS_MS[0]);
    await waitFor(() => catalogCalls === 2);
    await flush();
    expect(sessionsStatus.value).to.equal('loading');

    clock.tick(SESSIONS_RETRY_DELAYS_MS[1]);
    await waitFor(() => sessionsStatus.value === 'ready');
    expect(catalogCalls).to.equal(3);
    expect(sessions.value.map((s) => s.id)).to.deep.equal(['s-1']);
  });

  it('never reports error while a retry can still succeed', () => {
    expect(statuses).to.not.include('error');
  });

  it('stops retrying once loaded', async () => {
    clock.tick(Math.max(...SESSIONS_RETRY_DELAYS_MS) * 2);
    await flush();
    expect(catalogCalls).to.equal(3);
  });

  it('logs each retried failure to lana as a warning with its attempt number', () => {
    const storeCalls = lanaLogStub.getCalls().filter((call) => call.args[1]?.tags === 'session-store,sessions');
    expect(storeCalls).to.have.lengthOf(2);
    storeCalls.forEach((call) => expect(call.args[1].severity).to.equal('warning'));
    expect(storeCalls[0].args[0]).to.include('event-retry').and.include('(attempt 1), retrying');
    expect(storeCalls[1].args[0]).to.include('(attempt 2), retrying');
  });
});
