import { html } from '../../v1/deps/htm-preact.js';

export default function LoadingInline({ label }) {
  return html`<p class="tec-loading-inline"><span class="tec-spinner tec-spinner--s"></span> ${label}</p>`;
}
