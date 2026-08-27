import { expect } from '@esm-bundle/chai';
import initMiloSiteRedesignOverride from '../../../../event-libs/v1/features/milo-site-redesign-override/index.js';

describe('Milo site-redesign-override: base-card', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.head.innerHTML = '';
    document.body.className = '';
    delete document.body.dataset.bentoStackOverrideStarted;
  });

  it('loads the base-card CSS override unconditionally', async () => {
    document.body.innerHTML = '<div class="base-card"></div>';
    await initMiloSiteRedesignOverride();
    expect(document.head.querySelector('link[href*="base-card.css"]')).to.not.be.null;
  });

  it('loads the base-card CSS override even with no base-card on the page', async () => {
    document.body.innerHTML = '<div class="section"></div>';
    await initMiloSiteRedesignOverride();
    expect(document.head.querySelector('link[href*="base-card.css"]')).to.not.be.null;
  });

  it('marks the body so the override CSS outranks Milo\'s own base-card.css regardless of load order', async () => {
    document.body.innerHTML = '<div class="base-card"></div>';
    await initMiloSiteRedesignOverride();
    expect(document.body.classList.contains('milo-site-redesign-override')).to.be.true;
  });
});
