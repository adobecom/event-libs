import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import init, {
  getVideoProgress,
  saveVideoProgress,
  resumeMpcVideo,
  convertIsoDurationToSeconds,
} from '../../../../../event-libs/v1/c2/blocks/session-video-player/session-video-player.js';
import BlockMediator from '../../../../../event-libs/v1/deps/block-mediator.min.js';

const PROGRESS_STORAGE_KEY = 'session-video-playlist:progress';
const DECISION_KEY = 'videoLayoutDecision';
const ADOBE_TV_ORIGIN = 'https://video.tv.adobe.com';

const HOUR_MS = 3_600_000;

function setMeta(name, content) {
  const attr = name.includes('og:') ? 'property' : 'name';
  const meta = document.createElement('meta');
  meta.setAttribute(attr, name);
  meta.setAttribute('content', content);
  document.head.append(meta);
}

/** session-times metadata shaped exactly like the real Individual Session Page's. */
function sessionTimes({ endTimeMillis = Date.now() - HOUR_MS, videos } = {}) {
  return JSON.stringify([{
    endTimeMillis,
    videos: videos ?? [{ provider: 'mpc', url: `${ADOBE_TV_ORIGIN}/v/3458940`, kind: 'onDemand' }],
  }]);
}

/**
 * Builds the real two-section page shape: a full-width `.session-video-container` section and a
 * `.session-video-playlist-container` section, each holding its own `.session-video-player` instance.
 */
function buildPage({ withPlaylistContainer = true, withPlaylistBlock = false } = {}) {
  const main = document.createElement('main');

  const videoSection = document.createElement('div');
  videoSection.className = 'section session-video-container';
  const fullWidthPlayer = document.createElement('div');
  fullWidthPlayer.className = 'session-video-player';
  videoSection.append(fullWidthPlayer);
  main.append(videoSection);

  let playlistPlayer = null;
  if (withPlaylistContainer) {
    const playlistSection = document.createElement('div');
    playlistSection.className = 'section session-video-playlist-container';
    playlistPlayer = document.createElement('div');
    playlistPlayer.className = 'session-video-player';
    playlistSection.append(playlistPlayer);
    if (withPlaylistBlock) {
      const playlist = document.createElement('div');
      playlist.className = 'session-video-playlist';
      playlistSection.append(playlist);
    }
    main.append(playlistSection);
  }

  document.body.append(main);
  return { fullWidthPlayer, playlistPlayer };
}

/** Authored key/value config rows, the shape init()'s own cfg reducer parses. */
function addConfigRow(el, key, value) {
  const row = document.createElement('div');
  const keyCell = document.createElement('div');
  keyCell.textContent = key;
  const valueCell = document.createElement('div');
  valueCell.textContent = value;
  row.append(keyCell, valueCell);
  el.append(row);
}

/** Lets the not-awaited async decision flow inside init() settle. */
const flush = () => new Promise((resolve) => { setTimeout(resolve, 0); });

