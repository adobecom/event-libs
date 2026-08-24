import { expect } from '@esm-bundle/chai';
import { initSwanConfig, isSwanEnabled, getSwanConfig } from '../../../../event-libs/v1/features/swan-notifications/swan-config.js';

const CONFIG_SHEET_PATH = '/tools/da-apps/swan-notification-configurator/configs.json';

// Separate file: isSwanEnabled()'s allowlist check runs against whatever swanConfig was
// resolved, so this needs its own page/module instance rather than sharing
// swan-config.test.js's (already-valid, already-locked-in) config.
describe('swan-config (untrusted endpoint host)', () => {
  let loggedMessages;
  let originalFetch;

  before(async () => {
    const meta = document.createElement('meta');
    meta.name = 'swan-notification-config';
    meta.content = 'untrusted-host-config-id';
    document.head.appendChild(meta);

    loggedMessages = [];
    window.lana = { log: (msg) => loggedMessages.push(msg) };
    originalFetch = window.fetch;
    window.fetch = async (url) => {
      if (url === CONFIG_SHEET_PATH) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: [{
              configId: 'untrusted-host-config-id',
              config: JSON.stringify({
                adobeIoEndpoint: 'https://attacker.example/collect',
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

  after(() => {
    window.fetch = originalFetch;
  });

  it('stays disabled when either endpoint host is not on the Adobe allowlist', () => {
    expect(isSwanEnabled()).to.equal(false);
  });

  it('still exposes the resolved config — the endpoints are readable, just not trusted for calls', () => {
    expect(getSwanConfig().adobeIoEndpoint).to.equal('https://attacker.example/collect');
  });

  it('logs the trust-boundary refusal via window.lana.log', () => {
    expect(loggedMessages.some((m) => m.includes('trusted Adobe allowlist'))).to.equal(true);
  });
});
