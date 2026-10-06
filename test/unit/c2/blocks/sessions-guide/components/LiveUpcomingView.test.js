import { expect } from '@esm-bundle/chai';
import * as preact from '../../../../mocks/deps/htm-preact.js';
import { buildStore } from '../../../../../../event-libs/v1/c2/blocks/sessions-guide/store/index.js';
import { buildLiveUpcomingView } from '../../../../../../event-libs/v1/c2/blocks/sessions-guide/components/LiveUpcomingView.js';
import { sessions, liveStreamActiveIds } from '../../../../../../event-libs/v1/utils/session-store.js';

function h(offsetHours) {
  return new Date(Date.now() + offsetHours * 3_600_000).toISOString();
}

// Sessions declared before day-key derivation
const LIVE_SESSION = {
  id: 'live-1', title: 'Live Session', description: 'Live now',
  primaryTrack: 'Design', startTimeUtc: h(-0.5), endTimeUtc: h(1),
  mrStreamId: null, thumbnailUrl: null,
  inPerson: false, sessionPageUrl: '/live-1',
};
const UPCOMING_SESSION = {
  id: 'upcoming-1', title: 'Upcoming Session', description: 'Starts soon',
  primaryTrack: 'Video', startTimeUtc: h(1), endTimeUtc: h(2),
  mrStreamId: null, thumbnailUrl: null,
  inPerson: false, sessionPageUrl: '/upcoming-1',
};
// Small offset (matches LIVE_SESSION's own -0.5h window) to keep the same calendar-day
// assumption other fixtures already rely on, while still being fully in the past.
const AIRED_SESSION = {
  id: 'aired-1', title: 'Recorded Talk', description: 'Already happened',
  primaryTrack: 'Design', startTimeUtc: h(-1), endTimeUtc: h(-0.5),
  mrStreamId: null, thumbnailUrl: null,
  inPerson: false, sessionPageUrl: '/aired-1',
};

// Derive day keys from session times — guarantees match with getSessionDayKey
const TZ = 'America/Los_Angeles';
const fmt = (ms) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(ms));
const TODAY = fmt(Date.parse(LIVE_SESSION.startTimeUtc));
const UPCOMING_DAY = fmt(Date.parse(UPCOMING_SESSION.startTimeUtc));
// Derived from AIRED_SESSION's own timestamp, not TODAY — near a Pacific-time midnight
// boundary, a -1h and a -0.5h offset from "now" can land on different calendar days.
const AIRED_DAY = fmt(Date.parse(AIRED_SESSION.startTimeUtc));

const BASE_CONFIG = {
  userTz: TZ, surface: 'page',
  title: '', filterCategories: [], theme: 'dark',
};

function makeStore(sessionList, activeDay = TODAY, extraState = {}) {
  sessions.value = sessionList;
  liveStreamActiveIds.value = new Set();
  const store = buildStore(preact);
  store.SessionGuideContext._current = {
    state: { activeDay, guideConfig: { ...BASE_CONFIG }, ...extraState },
    dispatch: () => {},
  };
  return store;
}

