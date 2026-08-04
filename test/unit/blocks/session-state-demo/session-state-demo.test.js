import { expect } from '@esm-bundle/chai';
import { readFile } from '@web/test-runner-commands';
// This block imports session-store.js itself (statically, same URL) — the test must import
// the same, non-cache-busted instance too, so both sides share the same signals/apiConfig.
import init from '../../../../event-libs/v1/blocks/session-state-demo/session-state-demo.js';
import {
  sessions, sessionsStatus, favorited, scheduled, auth, pendingActions,
  liveStreamActiveIds, sessionStateVersion, initSessionState,
} from '../../../../event-libs/v1/utils/session-store.js';
import { setMetadata } from '../../../../event-libs/v1/utils/utils.js';
import { deriveSessionState, getNowMs } from '../../../../event-libs/v1/utils/session-state.js';

const body = await readFile({ path: './mocks/default.html' });

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

// Seeded directly into sessions.value for every test — this block just renders whatever's
// there, and tests shouldn't depend on the real sessions-catalog fetch (which needs a real
// event-id to return anything, and isn't something to exercise here).
const TEST_SESSION = {
  id: 'demo-session-1',
  rfCode: 'DEMO001',
  startTimeUtc: new Date(Date.now() - 60_000).toISOString(),
  endTimeUtc: new Date(Date.now() + 3_600_000).toISOString(),
};

describe('session-state-demo block', () => {
  let el;
  let originalFetch;

  // initSessionState() is idempotent and only runs once — this populates the real apiConfig
  // that favoriteSession()'s RF call needs, same as decorateEvent() would on a real page. Its
  // internal loadSessions() also fetches the real ESL sessions catalog, which needs a real
  // event-id to return anything meaningful — stub fetch for that one call so it resolves
  // immediately with no sessions, then every test seeds sessions.value with TEST_SESSION
  // itself instead of depending on what that fetch returns.
  before(async () => {
    const realFetch = window.fetch;
    window.fetch = async () => new Response(JSON.stringify({ sessions: [], sessionTimes: [], speakers: [] }));
    setMetadata('tier-1-event-config', JSON.stringify({ rfApiUrl: 'https://mock.example/api' }));
    initSessionState();
    await waitForSessionsReady();
    window.fetch = realFetch;
  });

  beforeEach(() => {
    document.body.innerHTML = body;
    el = document.querySelector('.session-state-demo');

    sessions.value = [TEST_SESSION];
    favorited.value = new Set();
    scheduled.value = new Set();
    pendingActions.value = new Set();
    auth.value = { isLoggedIn: true, isRegistered: true, userFirstName: null };

    // rainfocus.js now makes a real fetch() for toggleSessionInterest/addSession/
    // removeSession — stub it so the favorite/schedule button clicks below don't hit
    // the network (unit tests disallow external fetches).
    originalFetch = window.fetch;
    window.fetch = async () => ({ ok: true, status: 200, json: async () => ({ responseCode: '0' }) });
  });

  afterEach(() => {
    window.fetch = originalFetch;
  });

  function rowValue(label) {
    const row = [...el.querySelectorAll('.session-state-demo__row')]
      .find((r) => r.textContent.startsWith(label));
    return row?.querySelector('.session-state-demo__value')?.textContent;
  }

  it('renders the current signal values on init', async () => {
    await init(el);
    expect(rowValue('Sessions status')).to.equal('ready');
    expect(Number(rowValue('Sessions loaded'))).to.equal(1);
    expect(rowValue('Favorited')).to.equal('0');
    expect(rowValue('Scheduled')).to.equal('0');
    expect(rowValue('Logged in')).to.equal('true');
    expect(rowValue('Registered')).to.equal('true');
    const expectedState = deriveSessionState(sessions.value[0], liveStreamActiveIds.value, getNowMs());
    expect(rowValue('First session state')).to.equal(expectedState);
  });

  it('recomputes the first session state row when sessionStateVersion changes', async () => {
    const now = Date.now();
    const previousSessions = sessions.value;
    await init(el);

    sessions.value = [{
      id: 'demo-live',
      startTimeUtc: new Date(now - 1_000).toISOString(),
      endTimeUtc: new Date(now + 3_600_000).toISOString(),
    }];
    sessionStateVersion.value += 1; // simulates a real session-state-ticker notification
    expect(rowValue('First session state')).to.equal('live');

    sessions.value = [{
      id: 'demo-live',
      startTimeUtc: new Date(now - 7_200_000).toISOString(),
      endTimeUtc: new Date(now - 3_600_000).toISOString(),
    }];
    sessionStateVersion.value += 1;
    expect(rowValue('First session state')).to.equal('on-demand');

    sessions.value = previousSessions;
  });

  it('updates live when a signal changes after init', async () => {
    await init(el);
    favorited.value = new Set([sessions.value[0].id]);
    expect(rowValue('Favorited')).to.equal('1');
  });

  it('favorites the first session on button click', async () => {
    await init(el);
    const [firstSession] = sessions.value;
    const btn = el.querySelector('.session-state-demo__favorite-btn');
    btn.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(favorited.value.has(firstSession.id)).to.be.true;
  });

  it('does nothing on click when there are no sessions', async () => {
    const previousSessions = sessions.value;
    sessions.value = [];
    await init(el);
    const btn = el.querySelector('.session-state-demo__favorite-btn');
    btn.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(favorited.value.size).to.equal(0);
    sessions.value = previousSessions;
  });
});
