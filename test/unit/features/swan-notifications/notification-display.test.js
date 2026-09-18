import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { upsertNotification, removeNotification } from '../../../../event-libs/v1/features/swan-notifications/notification-display.js';
import { getEntry, getEntries, removeEntry } from '../../../../event-libs/v1/features/swan-notifications/notification-store.js';

function clearStore() {
  getEntries().forEach((entry) => removeEntry(entry.rfCode));
}

describe('notification-display', () => {
  afterEach(() => {
    clearStore();
    sinon.restore();
  });

  describe('upsertNotification', () => {
    it('delegates to notification-store and returns true on success', () => {
      const result = upsertNotification('RF-1', { stage: 'reminder', title: 'Session' });
      expect(result).to.equal(true);
      expect(getEntry('RF-1').title).to.equal('Session');
    });

    it('never throws even when the underlying localStorage write fails', () => {
      // notification-store.js's own writeLocalState() already catches a localStorage
      // failure internally (quota exceeded, private-browsing restrictions, etc.) and keeps
      // the in-memory signal authoritative for the live tab — this wrapper's own try/catch
      // is defense-in-depth for that boundary, not something this particular failure mode
      // exercises on its own.
      const setItemStub = sinon.stub(window.localStorage, 'setItem').throws(new Error('quota exceeded'));
      let threw = false;
      let result;
      try {
        result = upsertNotification('RF-1', { stage: 'reminder', title: 'Session' });
      } catch {
        threw = true;
      }
      setItemStub.restore();
      expect(threw).to.equal(false);
      expect(result).to.equal(true);
      expect(getEntry('RF-1').title).to.equal('Session');
    });
  });

  describe('removeNotification', () => {
    it('delegates to notification-store and returns true', () => {
      upsertNotification('RF-1', { stage: 'reminder', title: 'Session' });
      const result = removeNotification('RF-1');
      expect(result).to.equal(true);
      expect(getEntry('RF-1')).to.equal(undefined);
    });

    it('never throws even for an rfCode that was never stored', () => {
      expect(() => removeNotification('RF-never')).to.not.throw();
    });
  });
});
