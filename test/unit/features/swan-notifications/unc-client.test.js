import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import {
  whenUncReady, registerReminderRule, deleteReminderRule, fireHostEvent,
} from '../../../../event-libs/v1/features/swan-notifications/unc-client.js';

function makeUncInstance() {
  return {
    UpsertReminderFeatureFlag: sinon.stub(),
    DeleteReminderFeatureFlag: sinon.stub(),
    AnalyticsEventFromHost: sinon.stub(),
  };
}

describe('unc-client', () => {
  let originalFeds;

  beforeEach(() => {
    originalFeds = window.feds;
    delete window.feds;
  });

  afterEach(() => {
    window.feds = originalFeds;
    sinon.restore();
  });

  describe('whenUncReady', () => {
    it('resolves immediately when a correctly-shaped instance already exists', async () => {
      const uncInstance = makeUncInstance();
      window.feds = { data: { notifications: uncInstance } };
      expect(await whenUncReady()).to.equal(uncInstance);
    });

    it('does not trust a global missing all of the expected methods', async () => {
      const clock = sinon.useFakeTimers();
      window.feds = { data: { notifications: { some: 'other-shape' } } };
      const promise = whenUncReady(1000);
      clock.tick(1000);
      expect(await promise).to.equal(null);
    });

    it('does not trust a global missing even just one of the three expected methods', async () => {
      const clock = sinon.useFakeTimers();
      window.feds = {
        data: {
          notifications: {
            UpsertReminderFeatureFlag: sinon.stub(),
            DeleteReminderFeatureFlag: sinon.stub(),
            // AnalyticsEventFromHost deliberately missing.
          },
        },
      };
      const promise = whenUncReady(1000);
      clock.tick(1000);
      expect(await promise).to.equal(null);
    });

    it('resolves once feds.data.notifications.loaded fires after the instance appears', async () => {
      const promise = whenUncReady();
      const uncInstance = makeUncInstance();
      window.feds = { data: { notifications: uncInstance } };
      window.dispatchEvent(new CustomEvent('feds.data.notifications.loaded'));
      expect(await promise).to.equal(uncInstance);
    });

    it('resolves to null once the timeout elapses and no instance ever appeared', async () => {
      const clock = sinon.useFakeTimers();
      const promise = whenUncReady(1000);
      clock.tick(1000);
      expect(await promise).to.equal(null);
    });

    it('removes its own event listener once the timeout wins, instead of leaking it', async () => {
      const removeSpy = sinon.spy(window, 'removeEventListener');
      const clock = sinon.useFakeTimers();
      const promise = whenUncReady(1000);
      clock.tick(1000);
      await promise;
      expect(removeSpy.calledWith('feds.data.notifications.loaded')).to.equal(true);
    });
  });

  describe('registerReminderRule / deleteReminderRule / fireHostEvent', () => {
    let uncInstance;

    beforeEach(() => {
      uncInstance = makeUncInstance();
      window.feds = { data: { notifications: uncInstance } };
    });

    it('registerReminderRule wraps into the real {campaignRules:[{campaignID, campaignRule}]} shape', async () => {
      const campaignRule = { events: [] };
      const result = await registerReminderRule('swan-RF-1-reminder', campaignRule);
      expect(result).to.equal(true);
      expect(uncInstance.UpsertReminderFeatureFlag.calledOnceWith({
        campaignRules: [{ campaignID: 'swan-RF-1-reminder', campaignRule }],
      })).to.equal(true);
    });

    it('deleteReminderRule sends only {campaignID}, no rule body', async () => {
      const result = await deleteReminderRule('swan-RF-1-reminder');
      expect(result).to.equal(true);
      expect(uncInstance.DeleteReminderFeatureFlag.calledOnceWith({
        campaignRules: [{ campaignID: 'swan-RF-1-reminder' }],
      })).to.equal(true);
    });

    it('fireHostEvent forwards the event object as-is to AnalyticsEventFromHost', async () => {
      const eventData = { swan_campaign_id: 'swan-RF-1-reminder' };
      const result = await fireHostEvent(eventData);
      expect(result).to.equal(true);
      expect(uncInstance.AnalyticsEventFromHost.calledOnceWith(eventData)).to.equal(true);
    });

    it('all three resolve false without throwing when no UNC instance is available', async () => {
      delete window.feds;
      const clock = sinon.useFakeTimers();
      const results = Promise.all([
        registerReminderRule('x', {}),
        deleteReminderRule('x'),
        fireHostEvent({}),
      ]);
      clock.tick(8000);
      expect(await results).to.deep.equal([false, false, false]);
    });

    it('resolves false without throwing when the underlying engine call itself throws', async () => {
      uncInstance.UpsertReminderFeatureFlag.throws(new Error('engine exploded'));
      const result = await registerReminderRule('swan-RF-1-reminder', {});
      expect(result).to.equal(false);
    });
  });
});
