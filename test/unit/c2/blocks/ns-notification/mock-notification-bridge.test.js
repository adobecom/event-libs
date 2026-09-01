import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { installMockNotificationBridge } from '../../../../../event-libs/v1/c2/blocks/ns-notification/mock-notification-bridge.js';

const STORAGE_KEY = 'ns-notification-mock-store-v1';

// Fixed createdAt (not Date.now()) — this helper is called multiple times per test to
// build both the value passed to add() and the value compared against in an assertion,
// and a live clock would make those two calls produce different timestamps.
function notification(overrides = {}) {
  return {
    id: 'session-1',
    label: 'reminder',
    title: 'Adobe Event',
    message: 'Test Session',
    url: 'https://example.com/session-1',
    startTimeUtc: '2026-09-01T18:00:00.000Z',
    endTimeUtc: '2026-09-01T19:00:00.000Z',
    createdAt: 1_700_000_000_000,
    ...overrides,
  };
}

// CRUD/subscribe tests stub localStorage entirely rather than touching the real thing:
// this repo's test runner can execute multiple test files concurrently against the same
// origin, and the mock's storage key is a fixed, unparameterized constant, so real
// localStorage isn't safe to share across concurrently-running files. Only the dedicated
// "localStorage persistence" describe below exercises the real thing, since that's
// exactly the behavior it's testing.
function stubEmptyLocalStorage() {
  sinon.stub(window.localStorage, 'getItem').returns(null);
  sinon.stub(window.localStorage, 'setItem');
}

describe('mock-notification-bridge', () => {
  describe('CRUD', () => {
    let bridge;

    beforeEach(() => {
      stubEmptyLocalStorage();
      bridge = installMockNotificationBridge();
    });

    afterEach(() => {
      sinon.restore();
    });

    it('add() stores an entry and list() reflects it', () => {
      expect(bridge.add(notification())).to.be.true;
      expect(bridge.list()).to.deep.equal([notification()]);
    });

    it('edit() patches an existing entry in place', () => {
      bridge.add(notification());
      expect(bridge.edit('session-1', { label: 'live' })).to.be.true;
      expect(bridge.list()[0].label).to.equal('live');
      expect(bridge.list()).to.have.lengthOf(1);
    });

    it('edit() returns false for an id that does not exist', () => {
      expect(bridge.edit('missing', { label: 'live' })).to.be.false;
    });

    it('remove() deletes an entry', () => {
      bridge.add(notification());
      expect(bridge.remove('session-1')).to.be.true;
      expect(bridge.list()).to.deep.equal([]);
    });

    it('remove() returns false for an id that does not exist', () => {
      expect(bridge.remove('missing')).to.be.false;
    });
  });

  describe('subscribe', () => {
    beforeEach(() => {
      stubEmptyLocalStorage();
    });

    afterEach(() => {
      sinon.restore();
    });

    it('fires immediately with the current list, then again on every write', () => {
      const bridge = installMockNotificationBridge();
      const calls = [];
      const unsubscribe = bridge.subscribe((list) => calls.push(list));

      expect(calls).to.have.lengthOf(1);
      expect(calls[0]).to.deep.equal([]);

      bridge.add(notification());
      expect(calls).to.have.lengthOf(2);
      expect(calls[1]).to.deep.equal([notification()]);

      unsubscribe();
      bridge.remove('session-1');
      expect(calls).to.have.lengthOf(2); // no further calls after unsubscribe
    });
  });

  describe('localStorage persistence', () => {
    afterEach(() => {
      localStorage.removeItem(STORAGE_KEY);
    });

    it('persists writes so a fresh instance picks up prior state', () => {
      localStorage.removeItem(STORAGE_KEY); // defensive against a concurrent leak from another file
      const first = installMockNotificationBridge();
      first.add(notification());

      const second = installMockNotificationBridge();
      expect(second.list()).to.deep.equal([notification()]);
    });
  });
});
