import { expect } from '@esm-bundle/chai';
import * as preact from '../../../mocks/deps/htm-preact.js';
import { buildStore } from '../../../../../event-libs/v1/blocks/sessions-guide/store/index.js';
import { buildCarousel } from '../../../../../event-libs/v1/blocks/sessions-guide/components/Carousel.js';

const BASE_CONFIG = {
  userTz: 'America/Los_Angeles',
  surface: 'widget',
  trackColors: {},
  trackIcons: {},
  rfApiUrl: '',
  rfApiProfileId: '',
  showConflictModal: false,
  filterCategories: [],
  mrEnv: 'dev',
  theme: 'dark',
  manualOnDemandTransitionTime: null,
  title: '',
};

const SESSION_A = {
  id: 'a', title: 'Keynote A', description: 'Desc A', track: 'Featured',
  startTimeUtc: '2026-10-28T16:00:00Z', endTimeUtc: '2026-10-28T17:30:00Z',
  thumbnailUrl: null, watchUrl: '/max', sessionPageUrl: '/sessions/a',
  videoAvailable: false, inPerson: false,
};
const SESSION_B = {
  id: 'b', title: 'Keynote B', description: 'Desc B', track: 'Featured',
  startTimeUtc: '2026-10-28T18:00:00Z', endTimeUtc: '2026-10-28T19:00:00Z',
  thumbnailUrl: 'https://example.com/b.jpg', watchUrl: '/max-2', sessionPageUrl: '/sessions/b',
  videoAvailable: false, inPerson: false,
};

function makeStore() {
  const store = buildStore(preact);
  store.SessionGuideContext._current = {
    state: {
      scheduled: new Set(),
      favorited: new Set(),
      isRegistered: true,
      eventConfig: { ...BASE_CONFIG },
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
    expect(html).to.include('key=a');
    expect(html).to.include('key=b');
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
    expect(html).to.include('disabled=true');
  });

  it('renders next arrow when multiple sessions exist', () => {
    const store = makeStore();
    const Carousel = buildCarousel(preact, store);
    const html = Carousel({ sessions: [SESSION_A, SESSION_B] });
    expect(html).to.include('sg-carousel__arrow--next');
  });

  it('renders no arrows for a single session', () => {
    const store = makeStore();
    const Carousel = buildCarousel(preact, store);
    const html = Carousel({ sessions: [SESSION_A] });
    expect(html).to.include('key=a');
    expect(html).to.not.include('sg-carousel__arrow');
  });
});
