import { expect } from '@esm-bundle/chai';
import { initSwanConfig, isSwanEnabled, getSwanConfig } from '../../../../event-libs/v1/features/swan-notifications/swan-config.js';

const CONFIG_SHEET_PATH = '/tools/da-apps/swan-notification-configurator/configs.json';

describe('swan-config (configId not found in the resolved sheet)', () => {
  let loggedMessages;
  let originalFetch;
  let fetchCallCount;

  before(async () => {
    const meta = document.createElement('meta');
    meta.name = 'swan-notification-config';
    meta.content = 'missing-config-id';
    document.head.appendChild(meta);

    loggedMessages = [];
    window.lana = { log: (msg) => loggedMessages.push(msg) };
    originalFetch = window.fetch;
    fetchCallCount = 0;
    window.fetch = async (url) => {
      fetchCallCount += 1;
      if (url === CONFIG_SHEET_PATH) {
        return { ok: true, status: 200, json: async () => ({ data: [{ configId: 'some-other-id', config: '{}' }] }) };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    };
    await initSwanConfig();
  });

  after(() => {
    window.fetch = originalFetch;
  });

  it('stays disabled without throwing', () => {
    expect(isSwanEnabled()).to.equal(false);
  });

  it('leaves getSwanConfig() at its default empty object', () => {
    expect(getSwanConfig()).to.deep.equal({});
  });

  it('logs that no config was found for the id', () => {
    expect(loggedMessages.some((m) => m.includes('no config found for id'))).to.equal(true);
  });

  it('locks in the failure — a second call does not retry the fetch', async () => {
    const callsBefore = fetchCallCount;
    await initSwanConfig();
    expect(fetchCallCount).to.equal(callsBefore);
  });
});
