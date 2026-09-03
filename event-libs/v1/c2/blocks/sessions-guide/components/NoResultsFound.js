import { html } from '../../../../deps/htm-preact.js';

/**
 * Shared empty state for a search/filter combination that matched zero sessions.
 * Distinct from a view's default "no data" empty state (e.g. "No sessions scheduled
 * for this day.") — this one tells the viewer their own input caused the empty result.
 */
export function NoResultsFound() {
  return html`
    <div class="sg-empty sg-empty--no-results" role="status" aria-live="polite">
      <p class="sg-empty__title">No results found</p>
      <p>Try broadening your search.</p>
    </div>
  `;
}
