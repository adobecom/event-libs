import { expect } from '@esm-bundle/chai';
import { setMetadata } from '../../../event-libs/v1/utils/utils.js';
import BlockMediator from '../../../event-libs/v1/deps/block-mediator.min.js';
import {
  getEntry, upsertEntry, dismissEntry, notificationsReady, setNotificationsReady,
} from '../../../event-libs/v1/features/swan-notifications/notification-store.js';
import { resetNotifications } from '../features/swan-notifications/mocks/notification-store.js';
import { stopSessionStateTicker } from '../../../event-libs/v1/services/sessions/session-state-ticker.js';

const EVENT_ID = 'test-notification-persistence';
const API_URL = 'https://mock.example/api';
const RF_CODE = 'S001TIME';

async function waitFor(predicate) {
  const deadline = Date.now() + 2000;
  while (!predicate() && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  expect(predicate()).to.equal(true);
}

describe('session-store: FEDS preserves cached dismissals until the schedule is known', () => {
  let originalFetch;
  let originalEvents;
  let resolveMyData;
  let jwtCalled = false;

  before(() => {
    originalFetch = window.fetch;
    originalEvents = window.events;
    window.events = {
      getRegistrationDetails: async () => ({ isRegistered: true, authToken: 'primary-token' }),
    };
    window.fetch = async (url) => {
      if (url.includes('/jwt')) {
        jwtCalled = true;
        throw new Error('the existing primary auth path should be retained');
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
      if (url.includes('/myData')) {
        expect(url).to.include('rfAuthToken=primary-token');
        return new Promise((resolve) => {
          resolveMyData = () => resolve({
            ok: true,
            json: async () => ({
              mySchedule: [{ sessionTimeID: RF_CODE }],
              sessionInterests: [],
              loggedInUser: { firstName: 'Test' },
            }),
          });
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
    BlockMediator.set('imsProfile', undefined);
    ['swan-notifications', 'tier-1-event-config'].forEach((name) => {
      document.head.querySelector(`meta[name="${name}"]`)?.remove();
    });
  });

  it('hides cached counts during loading and preserves same-stage dismissal after primary-auth reconciliation', async () => {
    await resetNotifications();
    setNotificationsReady(false);
    upsertEntry(RF_CODE, { stage: 'live', title: 'Previously dismissed' });
    dismissEntry(RF_CODE);
    BlockMediator.set('imsProfile', { userId: 'test-attendee', account_type: 'type1' });
    const store = await import(`../../../event-libs/v1/utils/session-store.js?persistence=${Math.random()}`);
    store.initSessionState();
    await waitFor(() => !!resolveMyData);
    expect(notificationsReady.value).to.equal(false);
    expect(getEntry(RF_CODE).dismissed).to.equal(true);
    resolveMyData();
    await waitFor(() => notificationsReady.value);
    expect(store.scheduled.value.has('s-001')).to.equal(true);
    expect(getEntry(RF_CODE).dismissed).to.equal(true);
    expect(jwtCalled).to.equal(false);
  });
});
