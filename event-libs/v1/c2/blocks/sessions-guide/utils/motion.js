// The drawer slide and the carousel/page scrolls are driven imperatively, so the CSS
// prefers-reduced-motion block can't reach them — they consult these instead.

export function prefersReducedMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false;
}

/** `behavior` value for scrollTo/scrollBy that respects the motion preference. */
export function scrollBehavior() {
  return prefersReducedMotion() ? 'auto' : 'smooth';
}

// Milo loads Lenis (window.lenis) on foundation=c2 pages. While it eases a wheel/trackpad
// scroll it re-applies its own target every frame, cancelling a native window.scrollTo —
// so page-level jumps must go through Lenis when it's present. Lenis's global lerp (0.06)
// takes ~2s to cover a screen; a fixed duration matches the native smooth scroll (~700ms).
export const PAGE_SCROLL_DURATION_S = 0.7;

export function scrollPageToTop() {
  if (window.lenis?.scrollTo) {
    window.lenis.scrollTo(0, {
      immediate: prefersReducedMotion(),
      duration: PAGE_SCROLL_DURATION_S,
      force: true,
    });
    return;
  }
  window.scrollTo({ top: 0, behavior: scrollBehavior() });
}
