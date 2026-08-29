import { expect } from '@esm-bundle/chai';
import { BroadcastBody } from '../../../../../../event-libs/v1/c2/blocks/session-broadcast/components/BroadcastApp.js';
import {
  sessions, sessionsStatus, liveStreamActiveIds,
} from '../../../../../../event-libs/v1/utils/session-store.js';

const CONFIG = {
  alsoLiveTitle: 'Currently Live', upcomingTitle: 'Upcoming', viewAllDetailsLabel: 'View all details',
};

const HOUR = 3600e3;

// Nested sub-components (PlayerHost, SessionInfoPanel, the carousels) sit inside a
// multi-sibling template whose first literal isn't a bare `<` — the mocked htm-preact's
// simplified html() tag only invokes a component call in that exact shape (see
// test/unit/mocks/deps/htm-preact.js), so those don't actually render through this harness.
// These tests stick to what IS reliably exercised here: the top-level loading/error/ready
// branching this component owns directly, which the mock does resolve correctly (LoadingState
// is its own bare `<${LoadingState} />` call, and the empty-state div has no interpolation at
// all). Full integration is verified via a preview harness in a real browser instead.
describe('BroadcastBody', () => {
  beforeEach(() => {
    sessions.value = [];
    sessionsStatus.value = 'idle';
    liveStreamActiveIds.value = new Set();
    history.replaceState(null, '', window.location.pathname);
  });

  it('shows the loading state while sessions are loading', () => {
    sessionsStatus.value = 'loading';
    const out = BroadcastBody({ config: CONFIG });
    expect(out).to.include('sg-loading-state');
    expect(out).to.include('Loading sessions');
  });

  it('marks aria-busy="true" while loading', () => {
    sessionsStatus.value = 'loading';
    const out = BroadcastBody({ config: CONFIG });
    expect(out).to.include('aria-busy="true"');
  });

  it('shows an error message when the catalog failed to load', () => {
    sessionsStatus.value = 'error';
    const out = BroadcastBody({ config: CONFIG });
    expect(out).to.include('sb-error');
    expect(out).to.include('Failed to load sessions');
  });

  it('shows the empty state once ready with nothing live or upcoming', () => {
    sessionsStatus.value = 'ready';
    sessions.value = [];
    const out = BroadcastBody({ config: CONFIG });
    expect(out).to.include('sb-empty');
    expect(out).to.include('No sessions are live right now');
  });

  it('omits the empty state once ready with a live session', () => {
    sessionsStatus.value = 'ready';
    sessions.value = [{
      id: 's-1',
      title: 'Live now',
      startTimeUtc: new Date(Date.now() - HOUR / 2).toISOString(),
      endTimeUtc: new Date(Date.now() + HOUR / 2).toISOString(),
      youTubeId: 'yt-1',
    }];
    const out = BroadcastBody({ config: CONFIG });
    expect(out).to.not.include('sb-empty');
  });

  it('marks aria-busy="false" once ready', () => {
    sessionsStatus.value = 'ready';
    const out = BroadcastBody({ config: CONFIG });
    expect(out).to.include('aria-busy="false"');
  });
});
