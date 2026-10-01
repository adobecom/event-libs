import { html } from '../../../../deps/htm-preact.js';
import { useSessionGuide } from '../store/index.js';

const RESULTS_CONTAINER = '.sg-body-scroll, .sg-full-page__body';

// The button unmounts on reset, so focus moves to the persistent results container to stay in the guide.
export function resetSearchAndFilters(dispatch, button) {
  const container = button?.closest?.(RESULTS_CONTAINER);
  dispatch({ type: 'RESET_SEARCH_AND_FILTERS' });
  container?.focus({ preventScroll: true });
}

// Shown when a search/filter matched nothing, distinct from a view's default "no data" state.
export function NoResultsFound() {
  const { dispatch } = useSessionGuide();
  return html`
    <div class="sg-empty sg-empty--no-results">
      <div class="sg-empty__message" role="status" aria-live="polite">
        <p class="sg-empty__title">No results match your current selection.</p>
        <p>Try adjusting your filters, selecting a different date, or choosing another option in the drop-down list. Or click reset to clear all selections.</p>
      </div>
      <button
        class="sg-empty__reset"
        onclick=${(e) => resetSearchAndFilters(dispatch, e.currentTarget)}
        daa-ll="No-Results-Reset-All"
        type="button"
      >Reset all</button>
    </div>
  `;
}
