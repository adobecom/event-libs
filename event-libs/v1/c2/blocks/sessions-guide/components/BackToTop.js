import { html, useEffect, useState } from '../../../../deps/htm-preact.js';
import { scrollBehavior } from '../utils/motion.js';
import { IconArrowUp } from './icons.js';

// Half a screen, with a floor so a short drawer doesn't reveal the button immediately.
export function shouldShowBackToTop(scrolled, viewportHeight) {
  return scrolled > Math.max(240, (viewportHeight || 0) / 2);
}

// Honours the motion preference. Exported so the jump is testable on its own.
export function scrollToTop(scroller) {
  (scroller || window).scrollTo({ top: 0, behavior: scrollBehavior() });
}

// Desktop-only; hidden below 1280px in CSS. scrollerRef omitted on the full-page surface,
// where the window scrolls. focusRef needs tabindex="-1" to accept programmatic focus.
export function BackToTop({ scrollerRef, focusRef, fixed }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Window fallback is the full-page surface, which has no inner scroller.
    const scroller = scrollerRef?.current || window;
    const isWindow = scroller === window;
    const update = () => {
      const scrolled = isWindow ? window.scrollY : scroller.scrollTop;
      const height = isWindow ? window.innerHeight : scroller.clientHeight;
      setVisible(shouldShowBackToTop(scrolled, height));
    };
    update();
    scroller.addEventListener('scroll', update, { passive: true });
    return () => scroller.removeEventListener('scroll', update);
  }, []);

  const toTop = () => {
    const scroller = scrollerRef?.current;
    scrollToTop(scroller);
    // Focus must leave before the jump makes this inert — an inert element drops focus to
    // the document, which sends the next Tab into the browser chrome past the focus trap.
    (focusRef?.current || scroller)?.focus?.({ preventScroll: true });
  };

  const cls = [
    'sg-back-to-top',
    fixed && 'sg-back-to-top--fixed',
    visible && 'sg-back-to-top--visible',
  ].filter(Boolean).join(' ');

  // inert keeps the faded-out button out of the tab order and away from assistive tech.
  return html`
    <button
      class=${cls}
      onclick=${toTop}
      inert=${visible ? undefined : true}
      daa-ll="Session-Guide-Back-To-Top"
      type="button"
    >
      <span class="sg-back-to-top__arrow" aria-hidden="true"><${IconArrowUp} /></span>
      <span class="sg-back-to-top__label">Back to top</span>
    </button>
  `;
}
