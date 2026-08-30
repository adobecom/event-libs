import { expect } from '@esm-bundle/chai';
import * as preact from '../../../../mocks/deps/htm-preact.js';
import { buildStore } from '../../../../../../event-libs/v1/c2/blocks/sessions-guide/store/index.js';
import { buildCarousel } from '../../../../../../event-libs/v1/c2/blocks/sessions-guide/components/Carousel.js';
import { buildSessionCard } from '../../../../../../event-libs/v1/c2/blocks/sessions-guide/components/SessionCard.js';

const BASE_CONFIG = {
  userTz: 'America/Los_Angeles',
  surface: 'widget',
  rfApiUrl: '',
  rfApiProfileId: '',
  filterCategories: [],
  mrEnv: 'dev',
  theme: 'dark',
  manualOnDemandTransitionTime: null,
  title: '',
};

const SESSION_A = {
  id: 'a', title: 'Keynote A', description: 'Desc A', primaryTrack: 'Featured',
  startTimeUtc: '2026-10-28T16:00:00Z', endTimeUtc: '2026-10-28T17:30:00Z',
  thumbnailUrl: null, sessionPageUrl: '/sessions/a',
  inPerson: false,
};
const SESSION_B = {
  id: 'b', title: 'Keynote B', description: 'Desc B', primaryTrack: 'Featured',
  startTimeUtc: '2026-10-28T18:00:00Z', endTimeUtc: '2026-10-28T19:00:00Z',
  thumbnailUrl: 'https://example.com/b.jpg', sessionPageUrl: '/sessions/b',
  inPerson: false,
};

function makeStore() {
  const store = buildStore(preact);
  store.SessionGuideContext._current = {
    state: {
      scheduled: new Set(),
      favorited: new Set(),
      isRegistered: true,
      guideConfig: { ...BASE_CONFIG },
    },
    dispatch: () => {},
  };
  return store;
}

describe('Carousel', () => {
  it('returns null for empty sessions', () => {
    const store = makeStore();
    const Carousel = buildCarousel(preact, store);
    expect(Carousel({ sessions: [] })).to.be.null;
  });

  it('returns null for undefined sessions', () => {
    const store = makeStore();
    const Carousel = buildCarousel(preact, store);
    expect(Carousel({ sessions: undefined })).to.be.null;
  });

  it('renders carousel container', () => {
    const store = makeStore();
    const Carousel = buildCarousel(preact, store);
    const html = Carousel({ sessions: [SESSION_A] });
    expect(html).to.include('sg-carousel');
  });

  it('renders all sessions in the strip', () => {
    const store = makeStore();
    const Carousel = buildCarousel(preact, store);
    const html = Carousel({ sessions: [SESSION_A, SESSION_B] });
    expect(html).to.include('key="a"');
    expect(html).to.include('key="b"');
  });

  it('renders the cards container', () => {
    const store = makeStore();
    const Carousel = buildCarousel(preact, store);
    const html = Carousel({ sessions: [SESSION_A, SESSION_B] });
    expect(html).to.include('sg-carousel__cards');
  });

  it('renders the prev arrow disabled at the initial offset', () => {
    const store = makeStore();
    const Carousel = buildCarousel(preact, store);
    const html = Carousel({ sessions: [SESSION_A, SESSION_B] });
    expect(html).to.include('sg-carousel__arrow--prev');
    expect(html).to.include('disabled="true"');
  });

  it('renders next arrow when multiple sessions exist', () => {
    const store = makeStore();
    const Carousel = buildCarousel(preact, store);
    const html = Carousel({ sessions: [SESSION_A, SESSION_B] });
    expect(html).to.include('sg-carousel__arrow--next');
  });

  it('renders the left time gutter when formatTime is supplied', () => {
    const store = makeStore();
    const Carousel = buildCarousel(preact, store);
    const html = Carousel({ sessions: [SESSION_A], formatTime: () => '9:00AM' });
    expect(html).to.include('sg-carousel__time');
  });

  // Recommended carousels pass no formatTime — with no gutter element the strip starts
  // flush with the section's left edge instead of being indented by it.
  it('omits the time gutter when no formatTime is supplied', () => {
    const store = makeStore();
    const Carousel = buildCarousel(preact, store);
    const html = Carousel({ sessions: [SESSION_A] });
    expect(html).to.not.include('sg-carousel__time');
  });

  // .sg-section-time is the mobile-only header time — hidden from 768px up in favor of
  // .sg-carousel__time/-tz, which already show both — so it needs the timezone appended too.
  it('includes the timezone in the header time label, not just the time', () => {
    const store = makeStore();
    const Carousel = buildCarousel(preact, store);
    const html = Carousel({
      sessions: [SESSION_A],
      formatTime: () => '9:00 AM',
      formatTimezone: () => 'PDT',
    });
    expect(html).to.include('<span class="sg-section-time">9:00 AM PDT</span>');
  });

  it('renders no arrows for a single session', () => {
    const store = makeStore();
    const Carousel = buildCarousel(preact, store);
    const html = Carousel({ sessions: [SESSION_A] });
    expect(html).to.include('key="a"');
    expect(html).to.not.include('sg-carousel__arrow');
  });

  // onCardClick/onWatchSamePage are threaded straight through to LiveCard for
  // session-broadcast's integration (no local modal/URL handling of its own) — see the
  // matching describe block in LiveCard.test.js for why this only guards the render
  // contract rather than exercising the click itself.
  it('accepts onCardClick/onWatchSamePage without throwing', () => {
    const store = makeStore();
    const Carousel = buildCarousel(preact, store);
    expect(() => Carousel({
      sessions: [SESSION_A], onCardClick: () => {}, onWatchSamePage: () => {},
    })).to.not.throw();
  });

  // session-broadcast's Upcoming section passes SessionCard instead of the default LiveCard —
  // see UpNextCarousel.js. Like the onCardClick/onWatchSamePage tests above, the card itself
  // sits inside a multi-sibling template whose first literal isn't a bare `<`, so this mock
  // doesn't actually invoke it as a component (see LiveCard.test.js's own note on this same
  // limitation) — this only guards the render contract, not the card's real output. Real
  // rendering is verified via a preview harness in a real browser instead.
  describe('CardComponent', () => {
    it('accepts a CardComponent override without throwing', () => {
      const store = makeStore();
      const Carousel = buildCarousel(preact, store);
      const SessionCard = buildSessionCard(preact, store);
      expect(() => Carousel({ sessions: [SESSION_A], CardComponent: SessionCard })).to.not.throw();
    });

    it('defaults to LiveCard when no CardComponent is supplied', () => {
      const store = makeStore();
      const Carousel = buildCarousel(preact, store);
      expect(() => Carousel({ sessions: [SESSION_A] })).to.not.throw();
    });
  });
});
