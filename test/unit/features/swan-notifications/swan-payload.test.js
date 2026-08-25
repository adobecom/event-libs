import { expect } from '@esm-bundle/chai';
import {
  calculateSessionTimes, buildLocalNotificationEntry, buildLocalNotificationId, SWAN_ENTRY_SOURCE,
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

  describe('buildLocalNotificationId', () => {
    it('is deterministic from rfCode alone', () => {
      expect(buildLocalNotificationId('RF-1')).to.equal('swan-RF-1');
      expect(buildLocalNotificationId('RF-1')).to.equal(buildLocalNotificationId('RF-1'));
    });
  });

  describe('buildLocalNotificationEntry', () => {
    const swanConfig = {
      eventName: 'MAX 2026',
      defaultNotificationIconUrl: 'https://example.com/icon.png',
      defaultNotificationImageUrl: 'https://example.com/image.png',
    };

    it('ids and tags the entry so a diff pass can find/own it', () => {
      const entry = buildLocalNotificationEntry(session, 'reminder', swanConfig);
      expect(entry.id).to.equal('swan-RF-1');
      expect(entry.source).to.equal(SWAN_ENTRY_SOURCE);
      expect(entry.stage).to.equal('reminder');
    });

    it('resolves the relative sessionPageUrl to an absolute URL', () => {
      const entry = buildLocalNotificationEntry(session, 'live', swanConfig);
      expect(entry.url).to.equal(new URL(session.sessionPageUrl, window.location.origin).toString());
    });

    it('carries the configured icon/image URLs through unchanged', () => {
      const entry = buildLocalNotificationEntry(session, 'reminder', swanConfig);
      expect(entry.icon).to.equal(swanConfig.defaultNotificationIconUrl);
      expect(entry.image).to.equal(swanConfig.defaultNotificationImageUrl);
    });

    it('uses the session title for message, falling back to a generic title otherwise', () => {
      const entry = buildLocalNotificationEntry(session, 'reminder', swanConfig);
      expect(entry.title).to.equal('Adobe MAX 2026 Session');
      expect(entry.message).to.equal('My Session');

      const untitled = buildLocalNotificationEntry({ ...session, title: '' }, 'reminder', swanConfig);
      expect(untitled.message).to.equal('Adobe MAX 2026 Session');
    });
  });
});
