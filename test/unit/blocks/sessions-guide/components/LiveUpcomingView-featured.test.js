import { expect } from '@esm-bundle/chai';
import * as preact from '../../../mocks/deps/htm-preact.js';
import { buildStore } from '../../../../../event-libs/v1/blocks/sessions-guide/store/index.js';
import { buildLiveUpcomingView } from '../../../../../event-libs/v1/blocks/sessions-guide/components/LiveUpcomingView.js';
import { sessions, liveStreamActiveIds } from '../../../../../event-libs/v1/utils/session-store.js';
import { initTierOneEventConfig } from '../../../../../event-libs/v1/utils/tier-1-event-config.js';

// Separate file from LiveUpcomingView.test.js: initTierOneEventConfig() only ever
// parses metadata once per module instance, so featuredSessions has to be authored
// before any other test in this file's module graph runs.
//
// Order-preservation itself is covered directly against getFeaturedSessions in
// session-filters.test.js — the mock htm-preact shim here only invokes a component
// when it's the entire template (not nested inside a wrapping <div>, as Carousel is),
// so this test only verifies the featured section is wired up and gated correctly
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
  title: '', filterCategories: [], theme: 'dark',
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

describe('LiveUpcomingView (featuredSessions authored)', () => {
  before(() => {
    const meta = document.createElement('meta');
    meta.name = 'tier-1-event-config';
    meta.content = JSON.stringify({ featuredSessions: ['upcoming-1'] });
    document.head.appendChild(meta);
    initTierOneEventConfig();
  });

  it('renders a featured carousel section when nothing is live and a match exists', () => {
    const store = makeStore([UPCOMING_SESSION], UPCOMING_DAY);
    const View = buildLiveUpcomingView(preact, store);
    expect(View({})).to.include('sg-carousel-section--featured');
  });
});
