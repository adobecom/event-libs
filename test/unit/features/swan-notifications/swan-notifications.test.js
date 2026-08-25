import { expect } from '@esm-bundle/chai';
import {
  notifySessionScheduled, notifySessionUnscheduled, reconcileSwanNotifications,
} from '../../../../event-libs/v1/features/swan-notifications/swan-notifications.js';
import { SWAN_ENTRY_SOURCE } from '../../../../event-libs/v1/features/swan-notifications/swan-payload.js';

const LOCAL_STATE_KEY = 'swan-notification-state';

function makeStore() {
  const entries = new Map();
  return {
    add(entry) { entries.set(entry.id, entry); },
    edit(id, entry) { entries.set(id, entry); },
    remove(id) { entries.delete(id); },
    get() { return [...entries.values()]; },
  };
}

// now + offsetMs, as an ISO string — startOffsetMs/endOffsetMs are negative for "in the past".
function iso(offsetMs) {
  return new Date(Date.now() + offsetMs).toISOString();
}

function makeSession(rfCode, { startOffsetMs, endOffsetMs }) {
  return {
    id: `session-${rfCode}`,
    rfCode,
    title: `Session ${rfCode}`,
    sessionPageUrl: `/sessions/${rfCode}`,
    startTimeUtc: iso(startOffsetMs),
    endTimeUtc: iso(endOffsetMs),
  };
}

const MIN = 60 * 1000;