describe('LiveUpcomingView', () => {
  it('renders the view container', () => {
    const store = makeStore([]);
    const View = buildLiveUpcomingView(preact, store);
    expect(View({})).to.include('sg-view--live-upcoming');
  });

  it('shows live section when live sessions exist', () => {
    const store = makeStore([LIVE_SESSION]);
    const View = buildLiveUpcomingView(preact, store);
    expect(View({})).to.include('sg-carousel-section');
    expect(View({})).to.include('Live sessions');
  });

  it('hides live section when no live sessions', () => {
    const store = makeStore([UPCOMING_SESSION], UPCOMING_DAY);
    const View = buildLiveUpcomingView(preact, store);
    expect(View({})).to.not.include('Live sessions');
  });

  it('shows upcoming section', () => {
    const store = makeStore([UPCOMING_SESSION], UPCOMING_DAY);
    const View = buildLiveUpcomingView(preact, store);
    expect(View({})).to.include('sg-upcoming-section');
  });

  it('shows empty state when no sessions at all', () => {
    const store = makeStore([]);
    const View = buildLiveUpcomingView(preact, store);
    expect(View({})).to.include('sg-empty');
  });

  it('renders time slot rows for upcoming sessions', () => {
    const store = makeStore([UPCOMING_SESSION], UPCOMING_DAY);
    const View = buildLiveUpcomingView(preact, store);
    expect(View({})).to.include('sg-time-row');
  });

  it('does not show a recommended carousel when no recommendedSessions are authored and nothing to fall back to', () => {
    // No sessions at all — unlike the authored case, there's nothing for the
    // deterministic-shuffle fallback (see getRecommendedSessions) to fill dead space with.
    const store = makeStore([]);
    const View = buildLiveUpcomingView(preact, store);
    expect(View({})).to.not.include('sg-carousel-section--recommended');
  });

  // MR streams stay on until ops turns them off, so a finished day can still have a live session.
  // That session stays in the Live carousel; the rest of the day must still list as Previously aired.
  describe('a day with nothing upcoming but a stream still on', () => {
    // Own start time (15 min after AIRED_SESSION) so it would form its own Previously aired row.
    const STILL_STREAMING = {
      ...AIRED_SESSION,
      id: 'mr-live',
      title: 'Keynote Still Streaming',
      mrStreamId: 'mr-1',
      sessionPageUrl: '/mr-live',
      startTimeUtc: h(-0.75),
      endTimeUtc: h(-0.6),
    };
    const countRows = (markup) => (markup.match(/class="sg-time-row"/g) || []).length;

    function render() {
      const store = makeStore([STILL_STREAMING, AIRED_SESSION], AIRED_DAY);
      liveStreamActiveIds.value = new Set(['mr-1']);
      return buildLiveUpcomingView(preact, store)({});
    }

    it('keeps the still-streaming session in the Live carousel', () => {
      const out = render();
      expect(out).to.include('sg-carousel-section--live');
      expect(out).to.not.include('sg-carousel-section--recommended');
    });

    it('still lists the rest of the day as Previously aired, minus the live session', () => {
      const out = render();
      expect(out).to.include('Previously aired');
      expect(out).to.not.include('sg-empty');
      // Two sessions at two start times; only the finished one is listed.
      expect(countRows(out.split('Previously aired')[1])).to.equal(1);
    });
  });

  it('shows a Previously aired session that matches the active search', () => {
    const store = makeStore([AIRED_SESSION], AIRED_DAY, { searchQuery: 'recorded' });
    const View = buildLiveUpcomingView(preact, store);
    expect(View({})).to.include('Previously aired');
  });

  it('hides a Previously aired session that does not match the active search', () => {
    const store = makeStore([AIRED_SESSION], AIRED_DAY, { searchQuery: 'nonexistent term' });
    const View = buildLiveUpcomingView(preact, store);
    expect(View({})).to.not.include('Previously aired');
  });

  it('hides a Previously aired session excluded by the active track filter', () => {
    const store = makeStore([AIRED_SESSION], AIRED_DAY, {
      activeFilters: { primaryTrack: new Set(['Video']) },
    });
    const View = buildLiveUpcomingView(preact, store);
    expect(View({})).to.not.include('Previously aired');
  });

  it('shows "No results found" instead of the default empty state when search matches nothing', () => {
    const store = makeStore([AIRED_SESSION], AIRED_DAY, { searchQuery: 'nonexistent term' });
    const View = buildLiveUpcomingView(preact, store);
    const html = View({});
    expect(html).to.include('No results match your current selection.');
    expect(html).to.not.include('No sessions scheduled for this day.');
  });

  it('shows "No results found" instead of the default empty state when a filter excludes everything', () => {
    const store = makeStore([AIRED_SESSION], AIRED_DAY, {
      activeFilters: { primaryTrack: new Set(['Video']) },
    });
    const View = buildLiveUpcomingView(preact, store);
    const html = View({});
    expect(html).to.include('No results match your current selection.');
    expect(html).to.not.include('No sessions scheduled for this day.');
  });

  // Live sessions ignore search/filters, but a zero-result search hides them so only the
  // no-results message shows (MWPW-209296).
  it('hides the Live sessions carousel when search matches nothing else', () => {
    const store = makeStore([LIVE_SESSION], TODAY, { searchQuery: 'nonexistent term' });
    const View = buildLiveUpcomingView(preact, store);
    const html = View({});
    expect(html).to.not.include('sg-carousel-section--live');
    expect(html).to.include('No results match your current selection.');
  });

  it('keeps the default empty state when no search or filters are active', () => {
    const store = makeStore([]);
    const View = buildLiveUpcomingView(preact, store);
    const html = View({});
    expect(html).to.include('No sessions scheduled for this day.');
    expect(html).to.not.include('No results match your current selection.');
  });
});
