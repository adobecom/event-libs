import { expect } from '@esm-bundle/chai';
import {
  notifySessionScheduled, notifySessionUnscheduled, reconcileSwanNotifications,
} from '../../../../event-libs/v1/features/swan-notifications/swan-notifications.js';

// Separate file, deliberately never authors swan-notification-config metadata: proves
// that on the vast majority of pages (which don't opt into SWAN at all), none of these
// functions ever makes a network call, regardless of what's passed in.
describe('swan-notifications (SWAN not configured on this page)', () => {
  let originalFetch;
  let fetchCallCount;

  beforeEach(() => {
    originalFetch = window.fetch;
    fetchCallCount = 0;
    window.fetch = async () => {
      fetchCallCount += 1;
      return { ok: true, status: 200, json: async () => ({}) };
    };
  });

  afterEach(() => {
    window.fetch = originalFetch;
  });

  const session = { id: 'sess-1', rfCode: 'RF-1' };

  it('notifySessionScheduled makes no network calls', async () => {
    await notifySessionScheduled(session);
    expect(fetchCallCount).to.equal(0);
  });

  it('notifySessionUnscheduled makes no network calls', async () => {
    await notifySessionUnscheduled(session);
    expect(fetchCallCount).to.equal(0);
  });

  it('reconcileSwanNotifications makes no network calls', async () => {
    await reconcileSwanNotifications(() => [session], () => new Set([session.id]));
    expect(fetchCallCount).to.equal(0);
  });
});
