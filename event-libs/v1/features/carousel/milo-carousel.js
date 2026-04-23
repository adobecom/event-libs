import { createTag, loadStyle } from '../../utils/utils.js';

export const ARROW_NEXT_IMG = `<svg xmlns="http://www.w3.org/2000/svg" width="21" height="21" viewBox="0 0 21 21">
<title>Next slide arrow</title>
<path d="M19.2214 10.8918C19.3516 10.5773 19.3516 10.2226 19.2214 9.90808C19.1562 9.75098 19.0621 9.60895 18.9435 9.49041L12.9241 3.47092C12.4226 2.96819 11.6076 2.96819 11.1061 3.47092C10.604 3.97239 10.604 4.78743 11.1061 5.2889L14.9312 9.11399H2.4314C1.72109 9.11399 1.146 9.69036 1.146 10.4C1.146 11.1097 1.72109 11.6861 2.4314 11.6861H14.9312L11.1061 15.5112C10.604 16.0126 10.604 16.8277 11.1061 17.3291C11.3568 17.5805 11.6863 17.7062 12.0151 17.7062C12.3439 17.7062 12.6733 17.5805 12.9241 17.3291L18.9436 11.3097C19.0622 11.1911 19.1562 11.0491 19.2214 10.8918Z"/>
</svg>`;

export const ARROW_PREVIOUS_IMG = `<svg xmlns="http://www.w3.org/2000/svg" width="21" height="21" viewBox="0 0 21 21">
<title>Previous slide arrow</title>
<path d="M19.2214 10.8918C19.3516 10.5773 19.3516 10.2226 19.2214 9.90808C19.1562 9.75098 19.0621 9.60895 18.9435 9.49041L12.9241 3.47092C12.4226 2.96819 11.6076 2.96819 11.1061 3.47092C10.604 3.97239 10.604 4.78743 11.1061 5.2889L14.9312 9.11399H2.4314C1.72109 9.11399 1.146 9.69036 1.146 10.4C1.146 11.1097 1.72109 11.6861 2.4314 11.6861H14.9312L11.1061 15.5112C10.604 16.0126 10.604 16.8277 11.1061 17.3291C11.3568 17.5805 11.6863 17.7062 12.0151 17.7062C12.3439 17.7062 12.6733 17.5805 12.9241 17.3291L18.9436 11.3097C19.0622 11.1911 19.1562 11.0491 19.2214 10.8918Z"/>
</svg>`;

export const KEY_CODES = {
  SPACE: 'Space',
  END: 'End',
  HOME: 'Home',
  ARROW_LEFT: 'ArrowLeft',
  ARROW_RIGHT: 'ArrowRight',
};

const FOCUSABLE_SELECTOR = 'a';

function getPreviousAriaLabel(currentIndex, totalSlides) {
  return currentIndex === 0 && totalSlides > 0
    ? `Previous slide, slide ${currentIndex + 1} of ${totalSlides}`
    : 'Previous slide';
}

function updatePreviousAriaLabel(carouselElements) {
  const { slides, nextPreviousBtns, currentActiveIndex } = carouselElements;
  if (!nextPreviousBtns?.[0]) return;

  nextPreviousBtns[0].setAttribute(
    'aria-label',
    getPreviousAriaLabel(currentActiveIndex, slides.length),
  );
}

export function decorateNextPreviousBtns(slides) {
  const totalSlides = slides ? slides.length : 0;

  const previousBtn = createTag(
    'button',
    {
      class: 'carousel-button carousel-previous is-delayed',
      'aria-label': getPreviousAriaLabel(0, totalSlides),
      'data-toggle': 'previous',
    },
    ARROW_PREVIOUS_IMG,
  );

  const nextBtn = createTag(
    'button',
    {
      class: 'carousel-button carousel-next is-delayed',
      'aria-label': 'Next slide',
      'data-toggle': 'next',
    },
    ARROW_NEXT_IMG,
  );
  return [previousBtn, nextBtn];
}

export function decorateSlideIndicators(slides) {
  const indicatorDots = [];

  for (let i = 0; i < slides.length; i += 1) {
    const li = createTag('li', {
      class: 'carousel-indicator',
      'data-index': i,
    });

    // Set initial active state
    if (i === 0) {
      li.classList.add('active');
      li.setAttribute('aria-current', 'location');
    }
    indicatorDots.push(li);
  }
  return indicatorDots;
}

export function handleNext(nextElement, elements) {
  if (nextElement.nextElementSibling) {
    return nextElement.nextElementSibling;
  }
  return elements[0];
}

export function handlePrevious(previousElment, elements) {
  if (previousElment.previousElementSibling) {
    return previousElment.previousElementSibling;
  }
  return elements[elements.length - 1];
}

