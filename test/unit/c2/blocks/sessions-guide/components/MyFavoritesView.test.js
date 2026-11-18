import { expect } from '@esm-bundle/chai';
import * as preact from '../../../../mocks/deps/htm-preact.js';
import { buildStore } from '../../../../../../event-libs/v1/c2/blocks/sessions-guide/store/index.js';
import { buildMyFavoritesView } from '../../../../../../event-libs/v1/c2/blocks/sessions-guide/components/MyFavoritesView.js';
import {
  sessions, scheduled, favorited, liveStreamActiveIds, auth, rfAuthStatus,
} from '../../../../../../event-libs/v1/utils/session-store.js';

// Offset from real "now" (the component derives session state from the real clock, so
// the sign must stay relative to it), but clamped to never cross the LA midnight boundary
// in either direction — otherwise this flakes whenever the suite runs near LA midnight,
// since `activeDay` below is pinned to "today" in LA time. Clamping is monotonic in the
// requested magnitude, so relative ordering between two calls (e.g. a session's start vs
// end) is always preserved.
function h(offsetHours) {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles', hour: 'numeric', minute: 'numeric', second: 'numeric', hour12: false,
  }).formatToParts(now).reduce((acc, p) => ({ ...acc, [p.type]: Number(p.value) }), {});
  const msSinceMidnightLA = ((parts.hour % 24) * 3600 + parts.minute * 60 + parts.second) * 1000;
  const msUntilMidnightLA = 24 * 3_600_000 - msSinceMidnightLA;
  const requestedMs = offsetHours * 3_600_000;
  const safeMs = requestedMs >= 0
    ? Math.min(requestedMs, msUntilMidnightLA / 2)
    : -Math.min(-requestedMs, msSinceMidnightLA / 2);
  return new Date(now.getTime() + safeMs).toISOString();
}

const UPCOMING_SESSION = {
  id: 'u-1', title: 'Upcoming', description: '', primaryTrack: 'Design',
  startTimeUtc: h(2), endTimeUtc: h(3),
  inPerson: false, sessionPageUrl: '/u-1',
  mrStreamId: null, thumbnailUrl: null,
};
const PAST_SESSION = {
  id: 'p-1', title: 'Past', description: '', primaryTrack: 'Video',
  startTimeUtc: h(-4), endTimeUtc: h(-3),
  inPerson: false, sessionPageUrl: '/p-1',
  mrStreamId: null, thumbnailUrl: null,
};

const CROSS_DAY_SESSIONS = [
  {
    ...PAST_SESSION, id: 'day-1', title: 'Earlier day', primaryTrack: 'Design',
    startTimeUtc: '2020-01-01T18:00:00Z', endTimeUtc: '2020-01-01T19:00:00Z',
  },
  {
    ...PAST_SESSION, id: 'day-2', title: 'Later day', primaryTrack: 'Video',
    startTimeUtc: '2020-01-02T18:00:00Z', endTimeUtc: '2020-01-02T19:00:00Z',
  },
];

const LIVE_NOW_SESSION = {
  id: 'l-1', title: 'Live now', description: '', primaryTrack: 'Design',
  startTimeUtc: h(-0.25), endTimeUtc: h(0.25),
  inPerson: false, sessionPageUrl: '/l-1',
  mrStreamId: null, thumbnailUrl: null,
};

const BASE_CONFIG = {
  userTz: 'America/Los_Angeles', surface: 'page',
  title: '', filterCategories: [], theme: 'dark', registerUrl: '/register-test',
};

function makeStore({
  isRegistered = true,
  isLoggedIn = true,
  rfStatus = 'ready',
  sessionList = [],
  favoritedIds = new Set(),
  myFavoritesTab = 'upcoming',
  activeDay = new Intl.DateTimeFormat('en-CA', { timeZone: BASE_CONFIG.userTz }).format(new Date()),
  activeFilters = {},
  searchQuery = '',
} = {}) {
  auth.value = { isLoggedIn, isRegistered, userFirstName: null };
  rfAuthStatus.value = rfStatus;
  sessions.value = sessionList;
  scheduled.value = new Set();
  favorited.value = favoritedIds;
  liveStreamActiveIds.value = new Set();

  const store = buildStore(preact);
  store.SessionGuideContext._current = {
    state: {
      myFavoritesTab, activeDay, activeFilters, searchQuery, guideConfig: { ...BASE_CONFIG },
    },
    dispatch: () => {},
  };
  return store;
}

