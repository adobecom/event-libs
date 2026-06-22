import { html, useEffect, useState, useRef } from '../../../deps/htm-preact.js';
import { useSessionGuide } from '../store/index.js';

function InfoIcon() {
  return html`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" width="20" height="20" aria-hidden="true" focusable="false">
      <circle cx="10" cy="10" r="9" stroke="currentColor" stroke-width="1.5" fill="none"/>
      <circle cx="10" cy="6.5" r="1" fill="currentColor"/>
      <rect x="9.25" y="9" width="1.5" height="5" rx="0.75" fill="currentColor"/>
    </svg>
  `;
}

function CheckIcon() {
  return html`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" width="20" height="20" aria-hidden="true" focusable="false">
      <circle cx="10" cy="10" r="9" stroke="currentColor" stroke-width="1.5" fill="none"/>
      <path d="M6.5 10.5l2.5 2.5 4.5-5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
    </svg>
  `;
}

function AlertIcon() {
  return html`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" width="20" height="20" aria-hidden="true" focusable="false">
      <path d="M8.564 2.955a1.667 1.667 0 0 1 2.872 0l7.167 12.444A1.667 1.667 0 0 1 17.167 18H2.833a1.667 1.667 0 0 1-1.436-2.601L8.564 2.955Z" stroke="currentColor" stroke-width="1.5" fill="none"/>
      <rect x="9.25" y="7.5" width="1.5" height="5" rx="0.75" fill="currentColor"/>
      <circle cx="10" cy="14.5" r="1" fill="currentColor"/>
    </svg>
  `;
}

const ICONS = {
  informative: InfoIcon,
  positive: CheckIcon,
  negative: AlertIcon,
};

export function Toast() {
  const { state, dispatch } = useSessionGuide();
  const { toast } = state;

  // `displayed` holds the toast data while it is on screen (including during exit transition).
  // `visible` drives the CSS transition: false = hidden/offset, true = fully shown.
  const [displayed, setDisplayed] = useState(null);
  const [visible, setVisible] = useState(false);
  const rafRef = useRef(null);

  // When a new toast arrives, mount it in the hidden state, then trigger the
  // enter transition after two rAFs so the browser paints the hidden state first.
  useEffect(() => {
    if (!toast) return undefined;
    cancelAnimationFrame(rafRef.current);
    setDisplayed(toast);
    setVisible(false);
    // Double rAF: first frame mounts the element hidden, second triggers the transition.
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = requestAnimationFrame(() => setVisible(true));
    });
    return () => cancelAnimationFrame(rafRef.current);
  }, [toast && toast.id]); // eslint-disable-line

  // Auto-dismiss: start the countdown only after the toast is fully visible.
  useEffect(() => {
    if (!visible || !displayed) return undefined;
    const duration = displayed.duration === null ? null : (displayed.duration || 1500);
    if (duration === null) return undefined;
    const id = setTimeout(() => setVisible(false), duration);
    return () => clearTimeout(id);
  }, [visible, displayed && displayed.id]); // eslint-disable-line

  // After the exit transition ends, remove the toast from the store and unmount.
  function handleTransitionEnd(e) {
    if (!visible && e.propertyName === 'opacity') {
      dispatch({ type: 'HIDE_TOAST' });
      setDisplayed(null);
    }
  }

  if (!displayed) return null;

  const dismiss = () => setVisible(false);
  const variant = displayed.variant || 'neutral';
  const Icon = ICONS[variant];
  const cls = ['sg-toast', `sg-toast--${variant}`, visible && 'sg-toast--visible'].filter(Boolean).join(' ');

  return html`
    <div
      class=${cls}
      role="status"
      aria-live="polite"
      ontransitionend=${handleTransitionEnd}
    >
      ${Icon && html`<span class="sg-toast__icon-wrap"><${Icon} /></span>`}
      <span class="sg-toast__msg">${displayed.message}</span>
      ${displayed.ctaLabel && displayed.ctaHref && html`
        <a class="sg-toast__cta" href=${displayed.ctaHref}>${displayed.ctaLabel}</a>
      `}
      ${displayed.ctaLabel && !displayed.ctaHref && displayed.ctaAction && html`
        <button class="sg-toast__cta" onclick=${displayed.ctaAction} type="button">${displayed.ctaLabel}</button>
      `}
      <button class="sg-toast__close" onclick=${dismiss} aria-label="Dismiss notification" type="button">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" width="10" height="10" aria-hidden="true" focusable="false">
          <path d="M1 1l8 8M9 1l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
      </button>
    </div>
  `;
}
