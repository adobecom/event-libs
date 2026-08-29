import { expect } from '@esm-bundle/chai';
import { PlayerHost } from '../../../../../../event-libs/v1/c2/blocks/session-broadcast/components/PlayerHost.js';

describe('PlayerHost', () => {
  it('renders nothing when there is no active session', () => {
    expect(PlayerHost({ session: null })).to.equal(null);
  });

  it('renders the YouTube adapter mount for a session with a youTubeId', () => {
    const out = PlayerHost({ session: { id: 's-1', youTubeId: 'abc123' } });
    expect(out).to.include('sb-player__mount');
  });

  it('falls back to an unsupported-player message for an unrecognized player type', () => {
    const out = PlayerHost({ session: { id: 's-2' } });
    expect(out).to.include('sb-player__unsupported');
  });
});
