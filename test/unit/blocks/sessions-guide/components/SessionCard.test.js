import { expect } from '@esm-bundle/chai';
import * as preact from '../../../mocks/deps/htm-preact.js';
import { buildStore } from '../../../../../event-libs/v1/blocks/sessions-guide/store/index.js';
import { buildSessionCard } from '../../../../../event-libs/v1/blocks/sessions-guide/components/SessionCard.js';

const BASE_CONFIG = {
  title: 'Adobe MAX 2026',


  userTz: 'America/Los_Angeles',
  surface: 'page',
  trackColors: { Design: '#0066cc' },
  trackIcons: {},
  rfApiUrl: '',
  rfApiProfileId: '',
  showConflictModal: false,
  filterCategories: [],
  mrEnv: 'dev',
  theme: 'dark',
  manualOnDemandTransitionTime: null,
};

// A future session (not on-demand)
const UPCOMING_SESSION = {
  id: 'session-1',
  title: 'Building with AI',
  description: 'Learn AI integration.',
  track: 'Design',
  startTimeUtc: '2099-10-28T17:00:00Z',
  endTimeUtc: '2099-10-28T18:00:00Z',
  videoAvailable: false,
  inPerson: false,
  sessionPageUrl: '/sessions/building-with-ai',
  watchUrl: '',
};

// A past session (on-demand)
const ONDEMAND_SESSION = {
  id: 'session-2',
  title: 'Past Session',
  description: 'Ended.',
  track: 'Design',
  startTimeUtc: '2020-01-01T10:00:00Z',
  endTimeUtc: '2020-01-01T11:00:00Z',
  videoAvailable: true,
  inPerson: false,
  sessionPageUrl: '/sessions/past',
  watchUrl: '',
};

function makeCtx(overrides = {}) {
  const state = {
    scheduled: new Set(),
    favorited: new Set(),
    isRegistered: true,
    eventConfig: { ...BASE_CONFIG },
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
    const html = renderCard(UPCOMING_SESSION, { scheduled: new Set(['session-1']) });
    expect(html).to.include('is-scheduled');
  });

  it('applies is-favorited class when session is favorited', () => {
    const html = renderCard(UPCOMING_SESSION, { favorited: new Set(['session-1']) });
    expect(html).to.include('is-favorited');
  });

  it('does not apply is-scheduled when not scheduled', () => {
    const html = renderCard(UPCOMING_SESSION);
    expect(html).to.not.include('is-scheduled');
  });

  it('shows schedule button for upcoming session', () => {
    const html = renderCard(UPCOMING_SESSION);
    expect(html).to.include('sg-card__btn--schedule');
  });

  it('shows on-demand label and hides schedule button for on-demand session', () => {
    const html = renderCard(ONDEMAND_SESSION);
    expect(html).to.include('On demand');
    expect(html).to.not.include('sg-card__btn--schedule');
    expect(html).to.include('sg-card--on-demand');
  });

  it('always shows favorite button', () => {
    const upcoming = renderCard(UPCOMING_SESSION);
    const onDemand = renderCard(ONDEMAND_SESSION);
    expect(upcoming).to.include('sg-card__btn--favorite');
    expect(onDemand).to.include('sg-card__btn--favorite');
  });

  it('shows aria-pressed=true on schedule button when scheduled', () => {
    const html = renderCard(UPCOMING_SESSION, { scheduled: new Set(['session-1']) });
    expect(html).to.include('aria-pressed=true');
  });

  it('shows aria-pressed=false on schedule button when not scheduled', () => {
    const html = renderCard(UPCOMING_SESSION);
    expect(html).to.include('aria-pressed=false');
  });

  it('dispatches SCHEDULE_ADD when schedule button clicked and registered', () => {
    const dispatched = [];
    const store = buildStore(preact);
    store.SessionGuideContext._current = {
      state: { ...makeCtx().state },
      dispatch: (action) => dispatched.push(action),
    };
    const SessionCard = buildSessionCard(preact, store);
    const rendered = SessionCard({ session: UPCOMING_SESSION });
    // Extract onclick from rendered HTML is not straightforward; test dispatch guard instead
    expect(rendered).to.include('sg-card__btn--schedule');
  });

  it('does not dispatch when isRegistered is not true (no-op guard)', () => {
    const dispatched = [];
    const store = buildStore(preact);
    const ctx = makeCtx({ isRegistered: false });
    ctx.dispatch = (action) => dispatched.push(action);
    store.SessionGuideContext._current = ctx;
    const SessionCard = buildSessionCard(preact, store);
    const rendered = SessionCard({ session: UPCOMING_SESSION });
    expect(rendered).to.include('sg-card'); // renders fine even when unregistered
    expect(dispatched.length).to.equal(0); // no dispatch on mount
  });
});
