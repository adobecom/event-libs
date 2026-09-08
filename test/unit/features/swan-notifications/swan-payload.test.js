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
      localNotificationPersistTillDays: 3,
    };

    it('is a single-stage rule that fires on its own first match, not a chained journey', () => {
      const { campaignRule } = buildStageCampaignRule(session, 'reminder', swanConfig);
      const [event] = campaignRule.events;
      expect(campaignRule.events).to.have.lengthOf(1);
      expect(event.stage).to.equal(1);
      expect(event.wait_for_next_event).to.equal(0);
    });

    it('returns a campaignId matching buildCampaignId, and event_data that matches it', () => {
      const { campaignId, campaignRule } = buildStageCampaignRule(session, 'live', swanConfig);
      expect(campaignId).to.equal(buildCampaignId('RF-1', 'live'));
      const [event] = campaignRule.events;
      expect(event.event_details[0].event_data).to.deep.equal({ campaignId });
    });

    it('always sets session_tracking_mechanism: local_storage, session_tracking, cooldown_timestamp, and generateNotification, regardless of stage/timing', () => {
      ['reminder', 'live', 'on-demand'].forEach((stage) => {
        const { campaignRule } = buildStageCampaignRule(session, stage, swanConfig);
        expect(campaignRule.session_tracking_mechanism).to.equal('local_storage');
        expect(campaignRule.session_tracking).to.equal(true);
        expect(campaignRule.cooldown_timestamp).to.equal(0);
        expect(campaignRule.generateNotification).to.equal(true);
      });
    });

    it('is network-free: local is always true, and contentURL is never set', () => {
      const { campaignRule } = buildStageCampaignRule(session, 'reminder', swanConfig);
      const { channel_details: channelDetails } = campaignRule.events[0].notification_channels[0];
      expect(channelDetails.local).to.equal(true);
      expect(channelDetails.contentURL).to.equal(undefined);
    });

    // schedule_at/schedule_after are epoch SECONDS — confirmed against UNC's real engine
    // source (ChannelHandler.ts, AddNotificationManager.jsx), despite the wiki stating ms.
    it('sets schedule_at (epoch seconds, per source — not the wiki\'s stated ms) when a future trigger time is given, not schedule_after', () => {
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

    it('carries local_notification_persist_till_days through from swanConfig', () => {
      const { campaignRule } = buildStageCampaignRule(session, 'reminder', swanConfig);
      const { channel_details: channelDetails } = campaignRule.events[0].notification_channels[0];
      expect(channelDetails.local_notification_persist_till_days).to.equal(3);
    });

    it('uses a fixed, platform-neutral notification_type/notification_subtype across all three stages, not the wiki\'s CCD-flavored example', () => {
      ['reminder', 'live', 'on-demand'].forEach((stage) => {
        const { campaignRule } = buildStageCampaignRule(session, stage, swanConfig);
        const { channel_details: channelDetails } = campaignRule.events[0].notification_channels[0];
        expect(channelDetails.notification_type).to.equal('com.adobe.reminder.v1');
        expect(channelDetails.notification_subtype).to.equal('swan-session-reminder');
      });
    });

    it('encodes an eventTimeline payload object (not stringified) with stage-appropriate content', () => {
      const { campaignRule } = buildStageCampaignRule(session, 'reminder', swanConfig);
      const { channel_details: channelDetails } = campaignRule.events[0].notification_channels[0];
      const { payload } = channelDetails;
      expect(payload).to.be.an('object');
      expect(payload.timeline.viewtype).to.equal('eventTimeline');
      expect(payload.timeline.content).to.equal('My Session starts soon');
      expect(payload.timeline.eventData.title).to.equal('My Session');
      expect(payload.timeline.eventData.goLiveTime).to.equal(String(Math.floor(Date.parse(session.startTimeUtc) / 1000)));
      expect(payload.timeline.eventData.goLiveExpireTime).to.equal(String(Math.floor(Date.parse(session.endTimeUtc) / 1000)));
      expect(payload.timeline.serviceIconDetails.serviceIcon).to.equal(swanConfig.defaultNotificationIconUrl);
      expect(payload.timeline.defaultAction.url).to.equal(new URL(session.sessionPageUrl, window.location.origin).toString());

      const untitled = buildStageCampaignRule({ ...session, title: '' }, 'reminder', swanConfig);
      const { payload: untitledPayload } = untitled.campaignRule.events[0].notification_channels[0].channel_details;
      expect(untitledPayload.timeline.eventData.title).to.equal('Adobe MAX 2026 Session');
    });

    it('varies timeline.content per stage', () => {
      const contentFor = (stage) => buildStageCampaignRule(session, stage, swanConfig)
        .campaignRule.events[0].notification_channels[0].channel_details.payload.timeline.content;
      const reminderContent = contentFor('reminder');
      const liveContent = contentFor('live');
      const onDemandContent = contentFor('on-demand');
      expect(reminderContent).to.not.equal(liveContent);
      expect(liveContent).to.not.equal(onDemandContent);
      expect(reminderContent).to.not.equal(onDemandContent);
    });

    it('omits AEM Content-Fragment bookkeeping fields and CCD-only defaultAction sub-fields', () => {
      const { campaignRule } = buildStageCampaignRule(session, 'reminder', swanConfig);
      const { timeline } = campaignRule.events[0].notification_channels[0].channel_details.payload;
      expect(timeline._path).to.equal(undefined);
      expect(timeline._metadata).to.equal(undefined);
      expect(timeline.pinnedCategory).to.equal(undefined);
      expect(timeline.defaultAction.deepLinkWorkflows).to.equal(undefined);
      expect(timeline.defaultAction.ccdRoutePath).to.equal(undefined);
    });
  });
});
