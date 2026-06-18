import { html, useEffect } from '../../../deps/htm-preact.js';
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

  useEffect(() => {
    if (!toast) return undefined;
    const duration = toast.duration === null ? null : (toast.duration || 1500);
    if (duration === null) return undefined;
    const id = setTimeout(() => dispatch({ type: 'HIDE_TOAST' }), duration);
    return () => clearTimeout(id);
  }, [toast && toast.id]); // eslint-disable-line

  if (!toast) return null;

  const variant = toast.variant || 'neutral';
  const Icon = ICONS[variant];
  const dismiss = () => dispatch({ type: 'HIDE_TOAST' });

  return html`
    <div class=${'sg-toast sg-toast--' + variant} role="status" aria-live="polite">
      ${Icon && html`<span class="sg-toast__icon-wrap"><${Icon} /></span>`}
      <span class="sg-toast__msg">${toast.message}</span>
      ${toast.ctaLabel && toast.ctaHref && html`
        <a class="sg-toast__cta" href=${toast.ctaHref}>${toast.ctaLabel}</a>
      `}
      ${toast.ctaLabel && !toast.ctaHref && toast.ctaAction && html`
        <button class="sg-toast__cta" onclick=${toast.ctaAction} type="button">${toast.ctaLabel}</button>
      `}
      <button class="sg-toast__close" onclick=${dismiss} aria-label="Dismiss notification" type="button">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" width="10" height="10" aria-hidden="true" focusable="false">
          <path d="M1 1l8 8M9 1l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
      </button>
    </div>
  `;
}
