import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import {
  whenUncReady, registerReminderRule, deleteReminderRule,
} from '../../../../event-libs/v1/features/swan-notifications/unc-client.js';
import { buildStageCampaignRule } from '../../../../event-libs/v1/features/swan-notifications/swan-payload.js';

function makeUncInstance() {
  return {
    _uncContainer: {
      handleMessageFromInterface: sinon.stub(),
    },
  };
}

function makeDirectMethodInstance() {
  return {
    UpsertReminderFeatureFlag: sinon.stub(),
    DeleteReminderFeatureFlag: sinon.stub(),
  };
}

function stubUniversalNav(getComponent) {
  window.UniversalNav = { getComponent };
}

describe('unc-client', () => {
  let originalUniversalNav;

  beforeEach(() => {
    originalUniversalNav = window.UniversalNav;
    delete window.UniversalNav;
  });

  afterEach(() => {
    window.UniversalNav = originalUniversalNav;
    sinon.restore();
  });

  describe('whenUncReady', () => {
    it("resolves immediately when getComponent('notifications') already yields a correctly-shaped instance", async () => {
      const uncInstance = makeUncInstance();
      stubUniversalNav(async (name) => (name === 'notifications' ? { instance: uncInstance } : undefined));
      expect(await whenUncReady()).to.equal(uncInstance);
    });

    it('trusts an instance exposing the two reminder methods directly, with no _uncContainer', async () => {
      const uncInstance = makeDirectMethodInstance();
      stubUniversalNav(async (name) => (name === 'notifications' ? { instance: uncInstance } : undefined));
      expect(await whenUncReady()).to.equal(uncInstance);
    });

    it('does not trust an instance exposing only one of the two reminder methods directly', async () => {
      const clock = sinon.useFakeTimers();
      stubUniversalNav(async () => ({
        instance: { UpsertReminderFeatureFlag: sinon.stub() },
      }));
      const promise = whenUncReady(1000);
      await clock.tickAsync(1000);
      expect(await promise).to.equal(null);
    });

    it('does not trust an instance missing all of the expected methods', async () => {
      const clock = sinon.useFakeTimers();
      stubUniversalNav(async () => ({ instance: { some: 'other-shape' } }));
      const promise = whenUncReady(1000);
      await clock.tickAsync(1000);
      expect(await promise).to.equal(null);
    });

    it('does not trust an instance whose _uncContainer is missing handleMessageFromInterface', async () => {
      const clock = sinon.useFakeTimers();
      stubUniversalNav(async () => ({
        instance: { _uncContainer: { someOtherMethod: sinon.stub() } },
      }));
      const promise = whenUncReady(1000);
      await clock.tickAsync(1000);
      expect(await promise).to.equal(null);
    });

    it('polls until getComponent starts yielding an instance, if window.UniversalNav appears late', async () => {
      const clock = sinon.useFakeTimers();
      const promise = whenUncReady(2000);
      await clock.tickAsync(500);

      const uncInstance = makeUncInstance();
      stubUniversalNav(async (name) => (name === 'notifications' ? { instance: uncInstance } : undefined));
      await clock.tickAsync(1500);

      expect(await promise).to.equal(uncInstance);
    });

    it('resolves to null once the timeout elapses and window.UniversalNav never appears', async () => {
      const clock = sinon.useFakeTimers();
      const promise = whenUncReady(1000);
      await clock.tickAsync(1000);
      expect(await promise).to.equal(null);
    });

    it('resolves to null if getComponent itself throws (e.g. the component was never configured on this page)', async () => {
      const clock = sinon.useFakeTimers();
      stubUniversalNav(async () => { throw new Error('Notifications component was not initialized'); });
      const promise = whenUncReady(1000);
      await clock.tickAsync(1000);
      expect(await promise).to.equal(null);
    });
  });

  describe('registerReminderRule / deleteReminderRule', () => {
    let uncInstance;

    beforeEach(() => {
      uncInstance = makeUncInstance();
      stubUniversalNav(async (name) => (name === 'notifications' ? { instance: uncInstance } : undefined));
    });

    it('registerReminderRule wraps into the real {type, action, campaignRules:[{campaignId, campaignRule}]} shape', async () => {
      const campaignRule = { events: [] };
      const result = await registerReminderRule('swan-RF-1-reminder', campaignRule);
      expect(result).to.equal(true);
      expect(uncInstance._uncContainer.handleMessageFromInterface.calledOnceWith(
        'UpsertReminderFeatureFlag',
        { type: 'rule', action: 'upsert', campaignRules: [{ campaignId: 'swan-RF-1-reminder', campaignRule }] },
      )).to.equal(true);
    });

    it('deleteReminderRule sends only {campaignId}, no rule body', async () => {
      const result = await deleteReminderRule('swan-RF-1-reminder');
      expect(result).to.equal(true);
      expect(uncInstance._uncContainer.handleMessageFromInterface.calledOnceWith(
        'DeleteReminderFeatureFlag',
        { type: 'rule', action: 'delete', campaignRules: [{ campaignId: 'swan-RF-1-reminder' }] },
      )).to.equal(true);
    });

    it("carries buildStageCampaignRule()'s real payload shape through to _uncContainer unchanged", async () => {
      const session = {
        rfCode: 'RF-200',
        title: 'Real Session',
        sessionPageUrl: '/sessions/real',
        startTimeUtc: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        endTimeUtc: new Date(Date.now() + 120 * 60 * 1000).toISOString(),
      };
      const swanConfig = { eventName: 'MAX', localNotificationPersistTillDays: 3 };
      const { campaignId, campaignRule } = buildStageCampaignRule(session, 'reminder', swanConfig, {});

      const result = await registerReminderRule(campaignId, campaignRule);
      expect(result).to.equal(true);
      expect(uncInstance._uncContainer.handleMessageFromInterface.calledOnceWith(
        'UpsertReminderFeatureFlag',
        { type: 'rule', action: 'upsert', campaignRules: [{ campaignId, campaignRule }] },
      )).to.equal(true);
    });

    it('both resolve false without throwing when no UNC instance is available', async () => {
      delete window.UniversalNav;
      const clock = sinon.useFakeTimers();
      const results = Promise.all([
        registerReminderRule('x', {}),
        deleteReminderRule('x'),
      ]);
      await clock.tickAsync(8000);
      expect(await results).to.deep.equal([false, false]);
    });

    it('resolves false without throwing when the underlying engine call itself throws on every retry', async () => {
      const clock = sinon.useFakeTimers();
      uncInstance._uncContainer.handleMessageFromInterface.throws(new Error('engine exploded'));
      const promise = registerReminderRule('swan-RF-1-reminder', {});
      await clock.tickAsync(8 * 500);
      expect(await promise).to.equal(false);
      expect(uncInstance._uncContainer.handleMessageFromInterface.callCount).to.equal(9);
    });

    it('retries a transient call failure and succeeds once the engine recovers', async () => {
      const clock = sinon.useFakeTimers();
      uncInstance._uncContainer.handleMessageFromInterface
        .onCall(0).throws(new Error('not ready'))
        .onCall(1).throws(new Error('not ready'))
        .onCall(2).returns(undefined);
      const promise = registerReminderRule('swan-RF-1-reminder', {});
      await clock.tickAsync(2 * 500);
      expect(await promise).to.equal(true);
      expect(uncInstance._uncContainer.handleMessageFromInterface.callCount).to.equal(3);
    });

    it('deleteReminderRule also retries a transient call failure', async () => {
      const clock = sinon.useFakeTimers();
      uncInstance._uncContainer.handleMessageFromInterface
        .onCall(0).throws(new Error('not ready'))
        .onCall(1).returns(undefined);
      const promise = deleteReminderRule('swan-RF-1-reminder');
      await clock.tickAsync(500);
      expect(await promise).to.equal(true);
      expect(uncInstance._uncContainer.handleMessageFromInterface.callCount).to.equal(2);
    });
  });

  describe('resolution against an instance exposing the reminder methods directly', () => {
    let directInstance;

    beforeEach(() => {
      directInstance = makeDirectMethodInstance();
      stubUniversalNav(async (name) => (name === 'notifications' ? { instance: directInstance } : undefined));
    });

    it('registerReminderRule calls UpsertReminderFeatureFlag directly, never touching _uncContainer', async () => {
      const campaignRule = { events: [] };
      const result = await registerReminderRule('swan-RF-1-reminder', campaignRule);
      expect(result).to.equal(true);
      expect(directInstance.UpsertReminderFeatureFlag.calledOnceWith(
        { type: 'rule', action: 'upsert', campaignRules: [{ campaignId: 'swan-RF-1-reminder', campaignRule }] },
      )).to.equal(true);
      expect(directInstance._uncContainer).to.equal(undefined);
    });

    it('deleteReminderRule calls DeleteReminderFeatureFlag directly', async () => {
      const result = await deleteReminderRule('swan-RF-1-reminder');
      expect(result).to.equal(true);
      expect(directInstance.DeleteReminderFeatureFlag.calledOnceWith(
        { type: 'rule', action: 'delete', campaignRules: [{ campaignId: 'swan-RF-1-reminder' }] },
      )).to.equal(true);
    });

    it('prefers the direct method over a working _uncContainer when both are present', async () => {
      directInstance._uncContainer = { handleMessageFromInterface: sinon.stub() };
      const result = await registerReminderRule('swan-RF-1-reminder', { events: [] });
      expect(result).to.equal(true);
      expect(directInstance.UpsertReminderFeatureFlag.called).to.equal(true);
      expect(directInstance._uncContainer.handleMessageFromInterface.called).to.equal(false);
    });
  });
});
