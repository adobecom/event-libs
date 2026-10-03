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

// Upper bound on a smooth scroll's duration; past it a stale pending target is ignored.
const PENDING_MS = 1000;

// Scrolls one card in `direction` and returns the target (or null). A smooth scroll reports
// in-between scrollLeft values, so a press mid-animation steps from the pending target instead.
export function scrollToAdjacent(strip, direction, pendingRef) {
  if (!strip) return null;
  const pending = pendingRef.current;
  const moving = pending && performance.now() < pending.until
    && Math.abs(strip.scrollLeft - pending.left) > 1;
  const target = adjacentCard(strip, direction, moving ? pending.left : undefined);
  if (!target) return null;
  pendingRef.current = { left: target.left, until: performance.now() + PENDING_MS };
  strip.scrollTo({ left: target.left, behavior: scrollBehavior() });
  return target;
}

// A focused arrow that becomes disabled at an end drops focus to <body>; hand it to the other arrow.
export function handOffArrowFocus(button) {
  if (!button?.disabled || !button.parentElement) return;
  const active = document.activeElement;
  if (active && active !== button && active !== document.body) return;
  const other = [...button.parentElement.children]
    .find((el) => el !== button && el.tagName === 'BUTTON' && !el.disabled);
  other?.focus();
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
