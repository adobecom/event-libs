import { expect } from '@esm-bundle/chai';
import {
  calculateSessionTimes, buildNotificationEntry, STAGE_COPY,
} from '../../../../event-libs/v1/features/swan-notifications/swan-payload.js';
import { MAX_EVENT_PAGES } from '../../../../event-libs/v1/utils/constances.js';

describe('swan-payload', () => {
  const session = {
    id: 'RF-1',
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
      // Falls back to swanConfig's default when the session has no thumbnail of its own.
      expect(entry.iconUrl).to.equal(swanConfig.defaultNotificationIconUrl);
    });

    it('prefers the session catalog\'s own thumbnailUrl over swanConfig\'s per-event default', () => {
      const entry = buildNotificationEntry(
        { ...session, thumbnailUrl: 'https://example.com/session-thumb.png' },
        'reminder',
        swanConfig,
      );
      expect(entry.iconUrl).to.equal('https://example.com/session-thumb.png');
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

    it('links a reminder for a non-livestreamed session to its own page', () => {
      const entry = buildNotificationEntry(session, 'reminder', swanConfig);
      expect(entry.actionUrl).to.equal(new URL(session.sessionPageUrl, window.location.origin).toString());
    });

    it('sends a reminder for a livestreamed-on-homepage session to the homepage already, not its own page', () => {
      const entry = buildNotificationEntry({ ...session, isLivestreamed: true }, 'reminder', swanConfig);
      expect(entry.actionUrl).to.equal(new URL(MAX_EVENT_PAGES.homepage, window.location.origin).toString());
    });

    it('still links an on-demand session to its own page', () => {
      const entry = buildNotificationEntry(session, 'on-demand', swanConfig);
      expect(entry.actionUrl).to.equal(new URL(session.sessionPageUrl, window.location.origin).toString());
    });

    it('sends a live livestreamed session to the homepage instead of its own page', () => {
      const entry = buildNotificationEntry({ ...session, isLivestreamed: true }, 'live', swanConfig);
      expect(entry.actionUrl).to.equal(new URL(MAX_EVENT_PAGES.homepage, window.location.origin).toString());
    });

    it('sends a live online-only session to the broadcast page, carrying ?watch=<id>', () => {
      const entry = buildNotificationEntry({ ...session, isOnline: true }, 'live', swanConfig);
      const expected = new URL(`${MAX_EVENT_PAGES.broadcast}?watch=${session.id}`, window.location.origin).toString();
      expect(entry.actionUrl).to.equal(expected);
    });

    it('prefers the homepage over the broadcast page when a session is both livestreamed and online', () => {
      const entry = buildNotificationEntry({ ...session, isLivestreamed: true, isOnline: true }, 'live', swanConfig);
      expect(entry.actionUrl).to.equal(new URL(MAX_EVENT_PAGES.homepage, window.location.origin).toString());
    });

    it('sends a live online-only session with no id to the bare broadcast page, no ?watch=', () => {
      const entry = buildNotificationEntry({ ...session, id: '', isOnline: true }, 'live', swanConfig);
      expect(entry.actionUrl).to.equal(new URL(MAX_EVENT_PAGES.broadcast, window.location.origin).toString());
    });

    it('falls back to the session\'s own page for a live session that is neither livestreamed nor online', () => {
      const entry = buildNotificationEntry(session, 'live', swanConfig);
      expect(entry.actionUrl).to.equal(new URL(session.sessionPageUrl, window.location.origin).toString());
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
