import { expect } from '@esm-bundle/chai';
import {
  getSwipeDistance,
  getSwipeDirection,
  decorateNextPreviousBtns,
  decorateSlideIndicators,
  handleNext,
  handlePrevious,
  moveSlides,
  KEY_CODES,
} from '../../../event-libs/v1/features/carousel/milo-carousel.js';
import { createTag } from '../../../event-libs/v1/utils/utils.js';

describe('Swipe Functions', () => {
  describe('getSwipeDistance', () => {
    it('should return the correct swipe distance', () => {
      expect(getSwipeDistance(0, 100)).to.equal(100);
      expect(getSwipeDistance(100, 0)).to.equal(0);
      expect(getSwipeDistance(50, 50)).to.equal(0);
    });

    it('should handle end value of 0 correctly', () => {
      expect(getSwipeDistance(100, 0)).to.equal(0);
    });
  });

  describe('getSwipeDirection', () => {
    it('should return "right" if swipe end is greater than start', () => {
      const swipe = { xStart: 0, xEnd: 100, xMin: 50 };
      const swipeDistance = { xDistance: 100 };
      expect(getSwipeDirection(swipe, swipeDistance)).to.equal('right');
    });

    it('should return "left" if swipe end is less than start', () => {
      const swipe = { xStart: 100, xEnd: 0, xMin: 50 };
      const swipeDistance = { xDistance: 99 };
      expect(getSwipeDirection(swipe, swipeDistance)).to.equal('left');
    });

    it('should return undefined if swipe distance is less than minimum', () => {
      const swipe = { xStart: 0, xEnd: 25, xMin: 50 };
      const swipeDistance = { xDistance: 25 };
      expect(getSwipeDirection(swipe, swipeDistance)).to.be.undefined;
    });

    it('should return undefined if swipe start equals swipe end', () => {
      const swipe = { xStart: 50, xEnd: 50, xMin: 50 };
      const swipeDistance = { xDistance: 0 };
      expect(getSwipeDirection(swipe, swipeDistance)).to.be.undefined;
    });
  });
});

