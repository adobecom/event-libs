export function buildToast(preact, store) {
  const { html, useEffect } = preact;
  const { useSessionGuide } = store;

  return function Toast() {
    const { state, dispatch } = useSessionGuide();
    const { toast } = state;

    useEffect(() => {
      if (!toast) return undefined;
      const id = setTimeout(() => dispatch({ type: 'HIDE_TOAST' }), 1500);
      return () => clearTimeout(id);
    }, [toast && toast.id]); // eslint-disable-line

    if (!toast) return null;

    return html`
      <div class=${'sg-toast sg-toast--' + (toast.variant || 'default')} role="status" aria-live="polite">
        <span class="sg-toast__msg">${toast.message}</span>
        <button
          class="sg-toast__close"
          onclick=${() => dispatch({ type: 'HIDE_TOAST' })}
          aria-label="Dismiss notification"
          type="button"
        >✕</button>
      </div>
    `;
  };
}
