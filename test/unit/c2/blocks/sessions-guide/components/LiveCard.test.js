import { expect } from '@esm-bundle/chai';
import * as preact from '../../../../mocks/deps/htm-preact.js';
import { buildStore } from '../../../../../../event-libs/v1/c2/blocks/sessions-guide/store/index.js';
import { buildLiveCard, computeProgressPct } from '../../../../../../event-libs/v1/c2/blocks/sessions-guide/components/LiveCard.js';
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
  primaryTrack: 'Featured',
  // Relative to "now" (not a fixed date) so the session always lands in the
  // 'live' sessionState regardless of when the suite runs.
  startTimeUtc: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
  endTimeUtc: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
  thumbnailUrl: 'https://example.com/thumb.jpg',
  isOnline: true,
  sessionPageUrl: '/sessions/max-keynote',
  inPerson: false,
};

const NO_THUMB_SESSION = { ...LIVE_SESSION, id: 'session-no-thumb', thumbnailUrl: null };

// "Additional Event Site Tracks" is multi-select upstream; only the first is badged.
const LIVE_TWO_TRACKS = {
  ...LIVE_SESSION,
  id: 'session-two-tracks',
  additionalTracks: ['Branding', 'Ignored Second'],
};

const PAST_TWO_TRACKS = {
  ...LIVE_TWO_TRACKS,
  id: 'session-past-two-tracks',
  startTimeUtc: new Date(Date.now() - 90 * 60 * 1000).toISOString(),
  endTimeUtc: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
};

const UPCOMING_SESSION = {
  ...LIVE_SESSION,
  id: 'session-upcoming',
  startTimeUtc: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  endTimeUtc: new Date(Date.now() + 90 * 60 * 1000).toISOString(),
};

