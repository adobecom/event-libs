import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import {
  ensureNotificationBridge, add, edit, remove, list, subscribe,
} from '../../../../../event-libs/v1/c2/blocks/ns-notification/notification-bridge.js';

describe('notification-bridge', () => {
  afterEach(() => {
    delete window.eventNotificationBridge;
    localStorage.removeItem('ns-notification-mock-store-v1');
    sinon.restore();
  });

  describe('ensureNotificationBridge', () => {
    it('installs the mock when nothing is present at window.eventNotificationBridge', () => {
      expect(window.eventNotificationBridge).to.be.undefined;
      const bridge = ensureNotificationBridge();
      expect(bridge).to.equal(window.eventNotificationBridge);
      // Content of list() isn't asserted here — mock-notification-bridge.test.js owns
      // that, and its localStorage-backed seed data can legitimately be non-empty if a
      // concurrently-running test file wrote to the same origin's storage.
      expect(bridge.add).to.be.a('function');
      expect(bridge.list).to.be.a('function');
    });

    it('leaves an already-present, contract-shaped global untouched', () => {
      const fakeBridge = {
        add: sinon.stub(), edit: sinon.stub(), remove: sinon.stub(), list: sinon.stub(), subscribe: sinon.stub(),
      };
      window.eventNotificationBridge = fakeBridge;
      const bridge = ensureNotificationBridge();
      expect(bridge).to.equal(fakeBridge);
    });

    it('installs the mock when the existing global is not contract-shaped', () => {
      window.eventNotificationBridge = { add: sinon.stub() }; // missing edit/remove/list/subscribe
      const bridge = ensureNotificationBridge();
      expect(bridge.list).to.be.a('function');
      expect(bridge.list()).to.deep.equal([]);
    });
  });

  describe('wrapper delegation', () => {
    it('delegates add/edit/remove/list/subscribe to the current global', () => {
      const fakeBridge = {
        add: sinon.stub().returns(true),
        edit: sinon.stub().returns(true),
        remove: sinon.stub().returns(true),
        list: sinon.stub().returns(['entry']),
        subscribe: sinon.stub().returns(() => {}),
      };
      window.eventNotificationBridge = fakeBridge;

      const payload = { id: 'a' };
      expect(add(payload)).to.be.true;
      expect(fakeBridge.add.calledWith(payload)).to.be.true;

      expect(edit('a', { label: 'live' })).to.be.true;
      expect(fakeBridge.edit.calledWith('a', { label: 'live' })).to.be.true;

      expect(remove('a')).to.be.true;
      expect(fakeBridge.remove.calledWith('a')).to.be.true;

      expect(list()).to.deep.equal(['entry']);

      const fn = () => {};
      subscribe(fn);
      expect(fakeBridge.subscribe.calledWith(fn)).to.be.true;
    });

    it('fails safe when no global is installed at all', () => {
      expect(add({ id: 'a' })).to.be.false;
      expect(edit('a', {})).to.be.false;
      expect(remove('a')).to.be.false;
      expect(list()).to.deep.equal([]);
      expect(subscribe(() => {})).to.be.a('function');
    });
  });
});
