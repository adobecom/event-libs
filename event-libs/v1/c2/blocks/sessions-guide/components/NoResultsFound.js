import { html } from '../../../../deps/htm-preact.js';
import { useSessionGuide } from '../store/index.js';

export function resetSearchAndFilters(dispatch) {
  dispatch({ type: 'SET_FILTERS', filters: {} });
  dispatch({ type: 'SET_SEARCH', query: '' });
}

// Shown when a search/filter matched nothing, distinct from a view's default "no data" state.
export function NoResultsFound() {
  const { dispatch } = useSessionGuide();
  return html`
    <div class="sg-empty sg-empty--no-results" role="status" aria-live="polite">
      <p class="sg-empty__title">No results match your current selection.</p>
      <p>Try adjusting your filters, selecting a different date, or choosing another option in the drop-down list. Or click reset to clear all selections.</p>
      <button
        class="sg-empty__reset"
        onclick=${() => resetSearchAndFilters(dispatch)}
        daa-ll="No-Results-Reset-All"
        type="button"
      >Reset all</button>
    </div>
  `;
}
