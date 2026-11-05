import { expect } from '@esm-bundle/chai';
import { setMetadata } from '../../../event-libs/v1/utils/utils.js';
import BlockMediator from '../../../event-libs/v1/deps/block-mediator.min.js';

// session-store.js holds module-level singleton state (initialized, eventApiConfig, etc.) that
// @web/test-runner does not reliably reset between test files sharing a worker session —
// cache-bust the import so this file gets its own fresh instance regardless.
const {
  initSessionState, getEventApiConfig, sessions, sessionsStatus, scheduled, favorited, auth,
  pendingActions, toggleFavorite, toggleSchedule,
} = await import(`../../../event-libs/v1/utils/session-store.js?t=${Math.random()}`);

const ONLINE_FORMAT = {
  name: 'Format',
  values: [{ valueId: 'online-id', label: 'Online', value: 'online' }],
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

describe('session-store: myData maps RF ids to our session ids', () => {
  let originalFetch;
  let jwtRequestUrl;
  let myDataRequestUrl;
  const mutations = [];
  let rejectMutation = false;

  before(async () => {
    originalFetch = window.fetch;
    // mySchedule matches by sessionTimeID (→ rfCode); sessionInterests matches by sessionID
    // (→ rfSessionId) — two different, non-interchangeable ids. 'UNKNOWN' has no match either way.
    window.fetch = async (url) => {
      if (url.includes('/jwt')) {
        jwtRequestUrl = url;
        return { ok: true, status: 200, json: async () => ({ rfAuthToken: 'exchanged-token' }) };
      }
      if (url.includes('session-catalog')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            // Required to survive the catalog mapper — see isMissingFormat.
            sessions: [
              {
                sessionId: 's-001', sessionCode: 'S001', externalSessionId: 'rf-S001SESS', customAttributes: [ONLINE_FORMAT],
              },
              {
                sessionId: 'k-001', sessionCode: 'K001', externalSessionId: 'rf-K001SESS', customAttributes: [ONLINE_FORMAT],
              },
            ],
            sessionTimes: [
              {
                sessionId: 's-001', sessionTimeId: 's-first', externalSessionTimeId: 'rf-S001TIME', startTimeMillis: 1000, endTimeMillis: 2000,
              },
              {
                sessionId: 's-001', sessionTimeId: 's-later', externalSessionTimeId: 'rf-S001LATER', startTimeMillis: 3000, endTimeMillis: 4000,
              },
              {
                sessionId: 'k-001', sessionTimeId: 'k-first', externalSessionTimeId: 'rf-K001TIME', startTimeMillis: 1000, endTimeMillis: 2000,
              },
              {
                sessionId: 'k-001', sessionTimeId: 'k-later', externalSessionTimeId: 'rf-K001LATER', startTimeMillis: 3000, endTimeMillis: 4000,
              },
            ],
            speakers: [],
          }),
        };
      }
      if (['addSession', 'removeSession', 'toggleSessionInterest'].some((endpoint) => url.includes(endpoint))) {
        mutations.push(url);
        if (rejectMutation) throw new Error('mutation failed');
        return { ok: true, json: async () => ({ responseCode: '0' }) };
      }
      myDataRequestUrl = url;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          mySchedule: [{ sessionTimeID: 'S001TIME' }],
          sessionInterests: [{ sessionID: 'K001SESS' }, { sessionID: 'UNKNOWN' }],
          loggedInUser: { firstName: 'Test' },
        }),
      };
    };

    // userId drives the jwt exchange for a real rfAuthToken.
    BlockMediator.set('imsProfile', { first_name: 'Test', account_type: 'type1', userId: 'user-1' });

    setMetadata('tier-1-event-config', JSON.stringify({ rfApiUrl: 'https://mock.example/api' }));
    initSessionState();
    await waitForSessionsReady();
    // loadMyData() is fire-and-forget, chained after the jwt exchange and the (already-awaited)
    // sessions fetch — give both their own stubbed fetches a tick to resolve and apply.
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  after(() => {
    window.fetch = originalFetch;
    document.head.querySelector('meta[name="tier-1-event-config"]')?.remove();
    // BlockMediator is a real, shared singleton across test files (unlike session-store.js's
    // cache-busted copy) — reset so this profile doesn't leak into whichever test runs next.
    BlockMediator.set('imsProfile', undefined);
  });

  it('exchanges the IMS userId for an rfAuthToken and uses it in the myData call', () => {
    expect(jwtRequestUrl).to.include('clientId=user-1');
    expect(myDataRequestUrl).to.include('rfAuthToken=exchanged-token');
  });

  it('resolves the real RF response into eventApiConfig-backed scheduled/favorited ids', () => {
    expect(getEventApiConfig().apiUrl).to.equal('https://mock.example/api');
    expect(scheduled.value).to.deep.equal(new Set(['s-first']));
    expect(favorited.value).to.deep.equal(new Set(['k-001']));
  });

  it('derives isRegistered from a populated loggedInUser', () => {
    expect(auth.value.isRegistered).to.be.true;
  });

  it('toggles all cards of a favorite together while sending the session-level RF id', async () => {
    const cards = sessions.value.filter((s) => s.sessionId === 'k-001');
    const operation = toggleFavorite(cards[1]);
    expect(cards.every((s) => pendingActions.value.has(s.id))).to.be.true;
    await toggleFavorite(cards[0]);
    await operation;
    expect(mutations).to.have.lengthOf(1);
    const url = new URL(mutations[0]);
    expect(url.searchParams.get('sessionId')).to.equal('K001SESS');
    expect(url.searchParams.has('sessionTimeId')).to.be.false;
    expect(cards.some((s) => favorited.value.has(s.id))).to.be.false;
    expect(pendingActions.value.size).to.equal(0);
    await toggleFavorite(cards[0]);
    expect(cards.every((s) => favorited.value.has(s.id))).to.be.true;
    expect(favorited.value).to.deep.equal(new Set(['k-001']));
  });

  it('leaves favorites unchanged and clears all pending cards when a mutation fails', async () => {
    const before = new Set(favorited.value);
    rejectMutation = true;
    try {
      await toggleFavorite(sessions.value.find((s) => s.sessionId === 'k-001'));
      expect.fail('Expected a failed mutation');
    } catch (error) {
      expect(error.message).to.equal('mutation failed');
    } finally {
      rejectMutation = false;
    }
    expect(favorited.value).to.deep.equal(before);
    expect(pendingActions.value.size).to.equal(0);
  });

  it('adds and removes only the chosen slot without changing the sibling schedule', async () => {
    const later = sessions.value.find((s) => s.rfCode === 'S001LATER');
    const operation = toggleSchedule(later);
    expect(pendingActions.value.has(later.sessionTimeId)).to.be.true;
    expect(pendingActions.value.has(later.id)).to.be.false;
    await operation;
    expect(scheduled.value).to.deep.equal(new Set(['s-first', later.sessionTimeId]));
    expect(new URL(mutations[mutations.length - 1]).searchParams.get('sessionTimeId')).to.equal('S001LATER');
    await toggleSchedule(later);
    expect(scheduled.value).to.deep.equal(new Set(['s-first']));
  });
});
