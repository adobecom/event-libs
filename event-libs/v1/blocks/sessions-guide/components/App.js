import { buildDrawerShell } from './DrawerShell.js';
import { buildFullPageShell } from './FullPageShell.js';
import { buildToast } from './Toast.js';
import { buildConflictModal } from './ConflictModal.js';
import { buildRegistrationPrompt } from './RegistrationPrompt.js';

export function buildApp(preact, store) {
  const { html } = preact;
  const { useSessionGuide } = store;
  const DrawerShell = buildDrawerShell(preact, store);
  const FullPageShell = buildFullPageShell(preact, store);
  const Toast = buildToast(preact, store);
  const ConflictModal = buildConflictModal(preact, store);
  const RegistrationPrompt = buildRegistrationPrompt(preact, store);

  return function App() {
    const ctx = useSessionGuide();
    if (!ctx) return html`<section class="sg-app sg-app--page"><div class="sg-loading">Loading sessions…</div></section>`;
    const { state, dispatch } = ctx;
    const { eventConfig, regPromptOpen, conflictModal } = state;
    const surface = eventConfig.surface;

    // Each component must be invoked via html`<${Comp} />` so the test stub
    // evaluates the component call before interpolating the string result.
    const toastEl = html`<${Toast} />`;
    const conflictEl = conflictModal ? html`<${ConflictModal} />` : '';
    const regPromptEl = regPromptOpen ? html`
      <div class="sg-modal-backdrop" onclick=${() => dispatch({ type: 'HIDE_REG_PROMPT' })} aria-hidden="true"></div>
      <div class="sg-reg-prompt-modal" role="dialog" aria-modal="true" aria-label="Registration required">
        <button
          class="sg-reg-prompt-modal__close"
          onclick=${() => dispatch({ type: 'HIDE_REG_PROMPT' })}
          aria-label="Close"
          type="button"
        >✕</button>
        ${html`<${RegistrationPrompt} />`}
      </div>
    ` : '';

    if (surface === 'page') {
      return html`<section class="sg-app sg-app--page">
        ${html`<${FullPageShell} />`}
        ${toastEl}${conflictEl}${regPromptEl}
      </section>`;
    }

    return html`<section class="sg-app">
      ${html`<${DrawerShell} />`}
      ${toastEl}${conflictEl}${regPromptEl}
    </section>`;
  };
}
