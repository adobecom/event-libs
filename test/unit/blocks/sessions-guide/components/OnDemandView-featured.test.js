import { expect } from '@esm-bundle/chai';
import * as preact from '../../../mocks/deps/htm-preact.js';
import { buildStore } from '../../../../../event-libs/v1/blocks/sessions-guide/store/index.js';
import { buildOnDemandView } from '../../../../../event-libs/v1/blocks/sessions-guide/components/OnDemandView.js';
import { sessions, liveStreamActiveIds } from '../../../../../event-libs/v1/utils/session-store.js';

// Separate file from OnDemandView.test.js, mirroring that file's own separation — keeps
// the recommendedSessions-authored scenario isolated from the "nothing authored"
// default-case tests.
//
// Order-preservation itself is covered directly against getOnDemandRecommendedSessions
// in session-filters.test.js — the mock htm-preact shim here only invokes a component
// when it's the entire template (not nested inside a wrapping <div>, as Carousel is),
// so these tests only verify the recommended section is wired up and gated correctly,
// not the card contents/order.
function h(offsetHours) {
  return new Date(Date.now() + offsetHours * 3_600_000).toISOString();
}

const PAST_DESIGN = {
  id: 'd-1', title: 'Design Talk', description: '', track: 'Design',
  startTimeUtc: h(-4), endTimeUtc: h(-3),
  videoAvailable: true, inPerson: false, sessionPageUrl: '/d-1',
  mrStreamId: null, thumbnailUrl: null,
};
const PAST_VIDEO = {
  id: 'v-1', title: 'Video Talk', description: '', track: 'Video',
  startTimeUtc: h(-6), endTimeUtc: h(-5),
  videoAvailable: true, inPerson: false, sessionPageUrl: '/v-1',
  mrStreamId: null, thumbnailUrl: null,
};

const BASE_CONFIG = {
  userTz: 'America/Los_Angeles', surface: 'page',
  title: '', filterCategories: [], theme: 'dark', recommendedSessions: ['v-1', 'd-1'],
};

function makeStore(sessionList, activeFilters = {}) {
  sessions.value = sessionList;
  liveStreamActiveIds.value = new Set();
  const store = buildStore(preact);
  store.SessionGuideContext._current = {
    state: {
      activeView: 'on-demand', activeFilters, searchQuery: '',
      guideConfig: { ...BASE_CONFIG },
    },
    dispatch: () => {},
  };
  return store;
}

describe('OnDemandView (recommendedSessions authored)', () => {
  it('renders a recommended carousel section when a match exists', () => {
    const store = makeStore([PAST_DESIGN, PAST_VIDEO]);
    const View = buildOnDemandView(preact, store);
    const html = View({});
    expect(html).to.include('sg-carousel-section--recommended');
    expect(html).to.include('Recommended');
  });

  it('ignores the viewer\'s active filters — recommended is a curated list, not a filtered one', () => {
    // A track filter that excludes PAST_VIDEO from the byTrack grouping below must
    // not remove the recommended section above, since it's built from onDemandRaw,
    // not the filtered `available` list.
    const store = makeStore([PAST_DESIGN, PAST_VIDEO], { track: new Set(['Design']) });
    const View = buildOnDemandView(preact, store);
    const html = View({});
    expect(html).to.include('sg-carousel-section--recommended');
  });
});
