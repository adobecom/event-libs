import { expect } from '@esm-bundle/chai';
import init from '../../../../../event-libs/v1/c2/blocks/featured-sessions/featured-sessions.js';

function entry(overrides = {}) {
  return {
    sessionId: 'session-1',
    enTitle: 'Intro to Adobe Express',
    track: 'Video',
    url: 'https://example.com/sessions/s-001',
    imageUrl: 'https://example.com/image.jpg',
    ...overrides,
  };
}

function buildBlock(config, { dark = false } = {}) {
  const el = document.createElement('div');
  el.className = 'featured-sessions';
  el.dataset.featuredSessionsConfig = JSON.stringify(config);
  const section = document.createElement('div');
  section.className = dark ? 'section dark' : 'section';
  section.append(el);
  document.body.append(section);
  return el;
}

describe('featured-sessions', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('renders a card per entry with an image, media-wide', async () => {
    const el = buildBlock({ entries: [entry()] });
    await init(el);

    const cards = el.querySelectorAll('.event-card');
    expect(cards.length).to.equal(1);
    expect(cards[0].classList.contains('media-wide')).to.equal(true);
    expect(cards[0].querySelector('.card-title').textContent).to.equal('Intro to Adobe Express');
    expect(cards[0].querySelector('.card-description').textContent).to.equal('Video');
    expect(cards[0].querySelector('.card-cta').textContent).to.equal('Learn more');
    expect(cards[0].querySelector('.card-media picture')).to.exist;
  });

  it('drops an entry with no imageUrl instead of rendering an imageless card', async () => {
    const el = buildBlock({
      entries: [entry(), entry({ sessionId: 'session-2', enTitle: 'No Image Session', imageUrl: '' })],
    });
    await init(el);

    const cards = el.querySelectorAll('.event-card');
    expect(cards.length).to.equal(1);
    expect(cards[0].querySelector('.card-title').textContent).to.equal('Intro to Adobe Express');
  });

  it('sets session-routing data attributes from the entry before hydrating the card', async () => {
    const el = buildBlock({
      entries: [entry({
        mrStreamId: 'mr-1',
        watchUrl: 'https://example.com/watch',
        sessionTime: { startTimeMillis: 1750000000000, endTimeMillis: 1750003600000 },
      })],
    });
    await init(el);

    const card = el.querySelector('.event-card');
    expect(card.dataset.sessionId).to.equal('session-1');
    expect(card.dataset.mrStreamId).to.equal('mr-1');
    expect(card.dataset.watchUrl).to.equal('https://example.com/watch');
    expect(card.dataset.sessionUrl).to.equal('https://example.com/sessions/s-001');
    expect(card.dataset.startTimeUtc).to.equal(new Date(1750000000000).toISOString());
    expect(card.dataset.endTimeUtc).to.equal(new Date(1750003600000).toISOString());
  });

  it('does not author a heading — aria-label is a fixed label regardless of config', async () => {
    const el = buildBlock({ heading: 'Ignored Custom Heading', entries: [entry()] });
    await init(el);

    expect(el.getAttribute('aria-label')).to.equal('Featured Sessions');
    expect(el.querySelector('.featured-sessions-heading')).to.not.exist;
  });

  it('does not render a heading through event-carousel\'s own hideable controls either', async () => {
    const el = buildBlock({ entries: [entry()] });
    await init(el);

    expect(el.querySelector('.carousel-heading')).to.not.exist;
  });

  it('wraps the cards in a shared carousel-track and builds arrow controls', async () => {
    const el = buildBlock({
      entries: [entry(), entry({ sessionId: 'session-2' })],
    });
    await init(el);

    const track = el.querySelector('.carousel-track');
    expect(track).to.exist;
    expect(track.querySelectorAll(':scope > .event-card')).to.have.lengthOf(2);
    expect(track.dataset.carouselId).to.be.a('string').that.is.not.empty;
    expect(el.querySelector('.carousel-arrows')).to.exist;
    expect(el.querySelector('.carousel-arrow-prev')).to.exist;
    expect(el.querySelector('.carousel-arrow-next')).to.exist;
  });

  it('removes itself entirely when the entries array is empty', async () => {
    const el = buildBlock({ entries: [] });
    await init(el);
    expect(el.isConnected).to.equal(false);
  });

  it('removes itself entirely when every entry lacks an image', async () => {
    const el = buildBlock({ entries: [entry({ imageUrl: '' })] });
    await init(el);
    expect(el.isConnected).to.equal(false);
  });

  it('removes itself entirely when there is no config data attribute at all', async () => {
    const el = document.createElement('div');
    el.className = 'featured-sessions';
    document.body.append(el);

    await init(el);
    expect(el.isConnected).to.equal(false);
  });

  it('removes itself entirely when the config payload fails to parse', async () => {
    const el = document.createElement('div');
    el.className = 'featured-sessions';
    el.dataset.featuredSessionsConfig = 'not json';
    document.body.append(el);

    await init(el);
    expect(el.isConnected).to.equal(false);
  });

  describe('theme', () => {
    it('defaults to light in a section with no dark style metadata', async () => {
      const el = buildBlock({ entries: [entry()] });
      await init(el);

      const card = el.querySelector('.event-card');
      expect(card.classList.contains('dark-card')).to.equal(false);
      expect(card.dataset.cardTheme).to.equal('light');
    });

    it('inherits dark from the containing section, with no config.theme or per-card wiring', async () => {
      const el = buildBlock({ entries: [entry()] }, { dark: true });
      await init(el);

      const card = el.querySelector('.event-card');
      expect(card.classList.contains('dark-card')).to.equal(false);
      expect(card.dataset.cardTheme).to.equal('dark');
    });
  });

  describe('per-state CTA text', () => {
    const NOW = Date.now();

    it('defaults to "Learn more" pre-session when config.cta is absent', async () => {
      const el = buildBlock({
        entries: [entry({ sessionTime: { startTimeMillis: NOW + 1000000, endTimeMillis: NOW + 2000000 } })],
      });
      await init(el);
      expect(el.querySelector('.card-cta').textContent).to.equal('Learn more');
    });

    it('uses config.cta.prior before the session starts', async () => {
      const el = buildBlock({
        cta: { prior: 'Coming soon', during: 'Live now', after: 'Catch the replay' },
        entries: [entry({ sessionTime: { startTimeMillis: NOW + 1000000, endTimeMillis: NOW + 2000000 } })],
      });
      await init(el);
      expect(el.querySelector('.card-cta').textContent).to.equal('Coming soon');
    });

    it('uses config.cta.during while the session is live', async () => {
      const el = buildBlock({
        cta: { prior: 'Coming soon', during: 'Live now', after: 'Catch the replay' },
        entries: [entry({ sessionTime: { startTimeMillis: NOW - 1000, endTimeMillis: NOW + 1000000 } })],
      });
      await init(el);
      expect(el.querySelector('.card-cta').textContent).to.equal('Live now');
    });

    it('uses config.cta.after once the session has ended', async () => {
      const el = buildBlock({
        cta: { prior: 'Coming soon', during: 'Live now', after: 'Catch the replay' },
        entries: [entry({ sessionTime: { startTimeMillis: NOW - 2000000, endTimeMillis: NOW - 1000000 } })],
      });
      await init(el);
      expect(el.querySelector('.card-cta').textContent).to.equal('Catch the replay');
    });

    it('falls back to the built-in default for a blank state while others are set', async () => {
      const el = buildBlock({
        cta: { during: 'Live now' },
        entries: [entry({ sessionTime: { startTimeMillis: NOW - 2000000, endTimeMillis: NOW - 1000000 } })],
      });
      await init(el);
      expect(el.querySelector('.card-cta').textContent).to.equal('Watch on-demand');
    });

    it('treats an entry with no sessionTime as "prior"', async () => {
      const el = buildBlock({
        cta: { prior: 'Coming soon', during: 'Live now', after: 'Catch the replay' },
        entries: [entry()],
      });
      await init(el);
      expect(el.querySelector('.card-cta').textContent).to.equal('Coming soon');
    });
  });
});