function setAriaHiddenAndTabIndex({ el: block, slides }, activeEl) {
  const active = activeEl ?? block.querySelector('.carousel-slide.active');
  const activeIdx = slides.findIndex((s) => s === active);
  const showClass = [...block.classList].find((cls) => cls.startsWith('show-'));
  const visible = (showClass && parseInt(showClass.split('-')[1], 10)) || 1;
  const ordered = activeIdx > 0
    ? [...slides.slice(activeIdx), ...slides.slice(0, activeIdx)] : slides;
  ordered.forEach((slide, i) => {
    const isVisible = i < visible;
    slide.setAttribute('aria-hidden', !isVisible);
    slide.querySelectorAll(FOCUSABLE_SELECTOR).forEach((el) => {
      el.setAttribute('tabindex', isVisible ? 0 : -1);
    });
  });
}

// Sets a multiplier variable, used by CSS, to move the indicator dots.
function setIndicatorMultiplier(carouselElements, activeSlideIndicator, event) {
  const { slides, direction } = carouselElements;
  const maxViewableIndicators = 6;
  if (slides.length <= maxViewableIndicators) return;

  const { currentTarget, key } = event;
  const eventDirection = currentTarget.dataset.toggle || direction;
  const keyNavDirection = key === KEY_CODES.ARROW_RIGHT || undefined;
  const multiplierOffset = (eventDirection === 'next' || eventDirection === 'left')
    || keyNavDirection ? 4 : 3;
  const activeSlideIndex = Number(activeSlideIndicator.dataset.index);
  if (activeSlideIndex > multiplierOffset && activeSlideIndex <= slides.length) {
    /*
      * Stop adding to the multiplier if it equals the difference
      * between the slides length and maxViewableIndicators
    */
    const multiplier = activeSlideIndex - multiplierOffset >= slides.length - maxViewableIndicators
      ? slides.length - maxViewableIndicators
      : activeSlideIndex - multiplierOffset;
    activeSlideIndicator.parentElement.classList.add('move-indicators');
    activeSlideIndicator.parentElement.style = `--indicator-multiplier: ${multiplier}`;
  } else {
    const multiplier = 0;
    activeSlideIndicator.parentElement.style = `--indicator-multiplier: ${multiplier}`;
  }
}

export function moveSlides(event, carouselElements) {
  const {
    slideContainer,
    slides,
    nextPreviousBtns,
    slideIndicators,
    controlsContainer,
    direction,
    ariaLive,
  } = carouselElements;

  if (ariaLive) ariaLive.textContent = '';

  let referenceSlide = slideContainer.querySelector('.reference-slide');
  let activeSlide = slideContainer.querySelector('.active');
  let activeSlideIndicator = controlsContainer.querySelector('.active');

  // Track reference slide - last slide initially
  if (!referenceSlide) {
    referenceSlide = slides[slides.length - 1];
    referenceSlide.classList.add('reference-slide');
    referenceSlide.style.order = '1';
  }

  // Remove class/attributes after being tracked
  referenceSlide.classList.remove('reference-slide');
  referenceSlide.style.order = null;
  activeSlide.classList.remove('active');
  activeSlideIndicator.classList.remove('active');
  activeSlideIndicator.removeAttribute('aria-current');

  // Next arrow button, swipe, keyboard navigation
  if ((event.currentTarget).dataset.toggle === 'next'
    || event.key === KEY_CODES.ARROW_RIGHT
    || (direction === 'left' && event.type === 'touchend')) {
    nextPreviousBtns[1].focus();
    referenceSlide = handleNext(referenceSlide, slides);
    activeSlideIndicator = handleNext(activeSlideIndicator, slideIndicators);
    activeSlide = handleNext(activeSlide, slides);
    slideContainer?.classList.remove('is-reversing');
    carouselElements.currentActiveIndex = (carouselElements.currentActiveIndex + 1)
      % slides.length;
  }

  // Previous arrow button, swipe, keyboard navigation
  if ((event.currentTarget).dataset.toggle === 'previous'
    || event.key === KEY_CODES.ARROW_LEFT
    || (direction === 'right' && event.type === 'touchend')) {
    nextPreviousBtns[0].focus();
    referenceSlide = handlePrevious(referenceSlide, slides);
    activeSlideIndicator = handlePrevious(activeSlideIndicator, slideIndicators);
    activeSlide = handlePrevious(activeSlide, slides);
    slideContainer.classList.add('is-reversing');
    carouselElements.currentActiveIndex = (carouselElements.currentActiveIndex - 1
      + slides.length) % slides.length;
  }

  // Update reference slide attributes
  referenceSlide.classList.add('reference-slide');
  referenceSlide.style.order = '1';

  // Update active slide and indicator dot attributes
  activeSlide.classList.add('active');
  setAriaHiddenAndTabIndex(carouselElements, activeSlide);

  activeSlideIndicator.classList.add('active');
  activeSlideIndicator.setAttribute('aria-current', 'location');
  setIndicatorMultiplier(carouselElements, activeSlideIndicator, event);

  // Loop over all slide siblings to update their order
  for (let i = 2; i <= slides.length; i += 1) {
    referenceSlide = handleNext(referenceSlide, slides);
    referenceSlide.style.order = i;
  }

  updatePreviousAriaLabel(carouselElements);

  /*
   * Activates slide animation.
   * Delay time matches animation time for next/previous controls.
  */
  const slideDelay = 25;
  slideContainer.classList.remove('is-ready');
  return setTimeout(() => slideContainer.classList.add('is-ready'), slideDelay);
}

