import { expect } from '@esm-bundle/chai';
import { executeServerCommand } from '@web/test-runner-commands';

describe('Broadcast carousel navigation', function carouselNavigation() {
  this.timeout(10000);
  let frame;

  beforeEach(async () => {
    // Browsers suspend smooth scrolling/transitions in background test tabs.
    await executeServerCommand('focus-test-page');
    document.body.innerHTML = '';
    document.head.innerHTML = '';
    frame = document.createElement('iframe');
    frame.style.border = '0';
    frame.style.height = '900px';
  });

  afterEach(() => {
    frame.remove();
  });

  async function waitFor(check) {
    const deadline = performance.now() + 3000;
    while (!check()) {
      if (performance.now() > deadline) throw new Error('Carousel did not settle');
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }

  async function loadFrame(width) {
    frame.style.width = `${width}px`;
    await new Promise((resolve, reject) => {
      frame.onload = resolve;
      frame.onerror = reject;
      frame.src = '/test/unit/c2/blocks/session-broadcast/mocks/carousel-navigation.html';
      document.body.append(frame);
    });
    const doc = frame.contentDocument;
    await waitFor(() => doc.body.dataset.ready === 'true'
      && doc.querySelector('.sg-carousel__arrow--next')?.disabled === false
      && doc.querySelector('.sg-carousel__card-wrap')?.inert === false);
    // Navigation geometry is measured by the real Preact effect, not the unit mock.
    await waitFor(() => width < 1280 || doc.querySelectorAll('[inert]').length === 4);
    return doc;
  }

  function expectCardVisible(doc, index, aligned = true) {
    const track = doc.querySelector('.sg-carousel__track').getBoundingClientRect();
    const card = doc.querySelectorAll('.sg-carousel__card-wrap')[index];
    const rect = card.getBoundingClientRect();
    if (aligned) expect(rect.left).to.be.closeTo(track.left, 1);
    expect(rect.left).to.be.at.least(track.left - 1);
    expect(rect.right).to.be.at.most(Math.min(track.right, frame.contentWindow.innerWidth) + 1);
    expect(card.inert).to.equal(false);
  }

  async function navigate(doc, direction, index, aligned = true) {
    const button = doc.querySelector(`.sg-carousel__arrow--${direction}`);
    expect(button.disabled).to.equal(false);
    button.click();
    await waitFor(() => {
      const strip = doc.querySelector('.sg-carousel__cards');
      const trackLeft = strip.parentElement.getBoundingClientRect().left;
      const cardLeft = strip.children[index].getBoundingClientRect().left;
      if (!aligned) return doc.querySelector('.sg-carousel__arrow--next').disabled;
      return Math.abs(cardLeft - trackLeft) <= 1;
    });
    expectCardVisible(doc, index, aligned);
  }

  [1280, 1440, 1441, 1920].forEach((width) => {
    it(`fully displays each next/previous live card at ${width}px`, async () => {
      const doc = await loadFrame(width);
      expectCardVisible(doc, 0);
      for (let i = 1; i < 5; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        await navigate(doc, 'next', i);
      }
      expect(doc.querySelector('.sg-carousel__arrow--next').disabled).to.equal(true);
      for (let i = 3; i >= 0; i -= 1) {
        // eslint-disable-next-line no-await-in-loop
        await navigate(doc, 'prev', i);
      }
      expect(doc.querySelector('.sg-carousel__arrow--prev').disabled).to.equal(true);
    });
  });

  it('uses each card position rather than assuming every card matches the first width', async () => {
    const doc = await loadFrame(1440);
    const widths = [860.5, 1000.25, 1156, 900.75, 1156];
    doc.querySelectorAll('.sg-carousel__card-wrap').forEach((card, i) => {
      card.style.flex = `0 0 ${widths[i]}px`;
    });
    frame.contentWindow.dispatchEvent(new Event('resize'));
    await navigate(doc, 'next', 1);
    await navigate(doc, 'next', 2);
    await navigate(doc, 'next', 3);
    await navigate(doc, 'prev', 2);
    await navigate(doc, 'prev', 1);
  });

  it('remeasures a nonzero page when its responsive card widths change', async () => {
    const doc = await loadFrame(1440);
    const cards = doc.querySelectorAll('.sg-carousel__card-wrap');
    cards.forEach((card) => { card.style.flex = '0 0 80%'; });
    frame.contentWindow.dispatchEvent(new Event('resize'));
    await navigate(doc, 'next', 1);
    const oldWidth = cards[0].getBoundingClientRect().width;
    frame.style.width = '1280px';
    await waitFor(() => cards[0].getBoundingClientRect().width < oldWidth
      && Math.abs(cards[1].getBoundingClientRect().left
        - doc.querySelector('.sg-carousel__track').getBoundingClientRect().left) <= 1);
    expectCardVisible(doc, 1);
    await navigate(doc, 'next', 2);
  });

  [375, 768].forEach((width) => {
    it(`preserves native scrolling without translating the strip at ${width}px`, async () => {
      const doc = await loadFrame(width);
      const strip = doc.querySelector('.sg-carousel__cards');
      await navigate(doc, 'next', 1);
      expect(strip.scrollLeft).to.be.greaterThan(0);
      expect(strip.style.transform).to.equal('translateX(0px)');
      expect(doc.querySelectorAll('[inert]').length).to.equal(0);
      await navigate(doc, 'prev', 0);
      expect(strip.scrollLeft).to.be.closeTo(0, 1);
    });
  });
});
