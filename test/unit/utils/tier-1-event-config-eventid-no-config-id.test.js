import { expect } from '@esm-bundle/chai';
import { initTierOneEventConfig } from '../../../event-libs/v1/utils/tier-1-event-config.js';

// Separate file from the other eventId cross-check tests: initTierOneEventConfig()
// only ever parses metadata once per module instance, so each combination of
// tier-1-event-config/event-id metadata needs its own fresh module graph.
//
// Covers an older Config authored before the eventId field existed — the page still
// has its own event-id, but there's nothing to cross-check it against.
describe('tier-1-event-config (eventId cross-check, config has no eventId)', () => {
  let loggedMessages;

  before(() => {
    const configMeta = document.createElement('meta');
    configMeta.name = 'tier-1-event-config';
    configMeta.content = JSON.stringify({ trackIcons: {} });
    document.head.appendChild(configMeta);

    const eventIdMeta = document.createElement('meta');
    eventIdMeta.name = 'event-id';
    eventIdMeta.content = 'actual-page-event-id';
    document.head.appendChild(eventIdMeta);

    loggedMessages = [];
    window.lana = { log: (msg) => loggedMessages.push(msg) };
    initTierOneEventConfig();
  });

  it('skips the cross-check silently when the config has no eventId', () => {
    expect(loggedMessages.length).to.equal(0);
  });
});