export function getSwipeDistance(start, end) {
  if (end === 0) {
    const updateStart = 0;
    return Math.abs(updateStart - end);
  }
  return Math.abs(start - end);
}

export function getSwipeDirection(swipe, swipeDistance) {
  const { xDistance } = swipeDistance;

  if (xDistance !== swipe.xStart && xDistance > swipe.xMin) {
    return (swipe.xEnd > swipe.xStart) ? 'right' : 'left';
  }
  return undefined;
}

/**
  * Mobile swipe/touch direction detection
  */
export function mobileSwipeDetect(carouselElements) {
  const { el } = carouselElements;
  const swipe = { xMin: 50 };
  /* c8 ignore start */
  el.addEventListener('touchstart', (event) => {
    const touch = event.touches[0];
    swipe.xStart = touch.screenX;
    swipe.yStart = touch.screenY;
  });

  el.addEventListener('touchmove', (event) => {
    const touch = event.touches[0];
    swipe.xEnd = touch.screenX;
    swipe.yEnd = touch.screenY;
    const xDistance = Math.abs(swipe.xEnd - swipe.xStart);
    const yDistance = Math.abs(swipe.yEnd - swipe.yStart);
    // If horizontal movement is greater than vertical, prevent default to stop vertical scrolling
    if (xDistance > yDistance && xDistance > 10) {
      event.preventDefault();
    }
  });

  el.addEventListener('touchend', (event) => {
    const swipeDistance = {};
    swipeDistance.xDistance = getSwipeDistance(swipe.xStart, swipe.xEnd);
    carouselElements.direction = getSwipeDirection(swipe, swipeDistance);

    // reset end swipe values
    swipe.xStart = 0;
    swipe.xEnd = 0;

    if (swipeDistance.xDistance > swipe.xMin) {
      moveSlides(event, carouselElements);
    }
  });
  /* c8 ignore end */
}

function handleChangingSlides(carouselElements) {
  const { el, nextPreviousBtns } = carouselElements;

  // Handle Next/Previous Buttons
  [...nextPreviousBtns].forEach((btn) => {
    btn.addEventListener('click', (event) => {
      moveSlides(event, carouselElements);
    });
  });

  // Handle keyboard navigation
  el.addEventListener('keydown', (event) => {
    if (event.key === KEY_CODES.ARROW_RIGHT
      || event.key === KEY_CODES.ARROW_LEFT) { moveSlides(event, carouselElements); }
  });

  // Swipe Events
  mobileSwipeDetect(carouselElements);
}

export default function buildMiloCarousel(el, slides) {
  return new Promise((resolve) => {
    const currentScriptUrl = new URL(import.meta.url);
    const cssUrl = new URL('./milo-carousel.css', currentScriptUrl);
    loadStyle(cssUrl.href, () => {
      const parentArea = el.closest('.fragment') || document;
      el.classList.add('carousel-plugin');

      const fragment = new DocumentFragment();
      const nextPreviousBtns = decorateNextPreviousBtns(slides);
      const slideIndicators = decorateSlideIndicators(slides);
      const controlsContainer = createTag('div', { class: 'carousel-controls is-delayed' });
      const nextPreviousContainer = createTag('div', { class: 'carousel-button-container' });

      fragment.append(...slides);
      const slideWrapper = createTag('div', { class: 'carousel-wrapper' });
      const ariaLive = createTag('div', {
        class: 'aria-live-container',
        'aria-live': 'polite',
      });
      slideWrapper.appendChild(ariaLive);
      const slideContainer = createTag('div', { class: 'carousel-slides' }, fragment);
      const carouselElements = {
        el,
        nextPreviousBtns,
        slideContainer,
        slides,
        slideIndicators,
        controlsContainer,
        direction: undefined,
        ariaLive,
        currentActiveIndex: 0,
      };

      slideWrapper.append(slideContainer);

      el.textContent = '';
      el.append(slideWrapper);

      const dotsUl = createTag('ul', { class: 'carousel-indicators' });
      dotsUl.append(...slideIndicators);
      controlsContainer.append(dotsUl);
      nextPreviousContainer.append(...nextPreviousBtns, controlsContainer);
      el.append(nextPreviousContainer);

      function handleDeferredImages() {
        const images = el.querySelectorAll('img[loading="lazy"]');
        images.forEach((img) => {
          img.removeAttribute('loading');
        });
        parentArea.removeEventListener('event-libs:deferred', handleDeferredImages, true);
      }
      parentArea.addEventListener('event-libs:deferred', handleDeferredImages, true);

      slides[0].classList.add('active');
      setAriaHiddenAndTabIndex(carouselElements, slides[0]);
      handleChangingSlides(carouselElements);

      // Remove is-delayed once the carousel is fully built and ready
      requestAnimationFrame(() => {
        [...el.querySelectorAll('.is-delayed')].forEach((item) => item.classList.remove('is-delayed'));
      });

      resolve();
    });
  });
}
