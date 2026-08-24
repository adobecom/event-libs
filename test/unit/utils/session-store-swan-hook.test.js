import { expect } from '@esm-bundle/chai';
import { setMetadata } from '../../../event-libs/v1/utils/utils.js';

// session-store.js holds module-level singleton state that @web/test-runner does not
// reliably reset between test files sharing a worker session — cache-bust the import
// so this file gets its own fresh instance regardless (matches the convention already
// used by session-store-my-data.test.js and friends).
const {
  initSessionState, toggleSchedule, scheduled, sessionsStatus,
} = await import(`../../../event-libs/v1/utils/session-store.js?t=${Math.random()}`);

const CONFIG_SHEET_PATH = '/tools/da-apps/swan-notification-configurator/configs.json';
const CONFIG_ID = 'session-store-hook-test-config-id';

const SWAN_CONFIG = {
  eventName: 'MAX 2026',
  ansEndpoint: 'https://notify-stage.adobe.io/ans/v1/notifications',
  notificationType: 'com.adobe.events.v1',
  notificationSubType: 'max26.scheduled.notifications',
  appId: 'adobecom',
  upcomingOffsetMinutes: 5,
};

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

// Races a promise against a short timeout — resolves `true` if `promise` settles first,
// `false` if the timeout wins. Used below to prove toggleSchedule() doesn't wait on the
// SWAN call, rather than merely proving the SWAN call doesn't throw (which the earlier
// version of this test could not distinguish from an accidental inline `await`).
function settlesWithin(promise, ms) {
  const timeout = new Promise((resolve) => setTimeout(() => resolve(false), ms));
  return Promise.race([promise.then(() => true), timeout]);
}

describe('session-store: toggleSchedule fires SWAN notification hooks without blocking on them', () => {
  let originalFetch;
  let originalAdobeIMS;
  let swanCallCount;
  let releaseSwanFetch;

  before(async () => {
    originalFetch = window.fetch;
    originalAdobeIMS = window.adobeIMS;
    swanCallCount = 0;
    // The SWAN/ANS/bookkeeping fetch deliberately never resolves on its own — only
    // releaseSwanFetch() (called explicitly, after the assertion below) lets it settle.
    // If toggleSchedule() were regressed to await the SWAN call inline, its own promise
    // would hang right along with this one, and the assertion below would fail.
    const swanFetchGate = new Promise((resolve) => { releaseSwanFetch = resolve; });
    window.fetch = async (url) => {
      if (typeof url === 'string' && url.includes('session-catalog')) {
        return { ok: true, status: 200, json: async () => ({ sessions: [], sessionTimes: [], speakers: [] }) };
      }
      if (typeof url === 'string' && url.includes('addSession')) {
        return { ok: true, status: 200, json: async () => ({ responseCode: '0' }) };
      }
      // The config-resolution fetch (initSwanConfig(), fired fire-and-forget from
      // initSessionState()) must resolve promptly — it is not itself a "SWAN/ANS call"
      // and must not fall into the hanging catch-all below, or initSwanConfig() would
      // never settle and swanCallCount would be polluted by a non-ANS fetch.
      if (url === CONFIG_SHEET_PATH) {
        return { ok: true, status: 200, json: async () => ({ data: [{ configId: CONFIG_ID, config: JSON.stringify(SWAN_CONFIG) }] }) };
      }
      swanCallCount += 1;
      await swanFetchGate;
      throw new Error('network down');
    };
    window.adobeIMS = {
      getAccessToken: () => ({ token: 'ims-token' }),
      tokenService: { getTokenAndProfile: async () => ({ tokenFields: { user_id: 'user-1' } }) },
    };

    const meta = document.createElement('meta');
    meta.name = 'swan-notification-config';
    meta.content = CONFIG_ID;
    document.head.appendChild(meta);

    setMetadata('tier-1-event-config', JSON.stringify({}));
    initSessionState();
    await waitForSessionsReady();
    swanCallCount = 0;
  });

  after(() => {
    releaseSwanFetch();
    window.fetch = originalFetch;
    window.adobeIMS = originalAdobeIMS;
    document.head.querySelector('meta[name="tier-1-event-config"]')?.remove();
    document.head.querySelector('meta[name="swan-notification-config"]')?.remove();
  });

  it('resolves and updates the scheduled signal even though the SWAN/ANS call never settles', async () => {
    const session = {
      id: 'sess-1',
      rfCode: 'RF-1',
      title: 'Test',
      sessionPageUrl: '/sessions/test',
      startTimeUtc: '2026-10-28T16:00:00.000Z',
      endTimeUtc: '2026-10-28T17:00:00.000Z',
    };

    const resolvedInTime = await settlesWithin(toggleSchedule(session), 200);
    expect(resolvedInTime).to.equal(true);
    expect(scheduled.value.has('sess-1')).to.equal(true);

    // The fire-and-forget SWAN call isn't awaited by toggleSchedule — give it a tick to
    // actually run and reach (and hang on) the gated fetch stub.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(swanCallCount).to.be.greaterThan(0);
  });
});
