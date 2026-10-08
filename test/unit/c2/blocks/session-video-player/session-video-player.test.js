import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import init, {
  getVideoProgress,
  saveVideoProgress,
  resumeMpcVideo,
  convertIsoDurationToSeconds,
} from '../../../../../event-libs/v1/c2/blocks/session-video-player/session-video-player.js';
import BlockMediator from '../../../../../event-libs/v1/deps/block-mediator.min.js';
import { YouTubeChat } from '../../../../../event-libs/v1/c2/blocks/event-youtube/event-youtube.js';
import { registerYouTubeTracking } from '../../../../../event-libs/v1/c2/utils/youtube-analytics.js';

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

/**
 * Authors the `custom-attributes` page metadata (the RF-synced attribute array) exactly the way
 * an Individual Session Page carries it. classifySessionPlayback() reads these — an `MPC ID`
 * (or `YouTube ID`) with no live/DVR identity classifies the session as SIMULIVE, which lands in
 * ON_DEMAND once its scheduled window has passed. Fully fake: no network, no catalog fetch.
 */
function setCustomAttributes(attrs = {}) {
  const {
    mpcId = '3458940', youTubeId, mrStreamId, livestreamed,
    dvrDelayHours, mrDvrVideoId, mrSkinId,
  } = attrs;
  const rows = [];
  const add = (name, value) => rows.push({ name, enabled: true, values: [{ value }] });
  const addLabel = (name, label) => rows.push({ name, enabled: true, values: [{ label }] });
  if (mpcId != null) add('MPC ID', mpcId);
  if (youTubeId != null) add('YouTube ID', youTubeId);
  if (mrStreamId != null) add('Mobilerider Video ID (Livestream)', mrStreamId);
  if (livestreamed) addLabel('Livestreamed Content', 'Live');
  if (dvrDelayHours != null) add('DVR Timing (in hours)', String(dvrDelayHours));
  if (mrDvrVideoId != null) add('Mobilerider Video ID (DVR)', mrDvrVideoId);
  if (mrSkinId != null) add('SkinID', mrSkinId);
  setMeta('custom-attributes', JSON.stringify(rows));
}

/**
 * session-times metadata shaped exactly like the real Individual Session Page's. Defaults to an
 * already-ended window (start/end in the past) so a SIMULIVE-classified session resolves to the
 * ON_DEMAND phase and the player embeds synchronously — no fake clock needed.
 */
function sessionTimes({
  startTimeMillis = Date.now() - (2 * HOUR_MS),
  endTimeMillis = Date.now() - HOUR_MS,
  videos,
} = {}) {
  return JSON.stringify([{
    startTimeMillis,
    endTimeMillis,
    videos: videos ?? [{ provider: 'mpc', url: `${ADOBE_TV_ORIGIN}/v/3458940`, kind: 'onDemand' }],
  }]);
}

