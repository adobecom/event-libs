import { expect } from '@esm-bundle/chai';
import { initTrackIconConfig, getTrackIcon } from '../../../event-libs/v1/utils/track-icon-config.js';

describe('track-icon-config (malformed JSON)', () => {
  let loggedMessages;

  before(() => {
    const meta = document.createElement('meta');
    meta.name = 'track-icon-config';
    meta.content = '{not valid json';
    document.head.appendChild(meta);

    loggedMessages = [];
    window.lana = { log: (msg) => loggedMessages.push(msg) };
    initTrackIconConfig();
  });

  it('logs via window.lana.log without throwing', () => {
    expect(loggedMessages.length).to.equal(1);
    expect(loggedMessages[0]).to.include('invalid track-icon-config JSON');
  });

  it('leaves the authored config empty (falling back only to built-in defaults)', () => {
    expect(getTrackIcon('Some Totally Unmapped Track')).to.equal(null);
  });
});
