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
    // manualSessionId's initializer now also reads sessionStorage — clear it so a prior test's
    // committed session id can't leak into this one.
    try { sessionStorage.removeItem('sb:active-session'); } catch { /* unavailable */ }
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
      isOnline: true,
    }];
    const out = BroadcastBody({ config: CONFIG });
    expect(out).to.not.include('sb-empty');
  });

  it('marks aria-busy="false" once ready', () => {
    sessionsStatus.value = 'ready';
    const out = BroadcastBody({ config: CONFIG });
    expect(out).to.include('aria-busy="false"');
  });

  // EndedState (unlike PlayerHost/AlsoLiveCarousel/etc.) IS invoked for real by this harness —
  // it's wrapped in its own bare `html`<${EndedState} .../>`` call, the one shape the mock
  // resolves (see the note at the top of this file) — so its actual rendered content is a
  // meaningful assertion here, not just a markup-presence check.
  //
  // Automatic in-bucket advancement itself (a committed session ending and a new one getting
  // picked) happens via the "resolve pendingCandidates" useEffect in BroadcastApp.js — this
  // mocked htm-preact's useEffect is a total no-op (see test/unit/mocks/deps/htm-preact.js), so
  // that effect never runs here. These tests stick to what's synchronously observable from a
  // single render: the genuinely-terminal ended state (no next group at all, or a next group in
  // a *different* bucket, which never gets picked automatically) resolves without needing the
  // effect. The actual pick-and-commit is covered at the pure-function level in
  // broadcast-schedule.test.js, and end-to-end in a real browser only.
  describe('ended state and bucket isolation', () => {
    it('shows the ended-state for a committed session with no next group in its own bucket', () => {
      sessionsStatus.value = 'ready';
      const endedSession = {
        id: 'ended-1',
        title: 'The One That Ended',
        description: 'It aired already.',
        startTimeUtc: new Date(Date.now() - 2 * HOUR).toISOString(),
        endTimeUtc: new Date(Date.now() - HOUR).toISOString(),
        youTubeId: 'yt-1',
        isOnline: true,
        sessionPageUrl: '/s/ended-1',
      };
      sessions.value = [endedSession];
      // Simulates "ended-1" having been committed earlier (initial default pick, a manual
      // switch, or the entry ?watch= param) — BroadcastBody's useState initializer reads
      // this via getHistorySessionId().
      history.pushState({ session: 'ended-1' }, '', window.location.pathname);

      const out = BroadcastBody({ config: CONFIG });
      expect(out).to.include('sb-ended');
      expect(out).to.include('Session complete.');
      expect(out).to.include('The One That Ended');
      expect(out).to.not.include('sb-empty');
    });

    // Unlike the pendingCandidates-to-activeSession commit (which needs BroadcastApp.js's
    // useEffect — a no-op in this mocked harness), this synthesis happens synchronously inside
    // resolveBucketSchedule itself, so it's observable on the very first render with no history
    // or sessionStorage seeding at all — a genuine first-time visitor.
    it('surfaces the most recently aired session as ended state for a first-time visitor on a gap', () => {
      sessionsStatus.value = 'ready';
      sessions.value = [{
        id: 'last-aired',
        title: 'The Last One That Aired',
        startTimeUtc: new Date(Date.now() - 2 * HOUR).toISOString(),
        endTimeUtc: new Date(Date.now() - HOUR).toISOString(),
        youTubeId: 'yt-1',
        isOnline: true,
        sessionPageUrl: '/s/last-aired',
      }];
      // No history.pushState, no sessionStorage seeding — manualSessionId starts truly null.

      const out = BroadcastBody({ config: CONFIG });
      expect(out).to.include('sb-ended');
      expect(out).to.include('The Last One That Aired');
      expect(out).to.not.include('sb-empty');
    });

    it('never auto-crosses buckets — a live YouTube session doesn\'t rescue an ended MPC commitment', () => {
      sessionsStatus.value = 'ready';
      const endedMpc = {
        id: 'ended-mpc',
        title: 'The One That Ended',
        startTimeUtc: new Date(Date.now() - 2 * HOUR).toISOString(),
        endTimeUtc: new Date(Date.now() - HOUR).toISOString(),
        mpcId: 'mpc-1',
        youTubeId: '',
        videoDuration: '01:00:00',
        isOnline: true,
        sessionPageUrl: '/s/ended-mpc',
      };
      const liveYoutube = {
        id: 'other-live',
        title: 'Still Going',
        startTimeUtc: new Date(Date.now() - HOUR / 2).toISOString(),
        endTimeUtc: new Date(Date.now() + HOUR / 2).toISOString(),
        youTubeId: 'yt-2',
        mpcId: '',
        isOnline: true,
      };
      sessions.value = [endedMpc, liveYoutube];
      history.pushState({ session: 'ended-mpc' }, '', window.location.pathname);

      const out = BroadcastBody({ config: CONFIG });
      expect(out).to.include('sb-ended');
      expect(out).to.include('The One That Ended');
    });
  });

  describe('cross-refresh persistence', () => {
    const terminalEnded = {
      id: 'ended-1',
      title: 'The One That Ended',
      startTimeUtc: new Date(Date.now() - 2 * HOUR).toISOString(),
      endTimeUtc: new Date(Date.now() - HOUR).toISOString(),
      youTubeId: 'yt-1',
      isOnline: true,
      sessionPageUrl: '/s/ended-1',
    };

    it('seeds the initial commitment from sessionStorage when there is no history.state', () => {
      sessionsStatus.value = 'ready';
      sessions.value = [terminalEnded];
      sessionStorage.setItem('sb:active-session', 'ended-1');

      const out = BroadcastBody({ config: CONFIG });
      expect(out).to.include('sb-ended');
      expect(out).to.include('The One That Ended');
    });

    it('prefers history.state over a persisted sessionStorage value', () => {
      sessionsStatus.value = 'ready';
      const otherEnded = { ...terminalEnded, id: 'ended-2', title: 'A Different One' };
      sessions.value = [terminalEnded, otherEnded];
      sessionStorage.setItem('sb:active-session', 'ended-2');
      history.pushState({ session: 'ended-1' }, '', window.location.pathname);

      const out = BroadcastBody({ config: CONFIG });
      expect(out).to.include('The One That Ended');
      expect(out).to.not.include('A Different One');
    });
  });

  // The ended-state background photo is a CSS background on .sb-app itself (not a JS-rendered
  // <img> inside EndedState) so it can visually bleed past EndedState's own short box into
  // Also Live/Upcoming below it — see session-broadcast.css's .sb-app:has(.sb-ended)::before.
  // .sb-app's own div is the outermost literal html`` output, not a nested `<${Component}>`
  // call, so — unlike PlayerHost/AlsoLiveCarousel/etc. — its style attribute IS reliably
  // resolved by this mocked harness.
  describe('ended-state background image (--sb-app-ended-bg)', () => {
    const endedSession = {
      id: 'ended-1',
      title: 'The One That Ended',
      description: 'It aired already.',
      startTimeUtc: new Date(Date.now() - 2 * HOUR).toISOString(),
      endTimeUtc: new Date(Date.now() - HOUR).toISOString(),
      youTubeId: 'yt-1',
      isOnline: true,
      sessionPageUrl: '/s/ended-1',
    };

    beforeEach(() => {
      sessionsStatus.value = 'ready';
      sessions.value = [endedSession];
      history.pushState({ session: 'ended-1' }, '', window.location.pathname);
    });

    it('sets the custom property from the authored sessionEndedImageUrl once ended', () => {
      const out = BroadcastBody({
        config: { ...CONFIG, sessionEndedImageUrl: 'https://example.com/ended.png' },
      });
      // The mocked htm-preact HTML-escapes attribute values, so quotes come back as &quot;.
      expect(out).to.include('--sb-app-ended-bg: url(&quot;https://example.com/ended.png&quot;)');
    });

    it('omits the custom property when ended but no image is authored', () => {
      const out = BroadcastBody({ config: CONFIG });
      expect(out).to.not.include('--sb-app-ended-bg');
    });

    it('also sets --sb-app-ended-bg-lg when a larger picture source was authored', () => {
      const out = BroadcastBody({
        config: {
          ...CONFIG,
          sessionEndedImageUrl: 'https://example.com/ended.png',
          sessionEndedImageUrlLarge: 'https://example.com/ended.png?width=2000',
        },
      });
      expect(out).to.include('--sb-app-ended-bg-lg: url(&quot;https://example.com/ended.png?width=2000&quot;)');
    });

    it('omits --sb-app-ended-bg-lg when no larger source was authored', () => {
      const out = BroadcastBody({
        config: { ...CONFIG, sessionEndedImageUrl: 'https://example.com/ended.png' },
      });
      expect(out).to.not.include('--sb-app-ended-bg-lg');
    });

    it('omits the custom property for an unsafe URL (e.g. a javascript: scheme)', () => {
      const out = BroadcastBody({
        config: { ...CONFIG, sessionEndedImageUrl: 'javascript:alert(1)' },
      });
      expect(out).to.not.include('--sb-app-ended-bg');
    });

    it('omits the custom property while a session is still live (not ended)', () => {
      sessions.value = [{
        id: 's-1',
        title: 'Live now',
        startTimeUtc: new Date(Date.now() - HOUR / 2).toISOString(),
        endTimeUtc: new Date(Date.now() + HOUR / 2).toISOString(),
        youTubeId: 'yt-1',
        isOnline: true,
      }];
      history.pushState({ session: 's-1' }, '', window.location.pathname);
      const out = BroadcastBody({
        config: { ...CONFIG, sessionEndedImageUrl: 'https://example.com/ended.png' },
      });
      expect(out).to.not.include('--sb-app-ended-bg');
    });
  });
});
