import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { readFile } from '@web/test-runner-commands';
// Same rationale as session-state-demo.test.js: this block imports session-store.js
// itself (statically, same URL) — the test must import the same, non-cache-busted
// instance too, so both sides share the same signals.
import init from '../../../../../event-libs/v1/c2/blocks/ns-notification/ns-notification.js';
import {
  sessions, scheduled, sessionsStatus, initSessionState,
} from '../../../../../event-libs/v1/utils/session-store.js';
import { setMetadata } from '../../../../../event-libs/v1/utils/utils.js';

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

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Real, small-ms offsets rather than sinon fake timers — this block's timer sits
// alongside the shared, already-running session-state-ticker (started for real in the
// before() bootstrap below), and faking Date/setTimeout mid-test would desync that
// ticker's real-clock-scheduled interval from the fake clock. Generous margins keep
// this robust against normal CI scheduling jitter.
function soonSession(overrides = {}) {
  const now = Date.now();
  return {
    id: 's1',
    title: 'Test Session',
    sessionPageUrl: 'https://example.com/s1',
    startTimeUtc: new Date(now + 150).toISOString(),
    endTimeUtc: new Date(now + 400).toISOString(),
    ...overrides,
  };
}

describe('ns-notification block', () => {
  let el;
  let originalFetch;

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
    el = document.querySelector('.ns-notification');
    sessions.value = [];
    scheduled.value = new Set();
    delete window.eventNotificationBridge;

    // Isolate the mock bridge's persistence from the real, shared-origin localStorage —
    // see the same rationale in mock-notification-bridge.test.js. These tests assert
    // exact list() contents, so a cross-file leaked seed entry would make them flaky.
    sinon.stub(window.localStorage, 'getItem').returns(null);
    sinon.stub(window.localStorage, 'setItem');

    originalFetch = window.fetch;
    window.fetch = async () => ({ ok: true, status: 200, json: async () => ({ responseCode: '0' }) });
  });

  afterEach(() => {
    el._nsNotificationCleanup?.();
    window.fetch = originalFetch;
    delete window.eventNotificationBridge;
    sinon.restore();
  });

  it('pushes a reminder notification immediately when a scheduled session is already within the lead-time window', async () => {
    sessions.value = [soonSession()];
    scheduled.value = new Set(['s1']);

    await init(el);

    const list = window.eventNotificationBridge.list();
    expect(list).to.have.lengthOf(1);
    expect(list[0]).to.include({ id: 's1', label: 'reminder' });
  });

  it('pushes nothing for a session outside the lead-time window', async () => {
    const now = Date.now();
    sessions.value = [soonSession({
      startTimeUtc: new Date(now + 3_600_000).toISOString(),
      endTimeUtc: new Date(now + 7_200_000).toISOString(),
    })];
    scheduled.value = new Set(['s1']);

    await init(el);

    expect(window.eventNotificationBridge.list()).to.deep.equal([]);
  });

  it('transitions reminder -> live -> on-demand via edit, not a second add', async () => {
    sessions.value = [soonSession()];
    scheduled.value = new Set(['s1']);

    await init(el);
    expect(window.eventNotificationBridge.list()[0].label).to.equal('reminder');

    await wait(250); // past startTimeUtc (now+150)
    expect(window.eventNotificationBridge.list()).to.have.lengthOf(1);
    expect(window.eventNotificationBridge.list()[0].label).to.equal('live');

    await wait(300); // past endTimeUtc (now+400)
    expect(window.eventNotificationBridge.list()).to.have.lengthOf(1);
    expect(window.eventNotificationBridge.list()[0].label).to.equal('on-demand');
  });

  it('removes the notification when the session is unscheduled mid-cycle', async () => {
    sessions.value = [soonSession()];
    scheduled.value = new Set(['s1']);

    await init(el);
    expect(window.eventNotificationBridge.list()).to.have.lengthOf(1);

    scheduled.value = new Set();
    expect(window.eventNotificationBridge.list()).to.deep.equal([]);
  });

  it('stops pushing further transitions once cleaned up', async () => {
    sessions.value = [soonSession()];
    scheduled.value = new Set(['s1']);

    await init(el);
    expect(window.eventNotificationBridge.list()[0].label).to.equal('reminder');

    el._nsNotificationCleanup();
    await wait(250); // would have crossed into 'live' if the timer were still active

    expect(window.eventNotificationBridge.list()[0].label).to.equal('reminder');
  });

  it('re-running init() on the same element tears down the previous instance first', async () => {
    sessions.value = [soonSession()];
    scheduled.value = new Set(['s1']);

    await init(el);
    const firstCleanup = el._nsNotificationCleanup;
    await init(el);

    expect(el._nsNotificationCleanup).to.not.equal(firstCleanup);
    // Only one entry, not duplicated by a second set of subscriptions double-pushing.
    expect(window.eventNotificationBridge.list()).to.have.lengthOf(1);
  });

  it('runs the initial recompute only once, not twice, despite two signals firing immediately on subscribe', async () => {
    const fakeBridge = {
      add: sinon.stub().returns(true),
      edit: sinon.stub().returns(true),
      remove: sinon.stub().returns(true),
      list: sinon.stub().returns([]),
      subscribe: sinon.stub().returns(() => {}),
    };
    window.eventNotificationBridge = fakeBridge;

    sessions.value = [soonSession()];
    scheduled.value = new Set(['s1']);

    await init(el);

    expect(fakeBridge.add.callCount).to.equal(1);
  });

  it('self-heals when a write is rejected: retries via add() next cycle instead of desyncing', async () => {
    const fakeBridge = {
      add: sinon.stub().returns(true),
      edit: sinon.stub().returns(false), // simulate the real bridge rejecting the edit
      remove: sinon.stub().returns(true),
      list: sinon.stub().returns([]),
      subscribe: sinon.stub().returns(() => {}),
    };
    window.eventNotificationBridge = fakeBridge;

    sessions.value = [soonSession()];
    scheduled.value = new Set(['s1']);

    await init(el); // pushes the initial 'reminder' via add()
    expect(fakeBridge.add.callCount).to.equal(1);

    await wait(250); // crosses into 'live' — diff calls edit(), which this bridge rejects
    expect(fakeBridge.edit.callCount).to.equal(1);

    // Because that edit() failed, the entry must have been dropped from lastPushed —
    // the next transition (into 'on-demand') should retry with a fresh add(), not a
    // second edit() against an id the bridge already told us doesn't exist.
    await wait(300);
    expect(fakeBridge.add.callCount).to.equal(2);
  });
});
