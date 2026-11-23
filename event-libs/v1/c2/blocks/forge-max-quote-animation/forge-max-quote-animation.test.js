// L22 fixture test for the authored Milo block forge-max-quote-animation.
// Runs under Milo's @web/test-runner (browser). Each it() loads the class-less
// DA-shaped fixture itself (self-contained — no shared async hook) and asserts
// init() RECONSTRUCTED the quote + 3-column photo-wall structure from the flat
// content (C24: the reconstruction is gated, not assumed).
import { readFile } from '@web/test-runner-commands';
import { expect } from '@esm-bundle/chai';
import init from './forge-max-quote-animation.js';

describe('forge-max-quote-animation', () => {
  it('exports a callable init(el)', () => {
    expect(init).to.be.a('function');
  });

  it('reconstructs the quote + 3-column photo wall and stamps the forge marker', async () => {
    document.body.innerHTML = await readFile({ path: './mocks/body.html' });
    const block = document.querySelector('.forge-max-quote-animation');
    expect(block, 'mock body has the block root').to.exist;
    await init(block);

    const figure = block.querySelector('figure.max-quote');
    expect(figure, 'quote figure rebuilt').to.exist;
    expect(figure.querySelector('blockquote.max-quote-text'), 'quote text moved into figure').to.exist;
    expect(block.querySelectorAll('.max-quote-tile-column').length, 'three staggered columns').to.equal(3);
    expect(block.querySelectorAll('.max-quote-tile').length, 'every picture wrapped in a tile').to.equal(6);
    expect(block.dataset.forgeAuthored).to.equal('forge-max-quote-animation');
  });
});
