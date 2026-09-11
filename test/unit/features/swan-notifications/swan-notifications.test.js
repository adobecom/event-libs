import { expect } from '@esm-bundle/chai';
import {
  notifySessionScheduled, notifySessionUnscheduled, reconcileSwanNotifications,
} from '../../../../event-libs/v1/features/swan-notifications/swan-notifications.js';
import {
  getEntry, getEntries, removeEntry, markRead,
} from '../../../../event-libs/v1/features/swan-notifications/notification-store.js';

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

// notification-store.js is a real singleton for the whole browser session — reset it
// through its own public API between tests (matches notification-store.test.js).
function clearStore() {
  getEntries().forEach((entry) => removeEntry(entry.rfCode));
}

describe('swan-notifications', () => {
  beforeEach(() => {
    const meta = document.createElement('meta');
    meta.name = 'swan-notifications';
    meta.content = 'true';
    document.head.appendChild(meta);
    clearStore();
  });

  afterEach(() => {
    clearStore();
    document.head.querySelector('meta[name="swan-notifications"]')?.remove();
  });

  describe('notifySessionScheduled / notifySessionUnscheduled', () => {
    it('does not create an entry yet when the trigger time (start - offset) is still in the future', () => {
      const session = makeSession('RF-100', { startOffsetMs: 60 * MIN, endOffsetMs: 120 * MIN });
      notifySessionScheduled(session);
      expect(getEntry('RF-100')).to.equal(undefined);
    });

    it('creates a reminder entry even once its trigger time has already passed but the session has not started', () => {
      const session = makeSession('RF-101', { startOffsetMs: 2 * MIN, endOffsetMs: 62 * MIN });
      notifySessionScheduled(session);
      expect(getEntry('RF-101').stage).to.equal('reminder');
    });

    it('creates the live entry directly (skipping reminder) for a session already underway when scheduled', () => {
      const session = makeSession('RF-102', { startOffsetMs: -MIN, endOffsetMs: 30 * MIN });
      notifySessionScheduled(session);
      expect(getEntry('RF-102').stage).to.equal('live');
    });

    it('removes the entry on unschedule', () => {
      const session = makeSession('RF-103', { startOffsetMs: -MIN, endOffsetMs: 30 * MIN });
      notifySessionScheduled(session);
      notifySessionUnscheduled(session);
      expect(getEntry('RF-103')).to.equal(undefined);
    });

    it('no-ops on unschedule when there is no known entry for the session', () => {
      notifySessionUnscheduled(makeSession('RF-never-scheduled', { startOffsetMs: MIN, endOffsetMs: 2 * MIN }));
      expect(getEntries()).to.have.lengthOf(0);
    });

    it('no-ops when the session has no rfCode', () => {
      notifySessionScheduled({ id: 'no-rfcode' });
      notifySessionUnscheduled({ id: 'no-rfcode' });
      expect(getEntries()).to.have.lengthOf(0);
    });

    it('creates the reminder entry once reconcile catches the trigger-time boundary passing', () => {
      const farSession = makeSession('RF-later', { startOffsetMs: 60 * MIN, endOffsetMs: 120 * MIN });
      notifySessionScheduled(farSession);
      expect(getEntry('RF-later')).to.equal(undefined);

      // Simulates time passing: the session is now within the (default 5-minute) reminder
      // window, without changing anything else about it.
      const dueSession = makeSession('RF-later', { startOffsetMs: 2 * MIN, endOffsetMs: 62 * MIN });
      reconcileSwanNotifications(() => [dueSession], () => new Set([dueSession.id]));
      expect(getEntry('RF-later').stage).to.equal('reminder');
    });

    it('skips a session with malformed start/end timestamps rather than misclassifying its stage', () => {
      const badSession = {
        id: 'session-bad', rfCode: 'RF-bad', startTimeUtc: 'not-a-date', endTimeUtc: 'also-not-a-date',
      };
      notifySessionScheduled(badSession);
      expect(getEntry('RF-bad')).to.equal(undefined);
    });

    it('is a no-op entirely when SWAN is not enabled on the page', () => {
      document.head.querySelector('meta[name="swan-notifications"]')?.remove();
      const session = makeSession('RF-disabled', { startOffsetMs: -MIN, endOffsetMs: 30 * MIN });
      notifySessionScheduled(session);
      expect(getEntries()).to.have.lengthOf(0);
    });
  });

  describe('reconcileSwanNotifications', () => {
    it('advances a session from reminder to live in place, as a single entry (not a new one)', () => {
      const reminderSession = makeSession('RF-progress', { startOffsetMs: 2 * MIN, endOffsetMs: 120 * MIN });
      notifySessionScheduled(reminderSession);
      expect(getEntry('RF-progress').stage).to.equal('reminder');

      const liveSession = makeSession('RF-progress', { startOffsetMs: -MIN, endOffsetMs: 30 * MIN });
      reconcileSwanNotifications(() => [liveSession], () => new Set([liveSession.id]));

      expect(getEntry('RF-progress').stage).to.equal('live');
      expect(getEntries().filter((e) => e.rfCode === 'RF-progress')).to.have.lengthOf(1);
    });

    it('re-flags the entry unread on a stage advance', () => {
      const reminderSession = makeSession('RF-unread', { startOffsetMs: 2 * MIN, endOffsetMs: 120 * MIN });
      notifySessionScheduled(reminderSession);
      // Simulate the user having already opened the panel and read the reminder.
      markRead('RF-unread');
      expect(getEntry('RF-unread').read).to.equal(true);

      const liveSession = makeSession('RF-unread', { startOffsetMs: -MIN, endOffsetMs: 30 * MIN });
      reconcileSwanNotifications(() => [liveSession], () => new Set([liveSession.id]));
      expect(getEntry('RF-unread').read).to.equal(false);
    });

    it('never re-applies a stage already reached, even across repeated reconcile calls at the same time', () => {
      const session = makeSession('RF-stable', { startOffsetMs: -MIN, endOffsetMs: 30 * MIN });
      notifySessionScheduled(session);
      const firstUpdatedAt = getEntry('RF-stable').updatedAt;

      reconcileSwanNotifications(() => [session], () => new Set([session.id]));
      reconcileSwanNotifications(() => [session], () => new Set([session.id]));
      expect(getEntry('RF-stable').updatedAt).to.equal(firstUpdatedAt);
    });

    it('removes the entry for a session no longer scheduled, once the schedule is known', () => {
      const session = makeSession('RF-orphan', { startOffsetMs: -MIN, endOffsetMs: 30 * MIN });
      notifySessionScheduled(session);

      reconcileSwanNotifications(() => [], () => new Set(), () => true);
      expect(getEntry('RF-orphan')).to.equal(undefined);
    });

    it('does NOT treat an empty schedule as orphaning everything when the schedule is not yet known', () => {
      // Reproduces a real regression: session-state-ticker.js's first tick fires
      // synchronously, immediately, as soon as the session catalog loads — which can (and in
      // practice does) happen before session-store.js's separate myData fetch has resolved
      // and populated the real scheduled set. Without this guard, that premature empty
      // getScheduled() looked identical to "the user has nothing scheduled," wiping out every
      // persisted entry, which then reappeared moments later marked unread again once the
      // real schedule loaded and re-created them — on every single page refresh.
      const session = makeSession('RF-not-yet-known', { startOffsetMs: -MIN, endOffsetMs: 30 * MIN });
      notifySessionScheduled(session);
      markRead('RF-not-yet-known');

      reconcileSwanNotifications(() => [], () => new Set()); // isScheduleKnown omitted, as the ticker's premature first tick would call it
      expect(getEntry('RF-not-yet-known')).to.not.equal(undefined);
      expect(getEntry('RF-not-yet-known').read).to.equal(true);

      reconcileSwanNotifications(() => [], () => new Set(), () => false);
      expect(getEntry('RF-not-yet-known')).to.not.equal(undefined);
    });

    it('skips a scheduled id absent from the session catalog instead of throwing', () => {
      expect(() => reconcileSwanNotifications(() => [], () => new Set(['missing-session-id']))).to.not.throw();
    });

    it('advances a session all the way through reminder -> live -> on-demand, one entry at a time', () => {
      const rfCode = 'RF-full-lifecycle';
      const reminderSession = makeSession(rfCode, { startOffsetMs: 2 * MIN, endOffsetMs: 120 * MIN });
      notifySessionScheduled(reminderSession);
      expect(getEntry(rfCode).stage).to.equal('reminder');

      const liveSession = makeSession(rfCode, { startOffsetMs: -MIN, endOffsetMs: 30 * MIN });
      reconcileSwanNotifications(() => [liveSession], () => new Set([liveSession.id]));
      expect(getEntry(rfCode).stage).to.equal('live');

      const onDemandSession = makeSession(rfCode, { startOffsetMs: -30 * MIN, endOffsetMs: -MIN });
      reconcileSwanNotifications(() => [onDemandSession], () => new Set([onDemandSession.id]));
      expect(getEntry(rfCode).stage).to.equal('on-demand');

      expect(getEntries().filter((e) => e.rfCode === rfCode)).to.have.lengthOf(1);
    });

    it('is a no-op entirely when SWAN is not enabled on the page', () => {
      document.head.querySelector('meta[name="swan-notifications"]')?.remove();
      const session = makeSession('RF-disabled', { startOffsetMs: -MIN, endOffsetMs: 30 * MIN });
      expect(() => reconcileSwanNotifications(() => [session], () => new Set([session.id]))).to.not.throw();
      expect(getEntries()).to.have.lengthOf(0);
    });
  });
});
