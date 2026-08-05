import { expect } from '@esm-bundle/chai';
import {
  initTierOneEventConfig,
  getTrackIcon,
  getAllowDoubleBooking,
} from '../../../event-libs/v1/utils/tier-1-event-config.js';

// Separate file from the other tier-1-event-config tests: initTierOneEventConfig()
// only ever parses metadata once per module instance, so this file needs its own
// fresh module graph to test the *first* call landing before any meta tag exists.
//
// Mirrors session-store.js's initSessionState(): a call that finds the essential
// metadata absent must not lock in `initialized`, so a later call (once the metadata
// exists) can still pick it up — unlike a parse failure, which does lock in, since
// retrying the same malformed string would just repeat the same failure forever.
describe('tier-1-event-config (retry when metadata is absent)', () => {
  it('no-ops without locking in when the metadata is absent on the first call', () => {
    initTierOneEventConfig();
    expect(getAllowDoubleBooking()).to.equal(false);
    expect(getTrackIcon('Photography')).to.deep.equal({ icon: 'photography', color: '#4CAF50' });
  });

  it('picks up the config on a later call, once the metadata exists', () => {
    const meta = document.createElement('meta');
    meta.name = 'tier-1-event-config';
    meta.content = JSON.stringify({ allowDoubleBooking: true });
    document.head.appendChild(meta);

    initTierOneEventConfig();

    expect(getAllowDoubleBooking()).to.equal(true);
  });
});
