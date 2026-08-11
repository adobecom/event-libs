// Milo's own focus trap (blocks/modal/modal.js) is baked into its own imperative,
// append-to-body dialog construction and can't be pointed at an already-mounted,
// Preact-managed container — so the drawer/filter panel need their own, lighter version
// of the same technique: cycle Tab/Shift+Tab within the container, close on Escape,
// and restore focus to whatever was focused before the trap activated.

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

  function onKeydown(e) {
    if (e.key === 'Escape') {
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
      lastItem.focus();
    } else if (!e.shiftKey && document.activeElement === lastItem) {
      e.preventDefault();
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
