// The drawer slide and the carousel/page scrolls are driven imperatively, so the CSS
// prefers-reduced-motion block can't reach them — they consult these instead.

export function prefersReducedMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false;
}

/** `behavior` value for scrollTo/scrollBy that respects the motion preference. */
export function scrollBehavior() {
  return prefersReducedMotion() ? 'auto' : 'smooth';
}
