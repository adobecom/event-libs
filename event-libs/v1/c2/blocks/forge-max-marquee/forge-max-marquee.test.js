// L22 gate for the authored Milo C2 block forge-max-marquee. Runs under Milo's
// @web/test-runner (browser). The fixture mirrors the FLAT, class-less, EDS-wrapped
// DA serialization — so these assertions prove init() RECONSTRUCTS the marquee
// (foreground container, single h1, split-out eyebrow, centered CTA), not just that
// it set a marker. Fixture is loaded INSIDE each it() (self-contained, no shared
// async hook) to keep the browser session from hanging the gate.
import { readFile } from '@web/test-runner-commands';
import { expect } from '@esm-bundle/chai';
import init from './forge-max-marquee.js';

describe('forge-max-marquee', () => {
  it('exports a callable init(el)', () => {
    expect(init).to.be.a('function');
  });

  it('reconstructs the centered marquee from the flat DA content', async () => {
    document.body.innerHTML = await readFile({ path: './mocks/body.html' });
    const block = document.querySelector('.forge-max-marquee');
    await init(block);

    expect(block.querySelector('.forge-max-marquee-foreground'), 'foreground built').to.exist;
    expect(block.querySelectorAll('h1').length, 'exactly one h1').to.equal(1);
    expect(block.querySelector('.forge-max-marquee-eyebrow')?.textContent.trim(), 'eyebrow split out').to.equal('Sponsors');
    expect(block.querySelector('.forge-max-marquee-heading')?.textContent).to.contain('Meet this year');
    const cta = block.querySelector('.forge-max-marquee-actions .forge-max-marquee-cta');
    expect(cta && cta.getAttribute('href'), 'CTA link reconstructed').to.contain('become-a-sponsor');
    expect(block.dataset.forgeAuthored).to.equal('forge-max-marquee');
  });
});
