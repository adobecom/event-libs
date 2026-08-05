import { expect } from '@esm-bundle/chai';
import { readFile } from '@web/test-runner-commands';
import init from '../../../../event-libs/v1/c2/blocks/card-c2/card-c2.js';

describe('card-c2', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.head.innerHTML = '';
  });

  it('renders a body-layout card for ratio-4-3', async () => {
    document.body.innerHTML = await readFile({ path: './mocks/ratio-4-3.html' });
    const el = document.querySelector('.card-c2');
    await init(el);

    expect(el.dataset.cardVariant).to.equal('ratio-4-3');
    expect(el.querySelector('.card-media picture')).to.exist;
    expect(el.querySelector('.card-title').textContent).to.equal('Session Title');
    expect(el.querySelector('.card-description').textContent).to.equal('Session description goes here.');
    expect(el.querySelector('.card-cta').textContent).to.equal('Register');
  });

  it('renders a body-layout card for ratio-3-4 too', async () => {
    document.body.innerHTML = await readFile({ path: './mocks/ratio-3-4.html' });
    const el = document.querySelector('.card-c2');
    await init(el);

    expect(el.dataset.cardVariant).to.equal('ratio-3-4');
    expect(el.querySelector('.card-body')).to.exist;
    expect(el.querySelector('.card-title').textContent).to.equal('Jane Doe');
    expect(el.querySelector('.card-description').textContent).to.equal('VP of Something');
    expect(el.querySelector('.card-cta').textContent).to.equal('Learn more');
  });

  it('renders a body-layout card for ratio-16-9 too', async () => {
    document.body.innerHTML = await readFile({ path: './mocks/ratio-16-9.html' });
    const el = document.querySelector('.card-c2');
    await init(el);

    expect(el.dataset.cardVariant).to.equal('ratio-16-9');
    expect(el.querySelector('.card-media picture')).to.exist;
    expect(el.querySelector('.card-title').textContent).to.equal('Featured Session Title');
    expect(el.querySelector('.card-description').textContent).to.equal('Featured session description goes here.');
    expect(el.querySelector('.card-cta').textContent).to.equal('Watch now');
  });

  it('defaults to ratio-4-3 when no variant class is authored', async () => {
    document.body.innerHTML = await readFile({ path: './mocks/ratio-4-3.html' });
    const el = document.querySelector('.card-c2');
    el.classList.remove('ratio-4-3');
    await init(el);

    expect(el.dataset.cardVariant).to.equal('ratio-4-3');
  });

  it('removes the block when no media is authored', async () => {
    document.body.innerHTML = '<div class="card-c2 ratio-4-3"><div></div><div></div></div>';
    const el = document.querySelector('.card-c2');
    await init(el);

    expect(document.querySelector('.card-c2')).to.not.exist;
  });
});
