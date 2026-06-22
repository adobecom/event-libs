import { html } from '../../../deps/htm-preact.js';
import { useSessionGuide } from '../store/index.js';

export const buildRegistrationPrompt = () => RegistrationPrompt;

export function RegistrationPrompt() {
  const { state } = useSessionGuide();
  const { isLoggedIn } = state;

  if (isLoggedIn === false) {
    return html`
      <div class="sg-reg-prompt">
        <p class="sg-reg-prompt__message">Sign in and register for the event to access this view.</p>
        <button
          class="sg-reg-prompt__cta"
          onclick=${() => window.adobeIMS?.signIn()}
          type="button"
        >Sign in</button>
      </div>
    `;
  }

  return html`
    <div class="sg-reg-prompt">
      <p class="sg-reg-prompt__message">Register for the event to access this view.</p>
      <a class="sg-reg-prompt__cta" href="/register">Register now</a>
    </div>
  `;
}
