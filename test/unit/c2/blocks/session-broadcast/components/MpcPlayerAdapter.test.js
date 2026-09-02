import { expect } from '@esm-bundle/chai';
import { MpcPlayerAdapter } from '../../../../../../event-libs/v1/c2/blocks/session-broadcast/components/players/MpcPlayerAdapter.js';

// The mock htm-preact's useEffect is a no-op (see test/unit/mocks/deps/htm-preact.js), so the
// actual Milo adobetv.js dynamic import/mount never runs under this harness — that's
// real-browser-only behavior, verified via a preview harness instead (see the plan's testing
// conventions). This just guards the render contract: the mount point renders without
// throwing either way.
describe('MpcPlayerAdapter', () => {
  it('renders a mount point without throwing, given an mpcId', () => {
    expect(() => MpcPlayerAdapter({ session: { id: 's-1', mpcId: '3458902' } })).to.not.throw();
  });

  it('renders a mount point without throwing when there is no mpcId', () => {
    expect(() => MpcPlayerAdapter({ session: { id: 's-1' } })).to.not.throw();
  });
});
