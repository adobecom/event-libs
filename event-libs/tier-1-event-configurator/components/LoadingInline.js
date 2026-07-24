import { html } from '../htm-wrapper.js';

export default function LoadingInline({ label }) {
  return html`<p class="tec-loading-inline"><span class="tec-spinner tec-spinner--s"></span> ${label}</p>`;
}
