import { expect } from '@esm-bundle/chai';
import * as preact from '../../../../mocks/deps/htm-preact.js';
import { buildStore } from '../../../../../../event-libs/v1/c2/blocks/sessions-guide/store/index.js';
import { buildMyFavoritesView } from '../../../../../../event-libs/v1/c2/blocks/sessions-guide/components/MyFavoritesView.js';
import {
  sessions, scheduled, favorited, liveStreamActiveIds, auth,
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

const BASE_CONFIG = {
  userTz: 'America/Los_Angeles', surface: 'page',
  title: '', filterCategories: [], theme: 'dark', registerUrl: '/register-test',
};

function makeStore({
  isRegistered = true,
  isLoggedIn = true,
  sessionList = [],
  favoritedIds = new Set(),
  myFavoritesTab = 'upcoming',
  activeDay = new Intl.DateTimeFormat('en-CA', { timeZone: BASE_CONFIG.userTz }).format(new Date()),
  activeFilters = {},
  searchQuery = '',
} = {}) {
  auth.value = { isLoggedIn, isRegistered, userFirstName: null };
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

  it('shows empty state when no sessions are favorited', () => {
    const store = makeStore({ sessionList: [UPCOMING_SESSION] });
    const View = buildMyFavoritesView(preact, store);
    expect(View({})).to.include('sg-my-favorites__empty');
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
    expect(html).to.include('No results found');
    expect(html).to.not.include('sg-my-favorites__empty');
  });

  it('shows "No results found" instead of the default empty state when a filter excludes every favorited session', () => {
    const store = makeStore({
      sessionList: [UPCOMING_SESSION, PAST_SESSION],
      favoritedIds: new Set(['u-1', 'p-1']),
      activeFilters: { primaryTrack: new Set(['Nonexistent']) },
    });
    const View = buildMyFavoritesView(preact, store);
    const html = View({});
    expect(html).to.include('No results found');
    expect(html).to.not.include('sg-my-favorites__empty');
  });
});
