import { expect } from '@esm-bundle/chai';
import { readFile } from '@web/test-runner-commands';
import sinon from 'sinon';
import init from '../../../../event-libs/v1/c2/blocks/event-card/event-card.js';
import { resolveCardAction } from '../../../../event-libs/v1/utils/session-routing.js';

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

  it('sets no theme attribute — dark/light is pure CSS off the ancestor .section.dark or a dark-card class', async () => {
    document.body.innerHTML = await readFile({ path: './mocks/media-standard.html' });
    const el = document.querySelector('.event-card');
    await init(el);

    expect(el.dataset.cardTheme).to.equal(undefined);
  });

  it('leaves an authored dark-card class in place for event-card.css to key off', async () => {
    document.body.innerHTML = await readFile({ path: './mocks/media-standard.html' });
    const el = document.querySelector('.event-card');
    el.classList.add('dark-card');
    await init(el);

    expect(el.classList.contains('dark-card')).to.equal(true);
  });

  it('leaves the card under its ancestor .section.dark for event-card.css to key off, with no card-level class added', async () => {
    document.body.innerHTML = await readFile({ path: './mocks/media-standard.html' });
    const el = document.querySelector('.event-card');
    const section = document.createElement('div');
    section.className = 'section dark';
    section.append(el);
    document.body.append(section);
    await init(el);

    expect(el.closest('.section.dark')).to.equal(section);
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

    expect(el.closest('.section.dark')).to.equal(null);
    expect(el.classList.contains('dark-card')).to.equal(false);
    expect(el.dataset.cardTheme).to.equal(undefined);
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

  it('updates MR card CTAs and routing at scheduled boundaries when avoiding stream end', async () => {
    document.body.innerHTML = await readFile({ path: './mocks/media-standard.html' });
    const el = document.querySelector('.event-card');
    const now = Date.parse('2026-11-11T19:00:00.000Z');
    const originalPath = window.location.pathname + window.location.search;
    const clock = sinon.useFakeTimers({ now, toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    const fetchStub = sinon.stub(window, 'fetch').resolves({
      ok: true,
      json: async () => ({ active: [], inactive: ['mr-1'] }),
    });

    try {
      window.history.replaceState(null, '', '?avoidStreamEndFlag=true');
      Object.assign(el.dataset, {
        sessionId: 'sess-1',
        mrStreamId: 'mr-1',
        sessionUrl: 'https://adobe.com/sessions/s1',
        watchDestination: 'homepage',
        homepageAnchorId: 'video',
        startTimeUtc: new Date(now + 1000).toISOString(),
        endTimeUtc: new Date(now + 2000).toISOString(),
      });
      Object.assign(el.querySelector('a').dataset, {
        ctaPrior: 'Learn more',
        ctaDuring: 'Watch now',
        ctaAfter: 'Watch on demand',
      });
      await init(el);

      const cta = el.querySelector('.card-cta');
      expect(cta.textContent).to.equal('Learn more');

      await clock.tickAsync(1000);
      expect(cta.textContent).to.equal('Watch now');
      expect(resolveCardAction(el.dataset)).to.deep.equal({ type: 'scroll', anchorId: 'video' });

      await clock.tickAsync(1001);
      expect(cta.textContent).to.equal('Watch on demand');
      expect(cta.href).to.equal(el.dataset.sessionUrl);
      expect(resolveCardAction(el.dataset))
        .to.deep.equal({ type: 'navigate', url: el.dataset.sessionUrl });
      expect(fetchStub.called).to.be.false;
    } finally {
      clock.restore();
      fetchStub.restore();
      window.history.replaceState(null, '', originalPath);
    }
  });
});
