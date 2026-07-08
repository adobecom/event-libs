import { expect } from '@esm-bundle/chai';
import * as preact from '../../../mocks/deps/htm-preact.js';
import { buildStore } from '../../../../../event-libs/v1/blocks/sessions-guide/store/index.js';
import { buildMySessionsView } from '../../../../../event-libs/v1/blocks/sessions-guide/components/MySessionsView.js';
import {
  sessions, scheduled, favorited, liveStreamActiveIds, auth,
} from '../../../../../event-libs/v1/utils/session-store.js';

function h(offsetHours) {
  return new Date(Date.now() + offsetHours * 3_600_000).toISOString();
}

const UPCOMING_SESSION = {
  id: 'u-1', title: 'Upcoming', description: '', track: 'Design',
  startTimeUtc: h(2), endTimeUtc: h(3),
  videoAvailable: false, inPerson: false, sessionPageUrl: '/u-1', watchUrl: '',
  mrStreamId: null, thumbnailUrl: null,
};
const PAST_SESSION = {
  id: 'p-1', title: 'Past', description: '', track: 'Video',
  startTimeUtc: h(-4), endTimeUtc: h(-3),
  videoAvailable: true, inPerson: false, sessionPageUrl: '/p-1', watchUrl: '/p-1',
  mrStreamId: null, thumbnailUrl: null,
};

const BASE_CONFIG = {
  userTz: 'America/Los_Angeles', surface: 'page', trackColors: {}, trackIcons: {},
  title: '', showConflictModal: false, filterCategories: [], theme: 'dark',
};

function makeStore({
  isRegistered = true,
  isLoggedIn = true,
  sessionList = [],
  scheduledIds = new Set(),
  mySessionsTab = 'upcoming',
  activeDay = new Intl.DateTimeFormat('en-CA', { timeZone: BASE_CONFIG.userTz }).format(new Date()),
} = {}) {
  auth.value = { isLoggedIn, isRegistered, userFirstName: null };
  sessions.value = sessionList;
  scheduled.value = scheduledIds;
  favorited.value = new Set();
  liveStreamActiveIds.value = new Set();

  const store = buildStore(preact);
  store.SessionGuideContext._current = {
    state: { mySessionsTab, activeDay, eventConfig: { ...BASE_CONFIG } },
    dispatch: () => {},
  };
  return store;
}

describe('MySessionsView', () => {
  it('shows RegistrationPrompt when not registered', () => {
    const store = makeStore({ isRegistered: false, isLoggedIn: false });
    const View = buildMySessionsView(preact, store);
    expect(View({})).to.include('sg-reg-prompt');
    expect(View({})).to.not.include('sg-view--my-sessions');
  });

  it('shows RegistrationPrompt when logged in but not registered', () => {
    const store = makeStore({ isRegistered: false, isLoggedIn: true });
    const View = buildMySessionsView(preact, store);
    expect(View({})).to.include('sg-reg-prompt');
  });

  it('renders the my-sessions view when registered', () => {
    const store = makeStore();
    const View = buildMySessionsView(preact, store);
    expect(View({})).to.include('sg-view--my-sessions');
  });

  it('shows sub-tabs when both upcoming and on-demand sessions are scheduled', () => {
    const store = makeStore({
      sessionList: [UPCOMING_SESSION, PAST_SESSION],
      scheduledIds: new Set(['u-1', 'p-1']),
    });
    const View = buildMySessionsView(preact, store);
    const html = View({});
    expect(html).to.include('Upcoming');
    expect(html).to.include('On demand');
  });

  it('shows empty state when no sessions are scheduled', () => {
    const store = makeStore({ sessionList: [UPCOMING_SESSION] });
    const View = buildMySessionsView(preact, store);
    expect(View({})).to.include('sg-my-sessions__empty');
  });

  it('shows scheduled upcoming sessions', () => {
    const store = makeStore({ sessionList: [UPCOMING_SESSION], scheduledIds: new Set(['u-1']) });
    const View = buildMySessionsView(preact, store);
    expect(View({})).to.include('sg-time-row');
  });

  it('shows on-demand tab content when mySessionsTab is on-demand', () => {
    const store = makeStore({
      sessionList: [PAST_SESSION], scheduledIds: new Set(['p-1']), mySessionsTab: 'on-demand',
    });
    const View = buildMySessionsView(preact, store);
    expect(View({})).to.include('sg-my-sessions__on-demand');
  });

  it('shows empty state when no sessions are scheduled on the on-demand tab', () => {
    const store = makeStore({ mySessionsTab: 'on-demand' });
    const View = buildMySessionsView(preact, store);
    expect(View({})).to.include('sg-my-sessions__empty');
  });
});