const ON_DEMAND_SESSION = {
  ...LIVE_SESSION,
  id: 'session-past',
  startTimeUtc: new Date(Date.now() - 90 * 60 * 1000).toISOString(),
  endTimeUtc: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
};

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

  it('labels the watch button "Watch on demand" once the session has gone on demand', () => {
    const store = makeStore();
    const LiveCard = buildLiveCard(preact, store);
    const out = LiveCard({ session: ON_DEMAND_SESSION });
    expect(out).to.include('Watch on demand');
    expect(out).to.not.include('Watch now');
    expect(out).to.include('daa-ll="Watch-On-Demand"');
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
    expect(LiveCard({ session: LIVE_SESSION })).to.include('daa-ll="Add-to-Schedule"');
    expect(LiveCard({ session: LIVE_SESSION })).to.include('daa-ll="Add-to-Favorites"');
    scheduled.value = new Set(['session-keynote']);
    favorited.value = new Set(['session-keynote']);
    const html = LiveCard({ session: LIVE_SESSION });
    expect(html).to.include('daa-ll="Remove-from-Schedule"');
    expect(html).to.include('daa-ll="Remove-from-Favorites"');
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

  // The time only earns its place on an upcoming Recommended card: a live card shows a
  // progress bar and remaining duration instead, and a start time is noise once on demand.
  describe('time display', () => {
    const render = (session, props) => {
      const LiveCard = buildLiveCard(preact, makeStore());
      return LiveCard({ session, ...props });
    };

    it('shows the time range on an upcoming Recommended card', () => {
      const out = render(UPCOMING_SESSION, { variant: 'recommended' });
      expect(out).to.include('sg-live-card__time');
      // en dash separator — proves a start–end range rendered, not a bare start time
      expect(out).to.include('\u2013');
    });

    it('omits the time on a live card', () => {
      expect(render(LIVE_SESSION, {})).to.not.include('sg-live-card__time');
    });

    it('omits the time on an upcoming card outside the Recommended carousel', () => {
      expect(render(UPCOMING_SESSION, { variant: 'live' })).to.not.include('sg-live-card__time');
    });

    it('omits the time on a Recommended card that has gone on demand', () => {
      expect(render(ON_DEMAND_SESSION, { variant: 'recommended' })).to.not.include('sg-live-card__time');
    });
  });
  // A live session with an additional event-site track badges both tracks side by side in
  // the time's slot, and drops the "+1" that would otherwise double count the second one.
  describe('additional track badge', () => {
    const render = (session, props) => {
      const LiveCard = buildLiveCard(preact, makeStore());
      return LiveCard({ session, ...props });
    };

    it('renders a second badge for the first additional track on a live card', () => {
      const out = render(LIVE_TWO_TRACKS, {});
      expect(out).to.include('sg-live-card__track-extra');
      expect(out).to.include('Branding');
    });

    it('uses only the first additional track', () => {
      expect(render(LIVE_TWO_TRACKS, {})).to.not.include('Ignored Second');
    });

    it('drops the +1 count when the second track is badged', () => {
      expect(render(LIVE_TWO_TRACKS, {})).to.not.include('sg-category-badge__count');
    });

    // The second slot holds the time for an upcoming Recommended card, so the extra badge
    // stands down there and the "+1" carries the additional track instead.
    it('keeps the +1 count on an upcoming Recommended card, where the time takes the slot', () => {
      const upcoming = {
        ...LIVE_TWO_TRACKS,
        startTimeUtc: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        endTimeUtc: new Date(Date.now() + 90 * 60 * 1000).toISOString(),
      };
      const out = render(upcoming, { variant: 'recommended' });
      expect(out).to.not.include('sg-live-card__track-extra');
      expect(out).to.include('sg-category-badge__count');
    });

    it('badges both tracks on a past Recommended card, same as a live one', () => {
      const out = render(PAST_TWO_TRACKS, { variant: 'recommended' });
      expect(out).to.include('sg-live-card__track-extra');
      expect(out).to.include('Branding');
      expect(out).to.not.include('sg-category-badge__count');
      expect(out).to.not.include('sg-live-card__time');
    });

    it('renders no second badge for a live session with no additional tracks', () => {
      expect(render(LIVE_SESSION, {})).to.not.include('sg-live-card__track-extra');
    });
  });
  // The favourite CTA is icon-only now, so the accessible name lives entirely in aria-label.
  describe('favorite CTA', () => {
    it('renders the heart with no visible label text', () => {
      const LiveCard = buildLiveCard(preact, makeStore());
      const out = LiveCard({ session: LIVE_SESSION });
      expect(out).to.include('sg-live-card__btn--favorite');
      expect(out).to.not.include('sg-live-card__btn-label');
      expect(out).to.not.include('>Favorite<');
    });

    it('keeps an accessible name that names the session', () => {
      const LiveCard = buildLiveCard(preact, makeStore());
      expect(LiveCard({ session: LIVE_SESSION })).to.include('Add MAX Keynote to favorites');
    });
  });

  // Per the Figma "Also Live" card (session-broadcast's carousel), the live variant shows a
  // trailing duration next to Watch Now/Favorite — a different slot than the progress-bar
  // overlay's own duration label (sg-live-card__duration), which already existed.
  describe('actions-row duration (live variant only)', () => {
    it('shows the session duration next to the actions for the live variant', () => {
      const LiveCard = buildLiveCard(preact, makeStore());
      const out = LiveCard({ session: LIVE_SESSION, variant: 'live' });
      expect(out).to.include('sg-live-card__actions-time');
    });

    it('omits it for the recommended variant', () => {
      const LiveCard = buildLiveCard(preact, makeStore());
      const out = LiveCard({ session: UPCOMING_SESSION, variant: 'recommended' });
      expect(out).to.not.include('sg-live-card__actions-time');
    });
  });

  // Real click-triggered branching (which path handleCardClick/handleWatch take) can't be
  // exercised by this string-render harness — no test in this suite simulates a real click,
  // since the htm-preact stub renders function attrs as `""`, losing the reference entirely.
  // These guard the render contract for session-broadcast's integration: the new optional
  // props are accepted without throwing and don't change markup on the surfaces that ignore
  // them. Interactive verification happens via a preview harness in a real browser instead.
  describe('onCardClick / onWatchSamePage (session-broadcast integration)', () => {
    function pageSurfaceStore() {
      const store = buildStore(preact);
      store.SessionGuideContext._current = {
        state: { guideConfig: { ...BASE_CONFIG, surface: 'page' } },
        dispatch: () => {},
      };
      return store;
    }

    it('accepts onCardClick/onWatchSamePage without throwing, on the page surface', () => {
      const LiveCard = buildLiveCard(preact, pageSurfaceStore());
      expect(() => LiveCard({
        session: LIVE_SESSION, onCardClick: () => {}, onWatchSamePage: () => {},
      })).to.not.throw();
    });

    it('renders identical markup whether or not onCardClick/onWatchSamePage are supplied', () => {
      const LiveCard = buildLiveCard(preact, pageSurfaceStore());
      const withCallbacks = LiveCard({
        session: LIVE_SESSION, onCardClick: () => {}, onWatchSamePage: () => {},
      });
      const without = LiveCard({ session: LIVE_SESSION });
      expect(withCallbacks).to.equal(without);
    });
  });

  describe('computeProgressPct', () => {
    const session = { startTimeUtc: '2026-01-01T00:00:00.000Z', endTimeUtc: '2026-01-01T01:00:00.000Z' };

    it('is 0 before the session starts', () => {
      expect(computeProgressPct(session, Date.parse('2025-12-31T23:00:00.000Z'))).to.equal(0);
    });

    it('is 50 at the halfway point', () => {
      expect(computeProgressPct(session, Date.parse('2026-01-01T00:30:00.000Z'))).to.equal(50);
    });

    it('clamps at 100 once the session has ended', () => {
      expect(computeProgressPct(session, Date.parse('2026-01-01T02:00:00.000Z'))).to.equal(100);
    });

    it('is 0 for a zero-duration session, instead of dividing by zero', () => {
      const zeroDuration = { startTimeUtc: session.startTimeUtc, endTimeUtc: session.startTimeUtc };
      expect(computeProgressPct(zeroDuration, Date.parse(session.startTimeUtc))).to.equal(0);
    });
  });
});
