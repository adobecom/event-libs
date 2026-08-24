import { expect } from '@esm-bundle/chai';
import {
  initSwanConfig, waitForSwanConfig, isSwanEnabled,
} from '../../../../event-libs/v1/features/swan-notifications/swan-config.js';

const CONFIG_SHEET_PATH = '/tools/da-apps/swan-notification-configurator/configs.json';
const CONFIG_ID = 'wait-for-config-test-id';

// Every other test file always fully `await`s initSwanConfig() before calling anything
// that depends on waitForSwanConfig() — so the actual Promise.race/wait behavior this
// gate exists for (a caller invoked WHILE the resolution is still in flight must not
// race ahead) has never been directly exercised. This file is that direct test.
describe('swan-config: waitForSwanConfig()', () => {
  it('resolves immediately when initSwanConfig() was never called', async () => {
    // Fresh file/module instance — no metadata authored, initSwanConfig() never invoked.
    const resolvedInTime = await Promise.race([
      waitForSwanConfig(5000).then(() => true),
      new Promise((resolve) => { setTimeout(() => resolve(false), 200); }),
    ]);
    expect(resolvedInTime).to.equal(true);
  });

  describe('while a resolution is in flight', () => {
    let originalFetch;
    let releaseFetch;

    before(() => {
      const meta = document.createElement('meta');
      meta.name = 'swan-notification-config';
      meta.content = CONFIG_ID;
      document.head.appendChild(meta);

      originalFetch = window.fetch;
      const gate = new Promise((resolve) => { releaseFetch = resolve; });
      window.fetch = async (url) => {
        await gate; // hangs until the test explicitly releases it below
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
    });

    after(() => {
      window.fetch = originalFetch;
    });

    it('does not resolve until the gated fetch settles, then reflects the resolved config', async () => {
      const initPromise = initSwanConfig(); // fire-and-forget, fetch is currently hanging on the gate
      let waited = false;
      const waitPromise = waitForSwanConfig(5000).then(() => { waited = true; });

      // Give pending microtasks/timers a chance to run — waitForSwanConfig() must NOT
      // have resolved yet, since the underlying fetch is still gated.
      await new Promise((resolve) => { setTimeout(resolve, 20); });
      expect(waited).to.equal(false);
      expect(isSwanEnabled()).to.equal(false);

      releaseFetch();
      await waitPromise;
      await initPromise;

      expect(waited).to.equal(true);
      expect(isSwanEnabled()).to.equal(true);
    });
  });
});
