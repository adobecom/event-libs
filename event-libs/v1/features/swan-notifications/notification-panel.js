// Native modal dialogs escape gnav's clipping/stacking contexts on mobile;
// show() keeps the desktop dialog in its existing bell-relative position.
export function bindNotificationPanel(panel, button, header, onOpen) {
  const mobile = window.matchMedia('(width < 900px)');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let phase = 'closed';
  let modal = false;
  let animation = null;
  let closeTimer = null;
  let restoreScroll = null;
  let drag = null;

  function cancelAnimation() {
    clearTimeout(closeTimer);
    closeTimer = null;
    animation?.cancel();
    animation = null;
  }

  function translation() {
    const transform = getComputedStyle(panel).transform;
    return transform === 'none' ? 0 : new DOMMatrixReadOnly(transform).m42;
  }

  function lockScroll() {
    // Body overflow creates a scroll container that breaks the sticky navigation.
    const root = document.documentElement;
    const value = root.style.getPropertyValue('overflow');
    const priority = root.style.getPropertyPriority('overflow');
    root.style.setProperty('overflow', 'hidden');
    restoreScroll = () => {
      if (value) root.style.setProperty('overflow', value, priority);
      else root.style.removeProperty('overflow');
    };
  }

  function stopDrag() {
    if (drag && header.hasPointerCapture(drag.id)) header.releasePointerCapture(drag.id);
    drag = null;
    document.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('pointerup', onPointerUp);
    document.removeEventListener('pointercancel', onPointerCancel);
  }

  function finishClose() {
    phase = 'closed';
    cancelAnimation();
    stopDrag();
    panel.close();
    panel.hidden = true;
    panel.style.removeProperty('transform');
    panel.removeAttribute('aria-modal');
    button.setAttribute('aria-expanded', 'false');
    restoreScroll?.();
    restoreScroll = null;
    document.removeEventListener('click', onOutsideClick);
    document.removeEventListener('keydown', onKeydown);
    button.focus({ preventScroll: true });
  }

  function slide(from, to, finished = () => {}) {
    cancelAnimation();
    panel.style.removeProperty('transform');
    if (reducedMotion.matches) {
      finished();
      return;
    }
    const currentAnimation = panel.animate(
      [{ transform: `translateY(${from}px)` }, { transform: `translateY(${to}px)` }],
      { duration: 250, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' },
    );
    animation = currentAnimation;
    currentAnimation.onfinish = () => {
      if (animation !== currentAnimation) return;
      animation = null;
      finished();
    };
  }

  function closePanel() {
    if (phase === 'closed' || phase === 'closing') return;
    phase = 'closing';
    button.setAttribute('aria-expanded', 'false');
    stopDrag();
    if (modal && !reducedMotion.matches) {
      slide(translation(), panel.offsetHeight, finishClose);
      // Background tabs can defer animation finish events; release the modal
      // and scroll lock even when no rendering frame is delivered.
      closeTimer = setTimeout(finishClose, 300);
    } else {
      finishClose();
    }
  }

  function onOutsideClick(e) {
    if (!panel.contains(e.target) && !button.contains(e.target)) closePanel();
  }

  function onKeydown(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      closePanel();
    }
  }

  function showPanel() {
    modal = mobile.matches;
    if (modal) {
      panel.showModal();
      panel.setAttribute('aria-modal', 'true');
      lockScroll();
      header.focus({ preventScroll: true });
    } else {
      panel.show();
      panel.removeAttribute('aria-modal');
    }
  }

  function openPanel() {
    const reopening = phase === 'closing';
    const from = reopening ? translation() : panel.offsetHeight;
    cancelAnimation();
    phase = 'open';
    panel.hidden = false;
    if (!panel.open) showPanel();
    button.setAttribute('aria-expanded', 'true');
    document.addEventListener('click', onOutsideClick);
    document.addEventListener('keydown', onKeydown);
    onOpen();
    if (modal) slide(reopening ? from : panel.offsetHeight, 0);
  }

  function onPointerMove(e) {
    if (!drag || e.pointerId !== drag.id) return;
    drag.distance = Math.max(0, e.clientY - drag.startY);
    panel.style.transform = `translateY(${drag.offset + drag.distance}px)`;
  }

  function onPointerUp(e) {
    if (!drag || e.pointerId !== drag.id) return;
    onPointerMove(e);
    const dismiss = drag.distance >= Math.min(100, panel.offsetHeight / 4);
    stopDrag();
    if (dismiss) closePanel();
    else slide(translation(), 0);
  }

  function onPointerCancel(e) {
    if (!drag || e.pointerId !== drag.id) return;
    stopDrag();
    slide(translation(), 0);
  }

  header.addEventListener('pointerdown', (e) => {
    if (!modal || phase !== 'open' || !e.isPrimary || e.button !== 0 || drag) return;
    const offset = translation();
    cancelAnimation();
    drag = { id: e.pointerId, startY: e.clientY, distance: 0, offset };
    if (e.isTrusted) header.setPointerCapture(e.pointerId);
    panel.style.transform = `translateY(${offset}px)`;
    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
    document.addEventListener('pointercancel', onPointerCancel);
  });
  header.addEventListener('lostpointercapture', onPointerCancel);

  button.addEventListener('click', (e) => {
    e.stopPropagation();
    if (phase === 'open') closePanel();
    else openPanel();
  });

  // Native backdrop events target the dialog itself; distinguish them from a
  // click on the dialog's own empty space using viewport coordinates.
  panel.addEventListener('click', (e) => {
    if (!modal || e.target !== panel) return;
    const rect = panel.getBoundingClientRect();
    if (e.clientX < rect.left || e.clientX >= rect.right
      || e.clientY < rect.top || e.clientY >= rect.bottom) closePanel();
  });
  panel.addEventListener('cancel', (e) => {
    e.preventDefault();
    closePanel();
  });
  panel.addEventListener('close', () => {
    if (!panel.open && phase !== 'closed') finishClose();
  });
  mobile.addEventListener('change', () => {
    if (phase === 'closed' || mobile.matches === modal) return;
    if (phase === 'closing') {
      finishClose();
      return;
    }
    cancelAnimation();
    stopDrag();
    panel.style.removeProperty('transform');
    panel.close();
    restoreScroll?.();
    restoreScroll = null;
    showPanel();
    if (!modal) button.focus({ preventScroll: true });
  });
  reducedMotion.addEventListener('change', () => {
    if (!reducedMotion.matches) return;
    cancelAnimation();
    if (phase === 'closing') finishClose();
  });

  return () => {
    if (phase !== 'closed') finishClose();
  };
}
