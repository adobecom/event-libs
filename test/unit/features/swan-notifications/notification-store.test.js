import { expect } from '@esm-bundle/chai';
import {
  notifications, getEntry, getEntries, upsertEntry, removeEntry, markRead, markAllRead, pruneStale,
} from '../../../../event-libs/v1/features/swan-notifications/notification-store.js';

const LOCAL_STATE_KEY = 'swan-notification-state-v3';

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
    clearStore();
  });

  afterEach(() => {
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
      expect(getEntry('RF-1')).to.equal(undefined);
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
      expect(getEntry('RF-1')).to.equal(undefined);
      expect(getEntry('RF-2')).to.equal(undefined);
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
      expect(getEntry('RF-1')).to.equal(undefined);
    });
  });

  describe('persistence', () => {
    it('persists writes to localStorage under the v3 key', () => {
      upsertEntry('RF-1', { stage: 'reminder', title: 'First' });
      const stored = JSON.parse(window.localStorage.getItem(LOCAL_STATE_KEY));
      expect(stored['RF-1'].title).to.equal('First');
    });
  });

  describe('cross-tab sync (storage event)', () => {
    // The real browser never fires `storage` in the same tab that made the write — this
    // dispatches it manually to simulate another tab's write landing in this one.
    function simulateOtherTabWrite(newState) {
      window.dispatchEvent(new StorageEvent('storage', {
        key: LOCAL_STATE_KEY,
        newValue: JSON.stringify(newState),
      }));
    }

    it('adopts state written by another tab', () => {
      simulateOtherTabWrite({ 'RF-1': {
        stage: 'reminder', title: 'From another tab', read: false, updatedAt: Date.now(), seq: 1,
      } });
      expect(getEntry('RF-1').title).to.equal('From another tab');
    });

    it('notifies subscribers when another tab writes', () => {
      const seen = [];
      const unsubscribe = notifications.subscribe((entries) => seen.push(entries.length));
      simulateOtherTabWrite({ 'RF-1': {
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
        expect(() => window.dispatchEvent(new StorageEvent('storage', {
          key: LOCAL_STATE_KEY, newValue,
        }))).to.not.throw();
      });
      expect(() => getEntry('anything')).to.not.throw();
      expect(() => markRead('anything')).to.not.throw();
    });

    it('lets a subsequent local upsert generate a seq higher than anything adopted cross-tab', () => {
      simulateOtherTabWrite({ 'RF-1': {
        stage: 'reminder', title: 'From another tab', read: false, updatedAt: Date.now(), seq: 100,
      } });
      upsertEntry('RF-2', { stage: 'live', title: 'Mine, written after' });
      expect(getEntry('RF-2').seq).to.be.above(100);
    });
  });
});
