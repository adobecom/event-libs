import { html } from '../../../../deps/htm-preact.js';
import { useSessionGuide } from '../store/index.js';
import { DrawerShell } from './DrawerShell.js';
import { FullPageShell } from './FullPageShell.js';

export function App() {
  const ctx = useSessionGuide();
  if (!ctx) return html`<section class="sg-app sg-app--page"><div class="sg-loading" role="status" aria-live="polite">Loading sessions…</div></section>`;
  const { state } = ctx;
  const { guideConfig } = state;
  const surface = guideConfig.surface;

  if (surface === 'page') {
    return html`<section class="sg-app sg-app--page">
      ${html`<${FullPageShell} />`}
    </section>`;
  }

  return html`<section class="sg-app">
    ${html`<${DrawerShell} />`}
  </section>`;
}