describe('Carousel Functions', () => {
  describe('decorateNextPreviousBtns', () => {
    it('should create and return next and previous buttons', () => {
      const [previousBtn, nextBtn] = decorateNextPreviousBtns();
      expect(previousBtn.tagName).to.equal('BUTTON');
      expect(previousBtn.classList.contains('carousel-previous')).to.be.true;
      expect(previousBtn.classList.contains('is-delayed')).to.be.true;
      expect(previousBtn.getAttribute('aria-label')).to.equal('Previous slide');
      expect(previousBtn.querySelector('svg')).to.not.be.null;

      expect(nextBtn.tagName).to.equal('BUTTON');
      expect(nextBtn.classList.contains('carousel-next')).to.be.true;
      expect(nextBtn.classList.contains('is-delayed')).to.be.true;
      expect(nextBtn.getAttribute('aria-label')).to.equal('Next slide');
      expect(nextBtn.querySelector('svg')).to.not.be.null;
    });

    it('should include slide count in previous aria-label when slides provided', () => {
      const slides = new Array(5).fill(null);
      const [previousBtn] = decorateNextPreviousBtns(slides);
      expect(previousBtn.getAttribute('aria-label')).to.equal('Previous slide, slide 1 of 5');
    });
  });

  describe('decorateSlideIndicators', () => {
    it('should create and return slide indicators', () => {
      const slides = new Array(3).fill(null);
      const indicators = decorateSlideIndicators(slides);

      expect(indicators.length).to.equal(3);
      indicators.forEach((indicator, index) => {
        expect(indicator.tagName).to.equal('LI');
        expect(indicator.classList.contains('carousel-indicator')).to.be.true;
        expect(indicator.getAttribute('data-index')).to.equal(String(index));
        if (index === 0) {
          expect(indicator.classList.contains('active')).to.be.true;
          expect(indicator.getAttribute('aria-current')).to.equal('location');
        } else {
          expect(indicator.classList.contains('active')).to.be.false;
          expect(indicator.getAttribute('aria-current')).to.be.null;
        }
      });
    });
  });

  describe('handleNext', () => {
    it('should return the next element or the first element if at the end', () => {
      const elementsHolder = createTag('div');
      const el1 = createTag('div');
      const el2 = createTag('div');
      const el3 = createTag('div');
      const elements = [el1, el2, el3];
      elements.forEach((el) => elementsHolder.appendChild(el));

      expect(handleNext(el1, elements)).to.equal(el2);
      expect(handleNext(el2, elements)).to.equal(el3);
      expect(handleNext(el3, elements)).to.equal(el1);
    });
  });

  describe('handlePrevious', () => {
    it('should return the previous element or the last element if at the start', () => {
      const elementsHolder = createTag('div');
      const el1 = createTag('div');
      const el2 = createTag('div');
      const el3 = createTag('div');
      const elements = [el1, el2, el3];
      elements.forEach((el) => elementsHolder.appendChild(el));

      expect(handlePrevious(el1, elements)).to.equal(el3);
      expect(handlePrevious(el2, elements)).to.equal(el1);
      expect(handlePrevious(el3, elements)).to.equal(el2);
    });
  });

  describe('moveSlides', () => {
    let carouselElements;

    beforeEach(() => {
      // Setup mock elements for moveSlides
      const slideContainer = document.createElement('div');
      const controlsContainer = document.createElement('div');
      const slides = new Array(3).fill(null).map((_, index) => {
        const slide = document.createElement('div');
        slide.classList.add('carousel-slide');
        slide.innerHTML = `<a href="#">Link ${index}</a>`;
        slideContainer.appendChild(slide);
        return slide;
      });
      const slideIndicators = new Array(3).fill(null).map((_, index) => {
        const li = document.createElement('li');
        li.classList.add('carousel-indicator');
        li.setAttribute('data-index', index);
        controlsContainer.appendChild(li);
        return li;
      });
      const prevBtn = document.createElement('button');
      prevBtn.setAttribute('data-toggle', 'previous');
      const nextBtn = document.createElement('button');
      nextBtn.setAttribute('data-toggle', 'next');
      const nextPreviousBtns = [prevBtn, nextBtn];
      const ariaLive = document.createElement('div');

      const el = document.createElement('div');

      carouselElements = {
        el,
        slideContainer,
        slides,
        nextPreviousBtns,
        slideIndicators,
        controlsContainer,
        ariaLive,
        currentActiveIndex: 0,
      };

      slides[0].classList.add('active');
      slideIndicators[0].classList.add('active');
      slideIndicators[0].setAttribute('aria-current', 'location');
    });

    it('should handle next button click', () => {
      const event = {
        currentTarget: carouselElements.nextPreviousBtns[1],
        key: null,
        type: 'click',
      };

      moveSlides(event, carouselElements);

      expect(carouselElements.slides[1].classList.contains('active')).to.be.true;
      expect(carouselElements.currentActiveIndex).to.equal(1);
    });

    it('should handle previous button click', () => {
      const event = {
        currentTarget: carouselElements.nextPreviousBtns[0],
        key: null,
        type: 'click',
      };

      moveSlides(event, carouselElements);

      expect(carouselElements.slides[2].classList.contains('active')).to.be.true;
      expect(carouselElements.currentActiveIndex).to.equal(2);
    });

    it('should handle right arrow key press', () => {
      const event = {
        currentTarget: carouselElements.el,
        key: KEY_CODES.ARROW_RIGHT,
        type: 'keydown',
      };

      moveSlides(event, carouselElements);

      expect(carouselElements.slides[1].classList.contains('active')).to.be.true;
      expect(carouselElements.slideIndicators[1].classList.contains('active')).to.be.true;
      expect(carouselElements.slideIndicators[1].getAttribute('aria-current')).to.equal('location');
    });

    it('should handle left arrow key press', () => {
      const event = {
        currentTarget: carouselElements.el,
        key: KEY_CODES.ARROW_LEFT,
        type: 'keydown',
      };

      moveSlides(event, carouselElements);

      expect(carouselElements.slides[2].classList.contains('active')).to.be.true;
      expect(carouselElements.slideIndicators[2].classList.contains('active')).to.be.true;
      expect(carouselElements.slideIndicators[2].getAttribute('aria-current')).to.equal('location');
    });

    it('should update aria-hidden and tabindex on slides', () => {
      const event = {
        currentTarget: carouselElements.el,
        key: KEY_CODES.ARROW_RIGHT,
        type: 'keydown',
      };

      moveSlides(event, carouselElements);

      expect(carouselElements.slides[1].getAttribute('aria-hidden')).to.equal('false');
      expect(carouselElements.slides[0].getAttribute('aria-hidden')).to.equal('true');
    });

    it('should clear ariaLive text before updating', () => {
      carouselElements.ariaLive.textContent = 'Previous content';
      const event = {
        currentTarget: carouselElements.el,
        key: KEY_CODES.ARROW_RIGHT,
        type: 'keydown',
      };

      moveSlides(event, carouselElements);
      expect(carouselElements.ariaLive.textContent).to.equal('');
    });
  });
});
