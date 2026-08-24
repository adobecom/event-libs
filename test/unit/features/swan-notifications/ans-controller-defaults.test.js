import { expect } from '@esm-bundle/chai';
import { initSwanConfig } from '../../../../event-libs/v1/features/swan-notifications/swan-config.js';
import { createAnsNotification } from '../../../../event-libs/v1/features/swan-notifications/ans-controller.js';

const CONFIG_SHEET_PATH = '/tools/da-apps/swan-notification-configurator/configs.json';
const CONFIG_ID = 'defaults-test-config-id';

// Separate file: swan-config.js's init is idempotent per module instance, so a config
// that deliberately omits appId/notificationType/notificationSubType needs its own
// page/module instance rather than sharing ans-controller.test.js's already-full config.
describe('ans-controller (config omits appId/notificationType/notificationSubType)', () => {
  let loggedMessages;
  let lastOptions;

  before(async () => {
    const meta = document.createElement('meta');
    meta.name = 'swan-notification-config';
    meta.content = CONFIG_ID;
    document.head.appendChild(meta);

    window.fetch = async (url) => {
      if (url === CONFIG_SHEET_PATH) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: [{
              configId: CONFIG_ID,
              config: JSON.stringify({
                adobeIoEndpoint: 'https://14257-eventsnotifmgr-dev.adobeioruntime.net/api/v1/web/virtual-events-notification-manager',
                ansEndpoint: 'https://notify-stage.adobe.io/ans/v1/notifications',
              }),
            }],
          }),
        };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    };
    await initSwanConfig();
  });

  beforeEach(() => {
    loggedMessages = [];
    window.lana = { log: (msg) => loggedMessages.push(msg) };
    window.adobeIMS = { getAccessToken: () => ({ token: 'ims-token' }) };
    window.fetch = async (url, options) => {
      lastOptions = options;
      return { ok: true, status: 200, json: async () => ({ notifications: { notification: [] } }) };
    };
  });

  it('falls back x-adobe-app-id to "adobecom" when appId is not authored', async () => {
    await createAnsNotification({ adobeUserId: 'user-1', timingProperties: { triggerNotificationTime: 1 }, payload: {} });
    expect(lastOptions.headers['x-adobe-app-id']).to.equal('adobecom');
  });

  it('falls back notification type to the fixed ANS/events type when notificationType is not authored', async () => {
    await createAnsNotification({ adobeUserId: 'user-1', timingProperties: { triggerNotificationTime: 1 }, payload: {} });
    const body = JSON.parse(lastOptions.body);
    expect(body.notifications.notification[0].type).to.equal('com.adobe.events.v1');
  });

  it('warns via window.lana.log when notificationSubType is missing, rather than failing silently', async () => {
    await createAnsNotification({ adobeUserId: 'user-1', timingProperties: { triggerNotificationTime: 1 }, payload: {} });
    expect(loggedMessages.some((m) => m.includes('notificationSubType'))).to.equal(true);
  });
});
