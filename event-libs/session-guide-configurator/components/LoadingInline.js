import { html } from '../../v1/deps/htm-preact.js';

export default function LoadingInline({ label }) {
  return html`<p class="sgc-loading-inline"><span class="sgc-spinner sgc-spinner--s"></span> ${label}</p>`;
}
