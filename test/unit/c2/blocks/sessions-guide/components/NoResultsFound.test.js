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

  it('scopes the live region to the message so the button is not announced', () => {
    const out = NoResultsFound();
    expect(out).to.match(/<div class="sg-empty__message" role="status" aria-live="polite">[\s\S]*No results match[\s\S]*<\/div>\s*<button/);
    expect(out).to.not.match(/class="sg-empty sg-empty--no-results"[^>]*role=/);
  });

  it('reset dispatches a single combined action', () => {
    const actions = [];
    resetSearchAndFilters((a) => actions.push(a));
    expect(actions).to.deep.equal([{ type: 'RESET_SEARCH_AND_FILTERS' }]);
  });

  ['sg-body-scroll', 'sg-full-page__body'].forEach((cls) => {
    it(`moves focus to the .${cls} container so it is not lost when the button unmounts`, () => {
      document.body.innerHTML = `<div class="${cls}" tabindex="-1"><button>Reset all</button></div>`;
      const button = document.querySelector('button');
      button.focus();
      let dispatched = false;
      resetSearchAndFilters(() => { dispatched = true; }, button);
      expect(dispatched).to.equal(true);
      expect(document.activeElement).to.equal(document.querySelector(`.${cls}`));
      document.body.innerHTML = '';
    });
  });

  it('does not throw when no button or container is available', () => {
    expect(() => resetSearchAndFilters(() => {})).to.not.throw();
    document.body.innerHTML = '<button>Reset all</button>';
    expect(() => resetSearchAndFilters(() => {}, document.querySelector('button'))).to.not.throw();
    document.body.innerHTML = '';
  });
});
