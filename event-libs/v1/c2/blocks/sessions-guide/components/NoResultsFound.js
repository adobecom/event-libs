import { html } from '../../../../deps/htm-preact.js';

// Shown when a search/filter matched nothing, distinct from a view's default "no data" state.
export function NoResultsFound() {
  return html`
    <div class="sg-empty sg-empty--no-results" role="status" aria-live="polite">
      <p class="sg-empty__title">No results found</p>
      <p>Try broadening your search.</p>
    </div>
  `;
}
