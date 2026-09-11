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

    it('never prunes a reminder or live entry regardless of age', () => {
      upsertEntry('RF-1', { stage: 'reminder', title: 'Still upcoming' });
      upsertEntry('RF-2', { stage: 'live', title: 'Still live' });
      const tenDaysMs = 10 * 24 * 60 * 60 * 1000;
      pruneStale(Date.now() + tenDaysMs, 3);
      expect(getEntry('RF-1')).to.not.equal(undefined);
      expect(getEntry('RF-2')).to.not.equal(undefined);
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
});
