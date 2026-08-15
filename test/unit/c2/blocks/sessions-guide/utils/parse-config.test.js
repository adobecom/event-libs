import { expect } from '@esm-bundle/chai';
import { parseSessionsGuideConfig } from '../../../../../../event-libs/v1/c2/blocks/sessions-guide/utils/parse-config.js';

function elWithConfig(config) {
  const el = document.createElement('div');
  el.dataset.sessionGuideConfig = JSON.stringify(config);
  return el;
}

describe('parse-config/filterCategories', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('falls back to an empty array (no panel) when nothing is authored', () => {
    const config = parseSessionsGuideConfig(elWithConfig({}));
    expect(config.filterCategories).to.deep.equal([]);
  });

  it('maps authored filterCategories to { id: attributeId, label: displayName }, preserving order', () => {
    const config = parseSessionsGuideConfig(elWithConfig({
      filterCategories: [
        { attributeId: 'attr-audience', label: 'Audience', displayName: 'Who it\'s for', enabled: true },
        { attributeId: 'attr-level', label: 'Technical Level', displayName: 'Level', enabled: true },
      ],
    }));
    expect(config.filterCategories).to.deep.equal([
      { id: 'attr-audience', label: 'Who it\'s for' },
      { id: 'attr-level', label: 'Level' },
    ]);
  });

  it('falls back to the original label when displayName is absent', () => {
    const config = parseSessionsGuideConfig(elWithConfig({
      filterCategories: [{ attributeId: 'attr-audience', label: 'Audience', enabled: true }],
    }));
    expect(config.filterCategories).to.deep.equal([{ id: 'attr-audience', label: 'Audience' }]);
  });

  it('drops disabled entries', () => {
    const config = parseSessionsGuideConfig(elWithConfig({
      filterCategories: [
        { attributeId: 'attr-audience', label: 'Audience', displayName: 'Audience', enabled: false },
        { attributeId: 'attr-level', label: 'Level', displayName: 'Level', enabled: true },
      ],
    }));
    expect(config.filterCategories).to.deep.equal([{ id: 'attr-level', label: 'Level' }]);
  });

  it('yields an empty array (no panel) when authored but every entry is disabled', () => {
    const config = parseSessionsGuideConfig(elWithConfig({
      filterCategories: [{ attributeId: 'attr-audience', label: 'Audience', displayName: 'Audience', enabled: false }],
    }));
    expect(config.filterCategories).to.deep.equal([]);
  });

  it('falls back to an empty array when filterCategories is present but not an array', () => {
    const config = parseSessionsGuideConfig(elWithConfig({ filterCategories: { attributeId: 'attr-audience' } }));
    expect(config.filterCategories).to.deep.equal([]);
  });

  it('no longer exposes a separate authoredFilterCategories field', () => {
    const config = parseSessionsGuideConfig(elWithConfig({
      filterCategories: [{ attributeId: 'attr-audience', label: 'Audience', displayName: 'Audience', enabled: true }],
    }));
    expect(config).to.not.have.property('authoredFilterCategories');
  });
});
