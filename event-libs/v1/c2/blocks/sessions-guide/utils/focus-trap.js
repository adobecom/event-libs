// Milo's trap is baked into its own append-to-body dialog and can't target an
// already-mounted, Preact-managed container.

const FOCUSABLE_SELECTOR = 'a[href], button:not([disabled]), input:not([disabled]), '
  + 'select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// An element the browser refuses to focus becomes a phantom boundary: it can never be
// document.activeElement, so the wrap-around below lets Tab walk out of the trap.
// The live case is BackToTop.js, mounted-but-inert while faded out.
function isFocusable(el) {
  if (el.offsetParent === null) return false;
  if (el.closest('[inert]')) return false;
  return getComputedStyle(el).visibility !== 'hidden';
}

function getFocusables(containerEl) {
  return [...containerEl.querySelectorAll(FOCUSABLE_SELECTOR)].filter(isFocusable);
}

// Cycles Tab within containerEl, calls onEscape, and restores prior focus on cleanup.
export function trapFocus(containerEl, onEscape) {
  if (!containerEl) return () => {};
  const previouslyFocused = document.activeElement;

  const [first] = getFocusables(containerEl);
  (first || containerEl).focus?.({ preventScroll: true });

  // Traps nest, so an unstopped Escape would bubble out and dismiss the outer one too.
  function onKeydown(e) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onEscape?.();
      return;
    }
    if (e.key !== 'Tab') return;
    const items = getFocusables(containerEl);
    if (!items.length) return;
    const firstItem = items[0];
    const lastItem = items[items.length - 1];
    if (e.shiftKey && document.activeElement === firstItem) {
      e.preventDefault();
      e.stopPropagation();
      lastItem.focus();
    } else if (!e.shiftKey && document.activeElement === lastItem) {
      e.preventDefault();
      e.stopPropagation();
      firstItem.focus();
    }
  }

  containerEl.addEventListener('keydown', onKeydown);

  return () => {
    containerEl.removeEventListener('keydown', onKeydown);
    if (previouslyFocused?.focus && document.contains(previouslyFocused)) {
      previouslyFocused.focus({ preventScroll: true });
    }
  };
}
