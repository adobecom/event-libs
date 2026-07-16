import { expect } from '@esm-bundle/chai';
import * as preact from '../../../mocks/deps/htm-preact.js';
import { buildStore } from '../../../../../event-libs/v1/blocks/sessions-guide/store/index.js';
import { buildViewRouter } from '../../../../../event-libs/v1/blocks/sessions-guide/components/ViewRouter.js';
import {
  sessions, scheduled, favorited, liveStreamActiveIds, auth,
} from '../../../../../event-libs/v1/utils/session-store.js';

const BASE_CONFIG = {
  userTz: 'America/Los_Angeles', surface: 'page',
  title: '',
  showConflictModal: false, filterCategories: [], theme: 'dark',
};

function makeStore(activeView, extraState = {}) {
  sessions.value = [];
  scheduled.value = new Set();
  favorited.value = new Set();
  liveStreamActiveIds.value = new Set();
  auth.value = { isLoggedIn: true, isRegistered: true, userFirstName: null };

  const store = buildStore(preact);
  store.SessionGuideContext._current = {
    state: {
      activeView,
      mySessionsTab: 'upcoming',
      myFavoritesTab: 'upcoming',
      activeDay: new Date().toLocaleDateString('en-CA'),
      eventConfig: { ...BASE_CONFIG },
      ...extraState,
    },
    dispatch: () => {},
  };
  return store;
}

describe('ViewRouter', () => {
  it('renders live-upcoming view by default', () => {
    const store = makeStore('live-upcoming');
    const ViewRouter = buildViewRouter(preact, store);
    expect(ViewRouter({})).to.include('sg-view--live-upcoming');
  });

  it('renders my-sessions view', () => {
    const store = makeStore('my-sessions');
    const ViewRouter = buildViewRouter(preact, store);
    expect(ViewRouter({})).to.include('sg-view--my-sessions');
  });

  it('renders my-favorites view', () => {
    const store = makeStore('my-favorites');
    const ViewRouter = buildViewRouter(preact, store);
    expect(ViewRouter({})).to.include('sg-view--my-favorites');
  });

  it('renders on-demand view', () => {
    const store = makeStore('on-demand');
    const ViewRouter = buildViewRouter(preact, store);
    expect(ViewRouter({})).to.include('sg-view--on-demand');
  });

  it('falls back to live-upcoming for unknown activeView', () => {
    const store = makeStore('unknown');
    const ViewRouter = buildViewRouter(preact, store);
    expect(ViewRouter({})).to.include('sg-view--live-upcoming');
  });
});
