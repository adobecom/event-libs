import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import {
  whenUncReady, registerReminderRule, deleteReminderRule, fireHostEvent,
} from '../../../../event-libs/v1/features/swan-notifications/unc-client.js';
import { buildStageCampaignRule } from '../../../../event-libs/v1/features/swan-notifications/swan-payload.js';

function makeUncInstance() {
  return {
    _uncContainer: {
      handleMessageFromInterface: sinon.stub(),
    },
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

  describe('registerReminderRule / deleteReminderRule / fireHostEvent', () => {
    let uncInstance;

    beforeEach(() => {
      uncInstance = makeUncInstance();
      stubUniversalNav(async (name) => (name === 'notifications' ? { instance: uncInstance } : undefined));
    });

    it('registerReminderRule wraps into the real {campaignRules:[{campaignID, campaignRule}]} shape', async () => {
      const campaignRule = { events: [] };
      const result = await registerReminderRule('swan-RF-1-reminder', campaignRule);
      expect(result).to.equal(true);
      expect(uncInstance._uncContainer.handleMessageFromInterface.calledOnceWith(
        'UpsertReminderFeatureFlag',
        { campaignRules: [{ campaignID: 'swan-RF-1-reminder', campaignRule }] },
      )).to.equal(true);
    });

    it('deleteReminderRule sends only {campaignID}, no rule body', async () => {
      const result = await deleteReminderRule('swan-RF-1-reminder');
      expect(result).to.equal(true);
      expect(uncInstance._uncContainer.handleMessageFromInterface.calledOnceWith(
        'DeleteReminderFeatureFlag',
        { campaignRules: [{ campaignID: 'swan-RF-1-reminder' }] },
      )).to.equal(true);
    });

    it('fireHostEvent forwards the event object as-is to AnalyticsEventFromHost', async () => {
      const eventData = { swan_campaign_id: 'swan-RF-1-reminder' };
      const result = await fireHostEvent(eventData);
      expect(result).to.equal(true);
      expect(uncInstance._uncContainer.handleMessageFromInterface.calledOnceWith(
        'AnalyticsEventFromHost',
        eventData,
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
      const swanConfig = { eventName: 'MAX', scheduleTimeBufferSeconds: 3600 };
      const { campaignId, campaignRule } = buildStageCampaignRule(session, 'reminder', swanConfig, {});

      const result = await registerReminderRule(campaignId, campaignRule);
      expect(result).to.equal(true);
      expect(uncInstance._uncContainer.handleMessageFromInterface.calledOnceWith(
        'UpsertReminderFeatureFlag',
        { campaignRules: [{ campaignID: campaignId, campaignRule }] },
      )).to.equal(true);
    });

    it('all three resolve false without throwing when no UNC instance is available', async () => {
      delete window.UniversalNav;
      const clock = sinon.useFakeTimers();
      const results = Promise.all([
        registerReminderRule('x', {}),
        deleteReminderRule('x'),
        fireHostEvent({}),
      ]);
      await clock.tickAsync(8000);
      expect(await results).to.deep.equal([false, false, false]);
    });

    it('resolves false without throwing when the underlying engine call itself throws', async () => {
      uncInstance._uncContainer.handleMessageFromInterface.throws(new Error('engine exploded'));
      const result = await registerReminderRule('swan-RF-1-reminder', {});
      expect(result).to.equal(false);
    });
  });
});
