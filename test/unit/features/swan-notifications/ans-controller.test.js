import { expect } from '@esm-bundle/chai';
import { initSwanConfig } from '../../../../event-libs/v1/features/swan-notifications/swan-config.js';
import {
  getAdobeUserId, fetchAdobeIoNotifications, createAnsNotification, expireAnsNotification,
  storeBookkeepingEntry, deleteBookkeepingEntry,
} from '../../../../event-libs/v1/features/swan-notifications/ans-controller.js';

const CONFIG_SHEET_PATH = '/tools/da-apps/swan-notification-configurator/configs.json';
const CONFIG_ID = 'ans-controller-test-config-id';

const CONFIG = {
  adobeIoEndpoint: 'https://14257-eventsnotifmgr-dev.adobeioruntime.net/api/v1/web/virtual-events-notification-manager',
  ansEndpoint: 'https://notify-stage.adobe.io/ans/v1/notifications',
  notificationType: 'com.adobe.events.v1',
  notificationSubType: 'max26.scheduled.notifications',
  appId: 'custom-app-id',
};

describe('ans-controller', () => {
  let originalFetch;
  let originalAdobeIMS;
  let lastUrl;
  let lastOptions;

  const stubFetch = (body, { ok = true, status = 200 } = {}) => {
    window.fetch = async (url, options) => {
      lastUrl = url;
      lastOptions = options;
      return { ok, status, json: async () => body };
    };
  };

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
  });

  afterEach(() => {
    window.fetch = originalFetch;
    window.adobeIMS = originalAdobeIMS;
  });

  describe('getAdobeUserId', () => {
    it('reads the user_id claim off the IMS token/profile', async () => {
      expect(await getAdobeUserId()).to.equal('user-1');
    });

    it('resolves to null instead of throwing when window.adobeIMS is not yet ready', async () => {
      window.adobeIMS = undefined;
      expect(await getAdobeUserId()).to.equal(null);
    });

    it('resolves to null when the profile has no user_id claim', async () => {
      window.adobeIMS = { tokenService: { getTokenAndProfile: async () => ({ tokenFields: {} }) } };
      expect(await getAdobeUserId()).to.equal(null);
    });
  });

  it('fetchAdobeIoNotifications GETs {adobeIoEndpoint}/list with bookkeeping headers', async () => {
    stubFetch([{ id: 'n-1', metadata: { sessionId: 'RF-1' } }]);
    const result = await fetchAdobeIoNotifications();
    expect(result).to.deep.equal([{ id: 'n-1', metadata: { sessionId: 'RF-1' } }]);
    expect(lastUrl).to.equal(`${CONFIG.adobeIoEndpoint}/list`);
    expect(lastOptions.method).to.equal('GET');
    expect(lastOptions.headers.Authorization).to.equal('Bearer ims-token');
  });

  describe('createAnsNotification', () => {
    it('POSTs the notification with ANS-specific headers and body shape', async () => {
      stubFetch({ notifications: { notification: [{ 'notification-id': 'n-1' }] } });
      const timingProperties = { triggerNotificationTime: 1000 };
      const payload = { title: 'hi' };
      const result = await createAnsNotification({ adobeUserId: 'user-1', timingProperties, payload });

      expect(result).to.deep.equal([{ 'notification-id': 'n-1' }]);
      expect(lastUrl).to.equal(CONFIG.ansEndpoint);
      expect(lastOptions.method).to.equal('POST');
      expect(lastOptions.headers['x-adobe-app-id']).to.equal('custom-app-id');
      expect(lastOptions.headers['x-api-key']).to.equal('adobedotcomdx');
      expect(lastOptions.headers.accept).to.equal('Application/json');
      expect(lastOptions.headers.Authorization).to.equal('Bearer ims-token');
      expect(lastOptions.headers.from).to.be.a('string');

      const body = JSON.parse(lastOptions.body);
      const notification = body.notifications.notification[0];
      expect(notification['user-id']).to.deep.equal(['user-1']);
      expect(notification.type).to.equal(CONFIG.notificationType);
      expect(notification['sub-type']).to.equal(CONFIG.notificationSubType);
      expect(notification.timestamp).to.equal(1000);
      expect(JSON.parse(notification.payload)).to.deep.equal(payload);
    });

    it('throws when the HTTP request itself fails', async () => {
      stubFetch({}, { ok: false, status: 500 });
      let error;
      try {
        await createAnsNotification({ adobeUserId: 'user-1', timingProperties: {}, payload: {} });
      } catch (err) {
        error = err;
      }
      expect(error).to.be.an('error');
      expect(error.message).to.include('500');
    });
  });

  it('expireAnsNotification PUTs state:EXPIRED instead of using DELETE', async () => {
    stubFetch({});
    await expireAnsNotification('n-1');
    expect(lastUrl).to.equal(CONFIG.ansEndpoint);
    expect(lastOptions.method).to.equal('PUT');
    const body = JSON.parse(lastOptions.body);
    expect(body.notifications.notification[0]).to.deep.equal({ 'notification-id': 'n-1', state: 'EXPIRED' });
  });

  it('throws when expireAnsNotification receives a non-ok response', async () => {
    stubFetch({}, { ok: false, status: 500 });
    let error;
    try {
      await expireAnsNotification('n-1');
    } catch (err) {
      error = err;
    }
    expect(error).to.be.an('error');
    expect(error.message).to.include('500');
  });

  describe('bookkeeping calls', () => {
    it('storeBookkeepingEntry POSTs {adobeIoEndpoint}/store with id + session metadata', async () => {
      stubFetch({});
      await storeBookkeepingEntry({ notificationId: 'n-1', rfCode: 'RF-1' });
      expect(lastUrl).to.equal(`${CONFIG.adobeIoEndpoint}/store`);
      expect(lastOptions.method).to.equal('POST');
      expect(JSON.parse(lastOptions.body)).to.deep.equal({ id: 'n-1', metadata: { sessionId: 'RF-1' } });
    });

    it('throws when storeBookkeepingEntry receives a non-ok response', async () => {
      stubFetch({}, { ok: false, status: 500 });
      let error;
      try {
        await storeBookkeepingEntry({ notificationId: 'n-1', rfCode: 'RF-1' });
      } catch (err) {
        error = err;
      }
      expect(error).to.be.an('error');
    });

    it('deleteBookkeepingEntry POSTs {adobeIoEndpoint}/delete/{id}', async () => {
      stubFetch({});
      await deleteBookkeepingEntry('n-1');
      expect(lastUrl).to.equal(`${CONFIG.adobeIoEndpoint}/delete/n-1`);
      expect(lastOptions.method).to.equal('POST');
    });

    it('throws when deleteBookkeepingEntry receives a non-ok response', async () => {
      stubFetch({}, { ok: false, status: 500 });
      let error;
      try {
        await deleteBookkeepingEntry('n-1');
      } catch (err) {
        error = err;
      }
      expect(error).to.be.an('error');
    });

    it('throws when fetchAdobeIoNotifications receives a non-ok response', async () => {
      stubFetch({}, { ok: false, status: 500 });
      let error;
      try {
        await fetchAdobeIoNotifications();
      } catch (err) {
        error = err;
      }
      expect(error).to.be.an('error');
    });
  });
});
