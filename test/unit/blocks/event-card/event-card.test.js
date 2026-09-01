import { expect } from '@esm-bundle/chai';
import { readFile } from '@web/test-runner-commands';
import init from '../../../../event-libs/v1/c2/blocks/event-card/event-card.js';

describe('event-card', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.head.innerHTML = '';
  });

  it('renders a body-layout card for media-standard', async () => {
    document.body.innerHTML = await readFile({ path: './mocks/media-standard.html' });
    const el = document.querySelector('.event-card');
    await init(el);

    expect(el.dataset.cardVariant).to.equal('media-standard');
    expect(el.querySelector('.card-media picture')).to.exist;
    expect(el.querySelector('.card-title').textContent).to.equal('Session Title');
    expect(el.querySelector('.card-description').textContent).to.equal('Session description goes here.');
    expect(el.querySelector('.card-cta').textContent).to.equal('Register');
  });

  it('renders a body-layout card for media-standard-rev too', async () => {
    document.body.innerHTML = await readFile({ path: './mocks/media-standard-rev.html' });
    const el = document.querySelector('.event-card');
    await init(el);

    expect(el.dataset.cardVariant).to.equal('media-standard-rev');
    expect(el.querySelector('.card-body')).to.exist;
    expect(el.querySelector('.card-title').textContent).to.equal('Jane Doe');
    expect(el.querySelector('.card-description').textContent).to.equal('VP of Something');
    expect(el.querySelector('.card-cta').textContent).to.equal('Learn more');
  });

  it('renders a body-layout card for media-wide too', async () => {
    document.body.innerHTML = await readFile({ path: './mocks/media-wide.html' });
    const el = document.querySelector('.event-card');
    await init(el);

    expect(el.dataset.cardVariant).to.equal('media-wide');
    expect(el.querySelector('.card-media picture')).to.exist;
    expect(el.querySelector('.card-title').textContent).to.equal('Featured Session Title');
    expect(el.querySelector('.card-description').textContent).to.equal('Featured session description goes here.');
    expect(el.querySelector('.card-cta').textContent).to.equal('Watch now');
  });

  it('renders a body-layout card for media-tall too', async () => {
    document.body.innerHTML = await readFile({ path: './mocks/media-tall.html' });
    const el = document.querySelector('.event-card');
    await init(el);

    expect(el.dataset.cardVariant).to.equal('media-tall');
    expect(el.querySelector('.card-media picture')).to.exist;
    expect(el.querySelector('.card-title').textContent).to.equal('Featured Session Title');
    expect(el.querySelector('.card-description').textContent).to.equal('Featured session description goes here.');
    expect(el.querySelector('.card-cta').textContent).to.equal('Watch now');
  });

  it('defaults to media-standard when no variant class is authored', async () => {
    document.body.innerHTML = await readFile({ path: './mocks/media-standard.html' });
    const el = document.querySelector('.event-card');
    el.classList.remove('media-standard');
    await init(el);

    expect(el.dataset.cardVariant).to.equal('media-standard');
  });

  it('removes the block when no media is authored', async () => {
    document.body.innerHTML = '<div class="event-card media-standard"><div></div><div></div></div>';
    const el = document.querySelector('.event-card');
    await init(el);

    expect(document.querySelector('.event-card')).to.not.exist;
  });

  it('builds media from a resolved image URL when no img is authored', async () => {
    document.body.innerHTML = `
      <div class="event-card media-wide">
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

  it('defaults to light theme when no dark-card class is authored', async () => {
    document.body.innerHTML = await readFile({ path: './mocks/media-standard.html' });
    const el = document.querySelector('.event-card');
    await init(el);

    expect(el.dataset.cardTheme).to.equal('light');
  });

  it('sets dark theme from a dark-card class present before init', async () => {
    document.body.innerHTML = await readFile({ path: './mocks/media-standard.html' });
    const el = document.querySelector('.event-card');
    el.classList.add('dark-card');
    await init(el);

    expect(el.dataset.cardTheme).to.equal('dark');
    expect(el.classList.contains('dark-card')).to.equal(true);
  });

  it('inherits dark theme from an ancestor .section.dark, with no card-level class needed', async () => {
    document.body.innerHTML = await readFile({ path: './mocks/media-standard.html' });
    const el = document.querySelector('.event-card');
    const section = document.createElement('div');
    section.className = 'section dark';
    section.append(el);
    document.body.append(section);
    await init(el);

    expect(el.dataset.cardTheme).to.equal('dark');
    expect(el.classList.contains('dark-card')).to.equal(false);
  });

  it('stays light inside a .section with no dark class', async () => {
    document.body.innerHTML = await readFile({ path: './mocks/media-standard.html' });
    const el = document.querySelector('.event-card');
    const section = document.createElement('div');
    section.className = 'section';
    section.append(el);
    document.body.append(section);
    await init(el);

    expect(el.dataset.cardTheme).to.equal('light');
  });

  it('keeps a cross-origin authored <img> at its real absolute URL, not a same-origin pathname', async () => {
    document.body.innerHTML = `
      <div class="event-card media-wide">
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
