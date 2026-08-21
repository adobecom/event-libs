// Shared click-away test for the header's popovers (filter panel, view dropdown).
//
// The naive `!wrapEl.contains(e.target)` check has a trap when the listener is on
// `document` in the bubble phase: Preact flushes state updates on a microtask, and the
// spec runs a microtask checkpoint after *each* listener callback during dispatch. So a
// handler that re-renders its own subtree away — the filter panel's mobile drill-down
// swaps the category list out for the options screen — has already detached the tapped
// node by the time the event reaches `document`. `contains()` reads that orphan as
// "outside" and dismisses the whole popover.
//
// A node that left the document during this very dispatch was inside the popover when it
// was clicked, so it is never a click-away.

/**
 * True when `target` is a real click outside `wrapEl` and should dismiss it.
 * Returns false for a missing wrap/target, and for a target already detached from
 * the document (see above).
 */
export function isOutsideClick(wrapEl, target) {
  if (!wrapEl || !target) return false;
  if (!target.isConnected) return false;
  return !wrapEl.contains(target);
}
