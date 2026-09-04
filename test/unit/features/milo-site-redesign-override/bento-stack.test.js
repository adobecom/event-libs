import { expect } from '@esm-bundle/chai';
import { readFile } from '@web/test-runner-commands';
import { setEventConfig } from '../../../../event-libs/v1/utils/utils.js';
import initMiloSiteRedesignOverride from '../../../../event-libs/v1/features/milo-site-redesign-override/index.js';

const body = await readFile({ path: './mocks/default.html' });

describe('Milo site-redesign-override: bento-stack', () => {
  before(() => {
    setEventConfig({}, { miloLibs: '/test/unit/features/milo-site-redesign-override/mocks/libs' });
  });

  beforeEach(() => {
    document.body.innerHTML = '';
    document.head.innerHTML = '';
    delete document.body.dataset.bentoStackOverrideStarted;
  });

  it('sets --card-idx per card and --slides on the section', async () => {
    document.body.innerHTML = body;
    const section = document.querySelector('.section.bento.stack-mobile');

    await initMiloSiteRedesignOverride();

    expect(section.style.getPropertyValue('--slides')).to.equal('3');
    const cards = section.querySelectorAll('.explore-card');
    cards.forEach((card, i) => {
      expect(card.style.getPropertyValue('--card-idx')).to.equal(String(i));
    });
  });

  it('is a no-op when no matching sections exist', async () => {
    document.body.innerHTML = '<div class="section"><div class="explore-card"></div></div>';

    await initMiloSiteRedesignOverride();

    expect(document.head.querySelector('link[href*="bento-stack.css"]')).to.be.null;
  });

  it('is idempotent when run twice', async () => {
    document.body.innerHTML = body;
    const section = document.querySelector('.section.bento.stack-mobile');

    await initMiloSiteRedesignOverride();
    await initMiloSiteRedesignOverride();

    expect(section.classList.contains('bento-stack-ready')).to.be.true;
    const cards = section.querySelectorAll('.explore-card');
    cards.forEach((card, i) => {
      expect(card.style.getPropertyValue('--card-idx')).to.equal(String(i));
    });
  });

  it('picks up a matching section added to the DOM after init runs', async () => {
    document.body.innerHTML = '<div id="host"></div>';

    await initMiloSiteRedesignOverride();
    document.getElementById('host').innerHTML = body;
    const section = document.querySelector('.section.bento.stack-mobile');

    await new Promise((resolve) => { setTimeout(resolve, 50); });

    expect(section.style.getPropertyValue('--slides')).to.equal('3');
  });
});
