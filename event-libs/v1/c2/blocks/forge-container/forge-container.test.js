// Smoke test for the Forge-authored Milo C2 block forge-container.
// Runs under Milo's @web/test-runner (browser). Each it() loads the fixture
// itself (no shared async hook) and keeps a tight assertion count so it never
// hangs the coverage/finish-timeout gate.
import { readFile } from '@web/test-runner-commands';
import { expect } from '@esm-bundle/chai';
import init from './forge-container.js';

describe('forge-container', () => {
  it('exports a callable init(el)', () => {
    expect(init).to.be.a('function');
  });

  it('reconstructs the tier grid and stamps the forge marker', async () => {
    document.body.innerHTML = await readFile({ path: './mocks/body.html' });
    const block = document.querySelector('.forge-container');
    await init(block);
    expect(block.dataset.forgeAuthored).to.equal('forge-container');
    expect(block.getAttribute('daa-lh')).to.equal('forge-container');
    // 3 tiers rebuilt, each with a centered heading + logo grid.
    expect(block.querySelectorAll('.sponsor-level').length).to.equal(3);
    expect(block.querySelectorAll('.sponsors-grid').length).to.equal(3);
  });

  it('carries the per-tier size sequence (large → medium → medium)', async () => {
    document.body.innerHTML = await readFile({ path: './mocks/body.html' });
    const block = document.querySelector('.forge-container');
    await init(block);
    const levels = [...block.querySelectorAll('.sponsor-level')];
    expect(levels[0].classList.contains('sponsor-level-size-large')).to.be.true;
    expect(levels[1].classList.contains('sponsor-level-size-medium')).to.be.true;
    expect(levels[2].classList.contains('sponsor-level-size-medium')).to.be.true;
  });

  it('preserves every logo image and tags it for analytics', async () => {
    document.body.innerHTML = await readFile({ path: './mocks/body.html' });
    const block = document.querySelector('.forge-container');
    await init(block);
    const imgs = block.querySelectorAll('.sponsor-card .sponsor-image');
    expect(imgs.length).to.equal(5);
    expect(imgs[0].getAttribute('loading')).to.equal('lazy');
    expect(imgs[0].hasAttribute('daa-im')).to.be.true;
  });
});
