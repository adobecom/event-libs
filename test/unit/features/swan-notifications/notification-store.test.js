import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import {
  notifications, getEntry, getEntries, upsertEntry, removeEntry, markRead, markAllRead,
  pruneStale, dismissEntry, batchNotifications, flushNotifications,
  correctEntry,
} from '../../../../event-libs/v1/features/swan-notifications/notification-store.js';
import { resetNotifications } from './mocks/notification-store.js';

const LOCAL_STATE_KEY = 'swan-notification-state-v3';
const DAY = 24 * 60 * 60 * 1000;

async function otherTabWrite(next) {
  await flushNotifications();
  localStorage.setItem(LOCAL_STATE_KEY, JSON.stringify(next));
  window.dispatchEvent(new StorageEvent('storage', { key: LOCAL_STATE_KEY, newValue: JSON.stringify(next) }));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('notification-store', () => {
  beforeEach(resetNotifications);
  afterEach(async () => {
    sinon.restore();
    await flushNotifications();
  });

  describe('timing corrections', () => {
    it('retains unknown legacy fields while comparing their persisted values structurally', async () => {
      upsertEntry('RF-1', { stage: 'on-demand', title: 'First', legacy: { source: 'QA' } });
      await flushNotifications();
      const expected = getEntry('RF-1');
      correctEntry('RF-1', { stage: 'reminder' }, expected);
      await flushNotifications();
      expect(getEntry('RF-1').stage).to.equal('reminder');
      expect(getEntry('RF-1').legacy).to.deep.equal({ source: 'QA' });
    });

    it('corrects a stage without resetting flags, timestamp or sequence', () => {
      upsertEntry('RF-1', { stage: 'on-demand', title: 'First' });
      const expected = getEntry('RF-1');
      markRead('RF-1');
      dismissEntry('RF-1');
      correctEntry('RF-1', { stage: 'reminder', title: 'Corrected' }, expected);
      expect(getEntry('RF-1')).to.include({
        stage: 'reminder', read: true, dismissed: true,
        updatedAt: expected.updatedAt, seq: expected.seq,
      });
    });

    it('does not overwrite a newer stage while a correction waits for the lock', async () => {
      upsertEntry('RF-1', { stage: 'on-demand', title: 'Original', endTimeMs: 100 });
      await flushNotifications();
      const expected = getEntry('RF-1');
      correctEntry('RF-1', { stage: 'reminder' }, expected);
      localStorage.setItem(LOCAL_STATE_KEY, JSON.stringify({
        'RF-1': { ...expected, endTimeMs: 200, title: 'New catalog' },
      }));
      await flushNotifications();
      expect(getEntry('RF-1').title).to.equal('New catalog');
      expect(getEntry('RF-1').stage).to.equal('on-demand');
    });

    it('merges flags changed in another tab before the correction is persisted', async () => {
      upsertEntry('RF-1', { stage: 'on-demand', title: 'First' });
      await flushNotifications();
      const expected = getEntry('RF-1');
      correctEntry('RF-1', { stage: 'reminder' }, expected);
      localStorage.setItem(LOCAL_STATE_KEY, JSON.stringify({
        'RF-1': { ...expected, read: true, dismissed: true },
      }));
      await flushNotifications();
      expect(getEntry('RF-1')).to.include({ stage: 'reminder', read: true, dismissed: true });
    });

    it('does not resurrect an entry removed while a correction is queued', async () => {
      upsertEntry('RF-1', { stage: 'on-demand', title: 'First' });
      await flushNotifications();
      correctEntry('RF-1', { stage: 'reminder' }, getEntry('RF-1'));
      localStorage.setItem(LOCAL_STATE_KEY, '{}');
      await flushNotifications();
      expect(getEntry('RF-1')).to.equal(undefined);
    });
  });

  describe('upsertEntry', () => {
    it('stores entries by rfCode, sets updatedAt, and defaults to unread', () => {
      const before = Date.now();
      upsertEntry('RF-1', { stage: 'reminder', title: 'First' });
      expect(getEntry('RF-1').title).to.equal('First');
      expect(getEntry('RF-1').read).to.equal(false);
      expect(getEntry('RF-1').updatedAt).to.be.at.least(before);
    });

    it('preserves read/dismiss and fields at the same stage and across a stage advance', () => {
      upsertEntry('RF-1', { stage: 'reminder', title: 'First', actionUrl: '/a' });
      markRead('RF-1');
      dismissEntry('RF-1');
      upsertEntry('RF-1', { stage: 'reminder', title: 'Refreshed' });
      expect(getEntry('RF-1').read).to.equal(true);
      expect(getEntry('RF-1').dismissed).to.equal(true);
      upsertEntry('RF-1', { stage: 'live', title: 'Live' });
      expect(getEntry('RF-1').stage).to.equal('live');
      expect(getEntry('RF-1').read).to.equal(true);
      expect(getEntry('RF-1').dismissed).to.equal(true);
      expect(getEntry('RF-1').actionUrl).to.equal('/a');
    });

    it('does not downgrade a stage advanced in another tab before the storage event arrives', async () => {
      upsertEntry('RF-1', { stage: 'reminder', title: 'Mine' });
      await flushNotifications();
      localStorage.setItem(LOCAL_STATE_KEY, JSON.stringify({
        'RF-1': { stage: 'live', title: 'Other tab', seq: 100, updatedAt: Date.now() },
      }));
      upsertEntry('RF-1', { stage: 'reminder', title: 'Stale' });
      expect(getEntry('RF-1').stage).to.equal('live');
    });
  });

  describe('read, dismiss and remove', () => {
    it('keeps dismissals in the existing map and writes no extra state for repeated actions', () => {
      upsertEntry('RF-1', { stage: 'live', title: 'First' });
      dismissEntry('RF-1');
      expect(getEntry('RF-1').dismissed).to.equal(true);
      const seen = [];
      const unsubscribe = notifications.subscribe((entries) => seen.push(entries));
      dismissEntry('RF-1');
      dismissEntry('missing');
      markRead('missing');
      unsubscribe();
      expect(seen).to.have.lengthOf(1);
    });

    it('marks only the requested entry read, then marks the whole inbox read', () => {
      upsertEntry('RF-1', { stage: 'live', title: 'First' });
      upsertEntry('RF-2', { stage: 'live', title: 'Second', eventId: 'another-event' });
      markRead('RF-1');
      expect(getEntry('RF-2').read).to.equal(false);
      markAllRead();
      expect(getEntries().every((entry) => entry.read)).to.equal(true);
    });

    it('removes entries rather than retaining hidden records', async () => {
      upsertEntry('RF-1', { stage: 'live', title: 'First' });
      removeEntry('RF-1');
      removeEntry('missing');
      await flushNotifications();
      expect(getEntry('RF-1')).to.equal(undefined);
      expect(JSON.parse(localStorage.getItem(LOCAL_STATE_KEY))).to.deep.equal({});
    });
  });

  describe('ordering and publication', () => {
    it('sorts live above reminder above on-demand, with recency within a stage', () => {
      upsertEntry('RF-on-demand', { stage: 'on-demand', title: 'Ended' });
      upsertEntry('RF-reminder-a', { stage: 'reminder', title: 'Older' });
      upsertEntry('RF-reminder-b', { stage: 'reminder', title: 'Newer' });
      upsertEntry('RF-live', { stage: 'live', title: 'Live' });
      expect(getEntries().map((entry) => entry.rfCode)).to.deep.equal([
        'RF-live', 'RF-reminder-b', 'RF-reminder-a', 'RF-on-demand',
      ]);
    });

    it('publishes only the final list for batched mutations', () => {
      const seen = [];
      const unsubscribe = notifications.subscribe((entries) => seen.push(entries.length));
      batchNotifications(() => {
        upsertEntry('RF-1', { stage: 'live', title: 'First' });
        upsertEntry('RF-2', { stage: 'live', title: 'Second' });
        removeEntry('RF-1');
      });
      unsubscribe();
      expect(seen).to.deep.equal([0, 1]);
    });
  });

  describe('expiry', () => {
    it('expires from the session end rather than a recent local write', () => {
      upsertEntry('RF-ended', { stage: 'on-demand', title: 'Old', endTimeMs: Date.now() - 4 * DAY });
      upsertEntry('RF-live', { stage: 'live', title: 'Old cached stage', endTimeMs: Date.now() - 4 * DAY });
      pruneStale(Date.now(), 3);
      expect(getEntries()).to.have.lengthOf(0);
    });

    it('preserves the original updatedAt fallback for existing entries without session times', () => {
      upsertEntry('RF-1', { stage: 'on-demand', title: 'Recent' });
      pruneStale(Date.now() + 2 * DAY, 3);
      expect(getEntry('RF-1')).to.not.equal(undefined);
      pruneStale(Date.now() + 4 * DAY, 3);
      expect(getEntry('RF-1')).to.equal(undefined);
    });

    it('retains the 14-day safety net, invalid-value fallbacks and explicit zero', () => {
      upsertEntry('RF-live', { stage: 'live', title: 'Live' });
      pruneStale(Date.now() + 10 * DAY, 'invalid', 'invalid');
      expect(getEntry('RF-live')).to.not.equal(undefined);
      pruneStale(Date.now() + 20 * DAY, 3, 14);
      expect(getEntry('RF-live')).to.equal(undefined);
      upsertEntry('RF-ended', { stage: 'on-demand', title: 'Ended' });
      pruneStale(Date.now() + 1, 0);
      expect(getEntry('RF-ended')).to.equal(undefined);
    });
  });

  describe('single-key persistence', () => {
    it('writes all notifications and flags to the existing v3 map', async () => {
      const writes = sinon.spy(Storage.prototype, 'setItem');
      upsertEntry('RF-1', { stage: 'live', title: 'First', eventId: 'event-a' });
      upsertEntry('RF-2', { stage: 'live', title: 'Second', eventId: 'event-b' });
      dismissEntry('RF-1');
      markRead('RF-2');
      await flushNotifications();
      const stored = JSON.parse(localStorage.getItem(LOCAL_STATE_KEY));
      expect(stored['RF-1'].dismissed).to.equal(true);
      expect(stored['RF-2'].read).to.equal(true);
      expect(Object.keys(stored)).to.deep.equal(['RF-1', 'RF-2']);
      expect(getEntries()).to.have.lengthOf(2);
      expect(writes.getCalls().every((call) => call.args[0] === LOCAL_STATE_KEY)).to.equal(true);
    });

    it('hydrates QA testers\' existing v3 entries without losing flags or requiring scope metadata', async () => {
      await otherTabWrite({
        'RF-existing': { stage: 'live', title: 'QA entry', dismissed: true, read: true, seq: 1, updatedAt: Date.now() },
      });
      const reloaded = await import(`../../../../event-libs/v1/features/swan-notifications/notification-store.js?reload=${Math.random()}`);
      expect(reloaded.getEntry('RF-existing').dismissed).to.equal(true);
      expect(reloaded.getEntry('RF-existing').read).to.equal(true);
      expect(reloaded.getEntries()).to.have.lengthOf(1);
    });

    it('retries failed persistence without overwriting another tab\'s newer entries', async () => {
      upsertEntry('RF-1', { stage: 'live', title: 'First' });
      await flushNotifications();
      const writes = sinon.stub(Storage.prototype, 'setItem').throws(new Error('quota exceeded'));
      dismissEntry('RF-1');
      expect(await flushNotifications()).to.equal(false);
      expect(getEntry('RF-1').dismissed).to.equal(true);
      writes.restore();
      const latest = JSON.parse(localStorage.getItem(LOCAL_STATE_KEY));
      latest['RF-2'] = { stage: 'live', title: 'Other tab', seq: 100, updatedAt: Date.now() };
      localStorage.setItem(LOCAL_STATE_KEY, JSON.stringify(latest));
      expect(await flushNotifications()).to.equal(true);
      expect(getEntry('RF-1').dismissed).to.equal(true);
      expect(getEntry('RF-2').title).to.equal('Other tab');
    });

    it('serializes concurrent tab writes while preserving read, dismiss and new entries', async () => {
      upsertEntry('RF-1', { stage: 'live', title: 'First' });
      await flushNotifications();
      const otherTab = await import(`../../../../event-libs/v1/features/swan-notifications/notification-store.js?tab=${Math.random()}`);
      dismissEntry('RF-1');
      otherTab.markRead('RF-1');
      otherTab.upsertEntry('RF-2', { stage: 'live', title: 'Other tab' });
      await Promise.all([flushNotifications(), otherTab.flushNotifications()]);
      const stored = JSON.parse(localStorage.getItem(LOCAL_STATE_KEY));
      expect(stored['RF-1'].dismissed).to.equal(true);
      expect(stored['RF-1'].read).to.equal(true);
      expect(stored['RF-2'].title).to.equal('Other tab');
    });

    it('persists mutations created by a subscriber during an ongoing flush', async () => {
      const unsubscribe = notifications.subscribe((entries) => {
        const entry = entries.find((value) => value.rfCode === 'RF-concurrent');
        if (entry && !entry.read) markRead(entry.rfCode);
      });
      upsertEntry('RF-local', { stage: 'live', title: 'Local' });
      // An external entry appears before the queued lock callback runs. Publishing
      // the merged map invokes the subscriber while the first flush is still active.
      localStorage.setItem(LOCAL_STATE_KEY, JSON.stringify({
        'RF-concurrent': { stage: 'live', title: 'Other tab', read: false, updatedAt: Date.now(), seq: 1 },
      }));
      await flushNotifications();
      unsubscribe();
      expect(JSON.parse(localStorage.getItem(LOCAL_STATE_KEY))['RF-concurrent'].read).to.equal(true);
    });

    it('waits for the origin-wide lock before updating the shared map', async () => {
      upsertEntry('RF-1', { stage: 'live', title: 'First' });
      await flushNotifications();
      let release;
      let acquired = false;
      const blocker = navigator.locks.request(LOCAL_STATE_KEY, async () => {
        acquired = true;
        await new Promise((resolve) => { release = resolve; });
      });
      while (!acquired) await new Promise((resolve) => setTimeout(resolve, 0));
      dismissEntry('RF-1');
      const pending = flushNotifications();
      expect(JSON.parse(localStorage.getItem(LOCAL_STATE_KEY))['RF-1'].dismissed).to.equal(false);
      release();
      await blocker;
      await pending;
      expect(JSON.parse(localStorage.getItem(LOCAL_STATE_KEY))['RF-1'].dismissed).to.equal(true);
    });
  });

  describe('storage events', () => {
    it('uses current storage instead of a queued stale newValue', async () => {
      upsertEntry('RF-1', { stage: 'live', title: 'First' });
      await flushNotifications();
      const stale = localStorage.getItem(LOCAL_STATE_KEY);
      dismissEntry('RF-1');
      await flushNotifications();
      window.dispatchEvent(new StorageEvent('storage', { key: LOCAL_STATE_KEY, newValue: stale }));
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(getEntry('RF-1').dismissed).to.equal(true);
      expect(notifications.value[0].dismissed).to.equal(true);
    });

    it('ignores unrelated keys and coalesces a burst without republishing unchanged state', async () => {
      upsertEntry('RF-1', { stage: 'live', title: 'First' });
      await flushNotifications();
      const seen = [];
      const unsubscribe = notifications.subscribe((entries) => seen.push(entries));
      for (let index = 0; index < 100; index += 1) {
        window.dispatchEvent(new StorageEvent('storage', { key: LOCAL_STATE_KEY, newValue: '{}' }));
      }
      window.dispatchEvent(new StorageEvent('storage', { key: 'unrelated', newValue: '{}' }));
      await new Promise((resolve) => setTimeout(resolve, 0));
      unsubscribe();
      expect(seen).to.have.lengthOf(1);
      expect(getEntry('RF-1').title).to.equal('First');
    });

    it('logs malformed storage without throwing or replacing the live state', async () => {
      upsertEntry('RF-1', { stage: 'live', title: 'First' });
      await flushNotifications();
      ['{bad-json', 'null', '42', '"text"', '[]'].forEach((value) => {
        localStorage.setItem(LOCAL_STATE_KEY, value);
        expect(() => getEntry('RF-1')).to.not.throw();
        expect(getEntry('RF-1').title).to.equal('First');
      });
      localStorage.setItem(LOCAL_STATE_KEY, '{}');
    });
  });
});
