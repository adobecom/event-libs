import { expect } from '@esm-bundle/chai';
import { setMetadata } from '../../../../../event-libs/v1/utils/utils.js';
import init from '../../../../../event-libs/v1/c2/blocks/event-session-resources/event-session-resources.js';
import { auth } from '../../../../../event-libs/v1/utils/session-store.js';
import { toast } from '../../../../../event-libs/v1/features/toast/toast.js';

const SIGNED_OUT = { isLoggedIn: null, isRegistered: undefined, userFirstName: null };
const SIGNED_IN = { isLoggedIn: true, isRegistered: true, userFirstName: 'Ada' };
const UNREGISTERED = { isLoggedIn: true, isRegistered: false, userFirstName: 'Ada' };

// Clicks and reports whether navigation was allowed through (i.e. not gated).
function clickAllowed(cta) {
  const e = new MouseEvent('click', { bubbles: true, cancelable: true });
  cta.dispatchEvent(e);
  return !e.defaultPrevented;
}

function setMaterials(list) {
  setMetadata('material-list', JSON.stringify(list));
}

function block() {
  const el = document.createElement('div');
  el.className = 'session-resources';
  return el;
}

function backgroundRow(value) {
  const row = document.createElement('div');
  const key = document.createElement('div');
  key.textContent = 'Background';
  const val = document.createElement('div');
  val.textContent = value;
  row.append(key, val);
  return row;
}

describe('Session Resources', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    auth.value = SIGNED_OUT;
    toast.value = null;
  });

  it('renders a row per published resource with name + CTA link', async () => {
    setMaterials([
      { fileTypeName: 'Session slides', fileURL: 'https://x/slides.pdf', published: true },
      { fileTypeName: 'Presentation', fileURL: 'https://x/deck', published: true },
    ]);
    const el = block();
    await init(el);
    expect(el.querySelector('.session-resources-title').textContent).to.equal('Session resources');
    const rows = [...el.querySelectorAll('.session-resource')];
    expect(rows).to.have.lengthOf(2);
    expect(rows[0].querySelector('.session-resource-name').textContent).to.equal('Session slides');
    const cta = rows[0].querySelector('.session-resource-cta');
    expect(cta.getAttribute('href')).to.equal('https://x/slides.pdf');
    expect(cta.getAttribute('target')).to.equal('_blank');
  });

  it('prefers fileTypeName over fileName, which is often not reader-friendly', async () => {
    setMaterials([{
      fileTypeName: 'Session slides',
      fileName: 'Screenshot 2026-08-13 at 11.23.26 AM.png',
      fileURL: 'https://x/slides.pdf',
      published: true,
    }]);
    const el = block();
    await init(el);
    expect(el.querySelector('.session-resource-name').textContent).to.equal('Session slides');
  });

  it('falls back to the file extension when fileTypeName is absent', async () => {
    setMaterials([
      { fileName: 'Magdiel_Lopez_MAX_2026_Session_Outline', fileURL: 'https://x/a.pdf', published: true },
      { fileName: 'whatever', fileURL: 'https://x/b.PPTX?v=2', published: true },
      { fileName: 'whatever', fileURL: 'https://x/no-extension', published: true },
    ]);
    const el = block();
    await init(el);
    const names = [...el.querySelectorAll('.session-resource-name')].map((n) => n.textContent);
    expect(names).to.deep.equal(['Resource (PDF)', 'Resource (PPTX)', 'Resource']);
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
      { fileTypeName: 'Draft', fileURL: 'https://x/d.pdf', published: false },
      { fileTypeName: 'NoUrl', published: true },
      { fileTypeName: 'Good', fileURL: 'https://x/g.pdf', published: true },
    ]);
    const el = block();
    await init(el);
    const names = [...el.querySelectorAll('.session-resource-name')].map((n) => n.textContent);
    expect(names).to.deep.equal(['Good']);
  });

  describe('download gating', () => {
    const oneOfEach = () => setMaterials([
      { fileTypeName: 'Slides', fileURL: 'https://x/slides.pdf', published: true },
      { fileTypeName: 'Link', fileURL: 'https://x/deck', published: true },
    ]);
    const ctas = (el) => [...el.querySelectorAll('.session-resource-cta')];

    it('blocks a Download while signed out and shows a login toast', async () => {
      oneOfEach();
      const el = block();
      await init(el);
      expect(clickAllowed(ctas(el)[0])).to.be.false;
      expect(toast.value?.message).to.match(/login required to download slides/i);
      expect(toast.value?.ctaLabel).to.match(/login/i);
    });

    it('blocks a Download when signed in but not registered, and prompts to register', async () => {
      oneOfEach();
      const el = block();
      await init(el);
      auth.value = UNREGISTERED;
      expect(clickAllowed(ctas(el)[0])).to.be.false;
      expect(toast.value?.message).to.match(/registration.*required to download slides/i);
      expect(toast.value?.ctaLabel).to.match(/register/i);
    });

    it('lets a Download through once signed in and registered, with no toast', async () => {
      oneOfEach();
      const el = block();
      await init(el);
      auth.value = SIGNED_IN;
      expect(clickAllowed(ctas(el)[0])).to.be.true;
      expect(toast.value).to.be.null;
    });

    it('never gates an "Open" link, even signed out', async () => {
      oneOfEach();
      const el = block();
      await init(el);
      const open = ctas(el)[1];
      expect(open.textContent).to.equal('Open');
      expect(clickAllowed(open)).to.be.true;
      expect(toast.value).to.be.null;
    });
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

  it('applies an authored Background row as the block background', async () => {
    setMaterials([{ fileName: 'Slides', fileURL: 'https://x/slides.pdf', published: true }]);
    const el = block();
    el.append(backgroundRow('#ff0000'));
    await init(el);
    expect(el.style.background).to.equal('rgb(255, 0, 0)');
  });

  it('leaves the background unset when no Background row is authored', async () => {
    setMaterials([{ fileName: 'Slides', fileURL: 'https://x/slides.pdf', published: true }]);
    const el = block();
    await init(el);
    expect(el.style.background).to.equal('');
  });
});
