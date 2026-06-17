export function buildToast(preact, store) {
  const { html, useEffect } = preact;
  const { useSessionGuide } = store;

  return function Toast() {
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

    const isInformative = toast.variant === 'informative';
    const dismiss = () => dispatch({ type: 'HIDE_TOAST' });

    return html`
      <div class=${'sg-toast sg-toast--' + (toast.variant || 'default')} role="status" aria-live="polite">
        ${isInformative && html`
          <svg class="sg-toast__icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" width="20" height="20" aria-hidden="true" focusable="false">
            <circle cx="10" cy="10" r="9" stroke="currentColor" stroke-width="1.5" fill="none"/>
            <circle cx="10" cy="6.5" r="1" fill="currentColor"/>
            <rect x="9.25" y="9" width="1.5" height="5" rx="0.75" fill="currentColor"/>
          </svg>
        `}
        <span class="sg-toast__msg">${toast.message}</span>
        ${toast.ctaLabel && toast.ctaHref && html`
          <a class="sg-toast__cta" href=${toast.ctaHref}>${toast.ctaLabel}</a>
        `}
        ${toast.ctaLabel && !toast.ctaHref && toast.ctaAction && html`
          <button class="sg-toast__cta" onclick=${toast.ctaAction} type="button">${toast.ctaLabel}</button>
        `}
        <button
          class="sg-toast__close"
          onclick=${dismiss}
          aria-label="Dismiss notification"
          type="button"
        >${isInformative
          ? html`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" width="10" height="10" aria-hidden="true" focusable="false"><path d="M1 1l8 8M9 1l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`
          : '✕'
        }</button>
      </div>
    `;
  };
}
