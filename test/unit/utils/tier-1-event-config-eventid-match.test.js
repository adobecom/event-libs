import { expect } from '@esm-bundle/chai';
import { initTierOneEventConfig } from '../../../event-libs/v1/utils/tier-1-event-config.js';

// Separate file from the other eventId cross-check tests: initTierOneEventConfig()
// only ever parses metadata once per module instance, so each combination of
// tier-1-event-config/event-id metadata needs its own fresh module graph.
describe('tier-1-event-config (eventId match)', () => {
  let loggedMessages;

  before(() => {
    const configMeta = document.createElement('meta');
    configMeta.name = 'tier-1-event-config';
    configMeta.content = JSON.stringify({ eventId: 'same-event-id' });
    document.head.appendChild(configMeta);

    const eventIdMeta = document.createElement('meta');
    eventIdMeta.name = 'event-id';
    eventIdMeta.content = 'same-event-id';
    document.head.appendChild(eventIdMeta);

    loggedMessages = [];
    window.lana = { log: (msg) => loggedMessages.push(msg) };
    initTierOneEventConfig();
  });

  it('does not warn when the config eventId matches the page', () => {
    expect(loggedMessages.length).to.equal(0);
  });
});
