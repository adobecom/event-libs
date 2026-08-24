import { expect } from '@esm-bundle/chai';
import { initSwanConfig, isSwanEnabled } from '../../../../event-libs/v1/features/swan-notifications/swan-config.js';

const CONFIG_SHEET_PATH = '/tools/da-apps/swan-notification-configurator/configs.json';

// A malformed `config` string inside an otherwise-resolvable sheet row — exercises
// da-sheet-controller.js's parseRowConfig() defaulting to {} rather than swan-config.js's
// own metadata-parsing (the metadata row is just a bare configId now, always valid).
describe('swan-config (malformed config JSON inside the resolved sheet row)', () => {
  let loggedMessages;
  let originalFetch;

  before(async () => {
    const meta = document.createElement('meta');
    meta.name = 'swan-notification-config';
    meta.content = 'bad-row-config-id';
    document.head.appendChild(meta);

    loggedMessages = [];
    window.lana = { log: (msg) => loggedMessages.push(msg) };
    originalFetch = window.fetch;
    window.fetch = async (url) => {
      if (url === CONFIG_SHEET_PATH) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ data: [{ configId: 'bad-row-config-id', config: '{not valid json' }] }),
        };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    };
    await initSwanConfig();
  });

  after(() => {
    window.fetch = originalFetch;
  });

  it('logs via window.lana.log without throwing', () => {
    expect(loggedMessages.some((m) => m.includes('malformed config JSON'))).to.equal(true);
  });

  it('stays disabled when the row config failed to parse', () => {
    expect(isSwanEnabled()).to.equal(false);
  });
});
