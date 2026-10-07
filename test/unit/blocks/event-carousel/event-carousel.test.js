import { expect } from '@esm-bundle/chai';
import { readFile, setViewport } from '@web/test-runner-commands';
import init from '../../../../event-libs/v1/c2/blocks/event-carousel/event-carousel.js';

describe('event-carousel', () => {
  beforeEach(async () => {
    document.body.innerHTML = await readFile({ path: './mocks/default.html' });
    document.head.innerHTML = '';
  });

  it('wraps the sibling cards in a single shared track', async () => {
    const [headerCarousel, footerCarousel] = [...document.querySelectorAll('.event-carousel')];

    await init(headerCarousel);
    await init(footerCarousel);

    const tracks = document.querySelectorAll('.carousel-track');
    expect(tracks).to.have.lengthOf(1);
    expect(tracks[0].querySelectorAll(':scope > .event-card')).to.have.lengthOf(2);
    expect(tracks[0].dataset.carouselId).to.be.a('string').that.is.not.empty;
  });

  it('renders heading and pills for the header instance', async () => {
    const [headerCarousel, footerCarousel] = [...document.querySelectorAll('.event-carousel')];
    await init(headerCarousel);
    await init(footerCarousel);

    expect(headerCarousel.querySelector('.carousel-heading')).to.exist;
    expect(headerCarousel.querySelectorAll('.carousel-pill')).to.have.lengthOf(3);
    expect(headerCarousel.querySelector('.carousel-pill.is-active').textContent).to.equal('All');
  });

  it('renders arrows-only for the footer instance', async () => {
    const [headerCarousel, footerCarousel] = [...document.querySelectorAll('.event-carousel')];
    await init(headerCarousel);
    await init(footerCarousel);

    expect(footerCarousel.querySelector('.carousel-heading')).to.not.exist;
    expect(footerCarousel.querySelector('.carousel-pills')).to.not.exist;
    expect(footerCarousel.querySelector('.carousel-arrows')).to.exist;
  });

  it('scrolls the shared track when an arrow is clicked', async () => {
    const [headerCarousel, footerCarousel] = [...document.querySelectorAll('.event-carousel')];
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
    document.body.innerHTML = '<div class="event-carousel"><div><div></div></div></div>';
    const el = document.querySelector('.event-carousel');
    await init(el);

    expect(document.querySelector('.event-carousel')).to.not.exist;
  });

  it('adds a right-edge margin only to carousels in right-stretched sections on tablet and larger screens', async () => {
    const css = await readFile({ path: '../../../../event-libs/v1/c2/blocks/event-carousel/event-carousel.css' });
    document.head.innerHTML = `<style>${css}</style>`;
    const originalViewport = { width: window.innerWidth, height: window.innerHeight };

    try {
      for (const width of [375, 767, 768, 1024, 1440]) {
        await setViewport({ width, height: originalViewport.height });
        ['ltr', 'rtl'].forEach((direction) => {
          ['', 'stretch', 'stretch-left', 'stretch-right', 'stretch-left stretch-right'].forEach((variant) => {
            document.body.innerHTML = `
              <main dir="${direction}">
                <div class="section ${variant}">
                  <div class="event-carousel"></div>
                  <div class="carousel-track"></div>
                  <div class="other-block"></div>
                  <div class="section"><div class="event-carousel" id="nested"></div></div>
                </div>
              </main>
            `;
            const section = document.querySelector('.section');
            const carousel = section.querySelector('.event-carousel');
            const rightStretched = variant.split(' ').some((value) => ['stretch', 'stretch-right'].includes(value));
            const expectedMargin = width >= 768 && rightStretched ? 24 : 0;
            const context = `${variant || 'plain'}, ${direction}, ${width}px`;

            expect(getComputedStyle(carousel).marginRight, context).to.equal(`${expectedMargin}px`);
            expect(getComputedStyle(carousel).marginLeft, context).to.equal('0px');
            expect(section.getBoundingClientRect().right - carousel.getBoundingClientRect().right, context)
              .to.equal(expectedMargin);
            ['.section', '.carousel-track', '.other-block', '#nested'].forEach((selector) => {
              expect(getComputedStyle(document.querySelector(selector)).marginRight, context).to.equal('0px');
            });
          });
        });
      }
    } finally {
      await setViewport(originalViewport);
    }
  });

  describe('theme', () => {
    function buildStandaloneCarousel({ dark = false } = {}) {
      document.body.innerHTML = '';
      const section = document.createElement('div');
      section.className = dark ? 'section dark' : 'section';
      section.innerHTML = `
        <div class="event-carousel"><div><div></div></div></div>
        <div class="event-card ratio-4-3">
          <div><div><picture><img src="/test/unit/mocks/media/session.jpg" alt="Session 1"></picture></div></div>
          <div><div><p>Session One</p><p>Description one</p></div></div>
        </div>
      `;
      document.body.append(section);
      return section.querySelector('.event-carousel');
    }

    it('sets no theme attribute in a section with no dark style metadata — pure CSS, nothing for JS to compute', async () => {
      const el = buildStandaloneCarousel();
      await init(el);

      expect(el.dataset.carouselTheme).to.equal(undefined);
      expect(el.classList.contains('dark-carousel')).to.equal(false);
    });

    it('leaves the carousel under its ancestor .section.dark for event-carousel.css to key off, with no card-level class added', async () => {
      const el = buildStandaloneCarousel({ dark: true });
      await init(el);

      expect(el.closest('.section.dark')).to.exist;
      expect(el.dataset.carouselTheme).to.equal(undefined);
      expect(el.classList.contains('dark-carousel')).to.equal(false);
    });

    it('leaves an authored dark-carousel class in place for event-carousel.css to key off', async () => {
      const el = buildStandaloneCarousel();
      el.classList.add('dark-carousel');
      await init(el);

      expect(el.classList.contains('dark-carousel')).to.equal(true);
      expect(el.dataset.carouselTheme).to.equal(undefined);
    });
  });
});
