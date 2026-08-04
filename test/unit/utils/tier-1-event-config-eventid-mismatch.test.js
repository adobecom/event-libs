import { expect } from '@esm-bundle/chai';
import { initTierOneEventConfig } from '../../../event-libs/v1/utils/tier-1-event-config.js';

// Separate file from the other eventId cross-check tests: initTierOneEventConfig()
// only ever parses metadata once per module instance, so each combination of
// tier-1-event-config/event-id metadata needs its own fresh module graph.
describe('tier-1-event-config (eventId mismatch)', () => {
  let loggedMessages;

  before(() => {
    const configMeta = document.createElement('meta');
    configMeta.name = 'tier-1-event-config';
    configMeta.content = JSON.stringify({ eventId: 'authored-event-id' });
    document.head.appendChild(configMeta);

    const eventIdMeta = document.createElement('meta');
    eventIdMeta.name = 'event-id';
    eventIdMeta.content = 'actual-page-event-id';
    document.head.appendChild(eventIdMeta);

    loggedMessages = [];
    window.lana = { log: (msg) => loggedMessages.push(msg) };
    initTierOneEventConfig();
  });

  it('warns via window.lana.log when the config eventId does not match the page', () => {
    expect(loggedMessages.length).to.equal(1);
    expect(loggedMessages[0]).to.include('eventId mismatch');
    expect(loggedMessages[0]).to.include('authored-event-id');
    expect(loggedMessages[0]).to.include('actual-page-event-id');
  });
});
