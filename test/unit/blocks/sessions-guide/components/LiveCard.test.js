import { expect } from '@esm-bundle/chai';
import * as preact from '../../../mocks/deps/htm-preact.js';
import { buildStore } from '../../../../../event-libs/v1/blocks/sessions-guide/store/index.js';
import { buildLiveCard } from '../../../../../event-libs/v1/blocks/sessions-guide/components/LiveCard.js';
import {
  scheduled, favorited, pendingActions, liveStreamActiveIds,
} from '../../../../../event-libs/v1/utils/session-store.js';
import { initTrackIconConfig } from '../../../../../event-libs/v1/utils/track-icon-config.js';

const BASE_CONFIG = {
  title: 'Adobe MAX 2026',
  userTz: 'America/Los_Angeles',
  surface: 'widget',
  showConflictModal: false,
  filterCategories: [],
  theme: 'dark',
};

const LIVE_SESSION = {
  id: 'session-keynote',
  title: 'MAX Keynote',
  description: 'The opening keynote.',
  track: 'Featured',
  startTimeUtc: '2026-10-28T16:00:00Z',
  endTimeUtc: '2026-10-28T17:30:00Z',
  thumbnailUrl: 'https://example.com/thumb.jpg',
  watchUrl: '/max',
  sessionPageUrl: '/sessions/max-keynote',
  videoAvailable: false,
  inPerson: false,
};

const NO_THUMB_SESSION = { ...LIVE_SESSION, id: 'session-no-thumb', thumbnailUrl: null };

function makeStore() {
  const store = buildStore(preact);
  store.SessionGuideContext._current = {
    state: { eventConfig: { ...BASE_CONFIG } },
    dispatch: () => {},
  };
  return store;
}

describe('LiveCard', () => {
  before(() => {
    const meta = document.createElement('meta');
    meta.name = 'track-icon-config';
    meta.content = JSON.stringify({ Featured: { icon: 'mainstage', color: '#ff0000' } });
    document.head.appendChild(meta);
    initTrackIconConfig();
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

  it('renders Watch now button when watchUrl is set', () => {
    const store = makeStore();
    const LiveCard = buildLiveCard(preact, store);
    expect(LiveCard({ session: LIVE_SESSION })).to.include('Watch now');
  });

  it('does not render Watch now when watchUrl is empty', () => {
    const store = makeStore();
    const LiveCard = buildLiveCard(preact, store);
    const noWatch = { ...LIVE_SESSION, watchUrl: '' };
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
});