describe('session-video-player', () => {
  let clock;

  beforeEach(() => {
    document.body.innerHTML = '';
    document.head.innerHTML = '';
    localStorage.clear();
    window.lana = { log: sinon.stub() };
  });

  afterEach(() => {
    clock?.restore();
    clock = null;
    sinon.restore();
  });

  // MUST run before any test that sets a decision. BlockMediator is a module-level
  // singleton with no reset API, so once `videoLayoutDecision` holds a value every later
  // init() resolves it synchronously via BlockMediator.get() and no "pending" state is
  // observable again for the rest of the file.
  describe('while the layout decision is still pending', () => {
    beforeEach(() => {
      setMeta('session-id', 's-1');
      setMeta('session-times', sessionTimes());
    });

    it('shows a loader only in the full-width instance', async () => {
      const { fullWidthPlayer, playlistPlayer } = buildPage();

      await init(fullWidthPlayer);
      await init(playlistPlayer);

      expect(fullWidthPlayer.querySelector('.session-video-player-loader')).to.exist;
      expect(playlistPlayer.querySelector('.session-video-player-loader')).to.not.exist;
    });

    it('embeds nothing until the decision arrives', async () => {
      const { fullWidthPlayer, playlistPlayer } = buildPage();

      await init(fullWidthPlayer);
      await init(playlistPlayer);
      await flush();

      expect(fullWidthPlayer.querySelector('iframe')).to.not.exist;
      expect(playlistPlayer.querySelector('iframe')).to.not.exist;
    });

    it('falls back to the full-width instance after the 4s timeout', async () => {
      clock = sinon.useFakeTimers({ now: Date.now(), shouldAdvanceTime: true });
      const { fullWidthPlayer, playlistPlayer } = buildPage();
      await init(fullWidthPlayer);
      await init(playlistPlayer);

      clock.tick(4000);
      await flush();

      expect(fullWidthPlayer.querySelector('iframe.adobetv')).to.exist;
      expect(playlistPlayer.querySelector('iframe')).to.not.exist;
    });
  });

  describe('progress persistence', () => {
    it('returns null for a session with no saved progress', () => {
      expect(getVideoProgress('s-1')).to.equal(null);
    });

    it('round-trips secondsWatched and length through localStorage', () => {
      saveVideoProgress('s-1', 30, 120);
      expect(getVideoProgress('s-1')).to.deep.equal({
        secondsWatched: 30, length: 120, completed: false,
      });
    });

    it('marks completed once secondsWatched reaches the length', () => {
      saveVideoProgress('s-1', 120, 120);
      expect(getVideoProgress('s-1').completed).to.be.true;
    });

    it('recomputes completed from the CURRENT secondsWatched, so a rewatch drops below 100%', () => {
      saveVideoProgress('s-1', 120, 120);
      saveVideoProgress('s-1', 5, 120);
      expect(getVideoProgress('s-1').completed).to.be.false;
    });

    it('falls back to a previously saved length when the new write omits it', () => {
      saveVideoProgress('s-1', 30, 120);
      saveVideoProgress('s-1', 60);
      expect(getVideoProgress('s-1').length).to.equal(120);
    });

    it('ignores a write with no sessionId', () => {
      saveVideoProgress('', 30, 120);
      expect(localStorage.getItem(PROGRESS_STORAGE_KEY)).to.equal(null);
    });

    it('survives corrupt JSON in storage rather than throwing', () => {
      localStorage.setItem(PROGRESS_STORAGE_KEY, '{not json');
      expect(getVideoProgress('s-1')).to.equal(null);
      expect(window.lana.log.called).to.be.true;
    });
  });

  describe('convertIsoDurationToSeconds', () => {
    it('parses hours, minutes and seconds', () => {
      expect(convertIsoDurationToSeconds('PT1H2M3S')).to.equal(3723);
    });

    it('parses a minutes+seconds only duration', () => {
      expect(convertIsoDurationToSeconds('PT40M40S')).to.equal(2440);
    });

    it('returns 0 for empty or non-string input', () => {
      expect(convertIsoDurationToSeconds('')).to.equal(0);
      expect(convertIsoDurationToSeconds(null)).to.equal(0);
      expect(convertIsoDurationToSeconds(42)).to.equal(0);
    });
  });

  describe('resumeMpcVideo', () => {
    it('posts a play action at the saved position', () => {
      const postMessage = sinon.stub();
      resumeMpcVideo({ contentWindow: { postMessage } }, { secondsWatched: 42.7, length: 300 });
      expect(postMessage.calledOnce).to.be.true;
      expect(postMessage.firstCall.args[0]).to.deep.equal({
        type: 'mpcAction', action: 'play', currentTime: 42,
      });
      expect(postMessage.firstCall.args[1]).to.equal(ADOBE_TV_ORIGIN);
    });

    it('does not resume when within 30s of the end', () => {
      const postMessage = sinon.stub();
      resumeMpcVideo({ contentWindow: { postMessage } }, { secondsWatched: 280, length: 300 });
      expect(postMessage.called).to.be.false;
    });

    it('does nothing without saved progress or a known length', () => {
      const postMessage = sinon.stub();
      resumeMpcVideo({ contentWindow: { postMessage } }, null);
      resumeMpcVideo({ contentWindow: { postMessage } }, { secondsWatched: 10, length: null });
      expect(postMessage.called).to.be.false;
    });
  });

  describe('init() render gates', () => {
    it('removes the block when no session-id is available', async () => {
      const { fullWidthPlayer } = buildPage();
      setMeta('session-times', sessionTimes());

      await init(fullWidthPlayer);

      expect(fullWidthPlayer.isConnected).to.be.false;
    });

    it('falls back to an authored session-id row when page metadata is missing', async () => {
      const { fullWidthPlayer } = buildPage();
      addConfigRow(fullWidthPlayer, 'session-id', 's-authored');
      setMeta('session-times', sessionTimes());

      await init(fullWidthPlayer);
      await flush();

      expect(fullWidthPlayer.isConnected).to.be.true;
    });

    it('removes the block when session-times has no embeddable video', async () => {
      const { fullWidthPlayer } = buildPage();
      setMeta('session-id', 's-1');
      setMeta('session-times', sessionTimes({ videos: [] }));

      await init(fullWidthPlayer);

      expect(fullWidthPlayer.isConnected).to.be.false;
    });

    it('keeps a liveStream video once the session has ended (kind is not gated)', async () => {
      const { fullWidthPlayer } = buildPage();
      setMeta('session-id', 's-1');
      setMeta('session-times', sessionTimes({
        videos: [{ provider: 'mpc', url: `${ADOBE_TV_ORIGIN}/v/1`, kind: 'liveStream' }],
      }));

      await init(fullWidthPlayer);

      expect(fullWidthPlayer.isConnected).to.be.true;
    });

    it('removes the block when no video has an embeddable provider', async () => {
      const { fullWidthPlayer } = buildPage();
      setMeta('session-id', 's-1');
      setMeta('session-times', sessionTimes({
        videos: [{ provider: 'vimeo', url: 'https://vimeo.com/1', kind: 'onDemand' }],
      }));

      await init(fullWidthPlayer);

      expect(fullWidthPlayer.isConnected).to.be.false;
    });

    it('removes the block when the session has not ended yet', async () => {
      const { fullWidthPlayer } = buildPage();
      setMeta('session-id', 's-1');
      setMeta('session-times', sessionTimes({ endTimeMillis: Date.now() + HOUR_MS }));

      await init(fullWidthPlayer);

      expect(fullWidthPlayer.isConnected).to.be.false;
    });

    it('removes the block when endTimeMillis is missing (cannot confirm the session ended)', async () => {
      const { fullWidthPlayer } = buildPage();
      setMeta('session-id', 's-1');
      setMeta('session-times', JSON.stringify([{
        videos: [{ provider: 'mpc', url: `${ADOBE_TV_ORIGIN}/v/1`, kind: 'onDemand' }],
      }]));

      await init(fullWidthPlayer);

      expect(fullWidthPlayer.isConnected).to.be.false;
    });

    it('survives invalid session-times JSON without throwing', async () => {
      const { fullWidthPlayer } = buildPage();
      setMeta('session-id', 's-1');
      setMeta('session-times', '{not json');

      await init(fullWidthPlayer);

      expect(fullWidthPlayer.isConnected).to.be.false;
      expect(window.lana.log.called).to.be.true;
    });
  });

  describe('init() side effects', () => {
    beforeEach(() => {
      setMeta('session-id', 's-1');
      setMeta('session-times', sessionTimes());
    });

    it('injects the block stylesheet exactly once', async () => {
      const { fullWidthPlayer, playlistPlayer } = buildPage();
      await init(fullWidthPlayer);
      await init(playlistPlayer);
      await flush();

      expect(document.querySelectorAll('#session-video-player-css')).to.have.lengthOf(1);
    });

    it('preconnects to the mpc origin, deduped across both instances', async () => {
      const { fullWidthPlayer, playlistPlayer } = buildPage();
      await init(fullWidthPlayer);
      await init(playlistPlayer);

      const links = document.querySelectorAll(`link[rel="preconnect"][href="${ADOBE_TV_ORIGIN}"]`);
      expect(links).to.have.lengthOf(1);
    });

    it('preconnects to all three youtube origins', async () => {
      document.head.innerHTML = '';
      setMeta('session-id', 's-1');
      setMeta('session-times', sessionTimes({
        videos: [{ provider: 'youtube', url: 'https://www.youtube.com/watch?v=abcdefghijk', kind: 'onDemand' }],
      }));
      const { fullWidthPlayer } = buildPage();

      await init(fullWidthPlayer);

      expect(document.querySelectorAll('link[rel="preconnect"]')).to.have.lengthOf(3);
    });

  });

  describe('embed decision', () => {
    beforeEach(() => {
      setMeta('session-id', 's-1');
      setMeta('session-times', sessionTimes());
    });

    /**
     * A decision is final once set: init() reads it synchronously via BlockMediator.get()
     * and both promises settle immediately, so a LATER set() can never flip an instance
     * that already resolved. These tests therefore set the decision up front — only the
     * first one below exercises the live subscribe-then-set path, and it can only do so
     * because it is the first test in this file to touch the store.
     */
    async function initBoth() {
      const page = buildPage();
      await init(page.fullWidthPlayer);
      await init(page.playlistPlayer);
      await flush();
      return page;
    }

    it('embeds the playlist-container instance when a playlist exists', async () => {
      BlockMediator.set(DECISION_KEY, { hasPlaylist: true });
      const { fullWidthPlayer, playlistPlayer } = await initBoth();

      expect(playlistPlayer.querySelector('iframe.adobetv')).to.exist;
      expect(fullWidthPlayer.querySelector('iframe')).to.not.exist;
    });

    it('embeds the full-width instance when there is no playlist', async () => {
      BlockMediator.set(DECISION_KEY, { hasPlaylist: false });
      const { fullWidthPlayer, playlistPlayer } = await initBoth();

      expect(fullWidthPlayer.querySelector('iframe.adobetv')).to.exist;
      expect(playlistPlayer.querySelector('iframe')).to.not.exist;
    });

    it('hides the loader once the decision resolves, win or lose', async () => {
      BlockMediator.set(DECISION_KEY, { hasPlaylist: true });
      await initBoth();

      expect(document.querySelector('.session-video-player-loader')).to.not.exist;
    });

    it('marks the winning instance with data-embedded', async () => {
      BlockMediator.set(DECISION_KEY, { hasPlaylist: false });
      const { fullWidthPlayer } = await initBoth();

      expect(fullWidthPlayer.dataset.embedded).to.equal('true');
    });

    it('leaves the losing instance unmarked', async () => {
      BlockMediator.set(DECISION_KEY, { hasPlaylist: false });
      const { playlistPlayer } = await initBoth();

      expect(playlistPlayer.dataset.embedded).to.equal(undefined);
    });

    /**
     * Regression: two players embedded at once on a real page. Milo's decorateSection()
     * resets `section.className = 'section'` and the Style-row classes are re-applied
     * later by the section-metadata BLOCK, so a section can be mid-decoration — bare
     * `class="section"` with only its authored metadata table — when these blocks run.
     * Matching on the applied class alone made BOTH instances read as full-width, so both
     * won and both embedded. Container detection reads the Style row as a fallback.
     */
    it('identifies the playlist container from its Style row before the class is applied', async () => {
      const main = document.createElement('main');

      const videoSection = document.createElement('div');
      videoSection.className = 'section session-video-container';
      const fullWidthPlayer = document.createElement('div');
      fullWidthPlayer.className = 'session-video-player';
      videoSection.append(fullWidthPlayer);

      // Not yet decorated: no session-video-playlist-container class, only the authored table.
      const undecoratedSection = document.createElement('div');
      undecoratedSection.className = 'section';
      const playlistPlayer = document.createElement('div');
      playlistPlayer.className = 'session-video-player';
      const metadata = document.createElement('div');
      metadata.className = 'section-metadata';
      const row = document.createElement('div');
      const label = document.createElement('div');
      label.textContent = 'style';
      const value = document.createElement('div');
      value.textContent = 'spacing-sm, grid, container-desktop, session-video-playlist-container';
      row.append(label, value);
      metadata.append(row);
      undecoratedSection.append(playlistPlayer, metadata);

      main.append(videoSection, undecoratedSection);
      document.body.append(main);

      BlockMediator.set(DECISION_KEY, { hasPlaylist: false });
      await init(fullWidthPlayer);
      await init(playlistPlayer);
      await flush();

      // hasPlaylist:false means the full-width instance wins — and the still-undecorated
      // one must recognise itself as the playlist container and stand down.
      expect(fullWidthPlayer.dataset.embedded).to.equal('true');
      expect(playlistPlayer.dataset.embedded).to.equal(undefined);
      expect(document.querySelectorAll('.session-video-player iframe')).to.have.lengthOf(1);
    });
  });

  describe('embedding', () => {
    beforeEach(() => {
      setMeta('session-id', 's-1');
      BlockMediator.set(DECISION_KEY, { hasPlaylist: false });
      // Present-but-inert YT global so ensureYouTubeIframeApi() short-circuits instead of
      // injecting the real https://www.youtube.com/iframe_api script, which this repo's
      // test harness disallows.
      window.YT = {
        Player: function StubPlayer() {},
        PlayerState: {
          PLAYING: 1, PAUSED: 2, ENDED: 0,
        },
      };
    });

    afterEach(() => {
      delete window.YT;
    });

    async function embedFullWidth() {
      const { fullWidthPlayer } = buildPage({ withPlaylistContainer: false });
      await init(fullWidthPlayer);
      await flush();
      return fullWidthPlayer;
    }

    it('builds an adobetv iframe using the authored url verbatim', async () => {
      setMeta('session-times', sessionTimes());
      const el = await embedFullWidth();

      const iframe = el.querySelector('iframe.adobetv');
      expect(iframe.getAttribute('src')).to.equal(`${ADOBE_TV_ORIGIN}/v/3458940`);
      expect(iframe.getAttribute('title')).to.equal('Adobe Video Publishing Cloud Player');
      expect(iframe.getAttribute('loading')).to.equal('lazy');
    });

    it('wraps the iframe in a .milo-video container and loads milo iframe css', async () => {
      setMeta('session-times', sessionTimes());
      const el = await embedFullWidth();

      expect(el.querySelector('.milo-video > iframe')).to.exist;
      expect(document.getElementById('milo-iframe-css')).to.exist;
    });

    it('reuses an already-authored .milo-video container instead of appending a second', async () => {
      setMeta('session-times', sessionTimes());
      const { fullWidthPlayer } = buildPage({ withPlaylistContainer: false });
      const authored = document.createElement('div');
      authored.className = 'milo-video';
      fullWidthPlayer.append(authored);

      await init(fullWidthPlayer);
      await flush();

      expect(fullWidthPlayer.querySelectorAll('.milo-video')).to.have.lengthOf(1);
      expect(authored.querySelector('iframe')).to.exist;
    });

    it('removes an authored .mobile-rider that cannot host the embed', async () => {
      setMeta('session-times', sessionTimes());
      const { fullWidthPlayer } = buildPage({ withPlaylistContainer: false });
      const rider = document.createElement('div');
      rider.className = 'mobile-rider';
      fullWidthPlayer.append(rider);

      await init(fullWidthPlayer);
      await flush();

      expect(fullWidthPlayer.querySelector('.mobile-rider')).to.not.exist;
      expect(fullWidthPlayer.querySelector('.milo-video')).to.exist;
    });

    ['https://www.youtube.com/watch?v=abcdefghijk',
      'https://www.youtube.com/embed/abcdefghijk',
      'abcdefghijk'].forEach((url) => {
      it(`extracts the youtube id from "${url}"`, async () => {
        setMeta('session-times', sessionTimes({
          videos: [{ provider: 'youtube', url, kind: 'onDemand' }],
        }));
        const el = await embedFullWidth();

        const iframe = el.querySelector('iframe.youtube');
        expect(iframe.id).to.equal('session-video-player-yt-abcdefghijk');
        expect(iframe.getAttribute('src')).to.contain('/embed/abcdefghijk');
        expect(iframe.getAttribute('src')).to.contain('enablejsapi=1');
      });
    });

    it('falls back to the raw url when no youtube id can be extracted', async () => {
      setMeta('session-times', sessionTimes({
        videos: [{ provider: 'youtube', url: 'https://example.com/nope', kind: 'onDemand' }],
      }));
      const el = await embedFullWidth();

      const iframe = el.querySelector('iframe.youtube');
      expect(iframe.getAttribute('src')).to.equal('https://example.com/nope');
      expect(iframe.id).to.equal('');
    });
  });

  describe('mpc playback tracking', () => {
    let el;

    beforeEach(async () => {
      setMeta('session-id', 's-1');
      setMeta('session-times', sessionTimes());
      BlockMediator.set(DECISION_KEY, { hasPlaylist: false });
      ({ fullWidthPlayer: el } = buildPage({ withPlaylistContainer: false }));
      await init(el);
      await flush();
    });

    /** Mirrors the real MPC postMessage envelope, including its origin check. */
    function postMpc(data) {
      window.dispatchEvent(new MessageEvent('message', { data, origin: ADOBE_TV_ORIGIN }));
    }

    it('saves progress on a tick landing on the 5s cadence', () => {
      postMpc({ type: 'mpcStatus', state: 'tick', currentTime: 10, length: 100 });
      expect(getVideoProgress('s-1')).to.include({ secondsWatched: 10, length: 100 });
    });

    it('ignores ticks between the 5s cadence marks', () => {
      postMpc({ type: 'mpcStatus', state: 'tick', currentTime: 7, length: 100 });
      expect(getVideoProgress('s-1')).to.equal(null);
    });

    /**
     * Captures only THIS session's events while `run` executes. Earlier tests in this
     * file leak their own permanent `message` listeners (every watchMpcPlayback listener
     * is never removed — see B1 in the refactor notes), so unrelated sessionIds would
     * otherwise show up alongside this one.
     */
    function captureStates(type, run) {
      const seen = [];
      const listener = (e) => { if (e.detail.sessionId === 's-1') seen.push(e.detail); };
      window.addEventListener(type, listener);
      try {
        run();
      } finally {
        window.removeEventListener(type, listener);
      }
      return seen;
    }

    it('emits a play state on every tick, even ones that skip the progress save', () => {
      const states = captureStates('session-video-player:state', () => {
        postMpc({ type: 'mpcStatus', state: 'tick', currentTime: 7, length: 100 });
      });

      expect(states).to.deep.equal([{ sessionId: 's-1', state: 'play' }]);
    });

    it('saves progress and emits pause on a pause event', () => {
      const states = captureStates('session-video-player:state', () => {
        postMpc({ type: 'mpcStatus', state: 'pause', currentTime: 33, length: 100 });
      });

      expect(getVideoProgress('s-1')).to.include({ secondsWatched: 33 });
      expect(states.map((d) => d.state)).to.deep.equal(['pause']);
    });

    it('emits progress notifications listeners can react to', () => {
      const progress = captureStates('session-video-player:progress', () => {
        postMpc({ type: 'mpcStatus', state: 'pause', currentTime: 33, length: 100 });
      });

      expect(progress).to.deep.equal([{ sessionId: 's-1' }]);
    });

    it('marks the session complete and emits ended', () => {
      const states = captureStates('session-video-player:state', () => {
        postMpc({ type: 'mpcStatus', state: 'complete', length: 100 });
      });

      expect(getVideoProgress('s-1')).to.include({ secondsWatched: 100, completed: true });
      expect(states.map((d) => d.state)).to.deep.equal(['ended']);
    });

    it('emits ended without clobbering progress when no length is known', () => {
      const states = captureStates('session-video-player:state', () => {
        postMpc({ type: 'mpcStatus', state: 'complete' });
      });

      expect(getVideoProgress('s-1')).to.equal(null);
      expect(states.map((d) => d.state)).to.deep.equal(['ended']);
    });

    it('ignores messages from a foreign origin', () => {
      window.dispatchEvent(new MessageEvent('message', {
        data: { type: 'mpcStatus', state: 'tick', currentTime: 10, length: 100 },
        origin: 'https://evil.example.com',
      }));
      expect(getVideoProgress('s-1')).to.equal(null);
    });

    it('ignores same-origin messages that are not mpcStatus', () => {
      postMpc({ type: 'somethingElse', state: 'tick', currentTime: 10, length: 100 });
      expect(getVideoProgress('s-1')).to.equal(null);
    });

    it('keys progress on the block session id, not the message id', () => {
      postMpc({
        type: 'mpcStatus', state: 'tick', id: 'mpc-999', currentTime: 10, length: 100,
      });
      expect(getVideoProgress('s-1')).to.not.equal(null);
      expect(getVideoProgress('mpc-999')).to.equal(null);
    });
  });
});