describe('swan-notifications', () => {
  let originalFeds;
  let store;

  beforeEach(() => {
    const meta = document.createElement('meta');
    meta.name = 'swan-notifications';
    meta.content = 'true';
    document.head.appendChild(meta);

    originalFeds = window.feds;
    store = makeStore();
    window.feds = { data: { notifications: store } };
    window.localStorage.removeItem(LOCAL_STATE_KEY);
  });

  afterEach(() => {
    window.feds = originalFeds;
    window.localStorage.removeItem(LOCAL_STATE_KEY);
    document.head.querySelector('meta[name="swan-notifications"]')?.remove();
  });

  describe('notifySessionScheduled / notifySessionUnscheduled', () => {
    it('adds a reminder entry once the trigger time has already passed', async () => {
      // Starts in 2 min, offset defaults to 5 min, so the reminder trigger (start - 5min)
      // is 3 min in the past already.
      const session = makeSession('RF-100', { startOffsetMs: 2 * MIN, endOffsetMs: 62 * MIN });
      await notifySessionScheduled(session);

      const [entry] = store.get();
      expect(entry.id).to.equal('swan-RF-100');
      expect(entry.stage).to.equal('reminder');
      // Tagged so a reconcile/diff pass never touches another product's entries in the
      // same (shared) store — verified here end-to-end, not just on the raw payload builder.
      expect(entry.source).to.equal(SWAN_ENTRY_SOURCE);
    });

    it('does not add an entry before the reminder trigger time', async () => {
      const session = makeSession('RF-101', { startOffsetMs: 60 * MIN, endOffsetMs: 120 * MIN });
      await notifySessionScheduled(session);
      expect(store.get()).to.have.lengthOf(0);
    });

    it('removes the matching entry on unschedule', async () => {
      const session = makeSession('RF-102', { startOffsetMs: -MIN, endOffsetMs: 30 * MIN });
      await notifySessionScheduled(session);
      expect(store.get()).to.have.lengthOf(1);

      await notifySessionUnscheduled(session);
      expect(store.get()).to.have.lengthOf(0);
    });

    it('no-ops on unschedule when there is no known entry for the session', async () => {
      await notifySessionUnscheduled(makeSession('RF-never-scheduled', { startOffsetMs: MIN, endOffsetMs: 2 * MIN }));
      expect(store.get()).to.have.lengthOf(0);
    });

    it('no-ops when the session has no rfCode', async () => {
      await notifySessionScheduled({ id: 'no-rfcode' });
      await notifySessionUnscheduled({ id: 'no-rfcode' });
      expect(store.get()).to.have.lengthOf(0);
    });

    it('is a no-op entirely when SWAN is not enabled on the page', async () => {
      document.head.querySelector('meta[name="swan-notifications"]')?.remove();
      const session = makeSession('RF-disabled', { startOffsetMs: -MIN, endOffsetMs: 30 * MIN });
      await notifySessionScheduled(session);
      expect(store.get()).to.have.lengthOf(0);
    });
  });

  describe('reconcileSwanNotifications', () => {
    it('creates for scheduled sessions past their trigger time, removes orphaned entries, leaves matched pairs alone', async () => {
      const keep = makeSession('RF-keep', { startOffsetMs: -MIN, endOffsetMs: 30 * MIN });
      const toCreate = makeSession('RF-create', { startOffsetMs: -MIN, endOffsetMs: 30 * MIN });
      await notifySessionScheduled(keep);
      store.add({ id: 'swan-RF-orphan', stage: 'reminder' }); // simulates a stale entry from a since-unscheduled session

      // Force local state to believe RF-orphan is still tracked, mirroring what a prior
      // notifySessionScheduled('RF-orphan') call would have left behind.
      const state = JSON.parse(window.localStorage.getItem(LOCAL_STATE_KEY) || '{}');
      state['RF-orphan'] = { stage: 'reminder', dismissed: false };
      window.localStorage.setItem(LOCAL_STATE_KEY, JSON.stringify(state));

      await reconcileSwanNotifications(
        () => [keep, toCreate],
        () => new Set([keep.id, toCreate.id]),
      );

      const ids = store.get().map((e) => e.id);
      expect(ids).to.include('swan-RF-keep');
      expect(ids).to.include('swan-RF-create');
      expect(ids).to.not.include('swan-RF-orphan');
    });

    it('removes every tracked entry when nothing is scheduled anymore', async () => {
      const a = makeSession('RF-a', { startOffsetMs: -MIN, endOffsetMs: 30 * MIN });
      const b = makeSession('RF-b', { startOffsetMs: -MIN, endOffsetMs: 30 * MIN });
      await notifySessionScheduled(a);
      await notifySessionScheduled(b);
      expect(store.get()).to.have.lengthOf(2);

      await reconcileSwanNotifications(() => [], () => new Set());
      expect(store.get()).to.have.lengthOf(0);
      // Not just the store — a regression that calls store.remove() but forgets to
      // clear local state would leave RF-a/RF-b stuck as "active" and never re-added
      // even if they got scheduled again (applyStage's current?.stage === stage guard
      // would think nothing changed).
      const state = JSON.parse(window.localStorage.getItem(LOCAL_STATE_KEY) || '{}');
      expect(state).to.deep.equal({});
    });

    it('skips a scheduled id absent from the session catalog instead of throwing', async () => {
      let threw = false;
      try {
        await reconcileSwanNotifications(() => [], () => new Set(['missing-session-id']));
      } catch {
        threw = true;
      }
      expect(threw).to.equal(false);
    });

    it('updates an entry in place (edit, not a duplicate add) as a session crosses live/on-demand', async () => {
      const session = makeSession('RF-progress', { startOffsetMs: 2 * MIN, endOffsetMs: 62 * MIN });
      await notifySessionScheduled(session);
      expect(store.get()[0].stage).to.equal('reminder');

      // Re-run reconcile once the session has actually gone live/on-demand relative to now.
      const liveSession = makeSession('RF-progress', { startOffsetMs: -30 * MIN, endOffsetMs: -MIN });
      await reconcileSwanNotifications(() => [liveSession], () => new Set([liveSession.id]));

      expect(store.get()).to.have.lengthOf(1);
      expect(store.get()[0].stage).to.equal('on-demand');
    });

    it('does not resurrect an entry the user dismissed directly via the UNC bell, even once its stage would otherwise change', async () => {
      // Starts in 2 min: reminder trigger already passed, live boundary has not.
      const reminderSession = makeSession('RF-dismissed', { startOffsetMs: 2 * MIN, endOffsetMs: 62 * MIN });
      await notifySessionScheduled(reminderSession);
      expect(store.get()[0].stage).to.equal('reminder');

      // Simulate the user clearing it via UNC's own UI — that call never goes through
      // this module, so only the store changes; local state still thinks it's active
      // until the next reconcile pass notices the mismatch.
      store.remove('swan-RF-dismissed');

      // A naive "scheduled but no local-state stage yet" check would treat this as
      // needing its *first* add — the real regression this guards against is
      // resurrecting it once the session progresses to a genuinely new stage, not just
      // leaving it alone while nothing changes.
      const liveSession = makeSession('RF-dismissed', { startOffsetMs: -MIN, endOffsetMs: 30 * MIN });
      await reconcileSwanNotifications(() => [liveSession], () => new Set([liveSession.id]));
      expect(store.get()).to.have.lengthOf(0);
    });
  });
});
