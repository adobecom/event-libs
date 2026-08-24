import { expect } from '@esm-bundle/chai';
import {
  calculateSessionTimes, buildNotificationPayload,
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

  describe('buildNotificationPayload', () => {
    const timingProperties = calculateSessionTimes(session, 5);
    const swanConfig = {
      eventName: 'MAX 2026',
      defaultNotificationIconUrl: 'https://example.com/icon.png',
      defaultNotificationImageUrl: 'https://example.com/image.png',
    };

    it('resolves the relative sessionPageUrl to an absolute URL for both target and on-demand', () => {
      const payload = buildNotificationPayload(session, timingProperties, swanConfig);
      const expectedUrl = new URL(session.sessionPageUrl, window.location.origin).toString();
      expect(payload.targetUrl).to.equal(expectedUrl);
      expect(payload.onDemandUrl).to.equal(expectedUrl);
    });

    it('converts goLiveTime/goLiveExpireTime to seconds, not ms', () => {
      const payload = buildNotificationPayload(session, timingProperties, swanConfig);
      expect(payload.goLiveTime).to.equal(timingProperties.triggerLiveBadgeTime / 1000);
      expect(payload.goLiveExpireTime).to.equal(timingProperties.triggerOnDemandBadgeTime / 1000);
    });

    it('carries the configured icon/image URLs through unchanged', () => {
      const payload = buildNotificationPayload(session, timingProperties, swanConfig);
      expect(payload.serviceIcon).to.deep.equal({ iconUrl: swanConfig.defaultNotificationIconUrl });
      expect(payload.image).to.deep.equal({ imageUrl: swanConfig.defaultNotificationImageUrl });
    });

    it('uses the session title for content/message, falling back to a generic title otherwise', () => {
      const payload = buildNotificationPayload(session, timingProperties, swanConfig);
      expect(payload.title).to.equal('Adobe MAX 2026 Session');
      expect(payload.content).to.equal('My Session');
      expect(payload.message).to.equal('My Session');
      expect(payload.OSTitle).to.equal('Adobe MAX 2026 Session');
      expect(payload.OSMessage).to.equal('My Session');

      const untitled = buildNotificationPayload({ ...session, title: '' }, timingProperties, swanConfig);
      expect(untitled.content).to.equal('Adobe MAX 2026 Session');
    });
  });
});
