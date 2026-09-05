import { expect } from '@esm-bundle/chai';
import { setMetadata } from '../../../event-libs/v1/utils/utils.js';
import { buildCampaignId } from '../../../event-libs/v1/features/swan-notifications/swan-payload.js';

// session-store.js holds module-level singleton state that @web/test-runner does not
// reliably reset between test files sharing a worker session — cache-bust the import
// so this file gets its own fresh instance regardless (matches the convention already
// used by session-store-my-data.test.js and friends).
const {
  initSessionState, toggleSchedule, scheduled, sessionsStatus,
} = await import(`../../../event-libs/v1/utils/session-store.js?t=${Math.random()}`);

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
// `false` if the timeout wins. Proves toggleSchedule() doesn't wait on the SWAN/UNC
// hook, rather than merely proving that hook doesn't throw.
function settlesWithin(promise, ms) {
  const timeout = new Promise((resolve) => setTimeout(() => resolve(false), ms));
  return Promise.race([promise.then(() => true), timeout]);
}

describe('session-store: toggleSchedule fires SWAN notification hooks without blocking on them', () => {
  let originalFetch;
  let originalUniversalNav;

  before(async () => {
    originalFetch = window.fetch;
    window.fetch = async (url) => {
      if (typeof url === 'string' && url.includes('session-catalog')) {
        return { ok: true, status: 200, json: async () => ({ sessions: [], sessionTimes: [], speakers: [] }) };
      }
      if (typeof url === 'string' && url.includes('addSession')) {
        return { ok: true, status: 200, json: async () => ({ responseCode: '0' }) };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    };

    originalUniversalNav = window.UniversalNav;
    // Deliberately absent — unc-client.js's whenUncReady() will poll (waiting on
    // window.UniversalNav.getComponent) until the test itself supplies it below. If
    // toggleSchedule() were regressed to await notifySessionScheduled() inline, its own
    // promise would hang right along with this one, and settlesWithin() below would return
    // false instead of true.
    delete window.UniversalNav;

    const meta = document.createElement('meta');
    meta.name = 'swan-notifications';
    meta.content = 'true';
    document.head.appendChild(meta);

    setMetadata('tier-1-event-config', JSON.stringify({}));
    initSessionState();
    await waitForSessionsReady();
  });

  after(() => {
    window.fetch = originalFetch;
    window.UniversalNav = originalUniversalNav;
    document.head.querySelector('meta[name="tier-1-event-config"]')?.remove();
    document.head.querySelector('meta[name="swan-notifications"]')?.remove();
  });

  it('resolves and updates the scheduled signal even though the SWAN/UNC hook is still pending', async () => {
    const session = {
      id: 'sess-1',
      rfCode: 'RF-1',
      title: 'Test',
      sessionPageUrl: '/sessions/test',
      startTimeUtc: new Date(Date.now() - 60 * 1000).toISOString(),
      endTimeUtc: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    };

    const resolvedInTime = await settlesWithin(toggleSchedule(session), 200);
    expect(resolvedInTime).to.equal(true);
    expect(scheduled.value.has('sess-1')).to.equal(true);

    // Only now let UNC "become ready" — proves the fire-and-forget SWAN call really was
    // still in flight above, not merely fast.
    const calls = [];
    window.UniversalNav = {
      getComponent: async (name) => (name === 'notifications' ? {
        instance: {
          _uncContainer: {
            handleMessageFromInterface: (methodName, data) => {
              if (methodName === 'UpsertReminderFeatureFlag') {
                calls.push({ method: 'UpsertReminderFeatureFlag', campaignID: data.campaignRules[0].campaignID });
              }
              // DeleteReminderFeatureFlag / AnalyticsEventFromHost intentionally no-op here —
              // this test only asserts on the reminder registration reaching UNC.
            },
          },
        },
      } : undefined),
    };

    // whenUncReady() polls every 250ms — give the next attempt a chance to run.
    await new Promise((resolve) => setTimeout(resolve, 300));
    const upsert = calls.find((c) => c.method === 'UpsertReminderFeatureFlag');
    expect(upsert?.campaignID).to.equal(buildCampaignId('RF-1', 'live'));
  });
});
