// Structure test for the authored Milo block forge-max-marquee.
// Runs under Milo's @web/test-runner (browser). The fixture mirrors the REAL
// class-less DA serialization (the eyebrow <span> is unwrapped into a two-line
// <h1>), so these assertions gate the RECONSTRUCTION — not a green-lie restyle.
// Each it() is self-contained (loads the fixture inside, no shared async hook)
// and the fixture is network-free, so the whole-session gate never hangs.
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

    // The rebuilt foreground container exists (not an empty/absent wrapper).
    expect(block.querySelector('.forge-max-marquee-foreground'), 'foreground built').to.exist;
    // The eyebrow was SPLIT off the two-line <h1> into its own node.
    const eyebrow = block.querySelector('.forge-max-marquee-eyebrow');
    expect(eyebrow && eyebrow.textContent.trim(), 'eyebrow split out').to.equal('In-person agenda');
    // Exactly one <h1> (lint L8), carrying the headline only.
    const titles = block.querySelectorAll('h1');
    expect(titles.length, 'single h1').to.equal(1);
    expect(titles[0].textContent).to.contain('Learn, connect');
    // The supporting copy survived and the forge marker is stamped.
    const copy = block.querySelector('.forge-max-marquee-copy');
    expect(copy && copy.textContent, 'copy preserved').to.contain('Attend keynotes');
    expect(block.dataset.forgeAuthored).to.equal('forge-max-marquee');
  });
});
