// Prev/next navigation helpers for Session Guide carousels.
import { scrollBehavior } from './motion.js';

// Card start offsets in scrollLeft coordinates.
function cardOffsets(strip) {
  const { left } = strip.getBoundingClientRect();
  const origin = left + strip.clientLeft
    + (parseFloat(getComputedStyle(strip).paddingLeft) || 0) - strip.scrollLeft;
  return [...strip.children].map((card) => card.getBoundingClientRect().left - origin);
}

// The card one step away from `from` (default: scrollLeft), or null at that end.
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

// Upper bound on a smooth scroll; older pending targets/presses are stale.
const PENDING_MS = 1000;

// Scrolls one card; a press mid-animation steps from the pending target, not the in-between scrollLeft.
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

// When a just-pressed arrow disables itself, move focus to the other arrow instead of <body>.
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

// Reports scroll edges on scroll and on strip/card resize; returns a cleanup.
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

// ── Paged (desktop) carousels: page by measured card positions (widths can vary) ──

// True while a CSS `width` transition runs inside `el`.
export function widthTransitionRunning(el) {
  return !!el?.getAnimations?.({ subtree: true })
    .some((a) => a.transitionProperty === 'width' && a.playState === 'running');
}

// Card starts/ends relative to the first card (offsetLeft ignores transforms).
export function measureCards(cards) {
  const base = cards[0]?.offsetLeft || 0;
  const starts = cards.map((c) => c.offsetLeft - base);
  return { starts, ends: cards.map((c, i) => starts[i] + c.offsetWidth) };
}

// Index of the last card fully inside a `trackWidth` window that starts at card `from`.
export function lastFullyVisible({ starts, ends }, from, trackWidth) {
  let last = from;
  for (let i = from + 1; i < starts.length; i += 1) {
    if (ends[i] - starts[from] > trackWidth + 1) break;
    last = i;
  }
  return last;
}

// Smallest start index from which every remaining card fits.
export function maxPageOffset({ starts, ends }, trackWidth) {
  if (!starts.length) return 0;
  const total = ends[ends.length - 1];
  const index = starts.findIndex((s) => total - s <= trackWidth + 1);
  return index < 0 ? starts.length - 1 : index;
}

// Start of the page that ends with card `from - 1`.
export function previousPageStart({ starts, ends }, from, trackWidth) {
  if (from <= 0) return 0;
  const lastIndex = from - 1;
  let start = lastIndex;
  while (start > 0 && ends[lastIndex] - starts[start - 1] <= trackWidth + 1) start -= 1;
  return start;
}
