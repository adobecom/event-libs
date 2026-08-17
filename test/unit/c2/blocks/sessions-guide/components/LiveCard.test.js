import { expect } from '@esm-bundle/chai';
import * as preact from '../../../../mocks/deps/htm-preact.js';
import { buildStore } from '../../../../../../event-libs/v1/c2/blocks/sessions-guide/store/index.js';
import { buildLiveCard } from '../../../../../../event-libs/v1/c2/blocks/sessions-guide/components/LiveCard.js';
import {
  scheduled, favorited, pendingActions, liveStreamActiveIds,
} from '../../../../../../event-libs/v1/utils/session-store.js';
import { initTierOneEventConfig } from '../../../../../../event-libs/v1/utils/tier-1-event-config.js';

const BASE_CONFIG = {
  title: 'Adobe MAX 2026',
  userTz: 'America/Los_Angeles',
  surface: 'widget',
  filterCategories: [],
  theme: 'dark',
};

const LIVE_SESSION = {
  id: 'session-keynote',
  title: 'MAX Keynote',
  description: 'The opening keynote.',
  track: 'Featured',
  // Relative to "now" (not a fixed date) so the session always lands in the
  // 'live' sessionState regardless of when the suite runs.
  startTimeUtc: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
  endTimeUtc: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
  thumbnailUrl: 'https://example.com/thumb.jpg',
  isOnline: true,
  sessionPageUrl: '/sessions/max-keynote',
  videoAvailable: false,
  inPerson: false,
};

const NO_THUMB_SESSION = { ...LIVE_SESSION, id: 'session-no-thumb', thumbnailUrl: null };

function makeStore(guideConfigOverrides = {}) {
  const store = buildStore(preact);
  store.SessionGuideContext._current = {
    state: { guideConfig: { ...BASE_CONFIG, ...guideConfigOverrides } },
    dispatch: () => {},
  };
  return store;
}

