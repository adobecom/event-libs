import { expect } from '@esm-bundle/chai';
import { initSwanConfig } from '../../../../event-libs/v1/features/swan-notifications/swan-config.js';
import {
  notifySessionScheduled, notifySessionUnscheduled, reconcileSwanNotifications,
} from '../../../../event-libs/v1/features/swan-notifications/swan-notifications.js';
import { toast } from '../../../../event-libs/v1/features/toast/toast.js';

const CONFIG_SHEET_PATH = '/tools/da-apps/swan-notification-configurator/configs.json';
const CONFIG_ID = 'swan-notifications-test-config-id';

const CONFIG = {
  eventName: 'MAX 2026',
  adobeIoEndpoint: 'https://14257-eventsnotifmgr-dev.adobeioruntime.net/api/v1/web/virtual-events-notification-manager',
  ansEndpoint: 'https://notify-stage.adobe.io/ans/v1/notifications',
  notificationType: 'com.adobe.events.v1',
  notificationSubType: 'max26.scheduled.notifications',
  appId: 'adobecom',
  upcomingOffsetMinutes: 5,
};

function makeSession(rfCode, overrides = {}) {
  return {
    id: `session-${rfCode}`,
    rfCode,
    title: `Session ${rfCode}`,
    sessionPageUrl: `/sessions/${rfCode}`,
    startTimeUtc: '2026-10-28T16:00:00.000Z',
    endTimeUtc: '2026-10-28T17:00:00.000Z',
    ...overrides,
  };
}

