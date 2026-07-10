import { signal } from '../../deps/htm-preact.js';
import { createTag, loadStyle } from '../../utils/utils.js';

// Page-level, framework-agnostic toast: any block (Preact or vanilla) that touches the
// shared session-store actions can surface feedback here, not just sessions-guide.
export const toast = signal(null);

let nextId = 0;

export function showToast({
  message, variant = 'neutral', ctaLabel = null, ctaAction = null, ctaHref = null, duration,
} = {}) {
  nextId += 1;
  toast.value = {
    id: nextId,
    message,
    variant,
    ctaLabel,
    ctaAction,
    ctaHref,
    duration: duration !== undefined ? duration : 1500,
  };
}

export function hideToast() {
  toast.value = null;
}

const ICONS = {
  informative: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" width="20" height="20" aria-hidden="true" focusable="false"><circle cx="10" cy="10" r="9" stroke="currentColor" stroke-width="1.5" fill="none"/><circle cx="10" cy="6.5" r="1" fill="currentColor"/><rect x="9.25" y="9" width="1.5" height="5" rx="0.75" fill="currentColor"/></svg>',
  positive: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" width="20" height="20" aria-hidden="true" focusable="false"><circle cx="10" cy="10" r="9" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M6.5 10.5l2.5 2.5 4.5-5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>',
  negative: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" width="20" height="20" aria-hidden="true" focusable="false"><path d="M8.564 2.955a1.667 1.667 0 0 1 2.872 0l7.167 12.444A1.667 1.667 0 0 1 17.167 18H2.833a1.667 1.667 0 0 1-1.436-2.601L8.564 2.955Z" stroke="currentColor" stroke-width="1.5" fill="none"/><rect x="9.25" y="7.5" width="1.5" height="5" rx="0.75" fill="currentColor"/><circle cx="10" cy="14.5" r="1" fill="currentColor"/></svg>',
};

const CLOSE_ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" width="10" height="10" aria-hidden="true" focusable="false"><path d="M1 1l8 8M9 1l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';

let mounted = false;

export function mountToast() {
  if (mounted) return;
  mounted = true;

  loadStyle(new URL('./toast.css', import.meta.url).href);

  const el = createTag('div', { class: 'sg-toast', role: 'status', 'aria-live': 'polite' }, '', { parent: document.body });
  el.hidden = true;

  let rafId = null;
  let dismissTimer = null;
  let currentId = null;

  function dismissCurrent() {
    el.classList.remove('sg-toast--visible');
  }

  function renderContent(data) {
    el.textContent = '';
    const variant = data.variant || 'neutral';
    el.className = ['sg-toast', `sg-toast--${variant}`].join(' ');

    const icon = ICONS[variant];
    if (icon) el.append(createTag('span', { class: 'sg-toast__icon-wrap' }, icon));

    const msg = createTag('span', { class: 'sg-toast__msg' });
    msg.textContent = data.message;
    el.append(msg);

    if (data.ctaLabel && data.ctaHref) {
      const cta = createTag('a', { class: 'sg-toast__cta', href: data.ctaHref });
      cta.textContent = data.ctaLabel;
      el.append(cta);
    } else if (data.ctaLabel && data.ctaAction) {
      const cta = createTag('button', { class: 'sg-toast__cta', type: 'button' });
      cta.textContent = data.ctaLabel;
      cta.addEventListener('click', data.ctaAction);
      el.append(cta);
    }

    const closeBtn = createTag('button', { class: 'sg-toast__close', 'aria-label': 'Dismiss notification', type: 'button' }, CLOSE_ICON);
    closeBtn.addEventListener('click', dismissCurrent);
    el.append(closeBtn);
  }

  // Double rAF: first frame mounts the element hidden, second triggers the transition.
  function showNext(data) {
    currentId = data.id;
    cancelAnimationFrame(rafId);
    clearTimeout(dismissTimer);
    el.hidden = false;
    renderContent(data);
    el.classList.remove('sg-toast--visible');
    rafId = requestAnimationFrame(() => {
      rafId = requestAnimationFrame(() => {
        el.classList.add('sg-toast--visible');
        const duration = data.duration === null ? null : (data.duration || 1500);
        if (duration !== null) dismissTimer = setTimeout(dismissCurrent, duration);
      });
    });
  }

  // Once the exit transition finishes, clear the signal so a fresh SHOW_TOAST-equivalent
  // call (same id timing edge case aside) is free to start a new enter transition.
  el.addEventListener('transitionend', (e) => {
    if (e.propertyName === 'opacity' && !el.classList.contains('sg-toast--visible')) {
      el.hidden = true;
      currentId = null;
      hideToast();
    }
  });

  toast.subscribe((data) => {
    if (data && data.id !== currentId) showNext(data);
  });
}