describe('LiveCard', () => {
  before(() => {
    const meta = document.createElement('meta');
    meta.name = 'tier-1-event-config';
    meta.content = JSON.stringify({ trackIcons: { Featured: { icon: 'mainstage', color: '#ff0000' } } });
    document.head.appendChild(meta);
    initTierOneEventConfig();
  });

  beforeEach(() => {
    scheduled.value = new Set();
    favorited.value = new Set();
    pendingActions.value = new Set();
    liveStreamActiveIds.value = new Set();
  });

  it('applies the track color to the thumbnail placeholder background', () => {
    const store = makeStore();
    const LiveCard = buildLiveCard(preact, store);
    const html = LiveCard({ session: NO_THUMB_SESSION });
    expect(html).to.include('background:#ff0000');
  });

  it('renders without throwing', () => {
    const store = makeStore();
    const LiveCard = buildLiveCard(preact, store);
    expect(() => LiveCard({ session: LIVE_SESSION })).to.not.throw();
  });

  it('includes the session title', () => {
    const store = makeStore();
    const LiveCard = buildLiveCard(preact, store);
    expect(LiveCard({ session: LIVE_SESSION })).to.include('MAX Keynote');
  });

  it('renders thumbnail img when thumbnailUrl is set', () => {
    const store = makeStore();
    const LiveCard = buildLiveCard(preact, store);
    const html = LiveCard({ session: LIVE_SESSION });
    expect(html).to.include('<img');
    expect(html).to.include('thumb.jpg');
  });

  it('renders placeholder when thumbnailUrl is null', () => {
    const store = makeStore();
    const LiveCard = buildLiveCard(preact, store);
    const html = LiveCard({ session: NO_THUMB_SESSION });
    expect(html).to.include('sg-live-card__thumb-placeholder');
    expect(html).to.not.include('<img');
  });

  it('renders Watch now button for a live session with a watch destination', () => {
    const store = makeStore();
    const LiveCard = buildLiveCard(preact, store);
    expect(LiveCard({ session: LIVE_SESSION })).to.include('Watch now');
  });

  it('does not render Watch now when the live session has no watch destination', () => {
    const store = makeStore();
    const LiveCard = buildLiveCard(preact, store);
    const noWatch = { ...LIVE_SESSION, isOnline: false, isLivestreamed: false };
    expect(LiveCard({ session: noWatch })).to.not.include('Watch now');
  });

  it('applies is-favorited class when favorited', () => {
    favorited.value = new Set(['session-keynote']);
    const store = makeStore();
    const LiveCard = buildLiveCard(preact, store);
    expect(LiveCard({ session: LIVE_SESSION })).to.include('is-favorited');
  });

  it('shows progress bar element', () => {
    const store = makeStore();
    const LiveCard = buildLiveCard(preact, store);
    expect(LiveCard({ session: LIVE_SESSION })).to.include('sg-live-card__progress-bar');
  });

  it('shows watch now, schedule, and favorite buttons', () => {
    const store = makeStore();
    const LiveCard = buildLiveCard(preact, store);
    const html = LiveCard({ session: LIVE_SESSION });
    expect(html).to.include('sg-live-card__btn--watch');
    expect(html).to.include('sg-live-card__btn--favorite');
    expect(html).to.include('sg-live-card__btn--schedule');
  });

  it('tags the watch button with daa-ll=Watch-Now', () => {
    const store = makeStore();
    const LiveCard = buildLiveCard(preact, store);
    expect(LiveCard({ session: LIVE_SESSION })).to.include('daa-ll="Watch-Now"');
  });

  it('tags the card title button with daa-ll=Session-Card-Open on the widget surface', () => {
    const store = makeStore();
    const LiveCard = buildLiveCard(preact, store);
    expect(LiveCard({ session: LIVE_SESSION })).to.include('daa-ll="Session-Card-Open"');
  });

  it('renders the title as plain text (not an interactive control) on the page surface', () => {
    const store = buildStore(preact);
    store.SessionGuideContext._current = {
      state: { guideConfig: { ...BASE_CONFIG, surface: 'page' } },
      dispatch: () => {},
    };
    const LiveCard = buildLiveCard(preact, store);
    const html = LiveCard({ session: LIVE_SESSION });
    expect(html).to.not.include('daa-ll="Session-Card-Open"');
    expect(html).to.include('<p class="sg-live-card__title">MAX Keynote</p>');
  });

  it('tags the schedule/favorite buttons with Add-/Remove- daa-ll labels matching their state', () => {
    const store = makeStore();
    const LiveCard = buildLiveCard(preact, store);
    expect(LiveCard({ session: LIVE_SESSION })).to.include('daa-ll=Add-to-Schedule');
    expect(LiveCard({ session: LIVE_SESSION })).to.include('daa-ll=Add-to-Favorites');
    scheduled.value = new Set(['session-keynote']);
    favorited.value = new Set(['session-keynote']);
    const html = LiveCard({ session: LIVE_SESSION });
    expect(html).to.include('daa-ll=Remove-from-Schedule');
    expect(html).to.include('daa-ll=Remove-from-Favorites');
  });

  it('omits the schedule button when enableScheduling is false', () => {
    const store = makeStore({ behaviorFlags: { enableScheduling: false } });
    const LiveCard = buildLiveCard(preact, store);
    expect(LiveCard({ session: LIVE_SESSION })).to.not.include('sg-live-card__btn--schedule');
  });

  it('omits the favorite button when enableFavoriting is false', () => {
    const store = makeStore({ behaviorFlags: { enableFavoriting: false } });
    const LiveCard = buildLiveCard(preact, store);
    expect(LiveCard({ session: LIVE_SESSION })).to.not.include('sg-live-card__btn--favorite');
  });

  it('omits the Watch now button when enableWatchNowCtas is false, even with a valid destination', () => {
    const store = makeStore({ behaviorFlags: { enableWatchNowCtas: false } });
    const LiveCard = buildLiveCard(preact, store);
    expect(LiveCard({ session: LIVE_SESSION })).to.not.include('Watch now');
  });
});
