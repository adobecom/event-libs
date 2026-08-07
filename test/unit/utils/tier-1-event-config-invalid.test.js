import { expect } from '@esm-bundle/chai';
import {
  initTierOneEventConfig,
  getTrackIcon,
  getAllowDoubleBooking,
  getFeaturedSessionIds,
} from '../../../event-libs/v1/utils/tier-1-event-config.js';

describe('tier-1-event-config (malformed JSON)', () => {
  let loggedMessages;

  before(() => {
    const meta = document.createElement('meta');
    meta.name = 'tier-1-event-config';
    meta.content = '{not valid json';
    document.head.appendChild(meta);

    loggedMessages = [];
    window.lana = { log: (msg) => loggedMessages.push(msg) };
    initTierOneEventConfig();
  });

  it('logs via window.lana.log without throwing', () => {
    expect(loggedMessages.length).to.equal(1);
    expect(loggedMessages[0]).to.include('invalid tier-1-event-config JSON');
  });

  it('leaves the authored config empty (falling back only to built-in defaults)', () => {
    expect(getTrackIcon('Some Totally Unmapped Track')).to.equal(null);
  });

  it('defaults allowDoubleBooking to false when config failed to parse', () => {
    expect(getAllowDoubleBooking()).to.equal(false);
  });

  it('defaults featuredSessions to an empty array when config failed to parse', () => {
    expect(getFeaturedSessionIds()).to.deep.equal([]);
  });
});
