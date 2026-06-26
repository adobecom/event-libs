import { expect } from '@esm-bundle/chai';
import * as preact from '../../../mocks/deps/htm-preact.js';
import { buildStore } from '../../../../../event-libs/v1/blocks/sessions-guide/store/index.js';
import { buildOnDemandView } from '../../../../../event-libs/v1/blocks/sessions-guide/components/OnDemandView.js';

function h(offsetHours) {
  return new Date(Date.now() + offsetHours * 3_600_000).toISOString();
}

const PAST_DESIGN = {
  id: 'd-1', title: 'Design Talk', description: '', track: 'Design',
  startTimeUtc: h(-4), endTimeUtc: h(-3),
  videoAvailable: true, inPerson: false, sessionPageUrl: '/d-1', watchUrl: '/d-1',
  mrStreamId: null, thumbnailUrl: null,
};
const PAST_VIDEO = {
  id: 'v-1', title: 'Video Talk', description: '', track: 'Video',
  startTimeUtc: h(-6), endTimeUtc: h(-5),
  videoAvailable: true, inPerson: false, sessionPageUrl: '/v-1', watchUrl: '/v-1',
  mrStreamId: null, thumbnailUrl: null,
};
const UPCOMING = {
  id: 'u-1', title: 'Upcoming', description: '', track: 'Dev',
  startTimeUtc: h(2), endTimeUtc: h(3),
  videoAvailable: false, inPerson: false, sessionPageUrl: '/u-1', watchUrl: '',
  mrStreamId: null, thumbnailUrl: null,
};

const BASE_CONFIG = {
  userTz: 'America/Los_Angeles', surface: 'page', trackColors: {}, trackIcons: {},
  title: '',
  rfApiUrl: '', rfApiProfileId: '', showConflictModal: false,
  filterCategories: [], mrEnv: 'dev', theme: 'dark', manualOnDemandTransitionTime: null,
};

function makeStore(sessions) {
  const store = buildStore(preact);
  store.SessionGuideContext._current = {
    state: {
      sessions, scheduled: new Set(), favorited: new Set(), isRegistered: true,
      dismissingIds: new Set(), pendingActions: new Set(), liveStreamActiveIds: new Set(),
      activeView: 'on-demand', activeFilters: {}, searchQuery: '',
      eventConfig: { ...BASE_CONFIG },
    },
    dispatch: () => {},
  };
  return store;
}

describe('OnDemandView', () => {
  it('renders the on-demand view container', () => {
    const store = makeStore([]);
    const View = buildOnDemandView(preact, store);
    expect(View({})).to.include('sg-view--on-demand');
  });

  it('shows empty state when no on-demand sessions', () => {
    const store = makeStore([UPCOMING]);
    const View = buildOnDemandView(preact, store);
    expect(View({})).to.include('sg-empty');
  });

  it('renders track rows for on-demand sessions', () => {
    const store = makeStore([PAST_DESIGN, PAST_VIDEO]);
    const View = buildOnDemandView(preact, store);
    const html = View({});
    expect(html).to.include('sg-time-row');
    expect(html).to.include('Design');
    expect(html).to.include('Video');
  });

  it('excludes upcoming sessions', () => {
    const store = makeStore([PAST_DESIGN, UPCOMING]);
    const View = buildOnDemandView(preact, store);
    const html = View({});
    expect(html).to.include('Design'); // on-demand session track label appears
    expect(html).to.not.include('Dev'); // upcoming session track does not appear
  });

  it('groups cards in a carousel strip per track', () => {
    const store = makeStore([PAST_DESIGN, PAST_VIDEO]);
    const View = buildOnDemandView(preact, store);
    const html = View({});
    expect(html).to.include('sg-time-row__cards');
  });
});
