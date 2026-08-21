import { html, useEffect, useState } from '../../../../deps/htm-preact.js';
import { scrollBehavior } from '../utils/motion.js';
import { IconArrowUp } from './icons.js';

// Half a screen of scrolling before it fades in: enough that the top of the list is
// genuinely out of reach, with a floor so a short drawer doesn't reveal the button almost
// immediately. Pure and exported so the threshold is unit-testable without a scroll harness.
export function shouldShowBackToTop(scrolled, viewportHeight) {
  return scrolled > Math.max(240, (viewportHeight || 0) / 2);
}

// Jumps the given scroller (or the window) back to the top, honouring the motion
// preference. Exported alongside the component so the jump is testable on its own.
export function scrollToTop(scroller) {
  (scroller || window).scrollTo({ top: 0, behavior: scrollBehavior() });
}

/**
 * Desktop-only "Back to top" affordance (Figma 9145:44653) — fades in once the list has
 * been scrolled, jumps back to the top when clicked. Hidden below 1280px in CSS: the
 * narrower layouts are a full-screen takeover where the header is a short flick away.
 *
 * @param {object} props
 * @param {{current: HTMLElement}} [props.scrollerRef] - the element that scrolls (the
 *   drawer's own body). Omit on the full-page surface, where the window scrolls.
 * @param {{current: HTMLElement}} [props.focusRef] - where focus lands after the jump;
 *   defaults to the scroller. Needs tabindex="-1" to accept programmatic focus.
 * @param {boolean} [props.fixed] - position against the viewport instead of the nearest
 *   positioned ancestor; for the full-page surface.
 */
export function BackToTop({ scrollerRef, focusRef, fixed }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Refs are attached before effects run, so the drawer's body element is available here;
    // the window fallback is for the full-page surface, which has no inner scroller.
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
    // Focus has to leave this button before the jump fades it out and makes it inert: an
    // inert element can't hold focus, so the browser drops focus to the document instead —
    // which sends the next Tab into the browser chrome, and leaves the drawer's focus trap
    // (it listens on the drawer) unable to see the keypress at all. Landing on the top of
    // the list means the next Tab continues from where the user just jumped to.
    (focusRef?.current || scroller)?.focus?.({ preventScroll: true });
  };

  const cls = [
    'sg-back-to-top',
    fixed && 'sg-back-to-top--fixed',
    visible && 'sg-back-to-top--visible',
  ].filter(Boolean).join(' ');

  // inert (same approach as Carousel.js's off-page cards) keeps the faded-out button out of
  // the tab order and away from assistive tech, rather than leaving an invisible target.
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