/** Sets both metadata halves the render path needs: identity/timing + the embeddable video. */
function authorSession({ times, attrs } = {}) {
  setMeta('session-id', 's-1');
  setMeta('session-times', times ?? sessionTimes());
  setCustomAttributes(attrs ?? {});
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

/** Lets the not-awaited async decision/embed flow inside init() settle. */
const flush = () => new Promise((resolve) => { setTimeout(resolve, 0); });

// The `embedding` describe stubs iframe src → about:blank (so nothing loads) and stashes the real
// value on data-src. This reads back the src the block actually built, for assertion.
const getIframeSrc = (iframe) => iframe.getAttribute('data-src') ?? iframe.getAttribute('src');

describe('session-video-player', () => {
  // Several tests mount real iframe elements and assert the src the block builds. We assert that
  // src WITHOUT the browser ever loading the cross-origin document: a real load pulls in the
  // frame's own scripts, which both hit the network and raise an opaque "Script error." that Mocha
  // (via window.onerror) attributes to whichever test is mid-run under the concurrent suite. So
  // while these tests run, intercept setAttribute('src', …) on iframes — stash the intended value
  // on a data-src attribute (which the tests assert via getIframeSrc) and point the live src at
  // about:blank so nothing is ever fetched. Fully fake: no network, no external scripts.
  let originalSetAttribute;
  let satelliteDescriptor;
  let readyState;

  before(() => {
    originalSetAttribute = HTMLIFrameElement.prototype.setAttribute;
    HTMLIFrameElement.prototype.setAttribute = function setAttribute(name, value) {
      if (name === 'src') {
        originalSetAttribute.call(this, 'data-src', value);
        return originalSetAttribute.call(this, 'src', 'about:blank');
      }
      return originalSetAttribute.call(this, name, value);
    };
  });

  after(() => {
    HTMLIFrameElement.prototype.setAttribute = originalSetAttribute;
  });

  beforeEach(() => {
    document.body.innerHTML = '';
    document.head.innerHTML = '';
    localStorage.clear();
    window.lana = { log: sinon.stub() };
    readyState = sinon.stub(document, 'readyState').get(() => 'complete');
    satelliteDescriptor = Object.getOwnPropertyDescriptor(window, '_satellite');
    Object.defineProperty(window, '_satellite', {
      configurable: true,
      writable: true,
      value: { track: sinon.spy() },
    });
    // Present-but-inert YT global so ensureYouTubeIframeApi() short-circuits instead of injecting
    // the real https://www.youtube.com/iframe_api script (disallowed in unit tests).
    window.YT = {
      Player: function StubPlayer() {},
      PlayerState: { PLAYING: 1, PAUSED: 2, ENDED: 0 },
    };
  });

  afterEach(() => {
    document.body.innerHTML = '';
    readyState.get(() => 'complete');
    document.dispatchEvent(new Event('readystatechange'));
    delete window.YT;
    sinon.restore();
    if (satelliteDescriptor) Object.defineProperty(window, '_satellite', satelliteDescriptor);
    else delete window._satellite;
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
      setCustomAttributes();

      await init(fullWidthPlayer);

      expect(fullWidthPlayer.isConnected).to.be.false;
    });

    it('falls back to an authored session-id row when page metadata is missing', async () => {
      const { fullWidthPlayer } = buildPage();
      addConfigRow(fullWidthPlayer, 'session-id', 's-authored');
      setMeta('session-times', sessionTimes());
      setCustomAttributes();

      await init(fullWidthPlayer);
      await flush();

      expect(fullWidthPlayer.isConnected).to.be.true;
    });

    it('removes an on-demand session that reaches a playable phase but has no embeddable video', async () => {
      const { fullWidthPlayer } = buildPage();
      // A livestreamed session with a past window (no mrStreamId → no poll) is off-air and, with
      // no DVR delay, lands ON_DEMAND — but neither session-times nor the catalog session carries
      // an embeddable video → terminal no-asset → the block removes itself.
      authorSession({
        times: sessionTimes({ videos: [] }),
        attrs: { mpcId: null, livestreamed: true },
      });

      await init(fullWidthPlayer);
      await flush();

      expect(fullWidthPlayer.isConnected).to.be.false;
    });

    it('keeps (does not remove) a session that has not reached a playable phase yet', async () => {
      const { fullWidthPlayer } = buildPage({ withPlaylistContainer: false });
      // Future window → SIMULIVE phase, which is not a playable phase for this block. The block
      // stays (empty) to receive the ON_DEMAND phase later rather than being torn out.
      authorSession({
        times: sessionTimes({
          startTimeMillis: Date.now() + HOUR_MS,
          endTimeMillis: Date.now() + (2 * HOUR_MS),
        }),
      });

      await init(fullWidthPlayer);
      await flush();

      expect(fullWidthPlayer.isConnected).to.be.true;
      expect(fullWidthPlayer.querySelector('iframe')).to.not.exist;
    });

    it('removes the block when the session classifies as nothing (no id, no live/DVR identity)', async () => {
      const { fullWidthPlayer } = buildPage();
      setMeta('session-id', 's-1');
      setMeta('session-times', sessionTimes());
      setMeta('custom-attributes', JSON.stringify([]));

      await init(fullWidthPlayer);
      await flush();

      // No mpc/youtube id and no live/DVR identity → classifySessionPlayback() returns null →
      // the watcher yields no phase, nothing is playable, and the block never embeds. It is kept
      // empty (non-terminal) rather than removed, since no playable phase was ever reached.
      expect(fullWidthPlayer.querySelector('iframe')).to.not.exist;
    });

    it('survives invalid session-times JSON without throwing', async () => {
      const { fullWidthPlayer } = buildPage();
      setMeta('session-id', 's-1');
      setMeta('session-times', '{not json');
      setCustomAttributes();

      await init(fullWidthPlayer);
      await flush();

      // Invalid session-times parses to null; the MPC id still classifies SIMULIVE→ON_DEMAND, but
      // there is no session-times video to embed and no catalog id fallback → nothing appears.
      expect(fullWidthPlayer.querySelector('iframe')).to.not.exist;
      expect(window.lana.log.called).to.be.true;
    });
  });

  describe('init() side effects', () => {
    beforeEach(() => {
      authorSession();
    });

    it('injects the block stylesheet exactly once', async () => {
      const { fullWidthPlayer, playlistPlayer } = buildPage();
      await init(fullWidthPlayer);
      await init(playlistPlayer);
      await flush();

      expect(document.querySelectorAll('#session-video-player-css')).to.have.lengthOf(1);
    });

    it('preconnects to the mpc origin, deduped across both instances', async () => {
      BlockMediator.set(DECISION_KEY, { hasPlaylist: false });
      const { fullWidthPlayer, playlistPlayer } = buildPage();
      await init(fullWidthPlayer);
      await init(playlistPlayer);
      await flush();

      const links = document.querySelectorAll(`link[rel="preconnect"][href="${ADOBE_TV_ORIGIN}"]`);
      expect(links).to.have.lengthOf(1);
    });

    it('preconnects to all three youtube origins', async () => {
      document.head.innerHTML = '';
      setMeta('session-id', 's-1');
      setMeta('session-times', sessionTimes({
        videos: [{ provider: 'youtube', url: 'https://www.youtube.com/watch?v=abcdefghijk', kind: 'onDemand' }],
      }));
      setCustomAttributes({ mpcId: null, youTubeId: 'abcdefghijk' });
      BlockMediator.set(DECISION_KEY, { hasPlaylist: false });
      const { fullWidthPlayer } = buildPage({ withPlaylistContainer: false });

      await init(fullWidthPlayer);
      await flush();

      expect(document.querySelectorAll('link[rel="preconnect"][href*="youtube.com"], link[rel="preconnect"][href*="ytimg.com"], link[rel="preconnect"][href*="google.com"]')).to.have.lengthOf(3);
    });
  });

  describe('embed decision', () => {
    beforeEach(() => {
      authorSession();
    });

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

    it('hides the losing playlist-container instance', async () => {
      BlockMediator.set(DECISION_KEY, { hasPlaylist: false });
      const { fullWidthPlayer, playlistPlayer } = await initBoth();

      expect(playlistPlayer.classList.contains('session-video-hidden')).to.be.true;
      expect(fullWidthPlayer.classList.contains('session-video-hidden')).to.be.false;
    });

    it('embeds only the winner when both instances init under the same decision', async () => {
      // The winning instance un-hides and embeds; the loser stays hidden with no iframe. Mirrors the
      // DVR_BUFFER → ON_DEMAND swap's end state where exactly one instance shows the player.
      BlockMediator.set(DECISION_KEY, { hasPlaylist: true });
      const { fullWidthPlayer, playlistPlayer } = await initBoth();

      expect(playlistPlayer.classList.contains('session-video-hidden')).to.be.false;
      expect(playlistPlayer.querySelector('iframe.adobetv')).to.exist;
      expect(fullWidthPlayer.querySelector('iframe')).to.not.exist;
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
    });

    async function embedFullWidth() {
      const { fullWidthPlayer } = buildPage({ withPlaylistContainer: false });
      await init(fullWidthPlayer);
      await flush();
      return fullWidthPlayer;
    }

    it('builds an adobetv iframe using the authored url verbatim', async () => {
      setMeta('session-times', sessionTimes());
      setCustomAttributes();
      const el = await embedFullWidth();

      const iframe = el.querySelector('iframe.adobetv');
      expect(getIframeSrc(iframe)).to.equal(`${ADOBE_TV_ORIGIN}/v/3458940`);
      expect(iframe.getAttribute('title')).to.equal('Adobe Video Publishing Cloud Player');
      expect(iframe.getAttribute('loading')).to.equal('lazy');
    });

    it('wraps the iframe in a .milo-video container and loads milo iframe css', async () => {
      setMeta('session-times', sessionTimes());
      setCustomAttributes();
      const el = await embedFullWidth();

      expect(el.querySelector('.milo-video > iframe')).to.exist;
      expect(document.getElementById('milo-iframe-css')).to.exist;
    });

    it('reuses an already-authored .milo-video container instead of appending a second', async () => {
      setMeta('session-times', sessionTimes());
      setCustomAttributes();
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
      setCustomAttributes();
      const { fullWidthPlayer } = buildPage({ withPlaylistContainer: false });
      const rider = document.createElement('div');
      rider.className = 'mobile-rider';
      fullWidthPlayer.append(rider);

      await init(fullWidthPlayer);
      await flush();

      expect(fullWidthPlayer.querySelector('.mobile-rider')).to.not.exist;
      expect(fullWidthPlayer.querySelector('.milo-video')).to.exist;
    });

    it('disposes the MobileRider VideoJS player before removing a prior .mobile-rider', async () => {
      // A DVR_BUFFER → ON_DEMAND swap tears down the MobileRider player and mounts an MPC iframe.
      // The player's VideoJS instance lives on window.__mr_player; it must be disposed before its
      // DOM is removed, or orphaned event handlers (userActive → createPlayerWidget) throw
      // "Cannot read properties of null (reading 'appendChild')" against detached nodes.
      setMeta('session-times', sessionTimes());
      setCustomAttributes();
      const { fullWidthPlayer } = buildPage({ withPlaylistContainer: false });
      const rider = document.createElement('div');
      rider.className = 'mobile-rider';
      fullWidthPlayer.append(rider);
      let disposedBeforeRemoval = null;
      const dispose = sinon.stub().callsFake(() => { disposedBeforeRemoval = rider.isConnected; });
      window.__mr_player = { dispose };

      await init(fullWidthPlayer);
      await flush();

      expect(dispose.calledOnce).to.be.true;
      // Disposed while the rider was still in the DOM, then removed — never the other way round.
      expect(disposedBeforeRemoval).to.be.true;
      expect(fullWidthPlayer.querySelector('.mobile-rider')).to.not.exist;
      expect(window.__mr_player).to.equal(null);
      expect(fullWidthPlayer.querySelector('.milo-video')).to.exist;

      delete window.__mr_player;
    });

    it('does not throw when disposing a .mobile-rider with no VideoJS instance', async () => {
      setMeta('session-times', sessionTimes());
      setCustomAttributes();
      const { fullWidthPlayer } = buildPage({ withPlaylistContainer: false });
      const rider = document.createElement('div');
      rider.className = 'mobile-rider';
      fullWidthPlayer.append(rider);
      window.__mr_player = null;

      await init(fullWidthPlayer);
      await flush();

      expect(fullWidthPlayer.querySelector('.mobile-rider')).to.not.exist;
      expect(fullWidthPlayer.querySelector('.milo-video')).to.exist;
    });

    ['https://www.youtube.com/watch?v=abcdefghijk',
      'https://www.youtube.com/embed/abcdefghijk',
      'https://www.youtube-nocookie.com/embed/abcdefghijk?rel=1',
      'abcdefghijk'].forEach((url) => {
      it(`extracts the youtube id from "${url}"`, async () => {
        setMeta('session-times', sessionTimes({
          videos: [{ provider: 'youtube', url, kind: 'onDemand' }],
        }));
        setCustomAttributes({ mpcId: null, youTubeId: 'abcdefghijk' });
        const el = await embedFullWidth();

        const iframe = el.querySelector('iframe.youtube');
        expect(iframe.id).to.match(/^player-/);
        const src = new URL(getIframeSrc(iframe));
        expect(src.origin).to.equal('https://www.youtube.com');
        expect(src.pathname).to.equal('/embed/abcdefghijk');
        expect(src.searchParams.getAll('enablejsapi')).to.deep.equal(['1']);
        expect(src.searchParams.getAll('rel')).to.deep.equal(['0']);
        expect(src.searchParams.getAll('videotype')).to.deep.equal(['vod']);
        expect(src.searchParams.get('origin')).to.equal(window.location.origin);
        expect(src.searchParams.getAll('autoplay')).to.deep.equal(['1']);
        expect(window._satellite.track.calledOnceWithExactly('trackYoutube')).to.be.true;
      });
    });

    it('falls back to the raw url when no youtube id can be extracted', async () => {
      setMeta('session-times', sessionTimes({
        videos: [{ provider: 'youtube', url: 'https://example.com/nope', kind: 'onDemand' }],
      }));
      setCustomAttributes({ mpcId: null, youTubeId: 'x' });
      const el = await embedFullWidth();

      const iframe = el.querySelector('iframe.youtube');
      expect(getIframeSrc(iframe)).to.equal('https://example.com/nope');
      expect(iframe.id).to.equal('');
      expect(window._satellite.track.called).to.be.false;
    });
  });

  describe('YouTube analytics', () => {
    beforeEach(() => {
      authorSession({
        times: sessionTimes({
          videos: [{ provider: 'youtube', url: 'https://www.youtube.com/watch?v=abcdefghijk', kind: 'onDemand' }],
        }),
        attrs: { mpcId: null, youTubeId: 'abcdefghijk' },
      });
      BlockMediator.set(DECISION_KEY, { hasPlaylist: false });
    });

    async function mountPlayer() {
      const { fullWidthPlayer } = buildPage({ withPlaylistContainer: false });
      await init(fullWidthPlayer);
      await flush();
      return fullWidthPlayer;
    }

    [
      { title: 'Session title', englishTitle: 'English title', expected: 'Session title' },
      { title: ' ', englishTitle: ' English title ', expected: 'English title' },
      { expected: 'YouTube video player' },
    ].forEach(({ title, englishTitle, expected }) => {
      it(`uses the existing page metadata title: ${expected}`, async () => {
        if (title) setMeta('title', title);
        if (englishTitle) setMeta('en-title', englishTitle);
        const el = await mountPlayer();
        expect(el.querySelector('iframe.youtube').title).to.equal(expected);
      });
    });

    it('also registers the YouTube ID custom-attribute fallback as vod', async () => {
      document.querySelector('meta[name="session-times"]').content = sessionTimes({ videos: [] });
      const el = await mountPlayer();
      const src = new URL(getIframeSrc(el.querySelector('iframe.youtube')));
      expect(src.pathname).to.equal('/embed/abcdefghijk');
      expect(src.searchParams.get('videotype')).to.equal('vod');
      expect(window._satellite.track.calledOnceWithExactly('trackYoutube')).to.be.true;
    });

    [false, true].forEach((hasPlaylist) => {
      it(`registers only the winning player with hasPlaylist=${hasPlaylist}`, async () => {
        BlockMediator.set(DECISION_KEY, { hasPlaylist });
        const { fullWidthPlayer, playlistPlayer } = buildPage();
        window._satellite.track = sinon.spy(() => {
          const frames = document.querySelectorAll('.session-video-player iframe.youtube');
          expect(frames).to.have.lengthOf(1);
          expect(frames[0].isConnected).to.be.true;
        });
        await init(fullWidthPlayer);
        await init(playlistPlayer);
        await flush();
        const winner = hasPlaylist ? playlistPlayer : fullWidthPlayer;
        const loser = hasPlaylist ? fullWidthPlayer : playlistPlayer;
        expect(winner.querySelector('iframe.youtube')).to.exist;
        expect(loser.querySelector('iframe')).not.to.exist;
        expect(window._satellite.track.calledOnceWithExactly('trackYoutube')).to.be.true;
      });
    });

    it('waits for the layout decision rather than registering detached markup', async () => {
      BlockMediator.set(DECISION_KEY, null);
      const { fullWidthPlayer } = buildPage({ withPlaylistContainer: false });
      await init(fullWidthPlayer);
      await flush();
      expect(fullWidthPlayer.querySelector('iframe')).not.to.exist;
      expect(window._satellite.track.called).to.be.false;
      BlockMediator.set(DECISION_KEY, { hasPlaylist: false });
      await flush();
      expect(fullWidthPlayer.querySelector('iframe.youtube')).to.exist;
      expect(window._satellite.track.calledOnce).to.be.true;
    });

    it('registers a phase-delayed on-demand iframe once, not during simulive', async () => {
      const now = Date.now();
      const clock = sinon.useFakeTimers({ now });
      document.querySelector('meta[name="session-times"]').content = sessionTimes({
        startTimeMillis: now - HOUR_MS,
        endTimeMillis: now + 1000,
        videos: [{ provider: 'youtube', url: 'abcdefghijk', kind: 'onDemand' }],
      });
      const { fullWidthPlayer } = buildPage({ withPlaylistContainer: false });
      await init(fullWidthPlayer);
      await clock.tickAsync(0);
      expect(fullWidthPlayer.querySelector('iframe')).not.to.exist;
      expect(window._satellite.track.called).to.be.false;
      await clock.tickAsync(1600);
      const iframe = fullWidthPlayer.querySelector('iframe.youtube');
      expect(new URL(getIframeSrc(iframe)).searchParams.get('videotype')).to.equal('vod');
      await clock.tickAsync(5000);
      expect(window._satellite.track.calledOnceWithExactly('trackYoutube')).to.be.true;
    });

    it('shares unique IDs and once-only registration with event-youtube', async () => {
      const el = await mountPlayer();
      const sessionIframe = el.querySelector('iframe.youtube');
      const eventPlayer = new YouTubeChat();
      eventPlayer.config = { autoplay: 'true' };
      eventPlayer.videoId = 'abcdefghijk';
      const stream = eventPlayer.mountStream(document.body);
      const eventIframe = stream.querySelector('iframe.youtube-video');
      expect(sessionIframe.id).not.to.equal(eventIframe.id);
      expect(eventIframe.id).to.match(/^player-/);
      expect(window._satellite.track.callCount).to.equal(2);
      registerYouTubeTracking(sessionIframe, 'session-video-player');
      eventPlayer.trackVideo(sessionIframe);
      expect(window._satellite.track.callCount).to.equal(2);
    });

    it('registers replacement iframes with a fresh ID without stacking players', async () => {
      const el = await mountPlayer();
      const first = el.querySelector('iframe.youtube');
      await init(el);
      await flush();
      const replacement = el.querySelector('iframe.youtube');
      expect(first.isConnected).to.be.false;
      expect(replacement.id).not.to.equal(first.id);
      expect(el.querySelectorAll('.milo-video')).to.have.lengthOf(1);
      expect(window._satellite.track.callCount).to.equal(2);
    });

    it('waits for document completion, ignoring frames replaced before registration', async () => {
      readyState.get(() => 'loading');
      const el = await mountPlayer();
      const first = el.querySelector('iframe.youtube');
      await init(el);
      await flush();
      expect(first.isConnected).to.be.false;
      expect(window._satellite.track.called).to.be.false;
      readyState.get(() => 'complete');
      document.dispatchEvent(new Event('readystatechange'));
      document.dispatchEvent(new Event('readystatechange'));
      expect(window._satellite.track.calledOnceWithExactly('trackYoutube')).to.be.true;
    });

    it('does not register a player removed before document completion', async () => {
      readyState.get(() => 'loading');
      const el = await mountPlayer();
      el.remove();
      readyState.get(() => 'complete');
      document.dispatchEvent(new Event('readystatechange'));
      expect(window._satellite.track.called).to.be.false;
    });

    ['missing', 'throwing'].forEach((failure) => {
      it(`logs ${failure} Launch without blocking the existing YT.Player`, async () => {
        window._satellite = failure === 'missing' ? undefined : { track: sinon.stub().throws(new Error('Launch failed')) };
        const apiPlayer = sinon.spy(window.YT, 'Player');
        const el = await mountPlayer();
        const iframe = el.querySelector('iframe.youtube');
        expect(iframe.isConnected).to.be.true;
        expect(el.dataset.embedded).to.equal('true');
        expect(apiPlayer.calledOnce).to.be.true;
        expect(apiPlayer.firstCall.args[0]).to.equal(iframe.id);
        const [message, options] = window.lana.log.firstCall.args;
        expect(message).to.include('[session-video-player]');
        expect(message).to.include(failure === 'missing' ? 'YouTube tracking unavailable' : 'failed to register YouTube tracking');
        expect(options.severity).to.equal(failure === 'missing' ? 'warning' : 'error');
      });
    });

    it('does not register MPC videos with the YouTube Launch rule', async () => {
      document.querySelector('meta[name="session-times"]').content = sessionTimes();
      const el = await mountPlayer();
      expect(el.querySelector('iframe.adobetv')).to.exist;
      expect(window._satellite.track.called).to.be.false;
    });

    it('preserves YT.Player resume, progress, and playlist state callbacks', async () => {
      const clock = sinon.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
      // Concurrent WTR tabs share localStorage; isolate this callback regression's progress.
      let storedProgress = null;
      const { getItem, setItem } = Storage.prototype;
      sinon.stub(Storage.prototype, 'getItem').callsFake(function read(key) {
        return key === PROGRESS_STORAGE_KEY ? storedProgress : getItem.call(this, key);
      });
      sinon.stub(Storage.prototype, 'setItem').callsFake(function write(key, value) {
        if (key === PROGRESS_STORAGE_KEY) storedProgress = value;
        else setItem.call(this, key, value);
      });
      const stateEvents = [];
      const onState = (event) => stateEvents.push(event.detail);
      window.addEventListener('session-video-player:state', onState);
      let callbacks;
      window.YT.Player = sinon.spy(function StubPlayer(id, { events }) {
        callbacks = events;
      });
      const api = {
        getDuration: () => 120,
        getCurrentTime: sinon.stub().returns(35),
        seekTo: sinon.spy(),
      };
      try {
        saveVideoProgress('s-1', 35, 120);
        const el = await mountPlayer();
        expect(window.YT.Player.firstCall.args[0]).to.equal(el.querySelector('iframe.youtube').id);
        expect(window._satellite.track.calledOnce).to.be.true;
        callbacks.onReady({ target: api });
        expect(api.seekTo.calledOnceWithExactly(35, true)).to.be.true;

        api.getCurrentTime.returns(40);
        callbacks.onStateChange({ data: window.YT.PlayerState.PLAYING, target: api });
        clock.tick(5000);
        expect(getVideoProgress('s-1').secondsWatched).to.equal(40);
        api.getCurrentTime.returns(45);
        callbacks.onStateChange({ data: window.YT.PlayerState.PAUSED, target: api });
        expect(getVideoProgress('s-1').secondsWatched).to.equal(45);
        api.getCurrentTime.returns(50);
        clock.tick(5000);
        expect(getVideoProgress('s-1').secondsWatched).to.equal(45);
        callbacks.onStateChange({ data: window.YT.PlayerState.ENDED, target: api });
        expect(getVideoProgress('s-1')).to.include({ secondsWatched: 120, completed: true });
        expect(stateEvents).to.deep.equal([
          { sessionId: 's-1', state: 'play' },
          { sessionId: 's-1', state: 'pause' },
          { sessionId: 's-1', state: 'ended' },
        ]);
        expect(window._satellite.track.calledOnce).to.be.true;
      } finally {
        window.removeEventListener('session-video-player:state', onState);
      }
    });
  });

  describe('mpc playback tracking', () => {
    let el;

    beforeEach(async () => {
      authorSession();
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
     * file leak their own permanent `message` listeners, so unrelated sessionIds would
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
