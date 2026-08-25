import { expect } from '@esm-bundle/chai';
import { setMetadata } from '../../../event-libs/v1/utils/utils.js';

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

function makeStore() {
  const entries = new Map();
  return {
    add(entry) { entries.set(entry.id, entry); },
    edit(id, entry) { entries.set(id, entry); },
    remove(id) { entries.delete(id); },
    get() { return [...entries.values()]; },
  };
}

describe('session-store: toggleSchedule fires SWAN notification hooks without blocking on them', () => {
  let originalFetch;
  let originalFeds;
  let store;

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

    originalFeds = window.feds;
    store = makeStore();
    window.feds = { data: { notifications: store } };

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
    window.feds = originalFeds;
    document.head.querySelector('meta[name="tier-1-event-config"]')?.remove();
    document.head.querySelector('meta[name="swan-notifications"]')?.remove();
  });

  it('resolves and updates the scheduled signal without waiting on the SWAN/UNC hook', async () => {
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

    // Give the fire-and-forget SWAN call a tick to actually run against the store.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(store.get().some((entry) => entry.id === 'swan-RF-1')).to.equal(true);
  });
});
