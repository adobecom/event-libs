// Prev/next stepping for natively scrolling (mobile/tablet) carousel strips (MWPW-208434).
import { scrollBehavior } from './motion.js';

// Card start offsets in the strip's scroll coordinates, so offset === the scrollLeft that aligns it.
function cardOffsets(strip) {
  const { left } = strip.getBoundingClientRect();
  const origin = left + strip.clientLeft
    + (parseFloat(getComputedStyle(strip).paddingLeft) || 0) - strip.scrollLeft;
  return [...strip.children].map((card) => card.getBoundingClientRect().left - origin);
}

// Index + scrollLeft of the card one step away from `from` (default: current position), or null at that end.
export function adjacentCard(strip, direction, from) {
  if (!strip?.children.length) return null;
  const offsets = cardOffsets(strip);
  const current = from ?? strip.scrollLeft;
  const index = direction > 0
    ? offsets.findIndex((o) => o > current + 1)
    : offsets.findLastIndex((o) => o < current - 1);
  if (index < 0) return null;
  const maxScroll = strip.scrollWidth - strip.clientWidth;
  return { index, left: Math.min(Math.max(0, offsets[index]), maxScroll) };
}

// Upper bound on a smooth scroll's duration; past it a pending target or arrow press is stale.
const PENDING_MS = 1000;

// Scrolls one card in `direction` and returns the target (or null). A smooth scroll reports
// in-between scrollLeft values, so a press mid-animation steps from the pending target instead.
// Only positions between the previous start and target count, so an intervening swipe resets it.
export function scrollToAdjacent(strip, direction, pendingRef) {
  if (!strip) return null;
  const pending = pendingRef.current;
  const current = strip.scrollLeft;
  const moving = pending && performance.now() < pending.until
    && current >= Math.min(pending.from, pending.left) - 1
    && current <= Math.max(pending.from, pending.left) + 1
    && Math.abs(current - pending.left) > 1;
  const target = adjacentCard(strip, direction, moving ? pending.left : undefined);
  if (!target) return null;
  pendingRef.current = { from: current, left: target.left, until: performance.now() + PENDING_MS };
  strip.scrollTo({ left: target.left, behavior: scrollBehavior() });
  return target;
}

// A focused arrow that becomes disabled at an end drops focus to <body>; hand it to the other
// arrow. `pressRef.current` is `{ button, at }` from the click; it's consumed once and expires so a
// later re-render can't pull focus (or scroll the page) back to the carousel.
export function handOffArrowFocus(pressRef) {
  const press = pressRef.current;
  if (!press) return;
  if (performance.now() - press.at > PENDING_MS) {
    pressRef.current = null;
    return;
  }
  const { button } = press;
  if (!button?.disabled) return;
  pressRef.current = null;
  const active = document.activeElement;
  if (!button.parentElement || (active && active !== button && active !== document.body)) return;
  const other = [...button.parentElement.children]
    .find((el) => el !== button && el.tagName === 'BUTTON' && !el.disabled);
  other?.focus({ preventScroll: true });
}

export function scrollEdges(strip) {
  if (!strip) return { atStart: true, atEnd: true };
  const maxScroll = strip.scrollWidth - strip.clientWidth;
  return { atStart: strip.scrollLeft <= 1, atEnd: strip.scrollLeft >= maxScroll - 1 };
}

// Keeps prev/next disabled state in sync with the strip's scroll position and size. Cards are
// observed too since a card widening (scheduled/favorited) changes scrollWidth, not the strip box.
export function watchScrollEdges(strip, onChange) {
  if (!strip) return () => {};
  const update = () => onChange(scrollEdges(strip));
  update();
  strip.addEventListener('scroll', update, { passive: true });
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(update) : null;
  [strip, ...strip.children].forEach((el) => ro?.observe(el));
  return () => {
    strip.removeEventListener('scroll', update);
    ro?.disconnect();
  };
}
