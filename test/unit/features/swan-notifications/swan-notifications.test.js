import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import {
  notifySessionScheduled, notifySessionUnscheduled, reconcileSwanNotifications,
} from '../../../../event-libs/v1/features/swan-notifications/swan-notifications.js';
import { buildCampaignId } from '../../../../event-libs/v1/features/swan-notifications/swan-payload.js';

const LOCAL_STATE_KEY = 'swan-notification-state-v2';

// now + offsetMs, as an ISO string — startOffsetMs/endOffsetMs are negative for "in the past".
function iso(offsetMs) {
  return new Date(Date.now() + offsetMs).toISOString();
}

function makeSession(rfCode, { startOffsetMs, endOffsetMs }) {
  return {
    id: `session-${rfCode}`,
    rfCode,
    title: `Session ${rfCode}`,
    sessionPageUrl: `/sessions/${rfCode}`,
    startTimeUtc: iso(startOffsetMs),
    endTimeUtc: iso(endOffsetMs),
  };
}

const MIN = 60 * 1000;

function makeUniversalNav(uncInstance) {
  return { getComponent: async (name) => (name === 'notifications' ? { instance: uncInstance } : undefined) };
}

describe('swan-notifications', () => {
  let originalUniversalNav;
  let calls;

  beforeEach(() => {
    const meta = document.createElement('meta');
    meta.name = 'swan-notifications';
    meta.content = 'true';
    document.head.appendChild(meta);

    originalUniversalNav = window.UniversalNav;
    calls = [];
    const uncInstance = {
      _uncContainer: {
        handleMessageFromInterface: (methodName, data) => {
          if (methodName === 'UpsertReminderFeatureFlag') {
            calls.push({
              method: 'UpsertReminderFeatureFlag',
              campaignID: data.campaignRules[0].campaignID,
              campaignRule: data.campaignRules[0].campaignRule,
            });
          } else if (methodName === 'DeleteReminderFeatureFlag') {
            calls.push({ method: 'DeleteReminderFeatureFlag', campaignID: data.campaignRules[0].campaignID });
          } else if (methodName === 'AnalyticsEventFromHost') {
            calls.push({ method: 'AnalyticsEventFromHost', eventData: data });
          }
        },
      },
    };
    window.UniversalNav = makeUniversalNav(uncInstance);
    window.localStorage.removeItem(LOCAL_STATE_KEY);
  });

  afterEach(() => {
    window.UniversalNav = originalUniversalNav;
    window.localStorage.removeItem(LOCAL_STATE_KEY);
    document.head.querySelector('meta[name="swan-notifications"]')?.remove();
    sinon.restore();
  });

  describe('notifySessionScheduled / notifySessionUnscheduled', () => {
    it('registers a reminder rule with schedule_at when the trigger time is still in the future', async () => {
      const session = makeSession('RF-100', { startOffsetMs: 60 * MIN, endOffsetMs: 120 * MIN });
      await notifySessionScheduled(session);

      const upsert = calls.find((c) => c.method === 'UpsertReminderFeatureFlag');
      expect(upsert.campaignID).to.equal(buildCampaignId('RF-100', 'reminder'));
      const channelDetails = upsert.campaignRule.events[0].notification_channels[0].channel_details;
      expect(channelDetails.schedule_at).to.be.a('number');

      const fire = calls.find((c) => c.method === 'AnalyticsEventFromHost');
      expect(fire.eventData).to.deep.equal({ swan_campaign_id: upsert.campaignID });

      expect(calls.some((c) => c.method === 'DeleteReminderFeatureFlag')).to.equal(false);
    });

    it('registers the reminder rule with schedule_after: 0 once its trigger time has already passed', async () => {
      const session = makeSession('RF-101', { startOffsetMs: 2 * MIN, endOffsetMs: 62 * MIN });
      await notifySessionScheduled(session);
      const upsert = calls.find((c) => c.method === 'UpsertReminderFeatureFlag');
      const channelDetails = upsert.campaignRule.events[0].notification_channels[0].channel_details;
      expect(channelDetails.schedule_after).to.equal(0);
      expect(channelDetails.schedule_at).to.equal(undefined);
    });

    it('registers the live stage directly (skipping reminder) for a session already underway when scheduled', async () => {
      const session = makeSession('RF-102', { startOffsetMs: -MIN, endOffsetMs: 30 * MIN });
      await notifySessionScheduled(session);
      const upsert = calls.find((c) => c.method === 'UpsertReminderFeatureFlag');
      expect(upsert.campaignID).to.equal(buildCampaignId('RF-102', 'live'));
    });

    it('deletes whatever stage is currently active on unschedule', async () => {
      const session = makeSession('RF-103', { startOffsetMs: -MIN, endOffsetMs: 30 * MIN });
      await notifySessionScheduled(session);
      calls = [];

      await notifySessionUnscheduled(session);
      const del = calls.find((c) => c.method === 'DeleteReminderFeatureFlag');
      expect(del.campaignID).to.equal(buildCampaignId('RF-103', 'live'));
    });

    it('no-ops on unschedule when there is no known active stage for the session', async () => {
      await notifySessionUnscheduled(makeSession('RF-never-scheduled', { startOffsetMs: MIN, endOffsetMs: 2 * MIN }));
      expect(calls).to.have.lengthOf(0);
    });

    it('no-ops when the session has no rfCode', async () => {
      await notifySessionScheduled({ id: 'no-rfcode' });
      await notifySessionUnscheduled({ id: 'no-rfcode' });
      expect(calls).to.have.lengthOf(0);
    });

    it('skips a session with malformed start/end timestamps rather than misclassifying its stage', async () => {
      const badSession = {
        id: 'session-bad', rfCode: 'RF-bad', startTimeUtc: 'not-a-date', endTimeUtc: 'also-not-a-date',
      };
      await notifySessionScheduled(badSession);
      expect(calls).to.have.lengthOf(0);
      const state = JSON.parse(window.localStorage.getItem(LOCAL_STATE_KEY) || '{}');
      expect(state['RF-bad']).to.equal(undefined);
    });

    it('is a no-op entirely when SWAN is not enabled on the page', async () => {
      document.head.querySelector('meta[name="swan-notifications"]')?.remove();
      const session = makeSession('RF-disabled', { startOffsetMs: -MIN, endOffsetMs: 30 * MIN });
      await notifySessionScheduled(session);
      expect(calls).to.have.lengthOf(0);
    });

    it('does not persist state for a failed transition, so it can be retried once UNC becomes available', async () => {
      // No UNC instance available on this page load — registerReminderRule/fireHostEvent
      // both resolve false (via whenUncReady()'s own polling timeout) rather than throw.
      delete window.UniversalNav;
      const session = makeSession('RF-retry', { startOffsetMs: -MIN, endOffsetMs: 30 * MIN });
      // Anchored to the real current time — whenUncReady()'s deadline check uses Date.now(),
      // so faking Date without an explicit `now` could start the fake clock at a different
      // epoch than the session's own timestamps (computed above, before this installs).
      const clock = sinon.useFakeTimers({ now: Date.now(), toFake: ['setTimeout', 'clearTimeout', 'Date'] });

      const scheduledPromise = notifySessionScheduled(session);
      await clock.tickAsync(8000); // let whenUncReady()'s default timeout elapse
      await scheduledPromise;
      clock.restore();

      // Must NOT be recorded as applied — the forward-only stage guard would otherwise
      // permanently skip retrying this session, since it'd look like "already done."
      let state = JSON.parse(window.localStorage.getItem(LOCAL_STATE_KEY) || '{}');
      expect(state['RF-retry']).to.equal(undefined);

      // Once UNC is available, the very next reconcile should succeed.
      window.UniversalNav = makeUniversalNav({
        _uncContainer: {
          handleMessageFromInterface: (methodName, data) => {
            if (methodName === 'UpsertReminderFeatureFlag') {
              calls.push({ method: 'UpsertReminderFeatureFlag', campaignID: data.campaignRules[0].campaignID });
            } else if (methodName === 'AnalyticsEventFromHost') {
              calls.push({ method: 'AnalyticsEventFromHost', eventData: data });
            }
            // DeleteReminderFeatureFlag intentionally left a no-op here, matching the original mock.
          },
        },
      });
      calls = [];
      await reconcileSwanNotifications(() => [session], () => new Set([session.id]));

      state = JSON.parse(window.localStorage.getItem(LOCAL_STATE_KEY) || '{}');
      expect(state['RF-retry']?.stage).to.equal('live');
      expect(calls.some((c) => c.method === 'UpsertReminderFeatureFlag')).to.equal(true);
    });
  });

  describe('reconcileSwanNotifications', () => {
    it('advances a session from reminder to live in the correct order: register new, fire, then delete the previous stage', async () => {
      const reminderSession = makeSession('RF-progress', { startOffsetMs: 60 * MIN, endOffsetMs: 120 * MIN });
      await notifySessionScheduled(reminderSession);
      calls = [];

      const liveSession = makeSession('RF-progress', { startOffsetMs: -MIN, endOffsetMs: 30 * MIN });
      await reconcileSwanNotifications(() => [liveSession], () => new Set([liveSession.id]));

      expect(calls.map((c) => c.method)).to.deep.equal([
        'UpsertReminderFeatureFlag', 'AnalyticsEventFromHost', 'DeleteReminderFeatureFlag',
      ]);
      expect(calls[0].campaignID).to.equal(buildCampaignId('RF-progress', 'live'));
      expect(calls[2].campaignID).to.equal(buildCampaignId('RF-progress', 'reminder'));
    });

    it('never re-applies a stage already reached, even across repeated reconcile calls at the same time', async () => {
      const session = makeSession('RF-stable', { startOffsetMs: -MIN, endOffsetMs: 30 * MIN });
      await notifySessionScheduled(session);
      calls = [];

      await reconcileSwanNotifications(() => [session], () => new Set([session.id]));
      await reconcileSwanNotifications(() => [session], () => new Set([session.id]));
      expect(calls).to.have.lengthOf(0);
    });

    it('deletes the active stage and drops local state for a session no longer scheduled', async () => {
      const session = makeSession('RF-orphan', { startOffsetMs: -MIN, endOffsetMs: 30 * MIN });
      await notifySessionScheduled(session);
      calls = [];

      await reconcileSwanNotifications(() => [], () => new Set());
      const del = calls.find((c) => c.method === 'DeleteReminderFeatureFlag');
      expect(del.campaignID).to.equal(buildCampaignId('RF-orphan', 'live'));

      const state = JSON.parse(window.localStorage.getItem(LOCAL_STATE_KEY) || '{}');
      expect(state).to.deep.equal({});
    });

    it('skips a scheduled id absent from the session catalog instead of throwing', async () => {
      let threw = false;
      try {
        await reconcileSwanNotifications(() => [], () => new Set(['missing-session-id']));
      } catch {
        threw = true;
      }
      expect(threw).to.equal(false);
    });

    it('ignores an overlapping reconcile call while one is still in flight, rather than racing its localStorage write', async () => {
      const session = makeSession('RF-overlap', { startOffsetMs: -MIN, endOffsetMs: 30 * MIN });
      // Neither call is awaited before the other starts — reconcileSwanNotifications sets
      // its in-flight guard synchronously, before its first await, so the second call is
      // guaranteed to see it already set regardless of how slow UNC itself is.
      const firstPass = reconcileSwanNotifications(() => [session], () => new Set([session.id]));
      const secondPass = reconcileSwanNotifications(() => [session], () => new Set([session.id]));
      await Promise.all([firstPass, secondPass]);

      const upserts = calls.filter((c) => c.method === 'UpsertReminderFeatureFlag');
      expect(upserts).to.have.lengthOf(1);
    });

    it('advances a session all the way through reminder -> live -> on-demand, one active campaign at a time', async () => {
      const rfCode = 'RF-full-lifecycle';
      const reminderSession = makeSession(rfCode, { startOffsetMs: 60 * MIN, endOffsetMs: 120 * MIN });
      await notifySessionScheduled(reminderSession);

      const liveSession = makeSession(rfCode, { startOffsetMs: -MIN, endOffsetMs: 30 * MIN });
      await reconcileSwanNotifications(() => [liveSession], () => new Set([liveSession.id]));

      const onDemandSession = makeSession(rfCode, { startOffsetMs: -30 * MIN, endOffsetMs: -MIN });
      await reconcileSwanNotifications(() => [onDemandSession], () => new Set([onDemandSession.id]));

      const state = JSON.parse(window.localStorage.getItem(LOCAL_STATE_KEY) || '{}');
      expect(state[rfCode].stage).to.equal('on-demand');
      expect(state[rfCode].campaignId).to.equal(buildCampaignId(rfCode, 'on-demand'));

      // Exactly one delete per completed transition (reminder->live, live->on-demand) — never
      // more than one stage's campaign registered/active at a time.
      const deletes = calls.filter((c) => c.method === 'DeleteReminderFeatureFlag').map((c) => c.campaignID);
      expect(deletes).to.deep.equal([
        buildCampaignId(rfCode, 'reminder'),
        buildCampaignId(rfCode, 'live'),
      ]);
    });
  });
});
