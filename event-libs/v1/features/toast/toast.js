import { signal } from '../../deps/htm-preact.js';
import { createTag, loadStyle } from '../../utils/utils.js';

// Page-level, framework-agnostic toast: any block can surface feedback here, not just sessions-guide.
// Ordered newest-first (index 0); every toast added is shown, stacked, none wait.
export const toasts = signal([]);

let nextId = 0;

// Auto-dismiss floor per WCAG 2.2.1 (enough time to read before it disappears).
const MIN_TOAST_DURATION = 5000;

function resolveDuration({ ctaLabel, duration }) {
  // Actionable toasts never auto-dismiss — enforced here, not trusted per call site.
  if (ctaLabel) return null;
  if (duration === null) return null;
  if (duration === undefined) return MIN_TOAST_DURATION;
  return Math.max(duration, MIN_TOAST_DURATION);
}

export function showToast({
  message, variant = 'neutral', ctaLabel = null, ctaAction = null, ctaHref = null, duration, key = null,
} = {}) {
  // Actionable toasts cap at one per `key`: a repeat trigger while one's showing is a no-op.
  if (key && ctaLabel && toasts.value.some((t) => t.key === key)) return null;

  nextId += 1;
  const id = nextId;
  toasts.value = [{
    id,
    message,
    variant,
    ctaLabel,
    ctaAction,
    ctaHref,
    key,
    duration: resolveDuration({ ctaLabel, duration }),
  }, ...toasts.value];
  return id;
}

// Called directly this dismisses instantly (no exit animation); no id clears every toast.
export function hideToast(id) {
  if (id === undefined) {
    toasts.value = [];
    return;
  }
  toasts.value = toasts.value.filter((t) => t.id !== id);
}

const ICONS = {
  informative: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" width="20" height="20" aria-hidden="true" focusable="false"><circle cx="10" cy="10" r="9" stroke="currentColor" stroke-width="1.5" fill="none"/><circle cx="10" cy="6.5" r="1" fill="currentColor"/><rect x="9.25" y="9" width="1.5" height="5" rx="0.75" fill="currentColor"/></svg>',
  positive: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" width="20" height="20" aria-hidden="true" focusable="false"><circle cx="10" cy="10" r="9" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M6.5 10.5l2.5 2.5 4.5-5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>',
  negative: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" width="20" height="20" aria-hidden="true" focusable="false"><path d="M8.564 2.955a1.667 1.667 0 0 1 2.872 0l7.167 12.444A1.667 1.667 0 0 1 17.167 18H2.833a1.667 1.667 0 0 1-1.436-2.601L8.564 2.955Z" stroke="currentColor" stroke-width="1.5" fill="none"/><rect x="9.25" y="7.5" width="1.5" height="5" rx="0.75" fill="currentColor"/><circle cx="10" cy="14.5" r="1" fill="currentColor"/></svg>',
};

const CLOSE_ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" width="10" height="10" aria-hidden="true" focusable="false"><path d="M1 1l8 8M9 1l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';

// Tracks remaining time across pause/resume so a hover/focus pause doesn't reset the countdown.
class Timer {
  constructor(callback, delay) {
    this.callback = callback;
    this.remaining = delay;
    this.startTime = null;
    this.timerId = null;
    this.resume();
  }

  pause() {
    if (this.timerId === null) return;
    clearTimeout(this.timerId);
    this.timerId = null;
    this.remaining -= Date.now() - this.startTime;
  }

  resume() {
    if (this.remaining <= 0 || this.timerId !== null) return;
    this.startTime = Date.now();
    this.timerId = setTimeout(this.callback, this.remaining);
  }

  clear() {
    if (this.timerId !== null) clearTimeout(this.timerId);
    this.timerId = null;
  }
}

let mounted = false;

