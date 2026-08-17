import { expect } from '@esm-bundle/chai';
import * as preact from '../../../../mocks/deps/htm-preact.js';
import { buildStore } from '../../../../../../event-libs/v1/c2/blocks/sessions-guide/store/index.js';
import { buildLiveUpcomingView } from '../../../../../../event-libs/v1/c2/blocks/sessions-guide/components/LiveUpcomingView.js';
import { sessions, liveStreamActiveIds } from '../../../../../../event-libs/v1/utils/session-store.js';

// Separate file from LiveUpcomingView.test.js, mirroring that file's own separation —
// keeps the recommendedSessions-authored scenario isolated from the "nothing authored"
// default-case tests.
//
// Order-preservation itself is covered directly against getRecommendedSessions in
// session-filters.test.js — the mock htm-preact shim here only invokes a component
// when it's the entire template (not nested inside a wrapping <div>, as Carousel is),
// so this test only verifies the recommended section is wired up and gated correctly
// (shown only when nothing's live), not the card contents/order.
function h(offsetHours) {
  return new Date(Date.now() + offsetHours * 3_600_000).toISOString();
}

const UPCOMING_SESSION = {
  id: 'upcoming-1', title: 'Upcoming Session', description: 'Starts soon',
  track: 'Video', startTimeUtc: h(1), endTimeUtc: h(2),
  mrStreamId: null, thumbnailUrl: null,
  videoAvailable: false, inPerson: false, sessionPageUrl: '/upcoming-1',
};

const TZ = 'America/Los_Angeles';
const fmt = (ms) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(ms));
const UPCOMING_DAY = fmt(Date.parse(UPCOMING_SESSION.startTimeUtc));

const BASE_CONFIG = {
  userTz: TZ, surface: 'page',
  title: '', filterCategories: [], theme: 'dark', recommendedSessions: ['upcoming-1'],
};

function makeStore(sessionList, activeDay) {
  sessions.value = sessionList;
  liveStreamActiveIds.value = new Set();
  const store = buildStore(preact);
  store.SessionGuideContext._current = {
    state: { activeDay, guideConfig: { ...BASE_CONFIG } },
    dispatch: () => {},
  };
  return store;
}

describe('LiveUpcomingView (recommendedSessions authored)', () => {
  it('renders a recommended carousel section when nothing is live and a match exists', () => {
    const store = makeStore([UPCOMING_SESSION], UPCOMING_DAY);
    const View = buildLiveUpcomingView(preact, store);
    expect(View({})).to.include('sg-carousel-section--recommended');
  });
});
