import { html } from '../../../deps/htm-preact.js';

export const buildLoadingState = () => LoadingState;

export function LoadingState() {
  return html`
    <div class="sg-loading-state" role="status" aria-live="polite">
      <span class="sg-loading-state__spinner" aria-hidden="true"></span>
      <p class="sg-loading-state__text">Loading sessions…</p>
      <div class="sg-loading-state__skeleton" aria-hidden="true">
        <div class="sg-loading-state__skeleton-row">
          <div class="sg-loading-state__skeleton-time"></div>
          <div class="sg-loading-state__skeleton-card"></div>
          <div class="sg-loading-state__skeleton-card"></div>
          <div class="sg-loading-state__skeleton-card"></div>
        </div>
        <div class="sg-loading-state__skeleton-row">
          <div class="sg-loading-state__skeleton-time"></div>
          <div class="sg-loading-state__skeleton-card"></div>
          <div class="sg-loading-state__skeleton-card"></div>
          <div class="sg-loading-state__skeleton-card"></div>
        </div>
      </div>
    </div>
  `;
}
