import { expect } from '@esm-bundle/chai';
import { readFile } from '@web/test-runner-commands';
import init from '../../../../event-libs/v1/c2/blocks/carousel/carousel.js';

describe('carousel', () => {
  beforeEach(async () => {
    document.body.innerHTML = await readFile({ path: './mocks/default.html' });
    document.head.innerHTML = '';
  });

  it('wraps the sibling cards in a single shared track', async () => {
    const [headerCarousel, footerCarousel] = [...document.querySelectorAll('.carousel')];

    await init(headerCarousel);
    await init(footerCarousel);

    const tracks = document.querySelectorAll('.carousel-track');
    expect(tracks).to.have.lengthOf(1);
    expect(tracks[0].querySelectorAll(':scope > .card')).to.have.lengthOf(2);
    expect(tracks[0].dataset.carouselId).to.be.a('string').that.is.not.empty;
  });

  it('renders heading and pills for the header instance', async () => {
    const [headerCarousel, footerCarousel] = [...document.querySelectorAll('.carousel')];
    await init(headerCarousel);
    await init(footerCarousel);

    expect(headerCarousel.querySelector('.carousel-heading')).to.exist;
    expect(headerCarousel.querySelectorAll('.carousel-pill')).to.have.lengthOf(3);
    expect(headerCarousel.querySelector('.carousel-pill.is-active').textContent).to.equal('All');
  });

  it('renders arrows-only for the footer instance', async () => {
    const [headerCarousel, footerCarousel] = [...document.querySelectorAll('.carousel')];
    await init(headerCarousel);
    await init(footerCarousel);

    expect(footerCarousel.querySelector('.carousel-heading')).to.not.exist;
    expect(footerCarousel.querySelector('.carousel-pills')).to.not.exist;
    expect(footerCarousel.querySelector('.carousel-arrows')).to.exist;
  });

  it('scrolls the shared track when an arrow is clicked', async () => {
    const [headerCarousel, footerCarousel] = [...document.querySelectorAll('.carousel')];
    await init(headerCarousel);
    await init(footerCarousel);

    const track = document.querySelector('.carousel-track');
    let scrollArgs;
    track.scrollBy = (args) => { scrollArgs = args; };

    const nextBtn = footerCarousel.querySelector('.carousel-arrow-next');
    // In an unlaid-out test DOM the track has no overflow, so the arrow starts
    // disabled (correct end-of-range behavior); force-enable it here purely to
    // verify the click handler is wired to the shared track.
    nextBtn.disabled = false;
    nextBtn.click();
    expect(scrollArgs.left).to.be.greaterThan(0);
  });

  it('removes the block when no adjacent cards are found', async () => {
    document.body.innerHTML = '<div class="carousel"><div><div></div></div></div>';
    const el = document.querySelector('.carousel');
    await init(el);

    expect(document.querySelector('.carousel')).to.not.exist;
  });
});
