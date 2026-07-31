import { expect } from '@esm-bundle/chai';
import { readFile } from '@web/test-runner-commands';
import init from '../../../../event-libs/v1/c2/blocks/card/card.js';

describe('card', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.head.innerHTML = '';
  });

  it('renders a body-layout card for ratio-4-3', async () => {
    document.body.innerHTML = await readFile({ path: './mocks/ratio-4-3.html' });
    const el = document.querySelector('.card');
    await init(el);

    expect(el.dataset.cardVariant).to.equal('ratio-4-3');
    expect(el.querySelector('.card-media picture')).to.exist;
    expect(el.querySelector('.card-title').textContent).to.equal('Session Title');
    expect(el.querySelector('.card-description').textContent).to.equal('Session description goes here.');
    expect(el.querySelector('.card-cta').textContent).to.equal('Register');
    expect(el.querySelector('.card-overlay')).to.not.exist;
  });

  it('renders an overlay-layout card for ratio-3-4 and strips any authored CTA', async () => {
    document.body.innerHTML = await readFile({ path: './mocks/ratio-3-4.html' });
    const el = document.querySelector('.card');
    await init(el);

    expect(el.dataset.cardVariant).to.equal('ratio-3-4');
    expect(el.querySelector('.card-overlay')).to.exist;
    expect(el.querySelector('.card-overlay .card-title').textContent).to.equal('Jane Doe');
    expect(el.querySelector('.card-overlay .card-description').textContent).to.equal('VP of Something');
    expect(el.querySelector('.card-cta')).to.not.exist;
    expect(el.querySelector('.card-body')).to.not.exist;
  });

  it('defaults to ratio-4-3 when no variant class is authored', async () => {
    document.body.innerHTML = await readFile({ path: './mocks/ratio-4-3.html' });
    const el = document.querySelector('.card');
    el.classList.remove('ratio-4-3');
    await init(el);

    expect(el.dataset.cardVariant).to.equal('ratio-4-3');
  });

  it('removes the block when no media is authored', async () => {
    document.body.innerHTML = '<div class="card ratio-4-3"><div></div><div></div></div>';
    const el = document.querySelector('.card');
    await init(el);

    expect(document.querySelector('.card')).to.not.exist;
  });
});
