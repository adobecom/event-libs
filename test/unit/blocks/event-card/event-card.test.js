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

  describe('event-card featured boundary refresh', () => {
    const NOW = Date.parse('2026-11-11T18:00:00.000Z');
    let clock;

    beforeEach(() => {
      document.body.innerHTML = '';
      document.head.innerHTML = '';
      clock = sinon.useFakeTimers({ now: NOW, toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    });

    afterEach(() => {
      clock.restore();
      document.body.innerHTML = '';
      document.head.innerHTML = '';
    });

    async function buildCard(overrides = {}) {
      document.body.innerHTML = `
        <div class="event-card">
          <div><div><img src="data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=" alt=""></div></div>
          <div><div>
            <p>Session</p><p>Scheduled time</p>
            <p><a href="/sessions/s1" data-cta-prior="Learn more"
              data-cta-during="Watch now" data-cta-after="Watch on-demand">Learn more</a></p>
          </div></div>
        </div>`;
      const el = document.querySelector('.event-card');
      Object.assign(el.dataset, {
        sessionId: 's1',
        sessionUrl: '/sessions/s1',
        isOnline: 'true',
        timingBasis: 'video-duration',
        videoDuration: '00:00:02',
        startTimeUtc: new Date(NOW - 1000).toISOString(),
        endTimeUtc: new Date(NOW + 10_000).toISOString(),
        ...overrides,
      });
      if (!el.dataset.timingBasis) delete el.dataset.timingBasis;
      await init(el);
      return { el, cta: el.querySelector('.card-cta') };
    }

    it('changes CTA text and destination at video end, before the scheduled end', async () => {
      const { el, cta } = await buildCard();
      expect(cta.textContent).to.equal('Watch now');
      clock.tick(999);
      expect(cta.textContent).to.equal('Watch now');
      clock.tick(1);
      expect(cta.textContent).to.equal('Watch on-demand');
      expect(cta.getAttribute('href')).to.equal('/sessions/s1');
      expect(resolveCardAction(el.dataset)).to.deep.equal({ type: 'navigate', url: '/sessions/s1' });
      expect(el.dataset.endTimeUtc).to.equal(new Date(NOW + 10_000).toISOString());
    });

    it('refreshes upcoming, live and on-demand boundaries on a continuously open card', async () => {
      const { cta } = await buildCard({ startTimeUtc: new Date(NOW + 1000).toISOString() });
      expect(cta.textContent).to.equal('Learn more');
      clock.tick(1000);
      expect(cta.textContent).to.equal('Watch now');
      clock.tick(2000);
      expect(cta.textContent).to.equal('Watch on-demand');
    });

    it('stays live beyond scheduled end when video duration is longer', async () => {
      const { cta } = await buildCard({
        videoDuration: '00:00:20',
        endTimeUtc: new Date(NOW + 1000).toISOString(),
      });
      clock.tick(1000);
      expect(cta.textContent).to.equal('Watch now');
      clock.tick(18_000);
      expect(cta.textContent).to.equal('Watch on-demand');
    });

    it('falls back to scheduled end for invalid duration', async () => {
      const { cta } = await buildCard({
        videoDuration: 'bad',
        endTimeUtc: new Date(NOW + 1000).toISOString(),
      });
      clock.tick(1000);
      expect(cta.textContent).to.equal('Watch on-demand');
    });

    it('does not enable video timing for other event cards', async () => {
      const { cta } = await buildCard({ timingBasis: '' });
      clock.tick(1000);
      expect(cta.textContent).to.equal('Watch now');
    });

    it('chunks long delays instead of overflowing the browser timeout limit', async () => {
      const timeout = sinon.spy(window, 'setTimeout');
      try {
        const { cta } = await buildCard({ videoDuration: '1000:00:00' });
        expect(timeout.lastCall.args[1]).to.equal(2_147_483_647);
        clock.tick(2_147_483_647);
        expect(cta.textContent).to.equal('Watch now');
        clock.tick(3_600_000_000 - 1000 - 2_147_483_647);
        expect(cta.textContent).to.equal('Watch on-demand');
      } finally {
        timeout.restore();
      }
    });

    it('re-evaluates the clock after a delayed boundary callback', async () => {
      const { cta } = await buildCard();
      clock.setSystemTime(NOW + 20_000);
      clock.tick(1000);
      expect(cta.textContent).to.equal('Watch on-demand');
    });
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
});
