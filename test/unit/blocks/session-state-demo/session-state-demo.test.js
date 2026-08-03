import { expect } from '@esm-bundle/chai';
import { readFile } from '@web/test-runner-commands';
import init from '../../../../event-libs/v1/blocks/session-state-demo/session-state-demo.js';
import {
  sessions, sessionsStatus, favorited, scheduled, auth, pendingActions, initSessionState,
} from '../../../../event-libs/v1/utils/session-store.js';
import { setMetadata } from '../../../../event-libs/v1/utils/utils.js';

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

describe('session-state-demo block', () => {
  let el;
  let originalFetch;

  // initSessionState() is idempotent and only needs the rainfocus-api-url gate to run
  // once — this populates the real apiConfig that favoriteSession()'s RF call needs,
  // same as decorateEvent() would on a real page, instead of leaving it null.
  before(async () => {
    setMetadata('rainfocus-api-url', 'https://mock.example/api');
    initSessionState();
    await waitForSessionsReady();
  });

  beforeEach(() => {
    document.body.innerHTML = body;
    el = document.querySelector('.session-state-demo');

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
    expect(Number(rowValue('Sessions loaded'))).to.be.greaterThan(0);
    expect(rowValue('Favorited')).to.equal('0');
    expect(rowValue('Scheduled')).to.equal('0');
    expect(rowValue('Logged in')).to.equal('true');
    expect(rowValue('Registered')).to.equal('true');
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
