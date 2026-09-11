import { expect } from '@esm-bundle/chai';
import {
  calculateSessionTimes, buildNotificationEntry, STAGE_COPY,
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

  describe('buildNotificationEntry', () => {
    const swanConfig = {
      eventName: 'MAX 2026',
      defaultNotificationIconUrl: 'https://example.com/icon.png',
      localNotificationPersistTillDays: 3,
    };

    it('carries title, stage, times, actionUrl and iconUrl through', () => {
      const entry = buildNotificationEntry(session, 'reminder', swanConfig);
      expect(entry.title).to.equal('My Session');
      expect(entry.stage).to.equal('reminder');
      expect(entry.startTimeMs).to.equal(Date.parse(session.startTimeUtc));
      expect(entry.endTimeMs).to.equal(Date.parse(session.endTimeUtc));
      expect(entry.actionUrl).to.equal(new URL(session.sessionPageUrl, window.location.origin).toString());
      expect(entry.iconUrl).to.equal(swanConfig.defaultNotificationIconUrl);
    });

    it('falls back to a generic event-branded title when the session has none', () => {
      const entry = buildNotificationEntry({ ...session, title: '' }, 'reminder', swanConfig);
      expect(entry.title).to.equal('Adobe MAX 2026 Session');
    });

    it('always includes an event-branded category kicker, distinct from the title', () => {
      const entry = buildNotificationEntry(session, 'reminder', swanConfig);
      expect(entry.category).to.equal('Adobe MAX 2026 Session');
      expect(entry.title).to.equal('My Session');
    });

    it('falls back to a generic category when swanConfig has no eventName', () => {
      const entry = buildNotificationEntry(session, 'reminder', { ...swanConfig, eventName: '' });
      expect(entry.category).to.equal('Adobe Event Session');
    });

    it('falls back to the page origin when sessionPageUrl is absent', () => {
      const entry = buildNotificationEntry({ ...session, sessionPageUrl: '' }, 'reminder', swanConfig);
      expect(entry.actionUrl).to.equal(window.location.origin);
    });

    it('falls back to an empty iconUrl when swanConfig has none', () => {
      const entry = buildNotificationEntry(session, 'reminder', { ...swanConfig, defaultNotificationIconUrl: '' });
      expect(entry.iconUrl).to.equal('');
    });

    it('varies stage across reminder/live/on-demand', () => {
      const stages = ['reminder', 'live', 'on-demand'].map(
        (stage) => buildNotificationEntry(session, stage, swanConfig).stage,
      );
      expect(stages).to.deep.equal(['reminder', 'live', 'on-demand']);
    });
  });

  describe('STAGE_COPY', () => {
    it('has distinct copy for each of the three stages', () => {
      expect(STAGE_COPY.reminder).to.not.equal(STAGE_COPY.live);
      expect(STAGE_COPY.live).to.not.equal(STAGE_COPY['on-demand']);
      expect(STAGE_COPY.reminder).to.not.equal(STAGE_COPY['on-demand']);
    });
  });
});
