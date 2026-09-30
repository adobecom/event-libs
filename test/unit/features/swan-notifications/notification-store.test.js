import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import {
  notifications, getEntry, getEntries, upsertEntry, removeEntry, markRead, markAllRead, pruneStale, dismissEntry,
  setNotificationScope, notificationsReady, setSessionScheduled,
  batchNotifications,
} from '../../../../event-libs/v1/features/swan-notifications/notification-store.js';
import { resetNotificationScope, LOCAL_STATE_PREFIX, TEST_SCOPE } from './mocks/notification-scope.js';

const LOCAL_STATE_KEY = `${LOCAL_STATE_PREFIX}RF-1:entry`;

// This module is a real singleton (its `state`/`notifications` signal live for the whole
// browser session), so tests reset it through its own public API rather than relying on
// re-importing the module or clearing localStorage alone — a fresh import wouldn't get a
// fresh instance anyway, since other test files in the same session may have already
// loaded it.
function clearStore() {
  getEntries().forEach((entry) => removeEntry(entry.rfCode));
}

describe('notification-store', () => {
  beforeEach(() => {
    resetNotificationScope();
  });

  afterEach(() => {
    sinon.restore();
    clearStore();
    window.localStorage.removeItem(LOCAL_STATE_KEY);
  });

  describe('upsertEntry / getEntry', () => {
    it('stores an entry retrievable by rfCode', () => {
      upsertEntry('RF-1', { stage: 'reminder', title: 'Session One' });
      expect(getEntry('RF-1').title).to.equal('Session One');
      expect(getEntry('RF-1').stage).to.equal('reminder');
    });

    it('marks a new entry unread by default', () => {
      upsertEntry('RF-1', { stage: 'reminder', title: 'Session One' });
      expect(getEntry('RF-1').read).to.equal(false);
    });

    it('sets updatedAt on every write', () => {
      const before = Date.now();
      upsertEntry('RF-1', { stage: 'reminder', title: 'Session One' });
      expect(getEntry('RF-1').updatedAt).to.be.at.least(before);
    });

    it('re-flags as unread when the stage actually changes', () => {
      upsertEntry('RF-1', { stage: 'reminder', title: 'Session One' });
      markRead('RF-1');
      expect(getEntry('RF-1').read).to.equal(true);

      upsertEntry('RF-1', { stage: 'live', title: 'Session One' });
      expect(getEntry('RF-1').read).to.equal(false);
    });

    it('leaves an already-read entry read on a no-op re-write of the same stage', () => {
      upsertEntry('RF-1', { stage: 'reminder', title: 'Session One' });
      markRead('RF-1');
      upsertEntry('RF-1', { stage: 'reminder', title: 'Session One' });
      expect(getEntry('RF-1').read).to.equal(true);
    });

    it('merges new fields onto the existing entry rather than replacing it wholesale', () => {
      upsertEntry('RF-1', { stage: 'reminder', title: 'Session One', actionUrl: '/a' });
      upsertEntry('RF-1', { stage: 'live', title: 'Session One' });
      expect(getEntry('RF-1').actionUrl).to.equal('/a');
    });

    it('un-dismisses an entry when its stage actually changes', () => {
      upsertEntry('RF-1', { stage: 'reminder', title: 'Session One' });
      dismissEntry('RF-1');
      expect(getEntry('RF-1').dismissed).to.equal(true);

      upsertEntry('RF-1', { stage: 'live', title: 'Session One' });
      expect(getEntry('RF-1').dismissed).to.equal(false);
    });

    it('leaves an already-dismissed entry dismissed on a no-op re-write of the same stage', () => {
      upsertEntry('RF-1', { stage: 'reminder', title: 'Session One' });
      dismissEntry('RF-1');
      upsertEntry('RF-1', { stage: 'reminder', title: 'Session One' });
      expect(getEntry('RF-1').dismissed).to.equal(true);
    });
  });

  describe('dismissEntry', () => {
    it('flags the entry dismissed without removing it from the store', () => {
      upsertEntry('RF-1', { stage: 'reminder', title: 'First' });
      dismissEntry('RF-1');
      expect(getEntry('RF-1')).to.not.equal(undefined);
      expect(getEntry('RF-1').dismissed).to.equal(true);
    });

    it('no-ops for an unknown rfCode', () => {
      expect(() => dismissEntry('RF-never')).to.not.throw();
    });

    it('is a no-op (no extra signal notification) when the entry is already dismissed', () => {
      upsertEntry('RF-1', { stage: 'reminder', title: 'First' });
      dismissEntry('RF-1');
      const seen = [];
      const unsubscribe = notifications.subscribe((entries) => seen.push(entries));
      dismissEntry('RF-1');
      unsubscribe();
      // subscribe() itself fires once immediately — a genuine second write would mean two.
      expect(seen).to.have.lengthOf(1);
    });
  });

  describe('getEntries / the notifications signal', () => {
    it('reflects every stored entry, most recently updated first', () => {
      upsertEntry('RF-1', { stage: 'reminder', title: 'First' });
      upsertEntry('RF-2', { stage: 'reminder', title: 'Second' });
      const entries = getEntries();
      expect(entries.map((e) => e.rfCode)).to.deep.equal(['RF-2', 'RF-1']);
    });

    it('sorts a live entry above an on-demand entry even when the on-demand one is more recent', () => {
      upsertEntry('RF-old-live', { stage: 'live', title: 'Live' });
      upsertEntry('RF-newer-on-demand', { stage: 'on-demand', title: 'On-Demand' });
      expect(getEntries().map((e) => e.rfCode)).to.deep.equal(['RF-old-live', 'RF-newer-on-demand']);
    });

    it('sorts live above reminder above on-demand, then falls back to recency within a stage', () => {
      upsertEntry('RF-on-demand', { stage: 'on-demand', title: 'On-Demand' });
      upsertEntry('RF-reminder-older', { stage: 'reminder', title: 'Reminder older' });
      upsertEntry('RF-reminder-newer', { stage: 'reminder', title: 'Reminder newer' });
      upsertEntry('RF-live', { stage: 'live', title: 'Live' });
      expect(getEntries().map((e) => e.rfCode)).to.deep.equal([
        'RF-live', 'RF-reminder-newer', 'RF-reminder-older', 'RF-on-demand',
      ]);
    });

    it('includes rfCode on each returned entry', () => {
      upsertEntry('RF-1', { stage: 'reminder', title: 'First' });
      expect(getEntries()[0].rfCode).to.equal('RF-1');
    });

    it('notifies signal subscribers on every mutation', () => {
      const seen = [];
      const unsubscribe = notifications.subscribe((entries) => seen.push(entries.length));
      upsertEntry('RF-1', { stage: 'reminder', title: 'First' });
      removeEntry('RF-1');
      unsubscribe();
      expect(seen).to.deep.equal([0, 1, 0]);
    });
  });

  describe('removeEntry', () => {
    it('drops the entry', () => {
      upsertEntry('RF-1', { stage: 'reminder', title: 'First' });
      removeEntry('RF-1');
      expect(getEntry('RF-1')).to.equal(undefined);
      expect(getEntries()).to.have.lengthOf(0);
    });

    it('no-ops for an rfCode that was never stored', () => {
      expect(() => removeEntry('RF-never')).to.not.throw();
    });
  });

  describe('markRead / markAllRead', () => {
    it('markRead flips only the targeted entry', () => {
      upsertEntry('RF-1', { stage: 'reminder', title: 'First' });
      upsertEntry('RF-2', { stage: 'reminder', title: 'Second' });
      markRead('RF-1');
      expect(getEntry('RF-1').read).to.equal(true);
      expect(getEntry('RF-2').read).to.equal(false);
    });

    it('markRead no-ops for an unknown rfCode', () => {
      expect(() => markRead('RF-never')).to.not.throw();
    });

    it('markAllRead flips every unread entry', () => {
      upsertEntry('RF-1', { stage: 'reminder', title: 'First' });
      upsertEntry('RF-2', { stage: 'reminder', title: 'Second' });
      markAllRead();
      expect(getEntry('RF-1').read).to.equal(true);
      expect(getEntry('RF-2').read).to.equal(true);
    });

    it('markAllRead is a no-op (no extra signal notification) when nothing is unread', () => {
      upsertEntry('RF-1', { stage: 'reminder', title: 'First' });
      markAllRead();
      const seen = [];
      const unsubscribe = notifications.subscribe((entries) => seen.push(entries));
      markAllRead();
      unsubscribe();
      // subscribe() itself fires once immediately with the current value — a genuine
      // second notification would mean two entries in `seen`.
      expect(seen).to.have.lengthOf(1);
    });
  });

  describe('pruneStale', () => {
    it('drops an on-demand entry older than persistTillDays', () => {
      upsertEntry('RF-1', { stage: 'on-demand', title: 'Old' });
      const fourDaysMs = 4 * 24 * 60 * 60 * 1000;
      pruneStale(Date.now() + fourDaysMs, 3);
      expect(getEntry('RF-1').expired).to.equal(true);
      expect(getEntries()).to.have.lengthOf(0);
    });

    it('keeps an on-demand entry younger than persistTillDays', () => {
      upsertEntry('RF-1', { stage: 'on-demand', title: 'Recent' });
      pruneStale(Date.now(), 3);
      expect(getEntry('RF-1')).to.not.equal(undefined);
    });

    it('keeps a reminder or live entry under the (default 14-day) event-wide expiration safety net', () => {
      upsertEntry('RF-1', { stage: 'reminder', title: 'Still upcoming' });
      upsertEntry('RF-2', { stage: 'live', title: 'Still live' });
      const tenDaysMs = 10 * 24 * 60 * 60 * 1000;
      pruneStale(Date.now() + tenDaysMs, 3);
      expect(getEntry('RF-1')).to.not.equal(undefined);
      expect(getEntry('RF-2')).to.not.equal(undefined);
    });

    it('drops a reminder or live entry once it exceeds the event-wide expirationDays safety net', () => {
      // Reproduces the scenario the safety net exists for: an entry that never gets
      // reconciled further (e.g. its session silently drops out of the catalog) would
      // otherwise persist forever, since only on-demand entries have their own TTL.
      upsertEntry('RF-1', { stage: 'reminder', title: 'Stuck reminder' });
      upsertEntry('RF-2', { stage: 'live', title: 'Stuck live' });
      const twentyDaysMs = 20 * 24 * 60 * 60 * 1000;
      pruneStale(Date.now() + twentyDaysMs, 3, 14);
      expect(getEntry('RF-1').expired).to.equal(true);
      expect(getEntry('RF-2').expired).to.equal(true);
      expect(getEntries()).to.have.lengthOf(0);
    });

    it('falls back to a 14-day expiration window for a non-numeric expirationDays', () => {
      upsertEntry('RF-1', { stage: 'reminder', title: 'Still upcoming' });
      const tenDaysMs = 10 * 24 * 60 * 60 * 1000;
      pruneStale(Date.now() + tenDaysMs, 3, 'not-a-number');
      expect(getEntry('RF-1')).to.not.equal(undefined);
    });

    it('falls back to a 3-day window for a non-numeric persistTillDays', () => {
      upsertEntry('RF-1', { stage: 'on-demand', title: 'Old' });
      const twoDaysMs = 2 * 24 * 60 * 60 * 1000;
      pruneStale(Date.now() + twoDaysMs, 'not-a-number');
      expect(getEntry('RF-1')).to.not.equal(undefined);
    });

    it('respects an explicit 0 as "prune immediately", rather than treating it as missing', () => {
      upsertEntry('RF-1', { stage: 'on-demand', title: 'Old' });
      pruneStale(Date.now() + 1, 0);
      expect(getEntry('RF-1').expired).to.equal(true);
      expect(getEntries()).to.have.lengthOf(0);
    });
  });

  describe('persistence', () => {
    it('persists writes to a scoped per-entry v3 key', () => {
      upsertEntry('RF-1', { stage: 'reminder', title: 'First' });
      const stored = JSON.parse(window.localStorage.getItem(LOCAL_STATE_KEY));
      expect(stored.title).to.equal('First');
    });

    it('persists read and dismissal separately from entry content', () => {
      upsertEntry('RF-1', { stage: 'live', title: 'First' });
      dismissEntry('RF-1');
      markRead('RF-1');
      expect(localStorage.getItem(`${LOCAL_STATE_PREFIX}RF-1:live:dismissed`)).to.equal('true');
      expect(localStorage.getItem(`${LOCAL_STATE_PREFIX}RF-1:live:read`)).to.equal('true');
      setNotificationScope(null, null, null);
      setNotificationScope(...TEST_SCOPE);
      expect(getEntry('RF-1').dismissed).to.equal(true);
      expect(getEntry('RF-1').read).to.equal(true);
      expect(notificationsReady.value).to.equal(false);
    });

    it('isolates events, attendees and environments, including identical rfCodes', () => {
      upsertEntry('RF-1', { stage: 'live', title: 'Original' });
      dismissEntry('RF-1');
      [
        ['another-event', TEST_SCOPE[1], TEST_SCOPE[2]],
        [TEST_SCOPE[0], 'another-attendee', TEST_SCOPE[2]],
        [TEST_SCOPE[0], TEST_SCOPE[1], 'another-environment'],
      ].forEach((scope) => {
        setNotificationScope(...scope);
        expect(getEntries()).to.have.lengthOf(0);
        upsertEntry('RF-1', { stage: 'live', title: 'Other' });
      });
      setNotificationScope(...TEST_SCOPE);
      expect(getEntry('RF-1').title).to.equal('Original');
      expect(getEntry('RF-1').dismissed).to.equal(true);
    });

    it('does not hydrate unscoped state or expose entries after logout', () => {
      localStorage.setItem('swan-notification-state-v3', JSON.stringify({ 'RF-1': { stage: 'live', title: 'Unscoped' } }));
      setNotificationScope(null, null, null);
      expect(getEntries()).to.have.lengthOf(0);
      setNotificationScope(...TEST_SCOPE);
      expect(getEntries()).to.have.lengthOf(0);
      localStorage.removeItem('swan-notification-state-v3');
    });

    it('keeps unschedule tombstones hidden until a fresh schedule explicitly restores membership', () => {
      upsertEntry('RF-1', { stage: 'live', title: 'First' });
      setSessionScheduled('RF-1', false);
      upsertEntry('RF-1', { stage: 'live', title: 'Stale tab' });
      expect(getEntries()).to.have.lengthOf(0);
      expect(getEntry('RF-1').unscheduled).to.equal(true);
      setSessionScheduled('RF-1', true);
      upsertEntry('RF-1', { stage: 'live', title: 'Rescheduled' });
      expect(getEntry('RF-1').title).to.equal('Rescheduled');
    });

    it('retries temporarily failed dismissal writes rather than losing them on scope changes', () => {
      upsertEntry('RF-1', { stage: 'live', title: 'First' });
      const writes = sinon.stub(Storage.prototype, 'setItem').throws(new Error('quota exceeded'));
      dismissEntry('RF-1');
      setNotificationScope(null, null, null);
      setNotificationScope(...TEST_SCOPE);
      expect(getEntry('RF-1').dismissed).to.equal(true);
      writes.restore();
      batchNotifications(() => {});
      expect(localStorage.getItem(`${LOCAL_STATE_PREFIX}RF-1:live:dismissed`)).to.equal('true');
      setNotificationScope(null, null, null);
      setNotificationScope(...TEST_SCOPE);
      expect(getEntry('RF-1').dismissed).to.equal(true);
    });
  });

  describe('cross-tab sync (storage event)', () => {
    // The real browser never fires `storage` in the same tab that made the write — this
    // dispatches it manually to simulate another tab's write landing in this one.
    async function simulateOtherTabWrite(newState) {
      Object.entries(newState).forEach(([rfCode, entry]) => {
        localStorage.setItem(`${LOCAL_STATE_PREFIX}${encodeURIComponent(rfCode)}:entry`, JSON.stringify(entry));
      });
      window.dispatchEvent(new StorageEvent('storage', {
        key: LOCAL_STATE_KEY,
        newValue: JSON.stringify(newState),
      }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    it('adopts state written by another tab', async () => {
      await simulateOtherTabWrite({ 'RF-1': {
        stage: 'reminder', title: 'From another tab', read: false, updatedAt: Date.now(), seq: 1,
      } });
      expect(getEntry('RF-1').title).to.equal('From another tab');
    });

    it('notifies subscribers when another tab writes', async () => {
      const seen = [];
      const unsubscribe = notifications.subscribe((entries) => seen.push(entries.length));
      await simulateOtherTabWrite({ 'RF-1': {
        stage: 'reminder', title: 'From another tab', read: false, updatedAt: Date.now(), seq: 1,
      } });
      unsubscribe();
      expect(seen[seen.length - 1]).to.equal(1);
    });

    it('ignores a storage event for an unrelated key', () => {
      upsertEntry('RF-1', { stage: 'reminder', title: 'Mine' });
      window.dispatchEvent(new StorageEvent('storage', { key: 'some-other-key', newValue: '{}' }));
      expect(getEntry('RF-1').title).to.equal('Mine');
    });

    it('resets to empty state rather than throwing on a corrupt cross-tab write', () => {
      upsertEntry('RF-1', { stage: 'reminder', title: 'Mine' });
      localStorage.setItem(LOCAL_STATE_KEY, '{not-json');
      expect(() => window.dispatchEvent(new StorageEvent('storage', {
        key: LOCAL_STATE_KEY, newValue: '{not-json',
      }))).to.not.throw();
      expect(getEntries()).to.have.lengthOf(0);
    });

    it('resets to empty state rather than crashing when the written value is valid JSON but not an object', () => {
      // JSON.parse('null')/('42')/('"x"') all succeed without throwing — only the try/catch
      // shape check catches these; without it, `state` would become `null`/a number/a string,
      // and the very next line (Object.values(state)) would throw instead.
      upsertEntry('RF-1', { stage: 'reminder', title: 'Mine' });
      ['null', '42', '"just a string"', '[]'].forEach((newValue) => {
        localStorage.setItem(LOCAL_STATE_KEY, newValue);
        expect(() => window.dispatchEvent(new StorageEvent('storage', {
          key: LOCAL_STATE_KEY, newValue,
        }))).to.not.throw();
      });
      expect(() => getEntry('anything')).to.not.throw();
      expect(() => markRead('anything')).to.not.throw();
    });

    it('lets a subsequent local upsert generate a seq higher than anything adopted cross-tab', async () => {
      await simulateOtherTabWrite({ 'RF-1': {
        stage: 'reminder', title: 'From another tab', read: false, updatedAt: Date.now(), seq: 100,
      } });
      upsertEntry('RF-2', { stage: 'live', title: 'Mine, written after' });
      expect(getEntry('RF-2').seq).to.be.above(100);
    });

    it('reads current storage instead of resurrecting a dismissal from a queued stale event', () => {
      upsertEntry('RF-1', { stage: 'live', title: 'Mine' });
      const staleEntry = localStorage.getItem(LOCAL_STATE_KEY);
      dismissEntry('RF-1');
      window.dispatchEvent(new StorageEvent('storage', { key: LOCAL_STATE_KEY, newValue: staleEntry }));
      expect(getEntry('RF-1').dismissed).to.equal(true);
      expect(notifications.value[0].dismissed).to.equal(true);
    });

    it('never overwrites another entry or same-stage dismissal when writing from stale memory', () => {
      upsertEntry('RF-1', { stage: 'live', title: 'Mine' });
      localStorage.setItem(`${LOCAL_STATE_PREFIX}RF-1:live:dismissed`, 'true');
      // No storage event has reached this tab yet.
      localStorage.setItem(`${LOCAL_STATE_PREFIX}RF-2:entry`, JSON.stringify({
        stage: 'live', title: 'Other tab', updatedAt: Date.now(), seq: 100,
      }));
      upsertEntry('RF-3', { stage: 'live', title: 'Local write' });
      upsertEntry('RF-1', { stage: 'live', title: 'Refreshed' });
      expect(getEntry('RF-1').dismissed).to.equal(true);
      expect(getEntry('RF-2').title).to.equal('Other tab');
      expect(getEntries()).to.have.lengthOf(3);
    });

    it('does not downgrade a stage advanced by another tab before its storage event arrives', () => {
      upsertEntry('RF-1', { stage: 'reminder', title: 'Mine' });
      localStorage.setItem(LOCAL_STATE_KEY, JSON.stringify({
        stage: 'live', title: 'Other tab', updatedAt: Date.now(), seq: 100,
      }));
      upsertEntry('RF-1', { stage: 'reminder', title: 'Stale reminder' });
      expect(getEntry('RF-1').stage).to.equal('live');
    });

    it('preserves dismissal and concurrent entries across independent tab stores', async () => {
      const otherTab = await import(`../../../../event-libs/v1/features/swan-notifications/notification-store.js?tab=${Math.random()}`);
      otherTab.setNotificationScope(...TEST_SCOPE);
      upsertEntry('RF-1', { stage: 'live', title: 'Mine' });
      otherTab.getEntry('RF-1');
      dismissEntry('RF-1');
      otherTab.upsertEntry('RF-2', { stage: 'live', title: 'Other tab' });
      otherTab.markRead('RF-1');
      expect(getEntry('RF-1').dismissed).to.equal(true);
      expect(getEntry('RF-1').read).to.equal(true);
      expect(getEntry('RF-2').title).to.equal('Other tab');
      expect(otherTab.getEntry('RF-1').dismissed).to.equal(true);
      otherTab.setNotificationScope(null, null, null);
    });

    it('reads only the target entry and flags for each single-entry lookup', () => {
      for (let index = 0; index < 100; index += 1) {
        upsertEntry(`RF-${index}`, { stage: 'live', title: `Session ${index}` });
      }
      const keys = sinon.spy(Storage.prototype, 'key');
      const reads = sinon.spy(Storage.prototype, 'getItem');
      for (let index = 0; index < 100; index += 1) getEntry(`RF-${index}`);
      expect(keys.callCount).to.equal(0);
      expect(reads.callCount).to.equal(300);
    });

    it('coalesces a burst of read events and publishes only an effective state change', async () => {
      for (let index = 0; index < 100; index += 1) {
        upsertEntry(`RF-${index}`, { stage: 'live', title: `Session ${index}` });
        localStorage.setItem(`${LOCAL_STATE_PREFIX}RF-${index}:live:read`, 'true');
      }
      const seen = [];
      const unsubscribe = notifications.subscribe((entries) => seen.push(entries));
      const keys = sinon.spy(Storage.prototype, 'key');
      const keyCount = localStorage.length;
      for (let index = 0; index < 100; index += 1) {
        window.dispatchEvent(new StorageEvent('storage', {
          key: `${LOCAL_STATE_PREFIX}RF-${index}:live:read`, newValue: 'true',
        }));
      }
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(seen).to.have.lengthOf(2);
      expect(seen[1].every((entry) => entry.read)).to.equal(true);
      expect(keys.callCount).to.equal(keyCount);
      window.dispatchEvent(new StorageEvent('storage', { key: LOCAL_STATE_KEY, newValue: '{}' }));
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(seen).to.have.lengthOf(2);
      unsubscribe();
    });
  });
});