describe('MyFavoritesView', () => {
  it('renders nothing when logged out', () => {
    const store = makeStore({ isRegistered: false, isLoggedIn: false });
    const View = buildMyFavoritesView(preact, store);
    expect(View({})).to.be.null;
  });

  // Regression for the refresh-on-My-favorites bounce: while auth is still resolving
  // (isLoggedIn null, isRegistered undefined — see isAuthResolved()'s own comment), the
  // view shows the same loading treatment as the shells' own sessionsStatus gate, rather
  // than asserting the visitor is unauthorized (or leaving a bare blank view) either way.
  // makeStore()'s own default would coerce an explicit `isRegistered: undefined` back to
  // `true` (a destructuring default triggers on undefined, not just a missing key), so
  // isRegistered is reset directly on the signal after construction instead.
  it('shows the loading state while auth is still resolving, not yet an unauthorized verdict', () => {
    const store = makeStore({ isLoggedIn: null });
    auth.value = { ...auth.value, isRegistered: undefined };
    const View = buildMyFavoritesView(preact, store);
    expect(View({})).to.include('sg-loading-state');
  });

  it('renders the my-favorites view when registered', () => {
    const store = makeStore();
    const View = buildMyFavoritesView(preact, store);
    expect(View({})).to.include('sg-view--my-favorites');
  });

  it('renders saved favorites post-event for a token-bearing unregistered visitor', () => {
    const store = makeStore({
      isRegistered: false, sessionList: [PAST_SESSION], favoritedIds: new Set(['p-1']),
    });
    const View = buildMyFavoritesView(preact, store);
    expect(View({})).to.include('sg-my-favorites__on-demand');
    expect(View({})).to.include('track="Video"');
  });

  ['2020-01-02', ''].forEach((activeDay) => {
    it(`shows only favorited on-demand sessions across all days post-event with activeDay="${activeDay}"`, () => {
      const store = makeStore({
        sessionList: [...CROSS_DAY_SESSIONS, { ...CROSS_DAY_SESSIONS[0], id: 'other', primaryTrack: 'Unselected' }],
        favoritedIds: new Set(['day-1', 'day-2']),
        activeDay,
      });
      const html = buildMyFavoritesView(preact, store)({});
      expect(html).to.include('track="Design"');
      expect(html).to.include('track="Video"');
      expect(html).to.not.include('track="Unselected"');
    });
  });

  [
    { name: 'search', searchQuery: 'Earlier day' },
    { name: 'facets', activeFilters: { primaryTrack: new Set(['Design']) } },
  ].forEach(({ name, ...filters }) => {
    it(`still applies ${name} to the post-event all-days selection`, () => {
      const store = makeStore({
        sessionList: CROSS_DAY_SESSIONS, favoritedIds: new Set(['day-1', 'day-2']),
        activeDay: '2020-01-02', ...filters,
      });
      const html = buildMyFavoritesView(preact, store)({});
      expect(html).to.include('track="Design"');
      expect(html).to.not.include('track="Video"');
    });
  });

  [UPCOMING_SESSION, LIVE_NOW_SESSION].forEach((session) => {
    it(`retains the selected-day scope while the catalog has ${session.title} sessions`, () => {
      const store = makeStore({
        sessionList: [...CROSS_DAY_SESSIONS, session], favoritedIds: new Set(['day-1', 'day-2']),
        activeDay: '2020-01-02', myFavoritesTab: 'on-demand',
      });
      const html = buildMyFavoritesView(preact, store)({});
      expect(html).to.include('track="Video"');
      expect(html).to.not.include('track="Design"');
    });
  });

  it('waits for post-event RF auth instead of leaving an unregistered visitor blank', () => {
    const store = makeStore({ isRegistered: false, rfStatus: 'loading', sessionList: [PAST_SESSION] });
    const View = buildMyFavoritesView(preact, store);
    expect(View({})).to.include('sg-loading-state');
  });

  it('does not render a personal view for a confirmed tokenless post-event visitor', () => {
    const store = makeStore({ rfStatus: 'missing', sessionList: [PAST_SESSION] });
    const View = buildMyFavoritesView(preact, store);
    expect(View({})).to.be.null;
  });

  it('shows an explicit auth lookup error rather than an empty favorites list', () => {
    const store = makeStore({ isRegistered: false, rfStatus: 'error', sessionList: [PAST_SESSION] });
    const View = buildMyFavoritesView(preact, store);
    expect(View({})).to.include('role="alert"');
    expect(View({})).to.include('Unable to load your favorites.');
  });

  it('still blocks unregistered visitors before/during the event even with RF credentials', () => {
    const store = makeStore({ isRegistered: false, sessionList: [UPCOMING_SESSION] });
    const View = buildMyFavoritesView(preact, store);
    expect(View({})).to.be.null;
  });

  it('shows empty state when no sessions are favorited', () => {
    const store = makeStore({ sessionList: [UPCOMING_SESSION] });
    const View = buildMyFavoritesView(preact, store);
    expect(View({})).to.include('sg-my-favorites__empty');
    expect(View({})).to.include('See live & upcoming');
  });

  it('shows favorited upcoming sessions', () => {
    const store = makeStore({ sessionList: [UPCOMING_SESSION], favoritedIds: new Set(['u-1']) });
    const View = buildMyFavoritesView(preact, store);
    expect(View({})).to.include('sg-time-row');
  });

  it('shows "No results found" instead of the default empty state when search excludes every favorited session', () => {
    const store = makeStore({
      sessionList: [UPCOMING_SESSION, PAST_SESSION],
      favoritedIds: new Set(['u-1', 'p-1']),
      searchQuery: 'nonexistent term',
    });
    const View = buildMyFavoritesView(preact, store);
    const html = View({});
    expect(html).to.include('No results match your current selection.');
    expect(html).to.not.include('sg-my-favorites__empty');
  });

  it('shows the Live carousel normally, and hides it when search matches nothing', () => {
    const base = { sessionList: [LIVE_NOW_SESSION], favoritedIds: new Set(['l-1']) };
    const View = buildMyFavoritesView(preact, makeStore(base));
    expect(View({})).to.include('sg-carousel-section--live');
    const html = buildMyFavoritesView(preact, makeStore({ ...base, searchQuery: 'nonexistent term' }))({});
    expect(html).to.not.include('sg-carousel-section--live');
    expect(html).to.include('No results match your current selection.');
  });

  it('shows "No results found" instead of the default empty state when a filter excludes every favorited session', () => {
    const store = makeStore({
      sessionList: [UPCOMING_SESSION, PAST_SESSION],
      favoritedIds: new Set(['u-1', 'p-1']),
      activeFilters: { primaryTrack: new Set(['Nonexistent']) },
    });
    const View = buildMyFavoritesView(preact, store);
    const html = View({});
    expect(html).to.include('No results match your current selection.');
    expect(html).to.not.include('sg-my-favorites__empty');
  });
});
