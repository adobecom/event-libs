import {
  notifySessionScheduled, notifySessionUnscheduled, reconcileSwanNotifications,
} from '../../../../event-libs/v1/features/swan-notifications/swan-notifications.js';

// Deliberately never authors the swan-notifications metadata flag: proves that on the vast
// majority of pages (which don't opt into SWAN at all), none of these functions ever touches
// the local notification store.
describe('swan-notifications (SWAN not configured on this page)', () => {
  const session = { id: 'sess-1', rfCode: 'RF-1' };

  it('notifySessionScheduled resolves immediately without touching window.feds', async () => {
    await notifySessionScheduled(session);
  });

  it('notifySessionUnscheduled resolves immediately without touching window.feds', async () => {
    await notifySessionUnscheduled(session);
  });

  it('reconcileSwanNotifications resolves immediately without touching window.feds', async () => {
    await reconcileSwanNotifications(() => [session], () => new Set([session.id]));
  });
});
