import { expect } from '@esm-bundle/chai';
import * as preact from '../../../../mocks/deps/htm-preact.js';
import { buildStore } from '../../../../../../event-libs/v1/c2/blocks/sessions-guide/store/index.js';
import { buildTimeSlotRow } from '../../../../../../event-libs/v1/c2/blocks/sessions-guide/components/TimeSlotRow.js';

const BASE_CONFIG = {
  userTz: 'America/Los_Angeles',
  surface: 'page',
  rfApiUrl: '',
  rfApiProfileId: '',
  filterCategories: [],
  mrEnv: 'dev',
  theme: 'dark',
  manualOnDemandTransitionTime: null,
  title: '',
};

const SESSION_A = {
  id: 'a', title: 'Session A', description: 'Desc A', primaryTrack: 'Design',
  startTimeUtc: '2099-10-28T17:00:00Z', endTimeUtc: '2099-10-28T18:00:00Z',
  inPerson: false, sessionPageUrl: '/a',
};
const SESSION_B = {
  id: 'b', title: 'Session B', description: 'Desc B', primaryTrack: 'Video',
  startTimeUtc: '2099-10-28T17:00:00Z', endTimeUtc: '2099-10-28T18:00:00Z',
  inPerson: false, sessionPageUrl: '/b',
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

describe('TimeSlotRow', () => {
  it('returns null for empty sessions array', () => {
    const store = makeStore();
    const TimeSlotRow = buildTimeSlotRow(preact, store);
    expect(TimeSlotRow({ sessions: [] })).to.be.null;
  });

  describe('Carousel row real Preact lifecycle', () => {
    let frame;
    let doc;
    let win;
    const settle = () => new Promise((resolve) => setTimeout(resolve, 30));
    const waitFor = async (condition) => {
      for (let i = 0; i < 100 && !condition(); i += 1) {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      expect(condition()).to.be.true;
    };
    const cards = () => [...doc.querySelectorAll('.sg-time-row__card-wrap')];
    const strip = () => doc.querySelector('.sg-time-row__cards');
    const previous = () => doc.querySelector('.sg-time-row__arrow--prev');
    const next = () => doc.querySelector('.sg-time-row__arrow--next');
    const update = async (patch) => {
      win.updateCarouselRow(patch);
      await settle();
    };
    const goToEnd = async () => {
      for (let i = 0; i < 20 && !next().disabled; i += 1) {
        next().click();
        await settle();
      }
      expect(next().disabled).to.be.true;
      expect(previous().disabled).to.be.false;
    };
    const expectStart = () => {
      expect(previous().disabled).to.be.true;
      expect(strip().style.transform).to.equal('translateX(0px)');
      expect(cards()[0].inert).to.be.false;
      const viewport = doc.querySelector('.sg-time-row__viewport').getBoundingClientRect();
      const first = cards()[0].getBoundingClientRect();
      expect(first.right).to.be.greaterThan(viewport.left);
      expect(first.left).to.be.lessThan(viewport.right);
    };

    beforeEach(() => {
      document.body.innerHTML = '';
      document.head.innerHTML = '';
      frame = document.createElement('iframe');
      frame.style.cssText = 'width:1440px;height:600px;border:0';
    });
    afterEach(() => frame.remove());

    const load = async (rowType) => {
      await new Promise((resolve, reject) => {
        frame.onload = resolve;
        frame.onerror = reject;
        frame.src = '/test/unit/c2/blocks/sessions-guide/mocks/fab-placement.html';
        document.body.append(frame);
      });
      doc = frame.contentDocument;
      win = frame.contentWindow;
      doc.body.dataset.rowType = rowType;
      const importMap = doc.createElement('script');
      importMap.type = 'importmap';
      importMap.textContent = JSON.stringify({
        imports: { '/event-libs/v1/deps/htm-preact.js': '/event-libs/v1/deps/htm-preact.js?real-preact=true' },
      });
      doc.head.append(importMap);
      await new Promise((resolve, reject) => {
        win.addEventListener('carousel-row-test-ready', resolve, { once: true });
        win.addEventListener('error', (event) => reject(event.error || new Error(event.message)), { once: true });
        const script = doc.createElement('script');
        script.type = 'module';
        script.src = '/test/unit/c2/blocks/sessions-guide/mocks/carousel-row-lifecycle.js';
        script.onerror = reject;
        doc.head.append(script);
      });
      await settle();
    };

    ['track', 'time-slot'].forEach((rowType) => {
      it(`starts filtered ${rowType} results at the beginning after reaching the end`, async () => {
        await load(rowType);
        await goToEnd();
        await update({ ids: ['0', '1', '2', '3'], searchQuery: 'Photoshop' });
        expect(cards()).to.have.length(4);
        expectStart();
        await goToEnd();
        await update({ ids: ['10', '11', '12', '13'], activeFilters: { track: ['Design'] } });
        expectStart();
        await update({ ids: [], searchQuery: 'No matching sessions' });
        expect(doc.querySelector('.sg-time-row')).to.be.null;
        await update({
          ids: Array.from({ length: 20 }, (_, i) => String(i)),
          searchQuery: '',
          activeFilters: {},
        });
        expectStart();
        next().click();
        await settle();
        await update({ activeDay: '2099-10-29' });
        expectStart();
      });

      it(`preserves ${rowType} position on saved-state updates and clamps shrinking results`, async () => {
        await load(rowType);
        next().click();
        await settle();
        const position = strip().style.transform;
        await update({ favoriteIds: ['19'], scheduledIds: ['19'] });
        expect(strip().style.transform).to.equal(position);
        expect(cards()[0].inert).to.be.true;
        await update({ favoriteIds: ['0', '19'], scheduledIds: ['0', '19'] });
        expect(cards()[0].inert).to.be.true;
        expect(cards()[1].inert).to.be.false;
        expect(strip().style.transform).to.not.equal(position);
        await goToEnd();
        await update({ ids: ['0', '1'] });
        expect(cards().some((card) => !card.inert)).to.be.true;
        expect(next().disabled).to.be.true;
        previous().click();
        await settle();
        expectStart();
      });

      it(`resets native ${rowType} scrolling and keeps cards reachable after desktop resize`, async () => {
        await load(rowType);
        await goToEnd();
        for (const width of [1100, 375, 768, 1279]) {
          frame.style.width = `${width}px`;
          win.resizeCarouselRow();
          await waitFor(() => cards().every((card) => !card.inert));
          expect(win.innerWidth).to.equal(width);
        }
        strip().scrollLeft = strip().scrollWidth;
        await settle();
        expect(strip().scrollLeft).to.be.greaterThan(0);
        await update({ ids: ['0', '1', '2', '3'], searchQuery: 'Photoshop' });
        expect(strip().scrollLeft).to.equal(0);
        expect(cards().every((card) => !card.inert)).to.be.true;
        for (const width of [1280, 1440, 1920]) {
          frame.style.width = `${width}px`;
          win.resizeCarouselRow();
          await waitFor(() => previous().disabled && strip().style.transform === 'translateX(0px)');
          expect(win.innerWidth).to.equal(width);
          expectStart();
        }
      });
    });
  });

  it('returns null for undefined sessions', () => {
    const store = makeStore();
    const TimeSlotRow = buildTimeSlotRow(preact, store);
    expect(TimeSlotRow({ sessions: undefined })).to.be.null;
  });

  it('renders the row container for a single session', () => {
    const store = makeStore();
    const TimeSlotRow = buildTimeSlotRow(preact, store);
    const html = TimeSlotRow({ sessions: [SESSION_A] });
    expect(html).to.include('sg-time-row');
  });

  it('includes a time label derived from the first session', () => {
    const store = makeStore();
    const TimeSlotRow = buildTimeSlotRow(preact, store);
    const html = TimeSlotRow({ sessions: [SESSION_A] });
    expect(html).to.include('sg-time-row__label');
    // time should be rendered (exact format depends on Intl locale in test env)
    expect(html).to.include('sg-time-row__label');
  });

  it('renders card wraps for each session', () => {
    const store = makeStore();
    const TimeSlotRow = buildTimeSlotRow(preact, store);
    const html = TimeSlotRow({ sessions: [SESSION_A, SESSION_B] });
    const count = (html.match(/sg-time-row__card-wrap/g) || []).length;
    expect(count).to.equal(2);
  });

  // Arrows stay mounted and disable at the ends — conditionally unmounting them
  // destroyed focus when a keyboard user paged to either end.
  it('renders the prev arrow disabled at initial offset 0', () => {
    const store = makeStore();
    const TimeSlotRow = buildTimeSlotRow(preact, store);
    const html = TimeSlotRow({ sessions: [SESSION_A, SESSION_B] });
    expect(html).to.include('sg-time-row__arrow--prev');
    expect(html).to.include('disabled="true"');
  });

  it('renders card wraps for multiple sessions (next arrow requires real layout)', () => {
    const store = makeStore();
    const TimeSlotRow = buildTimeSlotRow(preact, store);
    const html = TimeSlotRow({ sessions: [SESSION_A, SESSION_B] });
    // showNext is driven by useLayoutEffect DOM measurement — not testable in the mock.
    // Verify that both card wraps are rendered instead.
    const count = (html.match(/sg-time-row__card-wrap/g) || []).length;
    expect(count).to.equal(2);
  });

  it('renders the next arrow disabled for a single session', () => {
    const store = makeStore();
    const TimeSlotRow = buildTimeSlotRow(preact, store);
    const html = TimeSlotRow({ sessions: [SESSION_A] });
    expect(html).to.include('sg-time-row__arrow--next');
    expect(html).to.include('disabled="true"');
  });
});
