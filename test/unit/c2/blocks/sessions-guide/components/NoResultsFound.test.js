import { expect } from '@esm-bundle/chai';
import { NoResultsFound, resetSearchAndFilters } from '../../../../../../event-libs/v1/c2/blocks/sessions-guide/components/NoResultsFound.js';
import { SessionGuideContext } from '../../../../../../event-libs/v1/c2/blocks/sessions-guide/store/index.js';

describe('NoResultsFound', () => {
  beforeEach(() => {
    SessionGuideContext._current = { state: {}, dispatch: () => {} };
  });

  it('renders the updated copy and a Reset all button', () => {
    const out = NoResultsFound();
    expect(out).to.include('No results match your current selection.');
    expect(out).to.include('Or click reset to clear all selections.');
    expect(out).to.match(/<button[^>]*class="sg-empty__reset"[^>]*type="button"[^>]*>Reset all<\/button>/);
  });

  it('reset clears both filters and the search query', () => {
    const actions = [];
    resetSearchAndFilters((a) => actions.push(a));
    expect(actions).to.deep.equal([
      { type: 'SET_FILTERS', filters: {} },
      { type: 'SET_SEARCH', query: '' },
    ]);
  });
});