describe('swan-notifications', () => {
  let originalFetch;
  let originalAdobeIMS;
  let calls;
  let nextNotificationId;

  before(async () => {
    const meta = document.createElement('meta');
    meta.name = 'swan-notification-config';
    meta.content = CONFIG_ID;
    document.head.appendChild(meta);

    const realFetch = window.fetch;
    window.fetch = async (url) => {
      if (url === CONFIG_SHEET_PATH) {
        return { ok: true, status: 200, json: async () => ({ data: [{ configId: CONFIG_ID, config: JSON.stringify(CONFIG) }] }) };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    };
    await initSwanConfig();
    window.fetch = realFetch;
  });

  beforeEach(() => {
    originalFetch = window.fetch;
    originalAdobeIMS = window.adobeIMS;
    window.adobeIMS = {
      getAccessToken: () => ({ token: 'ims-token' }),
      tokenService: { getTokenAndProfile: async () => ({ tokenFields: { user_id: 'user-1' } }) },
    };
    calls = [];
    nextNotificationId = 0;
    toast.value = null;
    window.fetch = async (url, options = {}) => {
      calls.push({ url, method: options.method || 'GET', body: options.body ? JSON.parse(options.body) : null });
      if (url === CONFIG.ansEndpoint && options.method === 'POST') {
        nextNotificationId += 1;
        return { ok: true, status: 200, json: async () => ({ notifications: { notification: [{ 'notification-id': `n-generated-${nextNotificationId}` }] } }) };
      }
      if (url === `${CONFIG.adobeIoEndpoint}/list`) {
        return { ok: true, status: 200, json: async () => [] };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    };
  });

  afterEach(() => {
    window.fetch = originalFetch;
    window.adobeIMS = originalAdobeIMS;
  });

  describe('notifySessionScheduled / notifySessionUnscheduled', () => {
    it('creates an ANS notification and stores a bookkeeping entry keyed on rfCode', async () => {
      const session = makeSession('RF-100');
      await notifySessionScheduled(session);

      const ansCreate = calls.find((c) => c.url === CONFIG.ansEndpoint && c.method === 'POST');
      expect(ansCreate).to.exist;
      expect(ansCreate.body.notifications.notification[0]['user-id']).to.deep.equal(['user-1']);

      const store = calls.find((c) => c.url === `${CONFIG.adobeIoEndpoint}/store`);
      expect(store).to.exist;
      expect(store.body).to.deep.equal({ id: 'n-generated-1', metadata: { sessionId: 'RF-100' } });
    });

    it('expires the matching ANS notification and deletes its bookkeeping entry on unschedule', async () => {
      const session = makeSession('RF-101');
      await notifySessionScheduled(session);
      calls = [];

      await notifySessionUnscheduled(session);

      const expire = calls.find((c) => c.url === CONFIG.ansEndpoint && c.method === 'PUT');
      expect(expire).to.exist;
      expect(expire.body.notifications.notification[0]).to.deep.equal({ 'notification-id': 'n-generated-1', state: 'EXPIRED' });

      const del = calls.find((c) => c.url === `${CONFIG.adobeIoEndpoint}/delete/n-generated-1`);
      expect(del).to.exist;
    });

    it('no-ops on unschedule when there is no known notification for the session', async () => {
      await notifySessionUnscheduled(makeSession('RF-never-scheduled'));
      expect(calls).to.have.lengthOf(0);
    });

    it('no-ops when the session has no rfCode, without making any network calls', async () => {
      await notifySessionScheduled({ id: 'no-rfcode' });
      await notifySessionUnscheduled({ id: 'no-rfcode' });
      expect(calls).to.have.lengthOf(0);
    });

    it('swallows a create failure, never throws back to the caller, and surfaces a toast', async () => {
      window.fetch = async () => ({ ok: false, status: 500, json: async () => ({}) });
      let threw = false;
      try {
        await notifySessionScheduled(makeSession('RF-fail'));
      } catch {
        threw = true;
      }
      expect(threw).to.equal(false);
      expect(toast.value?.variant).to.equal('informative');
      expect(toast.value?.message).to.include('could not be set up');
    });

    it('swallows an expire failure and never throws back to the caller', async () => {
      const session = makeSession('RF-expire-fail');
      await notifySessionScheduled(session);
      window.fetch = async () => ({ ok: false, status: 500, json: async () => ({}) });
      let threw = false;
      try {
        await notifySessionUnscheduled(session);
      } catch {
        threw = true;
      }
      expect(threw).to.equal(false);
    });

    it('dedupes a concurrent double-invocation for the same session into a single create', async () => {
      const session = makeSession('RF-double-click');
      await Promise.all([notifySessionScheduled(session), notifySessionScheduled(session)]);
      const creates = calls.filter((c) => c.url === CONFIG.ansEndpoint && c.method === 'POST');
      expect(creates).to.have.lengthOf(1);
    });
  });

  describe('reconcileSwanNotifications', () => {
    it('creates for scheduled sessions with no existing notification, expires orphaned notifications, leaves matched pairs alone', async () => {
      const keep = makeSession('RF-keep');
      const toCreate = makeSession('RF-create');
      const allSessions = [keep, toCreate];
      const scheduledIds = new Set([keep.id, toCreate.id]);

      window.fetch = async (url, options = {}) => {
        calls.push({ url, method: options.method || 'GET', body: options.body ? JSON.parse(options.body) : null });
        if (url === `${CONFIG.adobeIoEndpoint}/list`) {
          return {
            ok: true,
            status: 200,
            json: async () => [
              { id: 'n-keep', metadata: { sessionId: 'RF-keep' } },
              { id: 'n-orphan', metadata: { sessionId: 'RF-orphan' } },
            ],
          };
        }
        if (url === CONFIG.ansEndpoint && options.method === 'POST') {
          return { ok: true, status: 200, json: async () => ({ notifications: { notification: [{ 'notification-id': 'n-created' }] } }) };
        }
        return { ok: true, status: 200, json: async () => ({}) };
      };

      await reconcileSwanNotifications(() => allSessions, () => scheduledIds);

      const expireOrphan = calls.find((c) => c.url === CONFIG.ansEndpoint && c.method === 'PUT');
      expect(expireOrphan.body.notifications.notification[0]['notification-id']).to.equal('n-orphan');

      const deleteOrphan = calls.find((c) => c.url === `${CONFIG.adobeIoEndpoint}/delete/n-orphan`);
      expect(deleteOrphan).to.exist;

      // Exactly one create, and it's for RF-create specifically — not merely "some create
      // happened," which wouldn't catch a regression that also recreates RF-keep.
      const creates = calls.filter((c) => c.url === CONFIG.ansEndpoint && c.method === 'POST');
      expect(creates).to.have.lengthOf(1);
      const storeForCreate = calls.find((c) => c.url === `${CONFIG.adobeIoEndpoint}/store`);
      expect(storeForCreate.body.metadata.sessionId).to.equal('RF-create');

      const noExpireForKeep = calls.find((c) => c.url === `${CONFIG.adobeIoEndpoint}/delete/n-keep`);
      expect(noExpireForKeep).to.not.exist;
    });

    it('expires every existing notification when nothing is scheduled anymore', async () => {
      window.fetch = async (url, options = {}) => {
        calls.push({ url, method: options.method || 'GET', body: options.body ? JSON.parse(options.body) : null });
        if (url === `${CONFIG.adobeIoEndpoint}/list`) {
          return {
            ok: true,
            status: 200,
            json: async () => [
              { id: 'n-a', metadata: { sessionId: 'RF-a' } },
              { id: 'n-b', metadata: { sessionId: 'RF-b' } },
            ],
          };
        }
        return { ok: true, status: 200, json: async () => ({}) };
      };

      await reconcileSwanNotifications(() => [], () => new Set());

      const expires = calls.filter((c) => c.url === CONFIG.ansEndpoint && c.method === 'PUT');
      expect(expires).to.have.lengthOf(2);
      const deletes = calls.filter((c) => c.url === `${CONFIG.adobeIoEndpoint}/delete/n-a` || c.url === `${CONFIG.adobeIoEndpoint}/delete/n-b`);
      expect(deletes).to.have.lengthOf(2);
      const creates = calls.filter((c) => c.url === CONFIG.ansEndpoint && c.method === 'POST');
      expect(creates).to.have.lengthOf(0);
    });

    it('treats a bookkeeping entry with no metadata at all as orphaned instead of throwing', async () => {
      window.fetch = async (url, options = {}) => {
        calls.push({ url, method: options.method || 'GET' });
        if (url === `${CONFIG.adobeIoEndpoint}/list`) {
          return { ok: true, status: 200, json: async () => [{ id: 'n-no-metadata' }] };
        }
        return { ok: true, status: 200, json: async () => ({}) };
      };

      let threw = false;
      try {
        await reconcileSwanNotifications(() => [], () => new Set());
      } catch {
        threw = true;
      }
      expect(threw).to.equal(false);
      const expire = calls.find((c) => c.url === CONFIG.ansEndpoint && c.method === 'PUT');
      expect(expire).to.exist;
    });

    it('skips a scheduled id absent from the session catalog instead of throwing', async () => {
      const scheduledIds = new Set(['missing-session-id']);
      let threw = false;
      try {
        await reconcileSwanNotifications(() => [], () => scheduledIds);
      } catch {
        threw = true;
      }
      expect(threw).to.equal(false);
    });

    it('merges into the notification cache rather than replacing it, so a concurrent per-action update survives', async () => {
      // Simulate a per-action create that has already updated the module's cache (via a
      // real notifySessionScheduled call) before a reconcile pass's own /list fetch —
      // which necessarily reflects an older, stale snapshot that doesn't know about it
      // yet — resolves and merges in.
      const inFlight = makeSession('RF-concurrent');
      await notifySessionScheduled(inFlight);
      calls = [];

      window.fetch = async (url, options = {}) => {
        calls.push({ url, method: options.method || 'GET', body: options.body ? JSON.parse(options.body) : null });
        if (url === `${CONFIG.adobeIoEndpoint}/list`) {
          // Stale snapshot: doesn't know about RF-concurrent yet.
          return { ok: true, status: 200, json: async () => [] };
        }
        return { ok: true, status: 200, json: async () => ({}) };
      };
      await reconcileSwanNotifications(() => [inFlight], () => new Set([inFlight.id]));
      calls = [];

      // The real regression test: if reconcile had wholesale-replaced the cache with its
      // stale (empty) snapshot instead of merging, this lookup would find nothing and
      // silently no-op, leaving the real ANS notification for RF-concurrent stuck forever.
      await notifySessionUnscheduled(inFlight);
      const expire = calls.find((c) => c.url === CONFIG.ansEndpoint && c.method === 'PUT');
      expect(expire?.body.notifications.notification[0]['notification-id']).to.equal('n-generated-1');
    });
  });
});
