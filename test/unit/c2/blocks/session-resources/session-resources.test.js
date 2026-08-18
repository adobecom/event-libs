import { expect } from '@esm-bundle/chai';
import { setMetadata } from '../../../../../event-libs/v1/utils/utils.js';
import init from '../../../../../event-libs/v1/c2/blocks/session-resources/session-resources.js';

function setMaterials(list) {
  setMetadata('material-list', JSON.stringify(list));
}

function block() {
  const el = document.createElement('div');
  el.className = 'session-resources';
  return el;
}

describe('Session Resources', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
  });

  it('renders a row per published resource with name + CTA link', async () => {
    setMaterials([
      { fileName: 'Session Slides.pdf', fileURL: 'https://x/slides.pdf', published: true },
      { fileName: 'Presentation', fileURL: 'https://x/deck', published: true },
    ]);
    const el = block();
    await init(el);
    expect(el.querySelector('.session-resources-title').textContent).to.equal('Session resources');
    const rows = [...el.querySelectorAll('.session-resource')];
    expect(rows).to.have.lengthOf(2);
    expect(rows[0].querySelector('.session-resource-name').textContent).to.equal('Session Slides.pdf');
    const cta = rows[0].querySelector('.session-resource-cta');
    expect(cta.getAttribute('href')).to.equal('https://x/slides.pdf');
    expect(cta.getAttribute('target')).to.equal('_blank');
  });

  it('labels downloadable files "Download" and other URLs "Open"', async () => {
    setMaterials([
      { fileName: 'Slides', fileURL: 'https://x/slides.pdf', published: true },
      { fileName: 'Deck', fileURL: 'https://x/deck', published: true },
    ]);
    const el = block();
    await init(el);
    const ctas = [...el.querySelectorAll('.session-resource-cta')].map((a) => a.textContent);
    expect(ctas).to.deep.equal(['Download', 'Open']);
  });

  it('skips unpublished resources and those without a URL', async () => {
    setMaterials([
      { fileName: 'Draft', fileURL: 'https://x/d.pdf', published: false },
      { fileName: 'NoUrl', published: true },
      { fileName: 'Good', fileURL: 'https://x/g.pdf', published: true },
    ]);
    const el = block();
    await init(el);
    const names = [...el.querySelectorAll('.session-resource-name')].map((n) => n.textContent);
    expect(names).to.deep.equal(['Good']);
  });

  it('renders the "No resources" empty state when none are published', async () => {
    setMaterials([]);
    const el = block();
    await init(el);
    expect(el.querySelector('.session-resources-empty').textContent).to.equal('No resources');
    expect(el.querySelector('.session-resources-list')).to.be.null;
  });

  it('shows a working Show more toggle only when over the limit (2)', async () => {
    setMaterials(Array.from({ length: 4 }, (_, i) => ({ fileName: `F${i}`, fileURL: `https://x/${i}.pdf`, published: true })));
    const el = block();
    await init(el);
    const toggle = el.querySelector('.session-resources-toggle');
    expect(toggle).to.not.be.null;
    expect(el.querySelectorAll('.session-resource.is-overflow')).to.have.lengthOf(2);
    toggle.click();
    expect(el.classList.contains('is-expanded')).to.be.true;
    expect(toggle.textContent).to.equal('Show less');
  });
});
