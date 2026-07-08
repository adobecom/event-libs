import { expect } from '@esm-bundle/chai';
import * as preact from '../../../mocks/deps/htm-preact.js';
import { buildStore } from '../../../../../event-libs/v1/blocks/sessions-guide/store/index.js';
import { buildLiveUpcomingView } from '../../../../../event-libs/v1/blocks/sessions-guide/components/LiveUpcomingView.js';

function h(offsetHours) {
  return new Date(Date.now() + offsetHours * 3_600_000).toISOString();
}

// Sessions declared before day-key derivation
const LIVE_SESSION = {
  id: 'live-1', title: 'Live Session', description: 'Live now',
  track: 'Design', startTimeUtc: h(-0.5), endTimeUtc: h(1),
  mrStreamId: null, thumbnailUrl: null, watchUrl: '',
  videoAvailable: false, inPerson: false, sessionPageUrl: '/live-1',
};
const UPCOMING_SESSION = {
  id: 'upcoming-1', title: 'Upcoming Session', description: 'Starts soon',
  track: 'Video', startTimeUtc: h(1), endTimeUtc: h(2),
  mrStreamId: null, thumbnailUrl: null, watchUrl: '',
  videoAvailable: false, inPerson: false, sessionPageUrl: '/upcoming-1',
};

// Derive day keys from session times — guarantees match with getSessionDayKey
const TZ = 'America/Los_Angeles';
const fmt = (ms) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(ms));
const TODAY = fmt(Date.parse(LIVE_SESSION.startTimeUtc));
const UPCOMING_DAY = fmt(Date.parse(UPCOMING_SESSION.startTimeUtc));

const BASE_CONFIG = {
  userTz: TZ, surface: 'page', trackColors: {}, trackIcons: {},
  title: '',
  rfApiUrl: '', rfApiProfileId: '', showConflictModal: false,
  filterCategories: [], mrEnv: 'dev', theme: 'dark', manualOnDemandTransitionTime: null,
};

function makeStore(sessions, activeDay = TODAY) {
  const store = buildStore(preact);
  store.SessionGuideContext._current = {
    state: {
      sessions,
      activeDay,
      liveStreamActiveIds: new Set(),
      scheduled: new Set(),
      favorited: new Set(),
      isRegistered: true,
      eventConfig: { ...BASE_CONFIG },
    },
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
    expect(View({})).to.include('sg-live-section');
    expect(View({})).to.include('Live now');
  });

  it('hides live section when no live sessions', () => {
    const store = makeStore([UPCOMING_SESSION], UPCOMING_DAY);
    const View = buildLiveUpcomingView(preact, store);
    expect(View({})).to.not.include('Live now');
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
});
