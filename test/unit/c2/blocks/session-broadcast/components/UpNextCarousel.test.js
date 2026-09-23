import { expect } from '@esm-bundle/chai';
import { UpNextCarousel } from '../../../../../../event-libs/v1/c2/blocks/session-broadcast/components/UpNextCarousel.js';

const SESSION = { id: 's-1', title: 'Upcoming Session' };

describe('UpNextCarousel', () => {
  it('renders nothing for an empty list', () => {
    expect(UpNextCarousel({ sessions: [] })).to.equal(null);
  });

  it('renders nothing for an undefined list', () => {
    expect(UpNextCarousel({ sessions: undefined })).to.equal(null);
  });

  it('renders the section wrapper when there are upcoming sessions', () => {
    const out = UpNextCarousel({ sessions: [SESSION] });
    expect(out).to.include('sb-carousel-section--up-next');
  });

  // pageByGroup makes the shared Carousel's prev/next arrows step by however many cards are
  // fully visible instead of one at a time — real stepping behavior (including the
  // don't-overshoot clamp) is exercised in Carousel.test.js and verified live in a browser, since
  // it depends on real layout measurement the mocked htm-preact used here can't provide.
  it('renders without throwing now that pageByGroup is passed to Carousel', () => {
    expect(() => UpNextCarousel({ sessions: [SESSION] })).to.not.throw();
  });
});
