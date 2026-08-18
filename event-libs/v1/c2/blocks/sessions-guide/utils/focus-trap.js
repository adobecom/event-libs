// Milo's shared focus trap (blocks/modal/modal.js) is baked into its own imperative,
// append-to-body dialog and can't target an already-mounted, Preact-managed container —
// hence this lighter, standalone version (see trapFocus() below).

const FOCUSABLE_SELECTOR = 'a[href], button:not([disabled]), input:not([disabled]), '
  + 'select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function getFocusables(containerEl) {
  return [...containerEl.querySelectorAll(FOCUSABLE_SELECTOR)].filter((el) => el.offsetParent !== null);
}

/**
 * Traps Tab/Shift+Tab focus cycling within `containerEl`, calls `onEscape` on Escape,
 * and restores focus on cleanup to whatever was focused before the trap activated.
 * Returns a cleanup function.
 */
export function trapFocus(containerEl, onEscape) {
  if (!containerEl) return () => {};
  const previouslyFocused = document.activeElement;

  const [first] = getFocusables(containerEl);
  (first || containerEl).focus?.({ preventScroll: true });

  // Traps nest (the filter panel sits inside the drawer), and both listen on their own
  // container, so an unstopped key would bubble to the outer trap and dismiss it too.
  // Stopping propagation once handled keeps Escape scoped to the innermost surface.
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
