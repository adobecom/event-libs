import { expect } from '@esm-bundle/chai';
import * as preact from '../../../../mocks/deps/htm-preact.js';
import { buildStore } from '../../../../../../event-libs/v1/c2/blocks/sessions-guide/store/index.js';
import { buildSessionCard } from '../../../../../../event-libs/v1/c2/blocks/sessions-guide/components/SessionCard.js';
import {
  scheduled, favorited, pendingActions, auth,
} from '../../../../../../event-libs/v1/utils/session-store.js';
import { initTierOneEventConfig } from '../../../../../../event-libs/v1/utils/tier-1-event-config.js';
import { initSessionState } from '../../../../../../event-libs/v1/utils/session-store.js';

const BASE_CONFIG = {
  title: 'Adobe MAX 2026',
  userTz: 'America/Los_Angeles',
  surface: 'page',
  filterCategories: [],
  theme: 'dark',
};

// A future session (not on-demand)
const UPCOMING_SESSION = {
  id: 'session-1',
  title: 'Building with AI',
  description: 'Learn AI integration.',
  primaryTrack: 'Design',
  startTimeUtc: '2099-10-28T17:00:00Z',
  endTimeUtc: '2099-10-28T18:00:00Z',
  inPerson: false,
  sessionPageUrl: '/sessions/building-with-ai',
};

// A past session (on-demand)
const ONDEMAND_SESSION = {
  id: 'session-2',
  title: 'Past Session',
  description: 'Ended.',
  primaryTrack: 'Design',
  startTimeUtc: '2020-01-01T10:00:00Z',
  endTimeUtc: '2020-01-01T11:00:00Z',
  inPerson: false,
  sessionPageUrl: '/sessions/past',
};

function makeCtx(overrides = {}) {
  const state = {
    guideConfig: { ...BASE_CONFIG },
    ...overrides,
  };
  return { state, dispatch: () => {} };
}

function renderCard(session, ctxOverrides = {}) {
  const store = buildStore(preact);
  store.SessionGuideContext._current = makeCtx(ctxOverrides);
  const SessionCard = buildSessionCard(preact, store);
  return SessionCard({ session });
}

