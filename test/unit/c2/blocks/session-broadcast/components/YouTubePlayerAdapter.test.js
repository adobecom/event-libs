import { expect } from '@esm-bundle/chai';
import { YouTubePlayerAdapter } from '../../../../../../event-libs/v1/c2/blocks/session-broadcast/components/players/YouTubePlayerAdapter.js';

// The mock htm-preact's useEffect is a no-op (see test/unit/mocks/deps/htm-preact.js), so the
// actual YouTubeChat mount/build never runs under this harness — that's real-browser-only
// behavior, verified via a preview harness instead (see the plan's testing conventions). This
// just guards the render contract: the mount point renders without throwing either way.
describe('YouTubePlayerAdapter', () => {
  it('renders a mount point without throwing, given a youTubeId', () => {
    expect(() => YouTubePlayerAdapter({ session: { id: 's-1', youTubeId: 'abc123' } })).to.not.throw();
  });

  it('renders a mount point without throwing when there is no youTubeId', () => {
    expect(() => YouTubePlayerAdapter({ session: { id: 's-1' } })).to.not.throw();
  });
});
