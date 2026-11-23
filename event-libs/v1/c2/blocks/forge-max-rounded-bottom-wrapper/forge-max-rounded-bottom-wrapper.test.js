// Gate test for the authored Milo block forge-max-rounded-bottom-wrapper.
// Runs under Milo's @web/test-runner (browser). The fixture is loaded INSIDE
// each it() (self-contained, no shared async hook) and every image is a 1x1
// data-URI, so the unit server never makes a network request.
import { readFile } from '@web/test-runner-commands';
import { expect } from '@esm-bundle/chai';
import init from './forge-max-rounded-bottom-wrapper.js';

describe('forge-max-rounded-bottom-wrapper', () => {
  it('exports a callable init(el)', () => {
    expect(init).to.be.a('function');
  });

  it('reconstructs the information grid from the class-less list', async () => {
    document.body.innerHTML = await readFile({ path: './mocks/body.html' });
    const block = document.querySelector('.forge-max-rounded-bottom-wrapper');
    expect(block, 'mock body has the block root').to.exist;

    await init(block);

    // Structure was rebuilt from content order (not assumed from authored class).
    expect(block.querySelector('.information-grid'), 'grid container built').to.exist;
    expect(block.querySelectorAll('.information-grid-item').length).to.equal(9);
    expect(block.querySelectorAll('.information-grid-item-text-link').length).to.equal(2);
    // Authored media preserved inside <picture> with its intrinsic attrs (no CLS).
    const img = block.querySelector('.information-grid-item-image img');
    expect(img && img.getAttribute('loading')).to.equal('lazy');
    expect(block.dataset.forgeAuthored).to.equal('forge-max-rounded-bottom-wrapper');
  });
});