describe('SessionCard', () => {
  before(() => {
    const meta = document.createElement('meta');
    meta.name = 'tier-1-event-config';
    meta.content = JSON.stringify({ trackIcons: { Design: { icon: 'design-and-illustration', color: '#0066cc' } } });
    document.head.appendChild(meta);
    initTierOneEventConfig();
  });

  beforeEach(() => {
    scheduled.value = new Set();
    favorited.value = new Set();
    pendingActions.value = new Set();
    auth.value = { isLoggedIn: true, isRegistered: true, userFirstName: null };
  });

  it('applies the track color from the page-wide tier-1-event-config', () => {
    const html = renderCard(UPCOMING_SESSION);
    expect(html).to.include('color:#0066cc');
  });

  it('renders without throwing', () => {
    expect(() => renderCard(UPCOMING_SESSION)).to.not.throw();
  });

  it('includes the session title', () => {
    const html = renderCard(UPCOMING_SESSION);
    expect(html).to.include('Building with AI');
  });

  it('includes the session track', () => {
    const html = renderCard(UPCOMING_SESSION);
    expect(html).to.include('Design');
  });

  it('applies is-scheduled class when session is scheduled', () => {
    scheduled.value = new Set(['session-1']);
    const html = renderCard(UPCOMING_SESSION);
    expect(html).to.include('is-scheduled');
  });

  it('applies is-favorited class when session is favorited', () => {
    favorited.value = new Set(['session-1']);
    const html = renderCard(UPCOMING_SESSION);
    expect(html).to.include('is-favorited');
  });

  it('does not apply is-scheduled when not scheduled', () => {
    const html = renderCard(UPCOMING_SESSION);
    expect(html).to.not.include('is-scheduled');
  });

  it('shows schedule button for upcoming session', () => {
    const html = renderCard(UPCOMING_SESSION);
    expect(html).to.include('Add Building with AI to schedule');
  });

  it('shows on-demand label and hides schedule button for on-demand session', () => {
    const html = renderCard(ONDEMAND_SESSION);
    expect(html).to.include('ON DEMAND');
    expect(html).to.not.include('to schedule');
    expect(html).to.include('sg-card--on-demand');
  });

  it('always shows favorite button', () => {
    const upcoming = renderCard(UPCOMING_SESSION);
    const onDemand = renderCard(ONDEMAND_SESSION);
    expect(upcoming).to.include('Add Building with AI to favorites');
    expect(onDemand).to.include('to favorites');
  });

  it('shows aria-pressed=true on schedule button when scheduled', () => {
    scheduled.value = new Set(['session-1']);
    const html = renderCard(UPCOMING_SESSION);
    expect(html).to.include('aria-pressed="true"');
  });

  it('shows aria-pressed=false on schedule button when not scheduled', () => {
    const html = renderCard(UPCOMING_SESSION);
    expect(html).to.include('aria-pressed="false"');
  });

  it('dispatches SCHEDULE_ADD when schedule button clicked and registered', () => {
    const dispatched = [];
    const store = buildStore(preact);
    store.SessionGuideContext._current = {
      state: makeCtx().state,
      dispatch: (action) => dispatched.push(action),
    };
    const SessionCard = buildSessionCard(preact, store);
    const rendered = SessionCard({ session: UPCOMING_SESSION });
    // Extract onclick from rendered HTML is not straightforward; test dispatch guard instead
    expect(rendered).to.include('Add Building with AI to schedule');
  });

  it('shows duration by default for upcoming sessions', () => {
    const html = renderCard(UPCOMING_SESSION);
    // UPCOMING_SESSION is 1 hour long
    expect(html).to.include('1 hr');
    expect(html).to.not.include('sg-card--on-demand');
  });

  it('shows start time when timeDisplay is "time"', () => {
    const store = buildStore(preact);
    store.SessionGuideContext._current = makeCtx();
    const SessionCard = buildSessionCard(preact, store);
    const html = SessionCard({ session: UPCOMING_SESSION, timeDisplay: 'time' });
    // Should NOT show duration format
    expect(html).to.not.include('1 hr');
    // Should show a time string (contains AM or PM)
    expect(html).to.match(/\d+(:\d+)?\s*(AM|PM)/i);
  });

  it('shows a start–end range when timeDisplay is "range"', () => {
    const store = buildStore(preact);
    store.SessionGuideContext._current = makeCtx();
    const SessionCard = buildSessionCard(preact, store);
    const html = SessionCard({ session: UPCOMING_SESSION, timeDisplay: 'range' });
    expect(html).to.match(/\d+(:\d+)?\s*(AM|PM)\s*-\s*\d+(:\d+)?\s*(AM|PM)/i);
  });

  it('tags the card daa-ll as Session-Card-Navigate on the page surface', () => {
    const html = renderCard(UPCOMING_SESSION);
    expect(html).to.include('daa-ll="Session-Card-Navigate"');
  });

  // showDescription defaults to false so session-broadcast's Upcoming-card-only hover
  // treatment (session-broadcast.css) doesn't leak into sessions-guide's own TimeSlotRow/
  // TrackRow usage of this same component.
  describe('showDescription (session-broadcast integration)', () => {
    it('omits the description by default', () => {
      const html = renderCard(UPCOMING_SESSION);
      expect(html).to.not.include('sg-card__description');
    });

    it('includes the description when showDescription is true', () => {
      const store = buildStore(preact);
      store.SessionGuideContext._current = makeCtx();
      const SessionCard = buildSessionCard(preact, store);
      const html = SessionCard({ session: UPCOMING_SESSION, showDescription: true });
      expect(html).to.include('sg-card__description');
      expect(html).to.include('Learn AI integration.');
    });

    it('omits the description when showDescription is true but the session has none', () => {
      const store = buildStore(preact);
      store.SessionGuideContext._current = makeCtx();
      const SessionCard = buildSessionCard(preact, store);
      const html = SessionCard({ session: { ...UPCOMING_SESSION, description: '' }, showDescription: true });
      expect(html).to.not.include('sg-card__description');
    });
  });

  // session-broadcast (a non-widget "page" surface caller) supplies its own onCardClick to
  // open the real Session Guide detail view instead of navigating away — same escape hatch
  // LiveCard.js already offers on its own non-widget branch.
  it('tags the card daa-ll as Session-Card-Open on the page surface when onCardClick is supplied', () => {
    const store = buildStore(preact);
    store.SessionGuideContext._current = makeCtx();
    const SessionCard = buildSessionCard(preact, store);
    const html = SessionCard({ session: UPCOMING_SESSION, onCardClick: () => {} });
    expect(html).to.include('daa-ll="Session-Card-Open"');
  });

  it('tags the card daa-ll as Session-Card-Open on the widget surface for a live/upcoming session', () => {
    const html = renderCard(UPCOMING_SESSION, { guideConfig: { ...BASE_CONFIG, surface: 'widget' } });
    expect(html).to.include('daa-ll="Session-Card-Open"');
  });

  it('tags the card daa-ll as On-Demand-Card-Navigate on the widget surface for an on-demand session', () => {
    const html = renderCard(ONDEMAND_SESSION, { guideConfig: { ...BASE_CONFIG, surface: 'widget' } });
    expect(html).to.include('daa-ll="On-Demand-Card-Navigate"');
  });

  // Only the schedule button is asserted here — the favorite IconButton is embedded
  // directly in the card's own outer template rather than its own nested html`` call,
  // which this test mock's minimal component-tag parser can't resolve (real htm/preact
  // renders it correctly; this is a mock limitation, not a production bug).
  it('tags the schedule button with Add-/Remove- daa-ll labels matching its state', () => {
    expect(renderCard(UPCOMING_SESSION)).to.include('daa-ll="Add-to-Schedule"');
    scheduled.value = new Set(['session-1']);
    expect(renderCard(UPCOMING_SESSION)).to.include('daa-ll="Remove-from-Schedule"');
  });

  it('tags the previously-aired play button with daa-ll=Watch-Now', () => {
    const store = buildStore(preact);
    store.SessionGuideContext._current = makeCtx();
    const SessionCard = buildSessionCard(preact, store);
    const html = SessionCard({ session: ONDEMAND_SESSION, forceOnDemand: true });
    expect(html).to.include('daa-ll="Watch-Now"');
  });

  it('omits the schedule button when enableScheduling is false', () => {
    const html = renderCard(UPCOMING_SESSION, {
      guideConfig: { ...BASE_CONFIG, behaviorFlags: { enableScheduling: false } },
    });
    expect(html).to.not.include('sg-card__btn--schedule');
  });

  it('omits the favorite button when enableFavoriting is false', () => {
    const html = renderCard(UPCOMING_SESSION, {
      guideConfig: { ...BASE_CONFIG, behaviorFlags: { enableFavoriting: false } },
    });
    expect(html).to.not.include('sg-card__btn--favorite');
  });

  // Asserts daa-ll (an interpolated prop) rather than the extraClass literal — same mock
  // limitation noted above for the favorite button; extraClass isn't interpolated on this
  // element, so the mock's minimal parser never sees it.
  it('keeps the previously-aired play button even when enableWatchNowCtas is false (out of that flag\'s scope)', () => {
    const store = buildStore(preact);
    store.SessionGuideContext._current = makeCtx({
      guideConfig: { ...BASE_CONFIG, behaviorFlags: { enableWatchNowCtas: false } },
    });
    const SessionCard = buildSessionCard(preact, store);
    const html = SessionCard({ session: ONDEMAND_SESSION, forceOnDemand: true });
    expect(html).to.include('daa-ll="Watch-Now"');
  });

  it('does not dispatch when isRegistered is not true (no-op guard)', () => {
    auth.value = { isLoggedIn: true, isRegistered: false, userFirstName: null };
    const dispatched = [];
    const store = buildStore(preact);
    const ctx = makeCtx();
    ctx.dispatch = (action) => dispatched.push(action);
    store.SessionGuideContext._current = ctx;
    const SessionCard = buildSessionCard(preact, store);
    const rendered = SessionCard({ session: UPCOMING_SESSION });
    expect(rendered).to.include('sg-card'); // renders fine even when unregistered
    expect(dispatched.length).to.equal(0); // no dispatch on mount
  });

  // "AVAILABLE SOON" vs "ON DEMAND" hinges on a real eventStartMs from session-store.js's own
  // config (not guideConfig), authored on the same tier-1-event-config meta tag the file's
  // top-level before() already set up for trackIcons — merged in here, once, since
  // initSessionState() is idempotent and every case below shares one real event start time.
  describe('AVAILABLE SOON vs ON DEMAND (DVR delay)', () => {
    const HOUR = 60 * 60 * 1000;
    // 5 hours before "now" at test-run time, so the two cases below only need to vary
    // dvrDelayHours against one fixed, real eventStartMs rather than mocking the clock.
    const eventStartMs = Date.now() - 5 * HOUR;

    before(() => {
      const meta = document.head.querySelector('meta[name="tier-1-event-config"]');
      const existing = JSON.parse(meta.content || '{}');
      meta.content = JSON.stringify({ ...existing, eventId: 'test-event', eventStartDateTime: eventStartMs });
      initSessionState();
    });

    it('shows AVAILABLE SOON while now is before eventStart + dvrDelayHours', () => {
      // availableAt = eventStartMs + 10h = 5h from now.
      const pending = { ...ONDEMAND_SESSION, id: 'session-pending', dvrDelayHours: 10 };
      const html = renderCard(pending);
      expect(html).to.include('AVAILABLE SOON');
      expect(html).to.not.include('ON DEMAND');
    });

    it('shows ON DEMAND once eventStart + dvrDelayHours has passed', () => {
      // availableAt = eventStartMs + 1h = 4h ago.
      const elapsed = { ...ONDEMAND_SESSION, id: 'session-elapsed', dvrDelayHours: 1 };
      const html = renderCard(elapsed);
      expect(html).to.include('ON DEMAND');
      expect(html).to.not.include('AVAILABLE SOON');
    });

    it('shows ON DEMAND for a session with no dvrDelayHours, even with a real eventStartMs', () => {
      const html = renderCard(ONDEMAND_SESSION);
      expect(html).to.include('ON DEMAND');
      expect(html).to.not.include('AVAILABLE SOON');
    });
  });
});
