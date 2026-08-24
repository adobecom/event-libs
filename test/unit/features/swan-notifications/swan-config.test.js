import { expect } from '@esm-bundle/chai';
import {
  initSwanConfig, isSwanEnabled, getSwanConfig,
} from '../../../../event-libs/v1/features/swan-notifications/swan-config.js';

const CONFIG_SHEET_PATH = '/tools/da-apps/swan-notification-configurator/configs.json';
const CONFIG_ID = 'test-config-id-1';

const CONFIG = {
  eventName: 'MAX 2026',
  adobeIoEndpoint: 'https://14257-eventsnotifmgr-dev.adobeioruntime.net/api/v1/web/virtual-events-notification-manager',
  ansEndpoint: 'https://notify-stage.adobe.io/ans/v1/notifications',
  notificationType: 'com.adobe.events.v1',
  notificationSubType: 'max26.scheduled.notifications',
  appId: 'adobecom',
  defaultNotificationIconUrl: 'https://example.com/icon.png',
  defaultNotificationImageUrl: 'https://example.com/image.png',
  upcomingOffsetMinutes: 5,
};

describe('swan-config', () => {
  it('is disabled and returns an empty config before any metadata is authored', async () => {
    // No metadata authored yet in this test, so initSwanConfig() no-ops without ever
    // calling fetch — window.fetch is deliberately left untouched here.
    await initSwanConfig();
    expect(isSwanEnabled()).to.equal(false);
    expect(getSwanConfig()).to.deep.equal({});
  });

  describe('once swan-notification-config metadata holds a resolvable configId', () => {
    let originalFetch;
    let fetchCallCount;

    // A describe's own before() runs before any beforeEach in the same or an ancestor
    // suite (Mocha's actual hook ordering) — so the fetch stub has to be set up here,
    // inline, rather than in an outer beforeEach that wouldn't yet be in effect when
    // this hook runs.
    before(async () => {
      const meta = document.createElement('meta');
      meta.name = 'swan-notification-config';
      meta.content = CONFIG_ID;
      document.head.appendChild(meta);

      originalFetch = window.fetch;
      fetchCallCount = 0;
      window.fetch = async (url) => {
        fetchCallCount += 1;
        if (url === CONFIG_SHEET_PATH) {
          return { ok: true, status: 200, json: async () => ({ data: [{ configId: CONFIG_ID, config: JSON.stringify(CONFIG) }] }) };
        }
        return { ok: false, status: 404, json: async () => ({}) };
      };
      await initSwanConfig();
    });

    after(() => {
      window.fetch = originalFetch;
    });

    it('is enabled once both adobeIoEndpoint and ansEndpoint are present and on a trusted host', () => {
      expect(isSwanEnabled()).to.equal(true);
    });

    it('exposes every field from the resolved sheet row verbatim', () => {
      expect(getSwanConfig()).to.deep.equal(CONFIG);
    });

    it('is idempotent — a second init() call does not re-fetch or clear the config', async () => {
      const callsBefore = fetchCallCount;
      await initSwanConfig();
      expect(fetchCallCount).to.equal(callsBefore);
      expect(getSwanConfig().eventName).to.equal('MAX 2026');
    });
  });
});
