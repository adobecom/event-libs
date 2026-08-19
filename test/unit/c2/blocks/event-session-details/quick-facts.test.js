import { expect } from '@esm-bundle/chai';
import { setMetadata } from '../../../../../event-libs/v1/utils/utils.js';
import { renderQuickFacts } from '../../../../../event-libs/v1/c2/blocks/event-session-details/quick-facts.js';

const attr = (name, values) => ({ name, inputType: 'multi-select', enabled: true, values });

function setAttrs(list) {
  setMetadata('custom-attributes', JSON.stringify(list));
}

describe('Quick Facts', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
  });

  it('renders a label:value row per populated attribute, in order', () => {
    setAttrs([
      attr('Category', [{ value: 'how-to', label: 'How To' }]),
      attr('Technical Level', [{ value: 'beginner', label: 'Beginner' }]),
      attr('Product', [
        { value: 'photoshop', label: 'Photoshop' },
        { value: 'illustrator', label: 'Illustrator' },
      ]),
    ]);
    const el = renderQuickFacts();
    const rows = [...el.querySelectorAll('.session-quick-fact')];
    // ordered per QUICK_FACTS (Technical level before Product before Category)
    expect(rows.map((r) => r.querySelector('.session-quick-fact-label').textContent))
      .to.deep.equal(['Technical level:', 'Product:', 'Category:']);
    expect(rows[1].querySelector('.session-quick-fact-value').textContent)
      .to.equal('Photoshop, Illustrator');
  });

  it('skips attributes with no values and AI Focus (no RF attribute)', () => {
    setAttrs([attr('Audience', [{ value: 'educator', label: 'Educator' }])]);
    const el = renderQuickFacts();
    const labels = [...el.querySelectorAll('.session-quick-fact-label')].map((l) => l.textContent);
    expect(labels).to.deep.equal(['Audience:']);
    expect(labels).to.not.include('AI Focus:');
  });

  it('returns null when no quick-fact attributes are present', () => {
    setAttrs([attr('Primary Event Site Track', [{ value: 'x', label: 'X' }])]);
    expect(renderQuickFacts()).to.be.null;
  });
});
