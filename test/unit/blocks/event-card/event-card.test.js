import { expect } from '@esm-bundle/chai';
import { readFile } from '@web/test-runner-commands';
import init from '../../../../event-libs/v1/c2/blocks/event-card/event-card.js';

describe('event-card', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.head.innerHTML = '';
  });

  it('renders a body-layout card for ratio-4-3', async () => {
    document.body.innerHTML = await readFile({ path: './mocks/ratio-4-3.html' });
    const el = document.querySelector('.event-card');
    await init(el);

    expect(el.dataset.cardVariant).to.equal('ratio-4-3');
    expect(el.querySelector('.card-media picture')).to.exist;
    expect(el.querySelector('.card-title').textContent).to.equal('Session Title');
    expect(el.querySelector('.card-description').textContent).to.equal('Session description goes here.');
    expect(el.querySelector('.card-cta').textContent).to.equal('Register');
  });

  it('renders a body-layout card for ratio-3-4 too', async () => {
    document.body.innerHTML = await readFile({ path: './mocks/ratio-3-4.html' });
    const el = document.querySelector('.event-card');
    await init(el);

    expect(el.dataset.cardVariant).to.equal('ratio-3-4');
    expect(el.querySelector('.card-body')).to.exist;
    expect(el.querySelector('.card-title').textContent).to.equal('Jane Doe');
    expect(el.querySelector('.card-description').textContent).to.equal('VP of Something');
    expect(el.querySelector('.card-cta').textContent).to.equal('Learn more');
  });

  it('renders a body-layout card for ratio-16-9 too', async () => {
    document.body.innerHTML = await readFile({ path: './mocks/ratio-16-9.html' });
    const el = document.querySelector('.event-card');
    await init(el);

    expect(el.dataset.cardVariant).to.equal('ratio-16-9');
    expect(el.querySelector('.card-media picture')).to.exist;
    expect(el.querySelector('.card-title').textContent).to.equal('Featured Session Title');
    expect(el.querySelector('.card-description').textContent).to.equal('Featured session description goes here.');
    expect(el.querySelector('.card-cta').textContent).to.equal('Watch now');
  });

  it('defaults to ratio-4-3 when no variant class is authored', async () => {
    document.body.innerHTML = await readFile({ path: './mocks/ratio-4-3.html' });
    const el = document.querySelector('.event-card');
    el.classList.remove('ratio-4-3');
    await init(el);

    expect(el.dataset.cardVariant).to.equal('ratio-4-3');
  });

  it('removes the block when no media is authored', async () => {
    document.body.innerHTML = '<div class="event-card ratio-4-3"><div></div><div></div></div>';
    const el = document.querySelector('.event-card');
    await init(el);

    expect(document.querySelector('.event-card')).to.not.exist;
  });

  it('builds media from a resolved image URL when no img is authored', async () => {
    document.body.innerHTML = `
      <div class="event-card ratio-16-9">
        <div><div>https://example.com/media/session.jpg</div></div>
        <div><div>
          <p>Session Title</p>
          <p>Session description goes here.</p>
          <p><a href="https://example.com">Register</a></p>
        </div></div>
      </div>
    `;
    const el = document.querySelector('.event-card');
    await init(el);

    const img = el.querySelector('.card-media picture img');
    expect(img).to.exist;
    // The real absolute (possibly cross-origin) URL, not rewritten to a same-origin path.
    expect(img.src).to.equal('https://example.com/media/session.jpg');
  });

  it('keeps a cross-origin authored <img> at its real absolute URL, not a same-origin pathname', async () => {
    document.body.innerHTML = `
      <div class="event-card ratio-16-9">
        <div><div><img src="https://example.com/media/session.jpg" alt="Session"></div></div>
        <div><div>
          <p>Session Title</p>
          <p>Session description goes here.</p>
          <p><a href="https://example.com">Register</a></p>
        </div></div>
      </div>
    `;
    const el = document.querySelector('.event-card');
    await init(el);

    const img = el.querySelector('.card-media picture img');
    expect(img).to.exist;
    expect(img.src).to.equal('https://example.com/media/session.jpg');
  });
});