function renderToastContent(el, data) {
  el.textContent = '';
  el.className = ['sg-toast', `sg-toast--${data.variant}`].join(' ');

  const icon = ICONS[data.variant];
  if (icon) el.append(createTag('span', { class: 'sg-toast__icon-wrap' }, icon));

  // Mounted aria-hidden, revealed one frame after the enter transition starts, so screen readers
  // announce reliably once instead of missing or double-announcing at initial mount.
  // role="alert" is reserved for negative; other variants queue politely instead of interrupting.
  const body = createTag('div', {
    class: 'sg-toast__body',
    role: data.variant === 'negative' ? 'alert' : 'status',
    'aria-atomic': 'true',
    'aria-hidden': 'true',
  });
  const msg = createTag('span', { class: 'sg-toast__msg', id: `sg-toast-msg-${data.id}` });
  msg.textContent = data.message;
  body.append(msg);

  if (data.ctaLabel && (data.ctaHref || data.ctaAction)) {
    const cta = data.ctaHref
      ? createTag('a', { class: 'sg-toast__cta', href: data.ctaHref })
      : createTag('button', { class: 'sg-toast__cta', type: 'button' });
    cta.textContent = data.ctaLabel;
    if (!data.ctaHref) cta.addEventListener('click', data.ctaAction);
    body.append(cta);
  }
  el.append(body);

  const closeBtn = createTag('button', { class: 'sg-toast__close', 'aria-label': 'Dismiss notification', type: 'button' }, CLOSE_ICON);
  el.append(closeBtn);

  return closeBtn;
}

export function mountToast() {
  if (mounted) return;
  mounted = true;

  loadStyle(new URL('./toast.css', import.meta.url).href);

  // Landmark region, F6/Shift+F6 navigable; aria-label doubles as the live announcer.
  const region = createTag('div', {
    class: 'sg-toast-region', role: 'region', 'aria-label': '0 notifications', tabindex: '-1',
  }, '', { parent: document.body });

  const items = new Map(); // id -> { el, timer, leaving }
  let hovered = false;
  let focused = false;

  // Region-wide: hovering/focusing anywhere in the stack pauses every visible toast's timer.
  function updateTimers() {
    const shouldPause = hovered || focused;
    items.forEach(({ timer }) => {
      if (!timer) return;
      if (shouldPause) timer.pause();
      else timer.resume();
    });
  }

  region.addEventListener('mouseenter', () => { hovered = true; updateTimers(); });
  region.addEventListener('mouseleave', () => { hovered = false; updateTimers(); });
  region.addEventListener('focusin', () => { focused = true; updateTimers(); });
  region.addEventListener('focusout', () => { focused = false; updateTimers(); });

  function finalizeDismiss(id) {
    const item = items.get(id);
    if (!item) return;
    if (document.activeElement === item.el || item.el.contains(document.activeElement)) {
      region.focus();
    }
    item.el.remove();
    items.delete(id);
    hideToast(id);
  }

  function requestDismiss(id) {
    const item = items.get(id);
    if (!item || item.leaving) return;
    item.leaving = true;
    item.timer?.clear();
    item.el.classList.remove('sg-toast--visible');
  }

  toasts.subscribe((list) => {
    const count = list.length;
    region.setAttribute('aria-label', `${count} notification${count === 1 ? '' : 's'}`);

    list.forEach((data) => {
      if (items.has(data.id)) return;

      const el = createTag('div', {
        class: 'sg-toast', role: 'alertdialog', 'aria-modal': 'false', tabindex: '0', 'aria-labelledby': `sg-toast-msg-${data.id}`,
      }, '', { parent: region });
      const closeBtn = renderToastContent(el, data);
      closeBtn.addEventListener('click', () => requestDismiss(data.id));

      const item = { el, timer: null, leaving: false };
      items.set(data.id, item);

      if (data.duration !== null) {
        item.timer = new Timer(() => requestDismiss(data.id), data.duration);
        if (hovered || focused) item.timer.pause();
      }

      el.addEventListener('transitionend', (e) => {
        if (e.propertyName !== 'opacity' || !item.leaving) return;
        finalizeDismiss(data.id);
      });

      // Double rAF: first frame mounts hidden, second triggers the transition (no flash).
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          el.classList.add('sg-toast--visible');
          el.querySelector('.sg-toast__body')?.removeAttribute('aria-hidden');
        });
      });
    });

    // Toasts removed directly via hideToast() have no exit animation to wait for.
    items.forEach((item, id) => {
      if (item.leaving || list.some((t) => t.id === id)) return;
      item.timer?.clear();
      item.el.remove();
      items.delete(id);
    });
  });
}
