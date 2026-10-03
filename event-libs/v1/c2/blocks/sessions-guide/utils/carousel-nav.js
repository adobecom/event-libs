// Prev/next stepping for natively scrolling (mobile/tablet) carousel strips (MWPW-208434).

// Card start offsets in the strip's scroll coordinates, so offset === the scrollLeft that aligns it.
function cardOffsets(strip) {
  const { left } = strip.getBoundingClientRect();
  const origin = left + strip.clientLeft
    + (parseFloat(getComputedStyle(strip).paddingLeft) || 0) - strip.scrollLeft;
  return [...strip.children].map((card) => card.getBoundingClientRect().left - origin);
}

// Index + scrollLeft of the card one step away from the current position, or null at that end.
export function adjacentCard(strip, direction) {
  if (!strip?.children.length) return null;
  const offsets = cardOffsets(strip);
  const current = strip.scrollLeft;
  const index = direction > 0
    ? offsets.findIndex((o) => o > current + 1)
    : offsets.findLastIndex((o) => o < current - 1);
  if (index < 0) return null;
  const maxScroll = strip.scrollWidth - strip.clientWidth;
  return { index, left: Math.min(Math.max(0, offsets[index]), maxScroll) };
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
