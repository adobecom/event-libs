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

function buildBlock(config) {
  const el = document.createElement('div');
  el.className = 'featured-sessions';
  el.dataset.featuredSessionsConfig = JSON.stringify(config);
  document.body.append(el);
  return el;
}

describe('featured-sessions', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('renders a card per entry with an image, ratio-16-9', async () => {
    const el = buildBlock({ entries: [entry()] });
    await init(el);

    const cards = el.querySelectorAll('.event-card');
    expect(cards.length).to.equal(1);
    expect(cards[0].classList.contains('ratio-16-9')).to.equal(true);
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
});
