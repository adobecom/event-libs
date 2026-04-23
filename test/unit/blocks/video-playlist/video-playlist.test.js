import { expect } from '@esm-bundle/chai';
import { readFile } from '@web/test-runner-commands';
import init from '../../../../event-libs/v1/blocks/video-playlist/video-playlist.js';

const defaultBody = await readFile({ path: './mocks/default.html' });

// Number of cards in mock-chimera-response.json that have a thumbnailUrl (all 5 qualify)
const MOCK_CARD_COUNT = 5;

/**
 * Waits until a predicate returns true, polling every 50 ms up to `timeout` ms.
 * Used to let the async VideoPlaylist.init() settle without hard-coding a fixed delay.
 */
const waitFor = (predicate, timeout = 2000) =>
  new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      if (predicate()) {
        resolve();
        return;
      }
      if (Date.now() - start > timeout) {
        reject(new Error('waitFor timed out'));
        return;
      }
      setTimeout(check, 50);
    };
    check();
  });

describe('video-playlist block', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = defaultBody;
    localStorage.clear();
  });

  // ------------------------------------------------------------------ //
  // 1. Happy path — full render with .header, .sessions and skip anchor
  // ------------------------------------------------------------------ //
  it('renders .container with .header, .sessions and skip-to div after init', async () => {
    const el = document.querySelector('.video-playlist');
    init(el);

    await waitFor(() => !el.querySelector('.container.is-hidden'));

    const container = el.querySelector('.container');
    expect(container, '.container must exist').to.not.be.null;
    expect(container.classList.contains('is-hidden'), 'container must not be hidden').to.be.false;

    expect(el.querySelector('.header'), '.header must exist').to.not.be.null;
    expect(el.querySelector('.sessions'), '.sessions must exist').to.not.be.null;
    expect(
      el.querySelector('#playlist-skip-to'),
      'skip-to div must exist',
    ).to.not.be.null;
  });

  // ------------------------------------------------------------------ //
  // 2. Session cards are rendered from mock data
  // ------------------------------------------------------------------ //
  it('renders the correct number of session cards from mock chimera data', async () => {
    const el = document.querySelector('.video-playlist');
    init(el);

    await waitFor(() => el.querySelectorAll('.session').length === MOCK_CARD_COUNT);

    const cards = el.querySelectorAll('.session');
    expect(cards.length).to.equal(MOCK_CARD_COUNT);

    // Each card must carry a data-video-id
    cards.forEach((card) => {
      expect(card.getAttribute('data-video-id')).to.not.be.empty;
    });
  });

  // ------------------------------------------------------------------ //
  // 3. Config parsing — authored title and eyebrow surface in the header
  // ------------------------------------------------------------------ //
  it('renders playlistTitle and topicEyebrow from authored config divs', async () => {
    const el = document.querySelector('.video-playlist');
    init(el);

    await waitFor(() => !!el.querySelector('.header-title'));

    const title = el.querySelector('.header-title');
    const eyebrow = el.querySelector('.header-topic');

    expect(title).to.not.be.null;
    expect(title.textContent).to.equal('Test Playlist');

    expect(eyebrow).to.not.be.null;
    expect(eyebrow.textContent).to.equal('Test Topic');
  });

  // ------------------------------------------------------------------ //
  // 4. Too few sessions — container stays hidden when minimumSessions > count
  // ------------------------------------------------------------------ //
  it('keeps .container hidden when minimumSessions exceeds available card count', async () => {
    document.body.innerHTML = `
      <div class="video-playlist">
        <div><div>minimumSessions</div><div>99</div></div>
        <div><div>isTagbased</div><div>true</div></div>
        <div><div>socialSharing</div><div>false</div></div>
        <div><div>favoritesEnabled</div><div>false</div></div>
      </div>`;

    const el = document.querySelector('.video-playlist');
    init(el);

    // Wait long enough for the async fetch + bail-out path to complete (~200 ms delay)
    await new Promise((r) => setTimeout(r, 500));

    const container = el.querySelector('.container');
    expect(container, '.container must be created').to.not.be.null;
    expect(container.classList.contains('is-hidden'), 'container must remain hidden').to.be.true;

    expect(el.querySelector('.header'), '.header must NOT be rendered').to.be.null;
    expect(el.querySelector('.sessions'), '.sessions must NOT be rendered').to.be.null;
  });

  // ------------------------------------------------------------------ //
  // 5. Autoplay toggle — checkbox changes persist to localStorage
  // ------------------------------------------------------------------ //
  it('persists shouldAutoPlayPlaylist to localStorage when autoplay checkbox changes', async () => {
    const el = document.querySelector('.video-playlist');
    init(el);

    await waitFor(() => !!el.querySelector('#playlist-play-all'));

    const checkbox = el.querySelector('#playlist-play-all');
    expect(checkbox, 'autoplay checkbox must exist').to.not.be.null;

    // Simulate un-checking
    checkbox.checked = false;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));

    const stored = JSON.parse(localStorage.getItem('shouldAutoPlayPlaylist'));
    expect(stored).to.be.false;

    // Simulate checking again
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));

    const storedAgain = JSON.parse(localStorage.getItem('shouldAutoPlayPlaylist'));
    expect(storedAgain).to.be.true;
  });

  // ------------------------------------------------------------------ //
  // 6. Social sharing disabled — no .social-share-wrapper in the header
  // ------------------------------------------------------------------ //
  it('omits .social-share-wrapper when socialSharing is false', async () => {
    // default.html already sets socialSharing = false
    const el = document.querySelector('.video-playlist');
    init(el);

    await waitFor(() => !!el.querySelector('.header'));

    expect(
      el.querySelector('.social-share-wrapper'),
      '.social-share-wrapper must not be present when socialSharing is false',
    ).to.be.null;
  });

  // ------------------------------------------------------------------ //
  // 7. Theme — consonant--light class added to .container
  // ------------------------------------------------------------------ //
  it('adds consonant--light class to .container when theme is "light"', async () => {
    // default.html sets theme = light
    const el = document.querySelector('.video-playlist');
    init(el);

    // The container is created synchronously in createRoot(), before async work
    await waitFor(() => !!el.querySelector('.container'));

    const container = el.querySelector('.container');
    expect(container.classList.contains('consonant--light')).to.be.true;
  });

  // ------------------------------------------------------------------ //
  // 8. Progress bars — pre-seeded localStorage drives width style
  // ------------------------------------------------------------------ //
  it('sets progress bar width for sessions with pre-seeded localStorage data', async () => {
    // First render to discover the real video IDs from the mock JSON
    const el = document.querySelector('.video-playlist');
    init(el);

    await waitFor(() => el.querySelectorAll('.session').length === MOCK_CARD_COUNT);

    // Pick the first session card's video ID
    const firstCard = el.querySelector('.session');
    const videoId = firstCard.getAttribute('data-video-id');

    // Seed localStorage with 50 % progress for that video
    const totalSeconds = 3600;
    const watchedSeconds = 1800; // 50 %
    const videos = {};
    videos[videoId] = { secondsWatched: watchedSeconds, length: totalSeconds };
    localStorage.setItem('playlistVideos', JSON.stringify(videos));

    // Re-init on a fresh element so initProgressBars picks up the seeded data
    document.body.innerHTML = defaultBody;
    const el2 = document.querySelector('.video-playlist');
    init(el2);

    await waitFor(() => el2.querySelectorAll('.session').length === MOCK_CARD_COUNT);

    // Find the matching session in the re-rendered playlist
    const matchingSession = [...el2.querySelectorAll('.session')].find(
      (s) => s.getAttribute('data-video-id') === videoId,
    );
    expect(matchingSession, 'matching session card must exist').to.not.be.null;

    const bar = matchingSession.querySelector('.session-thumb-progress-bar');
    expect(bar, 'progress bar element must exist').to.not.be.null;
    expect(bar.style.width).to.equal('50%');
  });
});
