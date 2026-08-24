import { expect } from '@esm-bundle/chai';
import { initSwanConfig, isSwanEnabled, getSwanConfig } from '../../../../event-libs/v1/features/swan-notifications/swan-config.js';

describe('swan-config (sheet fetch fails)', () => {
  let loggedMessages;
  let originalFetch;
  let fetchCallCount;

  before(async () => {
    const meta = document.createElement('meta');
    meta.name = 'swan-notification-config';
    meta.content = 'any-config-id';
    document.head.appendChild(meta);

    loggedMessages = [];
    window.lana = { log: (msg) => loggedMessages.push(msg) };
    originalFetch = window.fetch;
    fetchCallCount = 0;
    window.fetch = async () => {
      fetchCallCount += 1;
      return { ok: false, status: 500, json: async () => ({}) };
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

  it('logs the fetch failure via window.lana.log', () => {
    expect(loggedMessages.some((m) => m.includes('sheet fetch failed'))).to.equal(true);
  });

  it('locks in the failure — a second call does not retry the fetch', async () => {
    const callsBefore = fetchCallCount;
    await initSwanConfig();
    expect(fetchCallCount).to.equal(callsBefore);
  });
});
