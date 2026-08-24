import { html } from '../../v1/deps/htm-preact.js';

export default function LoadingInline({ label }) {
  return html`<p class="snc-loading-inline"><span class="snc-spinner snc-spinner--s"></span> ${label}</p>`;
}
