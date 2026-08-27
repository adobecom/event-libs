// Click-away test for the header's popovers. The isConnected guard matters: a handler that
// re-renders its own subtree away detaches the tapped node before the event reaches document,
// and contains() would read that orphan as "outside".
// See docs/sessions-guide-implementation-notes.md.
export function isOutsideClick(wrapEl, target) {
  if (!wrapEl || !target) return false;
  if (!target.isConnected) return false;
  return !wrapEl.contains(target);
}
