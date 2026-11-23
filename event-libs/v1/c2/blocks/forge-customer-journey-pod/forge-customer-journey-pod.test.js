// Fixture test for the authored Milo block forge-customer-journey-pod.
// Runs under Milo's @web/test-runner (browser). The fixture is loaded INSIDE
// each it() (self-contained — no shared async hook) and uses a network-free
// body, so the gate never stalls on a real media request.
import { readFile } from '@web/test-runner-commands';
import { expect } from '@esm-bundle/chai';
import init from './forge-customer-journey-pod.js';

describe('forge-customer-journey-pod', () => {
  it('exports a callable init(el)', () => {
    expect(init).to.be.a('function');
  });

  it('reconstructs the banner structure and stamps the forge marker', async () => {
    document.body.innerHTML = await readFile({ path: './mocks/body.html' });
    const block = document.querySelector('.forge-customer-journey-pod');
    expect(block, 'mock body has the block root').to.exist;
    await init(block);
    // Reconstruction: decorate() builds the art layer + content column from the
    // FLAT class-less content, it is not assumed present in the fixture.
    expect(block.querySelector('.customer-journey-pod-background'), 'art layer built').to.exist;
    expect(block.querySelector('.customer-journey-pod-container .customer-journey-pod-content'), 'content column built').to.exist;
    expect(block.querySelector('h2.customer-journey-pod-title'), 'heading promoted').to.exist;
    expect(block.dataset.forgeAuthored).to.equal('forge-customer-journey-pod');
  });

  it('decorates the CTA as a new-window pill link', async () => {
    document.body.innerHTML = await readFile({ path: './mocks/body.html' });
    const block = document.querySelector('.forge-customer-journey-pod');
    await init(block);
    const cta = block.querySelector('a.customer-journey-pod-cta');
    expect(cta, 'CTA decorated').to.exist;
    expect(cta.getAttribute('target')).to.equal('_blank');
    expect(cta.querySelector('.sr-only'), 'new-window affordance hidden').to.exist;
    expect(cta.hasAttribute('daa-ll'), 'CTA analytics tagged').to.equal(true);
  });
});
