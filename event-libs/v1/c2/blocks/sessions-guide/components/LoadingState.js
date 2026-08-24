import { html } from '../../../../deps/htm-preact.js';

export const buildLoadingState = () => LoadingState;

// Spoken text for the shells' persistent live region. A polite region has to already be
// in the DOM before its text changes, so the shells keep one mounted and swap this in —
// LoadingState itself is purely the visual treatment.
export function sessionsStatusMessage(status) {
  if (status === 'loading') return 'Loading sessions…';
  if (status === 'error') return '';
  if (status === 'ready') return 'Sessions loaded.';
  return '';
}

export function LoadingState() {
  return html`
    <div class="sg-loading-state">
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
