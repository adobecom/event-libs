import { expect } from '@esm-bundle/chai';
import { setMetadata } from '../../../event-libs/v1/utils/utils.js';
import BlockMediator from '../../../event-libs/v1/deps/block-mediator.min.js';
import {
  setNotificationScope, getEntry, getEntries, upsertEntry, dismissEntry, notificationsReady,
} from '../../../event-libs/v1/features/swan-notifications/notification-store.js';
import { stopSessionStateTicker } from '../../../event-libs/v1/services/sessions/session-state-ticker.js';

const EVENT_ID = 'test-auth-persistence';
const API_URL = 'https://mock.example/api';
const RF_CODE = 'S001TIME';

function profile(userId) {
  return { userId, first_name: 'Test', account_type: 'type1' };
}

async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

async function waitForMyData(pending, userId) {
  const deadline = Date.now() + 2000;
  while (!pending.has(userId) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  expect(pending.has(userId), `myData request for ${userId}`).to.equal(true);
}

describe('session-store: FEDS persistence follows the authenticated attendee', () => {
  let originalFetch;
  let originalEvents;
  const pendingMyData = new Map();
  let resolveAdd;

  before(() => {
    originalFetch = window.fetch;
    originalEvents = window.events;
    delete window.events;
    window.fetch = async (url) => {
      const parsed = new URL(url, location.origin);
      if (parsed.pathname.endsWith('/jwt')) {
        return {
          ok: true, json: async () => ({ rfAuthToken: parsed.searchParams.get('clientId') }),
        };
      }
      if (url.includes('session-catalog')) {
        return {
          ok: true,
          json: async () => ({
            sessions: [{
              sessionId: 's-001', sessionCode: 'S001', externalSessionId: 'rf-S001SESS',
              customAttributes: [{ name: 'Format', values: [{ valueId: 'online-id', label: 'Online', value: 'online' }] }],
            }],
            sessionTimes: [{
              sessionId: 's-001', externalSessionTimeId: `rf-${RF_CODE}`,
              startTimeMillis: Date.now() - 60_000, endTimeMillis: Date.now() + 1_800_000,
            }],
            speakers: [],
          }),
        };
      }
      if (parsed.pathname.endsWith('/myData')) {
        return new Promise((resolve) => {
          const userId = parsed.searchParams.get('rfAuthToken');
          pendingMyData.set(userId, (mySchedule) => {
            pendingMyData.delete(userId);
            resolve({
              ok: true, json: async () => ({ mySchedule, sessionInterests: [], loggedInUser: { firstName: 'Test' } }),
            });
          });
        });
      }
      if (parsed.pathname.endsWith('/addSession')) {
        return new Promise((resolve) => {
          resolveAdd = () => resolve({ ok: true, json: async () => ({ responseCode: '0' }) });
        });
      }
      throw new Error(`unexpected request: ${url}`);
    };
    setMetadata('swan-notifications', 'feds');
    setMetadata('tier-1-event-config', JSON.stringify({ eventId: EVENT_ID, rfApiUrl: API_URL }));
  });

  after(() => {
    window.fetch = originalFetch;
    window.events = originalEvents;
    stopSessionStateTicker();
    BlockMediator.set('imsProfile', null);
    ['swan-notifications', 'tier-1-event-config'].forEach((name) => {
      document.head.querySelector(`meta[name="${name}"]`)?.remove();
    });
    setNotificationScope(null, null, null);
  });

  it('gates cached counts, discards old-user responses and mutations, and restores dismissals on re-login', async () => {
    setNotificationScope(EVENT_ID, 'user-a', API_URL);
    upsertEntry(RF_CODE, { stage: 'live', title: 'Dismissed by A' });
    dismissEntry(RF_CODE);
    BlockMediator.set('imsProfile', profile('user-a'));
    const store = await import(`../../../event-libs/v1/utils/session-store.js?persistence=${Math.random()}`);
    store.initSessionState();
    await waitForMyData(pendingMyData, 'user-a');
    expect(notificationsReady.value).to.equal(false);
    expect(getEntry(RF_CODE).dismissed).to.equal(true);

    BlockMediator.set('imsProfile', profile('user-b'));
    await waitForMyData(pendingMyData, 'user-b');
    expect(getEntries()).to.have.lengthOf(0);
    expect(notificationsReady.value).to.equal(false);
    pendingMyData.get('user-a')([{ sessionTimeID: RF_CODE }]);
    await settle();
    expect(store.scheduled.value.size).to.equal(0);
    expect(notificationsReady.value).to.equal(false);

    pendingMyData.get('user-b')([]);
    await settle();
    expect(notificationsReady.value).to.equal(true);
    const session = store.sessions.value[0];
    const add = store.toggleSchedule(session);
    let cancelled;
    const cancelledAdd = add.catch((err) => { cancelled = err; });
    BlockMediator.set('imsProfile', null);
    expect(notificationsReady.value).to.equal(false);
    expect(getEntries()).to.have.lengthOf(0);
    resolveAdd();
    await cancelledAdd;
    expect(cancelled).to.be.instanceOf(store.SessionAuthChangedError);
    expect(store.scheduled.value.size).to.equal(0);
    expect(store.pendingActions.value.size).to.equal(0);
    expect(getEntries()).to.have.lengthOf(0);

    BlockMediator.set('imsProfile', profile('user-a'));
    await waitForMyData(pendingMyData, 'user-a');
    expect(getEntry(RF_CODE).dismissed).to.equal(true);
    expect(notificationsReady.value).to.equal(false);
    pendingMyData.get('user-a')([{ sessionTimeID: RF_CODE }]);
    await settle();
    expect(store.scheduled.value.has(session.id)).to.equal(true);
    expect(notificationsReady.value).to.equal(true);
    expect(getEntry(RF_CODE).dismissed).to.equal(true);
  });
});
