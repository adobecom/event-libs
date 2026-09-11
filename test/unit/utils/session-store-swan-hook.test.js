import { expect } from '@esm-bundle/chai';
import { setMetadata } from '../../../event-libs/v1/utils/utils.js';
import {
  getEntry, getEntries, removeEntry,
} from '../../../event-libs/v1/features/swan-notifications/notification-store.js';

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

// notification-store.js is a real singleton shared across test files — reset it through
// its own public API rather than relying on module re-import.
function clearStore() {
  getEntries().forEach((entry) => removeEntry(entry.rfCode));
}

describe('session-store: toggleSchedule keeps the local SWAN notification store in sync', () => {
  let originalFetch;

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
    document.head.querySelector('meta[name="tier-1-event-config"]')?.remove();
    document.head.querySelector('meta[name="swan-notifications"]')?.remove();
    clearStore();
  });

  it('creates a local notification entry as part of toggleSchedule itself, with nothing external to wait on', async () => {
    const session = {
      id: 'sess-1',
      rfCode: 'RF-1',
      title: 'Test',
      sessionPageUrl: '/sessions/test',
      startTimeUtc: new Date(Date.now() - 60 * 1000).toISOString(),
      endTimeUtc: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    };

    await toggleSchedule(session);
    expect(scheduled.value.has('sess-1')).to.equal(true);
    // The local store write happens synchronously inside toggleSchedule's own
    // notifySessionScheduled() call — no delay to wait out.
    expect(getEntry('RF-1').stage).to.equal('live');
    expect(getEntry('RF-1').title).to.equal('Test');
  });
});
