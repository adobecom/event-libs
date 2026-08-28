import { expect } from '@esm-bundle/chai';
import {
  calculateSessionTimes, buildCampaignId, buildStageCampaignRule,
} from '../../../../event-libs/v1/features/swan-notifications/swan-payload.js';

describe('swan-payload', () => {
  const session = {
    rfCode: 'RF-1',
    title: 'My Session',
    sessionPageUrl: '/sessions/my-session',
    startTimeUtc: '2026-10-28T16:00:00.000Z',
    endTimeUtc: '2026-10-28T17:00:00.000Z',
  };

  describe('calculateSessionTimes', () => {
    it('derives notification/live/on-demand trigger times from start/end and the offset', () => {
      const times = calculateSessionTimes(session, 5);
      const startMs = Date.parse(session.startTimeUtc);
      const endMs = Date.parse(session.endTimeUtc);
      expect(times.triggerLiveBadgeTime).to.equal(startMs);
      expect(times.triggerOnDemandBadgeTime).to.equal(endMs);
      expect(times.triggerNotificationTime).to.equal(startMs - 5 * 60 * 1000);
    });

    it('coerces a string offset (as authored metadata may provide)', () => {
      const times = calculateSessionTimes(session, '5');
      expect(times.triggerNotificationTime).to.equal(Date.parse(session.startTimeUtc) - 5 * 60 * 1000);
    });

    it('falls back to a 5-minute offset when none is authored, instead of producing NaN', () => {
      const times = calculateSessionTimes(session, undefined);
      expect(times.triggerNotificationTime).to.equal(Date.parse(session.startTimeUtc) - 5 * 60 * 1000);
    });

    it('falls back to 5 minutes for a non-numeric offset too', () => {
      const times = calculateSessionTimes(session, 'not-a-number');
      expect(times.triggerNotificationTime).to.equal(Date.parse(session.startTimeUtc) - 5 * 60 * 1000);
    });
  });

  describe('buildCampaignId', () => {
    it('is deterministic per (rfCode, stage), and distinct per stage', () => {
      expect(buildCampaignId('RF-1', 'reminder')).to.equal('swan-RF-1-reminder');
      expect(buildCampaignId('RF-1', 'reminder')).to.equal(buildCampaignId('RF-1', 'reminder'));
      expect(buildCampaignId('RF-1', 'live')).to.not.equal(buildCampaignId('RF-1', 'reminder'));
    });
  });

  describe('buildStageCampaignRule', () => {
    const swanConfig = {
      eventName: 'MAX 2026',
      defaultNotificationIconUrl: 'https://example.com/icon.png',
      defaultNotificationImageUrl: 'https://example.com/image.png',
      scheduleTimeBufferSeconds: 3600,
    };

    it('is a single-stage rule that fires on its own first match, not a chained journey', () => {
      const { campaignRule } = buildStageCampaignRule(session, 'reminder', swanConfig);
      const [event] = campaignRule.events;
      expect(campaignRule.events).to.have.lengthOf(1);
      expect(event.stage).to.equal(1);
      expect(event.wait_for_next_event).to.equal(0);
    });

    it('returns a campaignId matching buildCampaignId, and a hostEvent that matches the rule\'s own event_data', () => {
      const { campaignId, campaignRule, hostEvent } = buildStageCampaignRule(session, 'live', swanConfig);
      expect(campaignId).to.equal(buildCampaignId('RF-1', 'live'));
      const [event] = campaignRule.events;
      expect(event.event_details[0].event_data).to.deep.equal({ swan_campaign_id: campaignId });
      expect(hostEvent).to.deep.equal({ swan_campaign_id: campaignId });
    });

    it('is network-free: local is always true, and contentURL/tracking-server mechanism are never set', () => {
      const { campaignRule } = buildStageCampaignRule(session, 'reminder', swanConfig);
      const { channel_details: channelDetails } = campaignRule.events[0].notification_channels[0];
      expect(channelDetails.local).to.equal(true);
      expect(channelDetails.contentURL).to.equal(undefined);
      expect(campaignRule.session_tracking_mechanism).to.equal(undefined);
    });

    it('sets schedule_at (epoch seconds) when a future trigger time is given, not schedule_after', () => {
      const scheduleAtSeconds = 1735689300;
      const { campaignRule } = buildStageCampaignRule(session, 'reminder', swanConfig, { scheduleAtSeconds });
      const { channel_details: channelDetails } = campaignRule.events[0].notification_channels[0];
      expect(channelDetails.schedule_at).to.equal(scheduleAtSeconds);
      expect(channelDetails.schedule_after).to.equal(undefined);
    });

    it('sets schedule_after: 0 (fire immediately) when no scheduleAtSeconds is given', () => {
      const { campaignRule } = buildStageCampaignRule(session, 'live', swanConfig);
      const { channel_details: channelDetails } = campaignRule.events[0].notification_channels[0];
      expect(channelDetails.schedule_after).to.equal(0);
      expect(channelDetails.schedule_at).to.equal(undefined);
    });

    it('carries the configured schedule_time_buffer through unchanged', () => {
      const { campaignRule } = buildStageCampaignRule(session, 'reminder', swanConfig);
      const { channel_details: channelDetails } = campaignRule.events[0].notification_channels[0];
      expect(channelDetails.schedule_time_buffer).to.equal(3600);
    });

    it('encodes stage-appropriate display content as a JSON string payload, not a field-pulling array', () => {
      const { campaignRule } = buildStageCampaignRule(session, 'reminder', swanConfig);
      const { channel_details: channelDetails } = campaignRule.events[0].notification_channels[0];
      expect(channelDetails.notification_subtype).to.equal('reminder');
      const content = JSON.parse(channelDetails.payload);
      expect(content.title).to.equal('Adobe MAX 2026 Session');
      expect(content.message).to.equal('My Session');
      expect(content.url).to.equal(new URL(session.sessionPageUrl, window.location.origin).toString());
      expect(content.icon).to.equal(swanConfig.defaultNotificationIconUrl);
      expect(content.image).to.equal(swanConfig.defaultNotificationImageUrl);

      const untitled = buildStageCampaignRule({ ...session, title: '' }, 'reminder', swanConfig);
      const untitledContent = JSON.parse(untitled.campaignRule.events[0].notification_channels[0].channel_details.payload);
      expect(untitledContent.message).to.equal('Adobe MAX 2026 Session');
    });
  });
});
