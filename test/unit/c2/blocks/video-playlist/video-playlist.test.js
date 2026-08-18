import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import init, {
  computeDrawerCapPx,
  clampedTitleBottom,
  resolveTopicPlaylist,
  resolveCurrentSessionTopics,
  computeProgressPercent,
  getVideoProgress,
  saveVideoProgress,
  resumeMpcVideo,
} from '../../../../../event-libs/v1/c2/blocks/video-playlist/video-playlist.js';
import { sessions } from '../../../../../event-libs/v1/utils/session-store.js';

function session(overrides = {}) {
  const nowMs = Date.now();
  return {
    id: 's-1',
    title: 'A session',
    duration: 30,
    thumbnailUrl: null,
    sessionPageUrl: '/sessions/s-1',
    isKeynote: false,
    mrStreamId: null,
    hasVideoSource: true,
    dvrTimingHours: 0,
    playlistAssignment: [],
    playlistOnSessionPage: [],
    // Ended an hour ago by default — on-demand under deriveSessionState.
    startTimeUtc: new Date(nowMs - 7200000).toISOString(),
    endTimeUtc: new Date(nowMs - 3600000).toISOString(),
    ...overrides,
  };
}

// IPOD-shaped: recorded in-person, no scheduled session-times of its own.
function ipodSession(overrides = {}) {
  return session({ startTimeUtc: '', endTimeUtc: '', ...overrides });
}

describe('video-playlist (C2)', () => {
  it('loads as a module — init is the default export', () => {
    expect(init).to.be.a('function');
  });

  it('exposes the drawer-cap math pinned by the original smoke test', () => {
    expect(computeDrawerCapPx(800, 200, { floor: 75, gap: 16 })).to.equal(584);
    expect(computeDrawerCapPx(800, null, { floor: 75, gap: 16 })).to.equal(560);
  });

  it('clampedTitleBottom leaves a title within the line cap untouched', () => {
    // 1-line title (height 24) is well under a 2-line cap (2 * 24 = 48) —
    // the real bottom wins, not an artificially extended one.
    expect(clampedTitleBottom(100, 24, 24, 2)).to.equal(124);
  });

  it('clampedTitleBottom clamps a title past the line cap, allowing overlap', () => {
    // 3-line title (height 72) exceeds the 2-line cap (48) — clamped to
    // top + 48, so the drawer is allowed to overlap the 3rd line.
    expect(clampedTitleBottom(100, 72, 24, 2)).to.equal(148);
  });

  describe('resolveCurrentSessionTopics', () => {
    it('prefers the page\'s own custom-attributes metadata over the fetched catalog entry', () => {
      const pageAttrs = [{
        name: 'Playlist on session page',
        values: [{ label: '3D', value: '3d' }],
      }];
      const catalogSession = { playlistOnSessionPage: ['video-audio-and-motion'] };

      expect(resolveCurrentSessionTopics(pageAttrs, catalogSession)).to.deep.equal(['3d']);
    });

    it('falls back to the catalog entry\'s playlistOnSessionPage when page metadata is absent', () => {
      const catalogSession = { playlistOnSessionPage: ['3d'] };
      expect(resolveCurrentSessionTopics(null, catalogSession)).to.deep.equal(['3d']);
    });

    it('returns an empty array when neither page metadata nor a catalog entry exists', () => {
      expect(resolveCurrentSessionTopics(null, undefined)).to.deep.equal([]);
    });
  });

  describe('resolveTopicPlaylist', () => {
    it('matches other sessions whose playlistAssignment includes a given topic value', () => {
      const matches = [1, 2, 3, 4].map((i) => session({ id: `match-${i}`, playlistAssignment: ['3d'] }));
      const all = [session({ id: 'current' }), ...matches];

      expect(resolveTopicPlaylist('current', ['3d'], all, 4)).to.deep.equal(matches);
    });

    it('returns nothing when there are no topic values to match against', () => {
      const all = [session({ id: 'current' }), session({ id: 'other', playlistAssignment: ['3d'] })];
      expect(resolveTopicPlaylist('current', [], all, 1)).to.deep.equal([]);
    });

    it('excludes non-on-demand sessions (upcoming or live) even if the topic matches', () => {
      const upcoming = session({
        id: 'upcoming', playlistAssignment: ['3d'],
        startTimeUtc: new Date(Date.now() + 3600000).toISOString(),
        endTimeUtc: new Date(Date.now() + 7200000).toISOString(),
      });
      const onDemand = session({ id: 'on-demand', playlistAssignment: ['3d'] });

      expect(resolveTopicPlaylist('current', ['3d'], [session({ id: 'current' }), upcoming, onDemand], 1))
        .to.deep.equal([onDemand]);
    });

    it('excludes the current session itself from its own playlist', () => {
      const current = session({ id: 'current', playlistAssignment: ['3d'] });
      expect(resolveTopicPlaylist('current', ['3d'], [current], 1)).to.deep.equal([]);
    });

    it('renders nothing when fewer than minSessions on-demand matches exist', () => {
      const matches = [1, 2, 3].map((i) => session({ id: `match-${i}`, playlistAssignment: ['3d'] }));
      expect(resolveTopicPlaylist('current', ['3d'], [session({ id: 'current' }), ...matches], 4)).to.deep.equal([]);
    });

    it('excludes sessions with no video source (no MPC ID or YouTube ID) even if on-demand and the topic matches', () => {
      const noVideo = session({ id: 'no-video', playlistAssignment: ['3d'], hasVideoSource: false });
      const withVideo = session({ id: 'with-video', playlistAssignment: ['3d'], hasVideoSource: true });

      expect(resolveTopicPlaylist('current', ['3d'], [session({ id: 'current' }), noVideo, withVideo], 1))
        .to.deep.equal([withVideo]);
    });

    it('excludes an IPOD session when eventStartMs is unknown, even with a video source and DVR hours', () => {
      const ipod = ipodSession({ id: 'ipod', playlistAssignment: ['3d'], dvrTimingHours: 1 });
      expect(resolveTopicPlaylist('current', ['3d'], [session({ id: 'current' }), ipod], 1, null))
        .to.deep.equal([]);
    });

    it('excludes an IPOD session before its event-start + DVR-hours premiere time', () => {
      const eventStartMs = Date.now() - (2 * 3600000); // event started 2h ago
      const ipod = ipodSession({ id: 'ipod', playlistAssignment: ['3d'], dvrTimingHours: 3 }); // premieres in 1h
      expect(resolveTopicPlaylist('current', ['3d'], [session({ id: 'current' }), ipod], 1, eventStartMs))
        .to.deep.equal([]);
    });

    it('includes an IPOD session once past its event-start + DVR-hours premiere time', () => {
      const eventStartMs = Date.now() - (2 * 3600000); // event started 2h ago
      const ipod = ipodSession({ id: 'ipod', playlistAssignment: ['3d'], dvrTimingHours: 1 }); // premiered 1h ago
      expect(resolveTopicPlaylist('current', ['3d'], [session({ id: 'current' }), ipod], 1, eventStartMs))
        .to.deep.equal([ipod]);
    });

    it('defaults dvrTimingHours to 0 for an IPOD session, premiering right at event start', () => {
      const eventStartMs = Date.now() - 1000; // event started 1s ago
      const ipod = ipodSession({ id: 'ipod', playlistAssignment: ['3d'], dvrTimingHours: 0 });
      expect(resolveTopicPlaylist('current', ['3d'], [session({ id: 'current' }), ipod], 1, eventStartMs))
        .to.deep.equal([ipod]);
    });

    it('still excludes an IPOD session past its premiere time if it has no video source', () => {
      const eventStartMs = Date.now() - (2 * 3600000);
      const ipod = ipodSession({
        id: 'ipod', playlistAssignment: ['3d'], dvrTimingHours: 1, hasVideoSource: false,
      });
      expect(resolveTopicPlaylist('current', ['3d'], [session({ id: 'current' }), ipod], 1, eventStartMs))
        .to.deep.equal([]);
    });
  });

  describe('computeProgressPercent', () => {
    it('returns 0 for no saved progress', () => {
      expect(computeProgressPercent(null)).to.equal(0);
    });

    it('computes a percentage from secondsWatched/length', () => {
      expect(computeProgressPercent({ secondsWatched: 30, length: 60 })).to.equal(50);
    });

    it('returns 100 once marked completed, regardless of secondsWatched', () => {
      expect(computeProgressPercent({ secondsWatched: 5, length: 60, completed: true })).to.equal(100);
    });

    it('clamps to 100 when secondsWatched exceeds length', () => {
      expect(computeProgressPercent({ secondsWatched: 90, length: 60 })).to.equal(100);
    });
  });

  describe('video progress persistence', () => {
    beforeEach(() => localStorage.removeItem('video-playlist:progress'));
    afterEach(() => localStorage.removeItem('video-playlist:progress'));

    it('returns null for a session with no saved progress', () => {
      expect(getVideoProgress('unknown')).to.equal(null);
    });

    it('round-trips secondsWatched/length through localStorage', () => {
      saveVideoProgress('s-1', 30, 60);
      expect(getVideoProgress('s-1')).to.deep.equal({ secondsWatched: 30, length: 60, completed: false });
    });

    it('marks completed once secondsWatched reaches length', () => {
      saveVideoProgress('s-1', 60, 60);
      expect(getVideoProgress('s-1').completed).to.be.true;
    });

    it('keeps a previously-saved length when a later save omits it', () => {
      saveVideoProgress('s-1', 10, 60);
      saveVideoProgress('s-1', 20);
      expect(getVideoProgress('s-1').length).to.equal(60);
    });
  });

  describe('resumeMpcVideo', () => {
    it('posts a resume message when saved progress exists and is not near the end', () => {
      const iframe = { contentWindow: { postMessage: sinon.stub() } };
      resumeMpcVideo(iframe, { secondsWatched: 40, length: 100 });
      expect(iframe.contentWindow.postMessage.calledWith(
        { type: 'mpcAction', action: 'play', currentTime: 40 },
        'https://video.tv.adobe.com',
      )).to.be.true;
    });

    it('does nothing when there is no saved progress', () => {
      const iframe = { contentWindow: { postMessage: sinon.stub() } };
      resumeMpcVideo(iframe, null);
      expect(iframe.contentWindow.postMessage.called).to.be.false;
    });

    it('does nothing when the saved position is within the restart threshold of the end', () => {
      const iframe = { contentWindow: { postMessage: sinon.stub() } };
      resumeMpcVideo(iframe, { secondsWatched: 85, length: 100 });
      expect(iframe.contentWindow.postMessage.called).to.be.false;
    });
  });

  describe('init', () => {
    let el;

    beforeEach(() => {
      document.body.innerHTML = '';
      document.head.innerHTML = '';
      sessions.value = [];
      delete window.__mr_player;
      delete window.YT;
      delete window.onYouTubeIframeAPIReady;
      localStorage.removeItem('video-playlist:play-all');
      localStorage.removeItem('video-playlist:progress');
      localStorage.removeItem('video-playlist:favorites');
    });

    afterEach(() => {
      sinon.restore();
      sessions.value = [];
      delete window.__mr_player;
      delete window.YT;
      delete window.onYouTubeIframeAPIReady;
      localStorage.removeItem('video-playlist:play-all');
      localStorage.removeItem('video-playlist:progress');
      localStorage.removeItem('video-playlist:favorites');
    });

    function playlistHtml(rows = {}) {
      const row = (key, val) => (val === undefined ? '' : `<div><div>${key}</div><div>${val}</div></div>`);
      return `
        <div class="video-playlist">
          ${row('session-id', 'current')}
          ${row('playlist-title', rows.playlistTitle)}
          ${row('minimum-sessions', rows.minimumSessions)}
          ${row('chapters', rows.chapters)}
        </div>
      `;
    }

    it('removes itself when no session-id is available, from metadata or authoring', async () => {
      document.body.innerHTML = '<div class="video-playlist"></div>';
      el = document.querySelector('.video-playlist');
      await init(el);
      expect(document.querySelector('.video-playlist')).to.not.exist;
    });

    it('resolves session-id from page metadata with no block authoring at all', async () => {
      document.head.innerHTML = '<meta name="session-id" content="current">';
      const current = session({ id: 'current', playlistOnSessionPage: ['3d'] });
      const matches = [1, 2, 3, 4].map((i) => session({ id: `match-${i}`, playlistAssignment: ['3d'] }));
      sessions.value = [current, ...matches];

      document.body.innerHTML = '<div class="video-playlist"></div>';
      el = document.querySelector('.video-playlist');
      await init(el);

      // 4 matches + the current session itself (now included, highlighted as "playing").
      expect(document.body.querySelectorAll('.video-playlist-row')).to.have.lengthOf(5);
    });

    it('prefers the page\'s own custom-attributes metadata over the fetched catalog for the topic value', async () => {
      document.head.innerHTML = `
        <meta name="session-id" content="current">
        <meta name="custom-attributes" content='[{"name":"Playlist on session page","values":[{"label":"3D","value":"3d"}]}]'>
      `;
      // The catalog entry for "current" claims a DIFFERENT topic — page metadata should win.
      const current = session({ id: 'current', playlistOnSessionPage: ['video-audio-and-motion'] });
      const matches = [1, 2, 3, 4].map((i) => session({ id: `match-${i}`, playlistAssignment: ['3d'] }));
      sessions.value = [current, ...matches];

      document.body.innerHTML = '<div class="video-playlist"></div>';
      el = document.querySelector('.video-playlist');
      await init(el);

      // 4 matches + the current session itself (now included, highlighted as "playing").
      expect(document.body.querySelectorAll('.video-playlist-row')).to.have.lengthOf(5);
    });

    it('renders the Chapters variant from session-type page metadata, even when the catalog entry says otherwise', async () => {
      document.head.innerHTML = '<meta name="session-id" content="current"><meta name="session-type" content="Keynote">';
      sessions.value = [session({ id: 'current', isKeynote: false })];

      document.body.innerHTML = `
        <div class="video-playlist">
          <div><div>chapters</div><div>${JSON.stringify([{ label: 'Intro', timestampSeconds: 0 }])}</div></div>
        </div>
      `;
      el = document.querySelector('.video-playlist');
      await init(el);

      expect(document.body.querySelector('.video-playlist-title').textContent).to.equal('Chapters');
    });

    it('removes itself when the topic playlist has fewer than the minimum matches', async () => {
      sessions.value = [session({ id: 'current', playlistOnSessionPage: ['3d'] })];
      document.body.innerHTML = playlistHtml();
      el = document.querySelector('.video-playlist');
      await init(el);
      expect(document.body.querySelector('.video-playlist')).to.not.exist;
    });

    it('renders the topic playlist title and rows when enough on-demand matches exist', async () => {
      const current = session({ id: 'current', playlistOnSessionPage: ['3d'] });
      const matches = [1, 2, 3, 4].map((i) => session({ id: `match-${i}`, title: `Match ${i}`, playlistAssignment: ['3d'] }));
      sessions.value = [current, ...matches];

      document.body.innerHTML = playlistHtml({ playlistTitle: 'Related sessions' });
      el = document.querySelector('.video-playlist');
      await init(el);

      const block = document.body.querySelector('.video-playlist');
      expect(block.querySelector('.video-playlist-title').textContent).to.equal('Related sessions');
      // 4 matches + the current session itself (now included, highlighted as "playing").
      expect(block.querySelectorAll('.video-playlist-row')).to.have.lengthOf(5);
    });

    it('includes an IPOD row once past its event-start + DVR-hours premiere time, using the page\'s own local-start-time-millis metadata', async () => {
      const eventStartMs = Date.now() - (2 * 3600000); // event started 2h ago
      const current = session({ id: 'current', playlistOnSessionPage: ['3d'] });
      const matches = [1, 2, 3].map((i) => session({ id: `match-${i}`, playlistAssignment: ['3d'] }));
      const ipod = ipodSession({ id: 'ipod-match', playlistAssignment: ['3d'], dvrTimingHours: 1 }); // premiered 1h ago
      sessions.value = [current, ...matches, ipod];

      document.head.innerHTML = `
        <meta name="session-id" content="current">
        <meta name="local-start-time-millis" content="${eventStartMs}">
      `;
      document.body.innerHTML = '<div class="video-playlist"></div>';
      el = document.querySelector('.video-playlist');
      await init(el);

      // 4 matches + the current session itself (now included, highlighted as "playing").
      expect(document.body.querySelectorAll('.video-playlist-row')).to.have.lengthOf(5);
    });

    it('defaults the playlist title to "More like this" when not authored', async () => {
      const current = session({ id: 'current', playlistOnSessionPage: ['3d'] });
      const matches = [1, 2, 3, 4].map((i) => session({ id: `match-${i}`, playlistAssignment: ['3d'] }));
      sessions.value = [current, ...matches];

      document.body.innerHTML = playlistHtml();
      el = document.querySelector('.video-playlist');
      await init(el);

      expect(document.body.querySelector('.video-playlist-title').textContent).to.equal('More like this');
    });

    it('respects an authored minimum-sessions override', async () => {
      const current = session({ id: 'current', playlistOnSessionPage: ['3d'] });
      const matches = [1, 2].map((i) => session({ id: `match-${i}`, playlistAssignment: ['3d'] }));
      sessions.value = [current, ...matches];

      document.body.innerHTML = playlistHtml({ minimumSessions: '2' });
      el = document.querySelector('.video-playlist');
      await init(el);

      expect(document.body.querySelector('.video-playlist-row')).to.exist;
    });

    it('renders the Chapters variant for a keynote session, ignoring the topic playlist', async () => {
      sessions.value = [session({ id: 'current', isKeynote: true })];

      document.body.innerHTML = playlistHtml({
        chapters: JSON.stringify([{ label: 'Intro', timestampSeconds: 0 }, { label: 'Demo', timestampSeconds: 120 }]),
      });
      el = document.querySelector('.video-playlist');
      await init(el);

      const block = document.body.querySelector('.video-playlist');
      expect(block.querySelector('.video-playlist-title').textContent).to.equal('Chapters');
      expect(block.querySelectorAll('.video-playlist-row')).to.have.lengthOf(2);
    });

    it('removes itself for a keynote session with no chapters authored', async () => {
      sessions.value = [session({ id: 'current', isKeynote: true })];
      document.body.innerHTML = playlistHtml();
      el = document.querySelector('.video-playlist');
      await init(el);
      expect(document.body.querySelector('.video-playlist')).to.not.exist;
    });

    it('seeks the current Mobile Rider player when a chapter row is selected', async () => {
      sessions.value = [session({ id: 'current', isKeynote: true })];
      const player = { currentTime: 0 };
      window.__mr_player = player;

      document.body.innerHTML = playlistHtml({
        chapters: JSON.stringify([{ label: 'Intro', timestampSeconds: 0 }, { label: 'Demo', timestampSeconds: 120 }]),
      });
      el = document.querySelector('.video-playlist');
      await init(el);

      document.body.querySelectorAll('.video-playlist-row')[1].click();
      expect(player.currentTime).to.equal(120);
    });

    it('carries each topic-playlist row\'s own session page as data-href, in resolved order', async () => {
      // window.location.assign itself isn't stubbable in a real browser test env (a
      // non-configurable Location property) — the row exposing the right target URL is
      // the part of this behavior actually worth asserting; the one-line assign() call
      // itself is trusted.
      const current = session({ id: 'current', playlistOnSessionPage: ['3d'] });
      const matches = [1, 2, 3, 4].map((i) => session({
        id: `match-${i}`, playlistAssignment: ['3d'], sessionPageUrl: `/sessions/match-${i}`,
      }));
      sessions.value = [current, ...matches];

      document.body.innerHTML = playlistHtml();
      el = document.querySelector('.video-playlist');
      await init(el);

      // Row 0 is now the current session itself (prepended, highlighted as "playing" —
      // see the next test); the first OTHER/resolved row is row 1.
      const rows = document.body.querySelectorAll('.video-playlist-row');
      expect(rows[1].dataset.href).to.equal('/sessions/match-1');
    });

    it('loads the current session\'s own video from session-times page metadata into an already-mounted player', async () => {
      sessions.value = [session({ id: 'current', playlistOnSessionPage: ['3d'] })];
      document.head.innerHTML = `
        <meta name="session-id" content="current">
        <meta name="session-times" content='[{"videos":[{"provider":"mpc","url":"https://video.tv.adobe.com/v/3458940?autoplay=true&amp;quality=9&amp;end=nothing&amp;learn=on","kind":"onDemand"}]}]'>
      `;

      document.body.innerHTML = `
        <div class="section">
          <div class="milo-video"><a href="/old">old player</a></div>
          <div class="video-playlist"></div>
        </div>
      `;
      el = document.querySelector('.video-playlist');
      await init(el);

      const iframe = document.querySelector('.milo-video iframe.adobetv');
      expect(iframe).to.exist;
      expect(iframe.src).to.equal('https://video.tv.adobe.com/v/3458940?autoplay=true&quality=9&end=nothing&learn=on');
    });

    it('builds a fresh .milo-video, mirroring Milo\'s adobetv autoblock markup, when no player is authored in the section at all', async () => {
      sessions.value = [session({ id: 'current', playlistOnSessionPage: ['3d'] })];
      document.head.innerHTML = `
        <meta name="session-id" content="current">
        <meta name="session-times" content='[{"videos":[{"provider":"mpc","url":"https://video.tv.adobe.com/v/3458940?autoplay=true&amp;quality=9&amp;end=nothing&amp;learn=on","kind":"onDemand"}]}]'>
      `;

      // No .milo-video/.mobile-rider anywhere — the block is the section's only child,
      // a real DOM shape seen on a live page.
      document.body.innerHTML = '<div class="section"><div class="video-playlist"></div></div>';
      el = document.querySelector('.video-playlist');
      await init(el);

      const built = document.querySelector('.section > .milo-video');
      expect(built).to.exist;
      const iframe = built.querySelector('iframe.adobetv');
      expect(iframe.src).to.equal('https://video.tv.adobe.com/v/3458940?autoplay=true&quality=9&end=nothing&learn=on');
      expect(iframe.getAttribute('allowfullscreen')).to.equal('');
    });

    it('removes an existing .mobile-rider and builds a fresh .milo-video for the current session\'s own mpc video', async () => {
      sessions.value = [session({ id: 'current', playlistOnSessionPage: ['3d'] })];
      document.head.innerHTML = `
        <meta name="session-id" content="current">
        <meta name="session-times" content='[{"videos":[{"provider":"mpc","url":"https://video.tv.adobe.com/v/3458940?autoplay=true&amp;quality=9&amp;end=nothing&amp;learn=on","kind":"onDemand"}]}]'>
      `;

      document.body.innerHTML = '<div class="section"><div class="mobile-rider"></div><div class="video-playlist"></div></div>';
      el = document.querySelector('.video-playlist');
      await init(el);

      expect(document.querySelector('.mobile-rider')).to.not.exist;
      expect(document.querySelector('.section > .milo-video iframe.adobetv').src)
        .to.equal('https://video.tv.adobe.com/v/3458940?autoplay=true&quality=9&end=nothing&learn=on');
    });

    it('does not touch the player when session-times metadata has no mpc video', async () => {
      sessions.value = [session({ id: 'current', playlistOnSessionPage: ['3d'] })];
      document.head.innerHTML = '<meta name="session-id" content="current">';

      document.body.innerHTML = `
        <div class="section">
          <div class="milo-video"><a href="/old">old player</a></div>
          <div class="video-playlist"></div>
        </div>
      `;
      el = document.querySelector('.video-playlist');
      await init(el);

      expect(document.querySelector('.milo-video iframe')).to.not.exist;
      expect(document.querySelector('.milo-video a')).to.exist;
    });

    it('loads a youtube-provider video with enablejsapi so completion can be tracked', async () => {
      // window.YT.Player pre-populated so ensureYouTubeIframeApi() short-circuits instead
      // of appending a real youtube.com/iframe_api script tag, which the test harness
      // disallows (external script loads aren't permitted in unit tests).
      window.YT = { Player: sinon.stub().returns({}), PlayerState: { ENDED: 0 } };
      sessions.value = [session({ id: 'current', playlistOnSessionPage: ['3d'] })];
      document.head.innerHTML = `
        <meta name="session-id" content="current">
        <meta name="session-times" content='[{"videos":[{"provider":"youtube","url":"dQw4w9WgXcQ","kind":"onDemand"}]}]'>
      `;
      document.body.innerHTML = '<div class="section"><div class="video-playlist"></div></div>';
      el = document.querySelector('.video-playlist');
      await init(el);

      const iframe = document.querySelector('.milo-video iframe.youtube');
      expect(iframe).to.exist;
      expect(iframe.src).to.equal(`https://www.youtube.com/embed/dQw4w9WgXcQ?enablejsapi=1&origin=${window.location.origin}&autoplay=1`);
      expect(iframe.id).to.equal('video-playlist-yt-dQw4w9WgXcQ');
    });

    it('renders the Play all toggle for the topic-playlist variant, reflecting the stored preference', async () => {
      localStorage.setItem('video-playlist:play-all', 'true');
      const current = session({ id: 'current', playlistOnSessionPage: ['3d'] });
      const matches = [1, 2, 3, 4].map((i) => session({ id: `match-${i}`, playlistAssignment: ['3d'] }));
      sessions.value = [current, ...matches];

      document.body.innerHTML = playlistHtml();
      el = document.querySelector('.video-playlist');
      await init(el);

      const checkbox = document.querySelector('.video-playlist-autoplay-toggle');
      expect(checkbox).to.exist;
      expect(checkbox.checked).to.be.true;
    });

    it('does not render the Play all toggle for the Chapters variant', async () => {
      sessions.value = [session({ id: 'current', isKeynote: true })];
      document.body.innerHTML = playlistHtml({
        chapters: JSON.stringify([{ label: 'Intro', timestampSeconds: 0 }]),
      });
      el = document.querySelector('.video-playlist');
      await init(el);

      expect(document.querySelector('.video-playlist-autoplay-toggle')).to.not.exist;
    });

    it('persists the Play all preference to localStorage when toggled', async () => {
      const current = session({ id: 'current', playlistOnSessionPage: ['3d'] });
      const matches = [1, 2, 3, 4].map((i) => session({ id: `match-${i}`, playlistAssignment: ['3d'] }));
      sessions.value = [current, ...matches];

      document.body.innerHTML = playlistHtml();
      el = document.querySelector('.video-playlist');
      await init(el);

      const checkbox = document.querySelector('.video-playlist-autoplay-toggle');
      checkbox.checked = true;
      checkbox.dispatchEvent(new Event('change'));

      expect(localStorage.getItem('video-playlist:play-all')).to.equal('true');
    });

    it('advances to the first resolved row\'s page when the mpc video completes and Play all is enabled', async () => {
      localStorage.setItem('video-playlist:play-all', 'true');
      const current = session({ id: 'current', playlistOnSessionPage: ['3d'] });
      const matches = [1, 2, 3, 4].map((i) => session({
        id: `match-${i}`, playlistAssignment: ['3d'], sessionPageUrl: `/sessions/match-${i}`,
      }));
      sessions.value = [current, ...matches];

      document.head.innerHTML = `
        <meta name="session-id" content="current">
        <meta name="session-times" content='[{"videos":[{"provider":"mpc","url":"https://video.tv.adobe.com/v/3458940?autoplay=true","kind":"onDemand"}]}]'>
      `;
      document.body.innerHTML = `<div class="section">${playlistHtml()}</div>`;
      el = document.querySelector('.video-playlist');
      await init(el);

      window.dispatchEvent(new MessageEvent('message', {
        origin: 'https://video.tv.adobe.com',
        data: { type: 'mpcStatus', state: 'complete' },
      }));

      expect(el.dataset.autoAdvanceHref).to.equal('/sessions/match-1');
    });

    it('does not advance on mpc completion when Play all is off', async () => {
      const current = session({ id: 'current', playlistOnSessionPage: ['3d'] });
      const matches = [1, 2, 3, 4].map((i) => session({
        id: `match-${i}`, playlistAssignment: ['3d'], sessionPageUrl: `/sessions/match-${i}`,
      }));
      sessions.value = [current, ...matches];

      document.head.innerHTML = `
        <meta name="session-id" content="current">
        <meta name="session-times" content='[{"videos":[{"provider":"mpc","url":"https://video.tv.adobe.com/v/3458940?autoplay=true","kind":"onDemand"}]}]'>
      `;
      document.body.innerHTML = `<div class="section">${playlistHtml()}</div>`;
      el = document.querySelector('.video-playlist');
      await init(el);

      window.dispatchEvent(new MessageEvent('message', {
        origin: 'https://video.tv.adobe.com',
        data: { type: 'mpcStatus', state: 'complete' },
      }));

      expect(el.dataset.autoAdvanceHref).to.be.undefined;
    });

    it('ignores mpc messages from an unexpected origin', async () => {
      localStorage.setItem('video-playlist:play-all', 'true');
      const current = session({ id: 'current', playlistOnSessionPage: ['3d'] });
      const matches = [1, 2, 3, 4].map((i) => session({
        id: `match-${i}`, playlistAssignment: ['3d'], sessionPageUrl: `/sessions/match-${i}`,
      }));
      sessions.value = [current, ...matches];

      document.head.innerHTML = `
        <meta name="session-id" content="current">
        <meta name="session-times" content='[{"videos":[{"provider":"mpc","url":"https://video.tv.adobe.com/v/3458940?autoplay=true","kind":"onDemand"}]}]'>
      `;
      document.body.innerHTML = `<div class="section">${playlistHtml()}</div>`;
      el = document.querySelector('.video-playlist');
      await init(el);

      window.dispatchEvent(new MessageEvent('message', {
        origin: 'https://evil.example',
        data: { type: 'mpcStatus', state: 'complete' },
      }));

      expect(el.dataset.autoAdvanceHref).to.be.undefined;
    });

    it('advances on youtube completion (ENDED state) when Play all is enabled', async () => {
      localStorage.setItem('video-playlist:play-all', 'true');
      const current = session({ id: 'current', playlistOnSessionPage: ['3d'] });
      const matches = [1, 2, 3, 4].map((i) => session({
        id: `match-${i}`, playlistAssignment: ['3d'], sessionPageUrl: `/sessions/match-${i}`,
      }));
      sessions.value = [current, ...matches];

      let onStateChange;
      window.YT = {
        Player: sinon.stub().callsFake((_id, { events }) => { onStateChange = events.onStateChange; return {}; }),
        PlayerState: { ENDED: 0 },
      };

      document.head.innerHTML = `
        <meta name="session-id" content="current">
        <meta name="session-times" content='[{"videos":[{"provider":"youtube","url":"dQw4w9WgXcQ","kind":"onDemand"}]}]'>
      `;
      document.body.innerHTML = `<div class="section">${playlistHtml()}</div>`;
      el = document.querySelector('.video-playlist');
      await init(el);
      // watchYouTubePlayback resolves ensureYouTubeIframeApi() (already-present window.YT)
      // asynchronously — flush the microtask queue before the player is constructed.
      await new Promise((resolve) => { setTimeout(resolve, 0); });

      expect(window.YT.Player.calledOnce).to.be.true;
      onStateChange({ data: window.YT.PlayerState.ENDED });

      expect(el.dataset.autoAdvanceHref).to.equal('/sessions/match-1');
    });

    it('toggles aria-expanded and the is-expanded class when the drawer toggle is clicked', async () => {
      const current = session({ id: 'current', playlistOnSessionPage: ['3d'] });
      const matches = [1, 2, 3, 4].map((i) => session({ id: `match-${i}`, playlistAssignment: ['3d'] }));
      sessions.value = [current, ...matches];

      document.body.innerHTML = playlistHtml();
      el = document.querySelector('.video-playlist');
      await init(el);

      const block = document.body.querySelector('.video-playlist');
      const toggle = block.querySelector('.video-playlist-toggle');
      expect(toggle.getAttribute('aria-expanded')).to.equal('true');

      toggle.click();
      expect(toggle.getAttribute('aria-expanded')).to.equal('false');
      expect(block.classList.contains('is-expanded')).to.be.false;
    });

    it('renders a favorite toggle on topic-playlist rows that does not propagate to the row', async () => {
      const current = session({ id: 'current', playlistOnSessionPage: ['3d'] });
      const matches = [1, 2, 3, 4].map((i) => session({
        id: `match-${i}`, playlistAssignment: ['3d'], sessionPageUrl: `/sessions/match-${i}`,
      }));
      sessions.value = [current, ...matches];

      document.body.innerHTML = playlistHtml();
      el = document.querySelector('.video-playlist');
      await init(el);

      const row = document.body.querySelector('.video-playlist-row');
      const favoriteButton = row.querySelector('.video-playlist-row-favorite');
      expect(favoriteButton).to.exist;
      expect(favoriteButton.getAttribute('aria-pressed')).to.equal('false');

      // The actual favorite/unfavorite now goes through the shared, real RF-backed
      // session-store.js/action-feedback.js mechanism (see buildFavoriteButton) rather
      // than a local synchronous toggle, so it isn't asserted here without mocking auth/
      // network state — just that the click reaches that mechanism without also
      // triggering row selection/navigation.
      const rowClickSpy = sinon.spy();
      row.addEventListener('click', rowClickSpy);
      favoriteButton.click();

      expect(rowClickSpy.called).to.be.false;
    });

    it('does not render a favorite toggle for Chapters rows', async () => {
      sessions.value = [session({ id: 'current', isKeynote: true })];
      document.body.innerHTML = playlistHtml({
        chapters: JSON.stringify([{ label: 'Intro', timestampSeconds: 0 }]),
      });
      el = document.querySelector('.video-playlist');
      await init(el);

      expect(document.querySelector('.video-playlist-row-favorite')).to.not.exist;
    });

    it('renders a play button on topic-playlist rows, stacked with favorite, not on the thumbnail', async () => {
      // sessionPageUrl:'' on all of these (including current) — the play button's click
      // handler calls `activate()` directly (unlike the favorite button, which never
      // navigates), so a real href here would attempt real navigation in this test env.
      const current = session({ id: 'current', playlistOnSessionPage: ['3d'], sessionPageUrl: '' });
      const matches = [1, 2, 3, 4].map((i) => session({
        id: `match-${i}`, playlistAssignment: ['3d'], sessionPageUrl: '',
      }));
      sessions.value = [current, ...matches];

      document.body.innerHTML = playlistHtml();
      el = document.querySelector('.video-playlist');
      await init(el);

      // Row 0 is the current session (prepended, highlighted as "playing"); assert
      // against a resolved/"match" row instead.
      const row = document.body.querySelectorAll('.video-playlist-row')[1];
      const actions = row.querySelector('.video-playlist-row-actions');
      const playButton = row.querySelector('.video-playlist-row-play');
      expect(actions).to.exist;
      expect(playButton).to.exist;
      expect(actions.contains(playButton)).to.be.true;
      expect(actions.contains(row.querySelector('.video-playlist-row-favorite'))).to.be.true;
      // Decorative — duplicates the row's own action rather than being independently
      // reachable/announced by assistive tech.
      expect(playButton.getAttribute('aria-hidden')).to.equal('true');
      expect(playButton.getAttribute('tabindex')).to.equal('-1');
      expect(row.querySelector('.video-playlist-row-thumb-wrap .video-playlist-row-play')).to.not.exist;

      const rowClickSpy = sinon.spy();
      row.addEventListener('click', rowClickSpy);
      playButton.click();

      expect(rowClickSpy.called).to.be.false;
    });

    it('does not render a play button for Chapters rows', async () => {
      sessions.value = [session({ id: 'current', isKeynote: true })];
      document.body.innerHTML = playlistHtml({
        chapters: JSON.stringify([{ label: 'Intro', timestampSeconds: 0 }]),
      });
      el = document.querySelector('.video-playlist');
      await init(el);

      expect(document.querySelector('.video-playlist-row-play')).to.not.exist;
    });

    it('saves progress to localStorage on an mpc tick message, keyed by the current session id', async () => {
      sessions.value = [session({ id: 'current', playlistOnSessionPage: ['3d'] })];
      document.head.innerHTML = `
        <meta name="session-id" content="current">
        <meta name="session-times" content='[{"videos":[{"provider":"mpc","url":"https://video.tv.adobe.com/v/3458940?autoplay=true","kind":"onDemand"}]}]'>
      `;
      document.body.innerHTML = `<div class="section">${playlistHtml()}</div>`;
      el = document.querySelector('.video-playlist');
      await init(el);

      window.dispatchEvent(new MessageEvent('message', {
        origin: 'https://video.tv.adobe.com',
        data: {
          type: 'mpcStatus', state: 'tick', id: '3458940', currentTime: 10, length: 100,
        },
      }));

      expect(getVideoProgress('current')).to.deep.equal({ secondsWatched: 10, length: 100, completed: false });
    });

    it('saves progress immediately on an mpc pause message', async () => {
      sessions.value = [session({ id: 'current', playlistOnSessionPage: ['3d'] })];
      document.head.innerHTML = `
        <meta name="session-id" content="current">
        <meta name="session-times" content='[{"videos":[{"provider":"mpc","url":"https://video.tv.adobe.com/v/3458940?autoplay=true","kind":"onDemand"}]}]'>
      `;
      document.body.innerHTML = `<div class="section">${playlistHtml()}</div>`;
      el = document.querySelector('.video-playlist');
      await init(el);

      window.dispatchEvent(new MessageEvent('message', {
        origin: 'https://video.tv.adobe.com',
        data: {
          type: 'mpcStatus', state: 'pause', id: '3458940', currentTime: 22, length: 100,
        },
      }));

      expect(getVideoProgress('current')).to.deep.equal({ secondsWatched: 22, length: 100, completed: false });
    });

    it('seeks YouTube playback to a saved position via onReady', async () => {
      saveVideoProgress('current', 40, 100);
      let onReady;
      window.YT = {
        Player: sinon.stub().callsFake((_id, { events }) => { onReady = events.onReady; return {}; }),
        PlayerState: { ENDED: 0, PLAYING: 1 },
      };
      sessions.value = [session({ id: 'current', playlistOnSessionPage: ['3d'] })];
      document.head.innerHTML = `
        <meta name="session-id" content="current">
        <meta name="session-times" content='[{"videos":[{"provider":"youtube","url":"dQw4w9WgXcQ","kind":"onDemand"}]}]'>
      `;
      document.body.innerHTML = `<div class="section">${playlistHtml()}</div>`;
      el = document.querySelector('.video-playlist');
      await init(el);
      await new Promise((resolve) => { setTimeout(resolve, 0); });

      const seekTo = sinon.stub();
      onReady({ target: { getDuration: () => 100, seekTo } });

      expect(seekTo.calledWith(40, true)).to.be.true;
    });

    it('does not seek YouTube playback when there is no saved position', async () => {
      let onReady;
      window.YT = {
        Player: sinon.stub().callsFake((_id, { events }) => { onReady = events.onReady; return {}; }),
        PlayerState: { ENDED: 0, PLAYING: 1 },
      };
      sessions.value = [session({ id: 'current', playlistOnSessionPage: ['3d'] })];
      document.head.innerHTML = `
        <meta name="session-id" content="current">
        <meta name="session-times" content='[{"videos":[{"provider":"youtube","url":"dQw4w9WgXcQ","kind":"onDemand"}]}]'>
      `;
      document.body.innerHTML = `<div class="section">${playlistHtml()}</div>`;
      el = document.querySelector('.video-playlist');
      await init(el);
      await new Promise((resolve) => { setTimeout(resolve, 0); });

      const seekTo = sinon.stub();
      onReady({ target: { getDuration: () => 100, seekTo } });

      expect(seekTo.called).to.be.false;
    });

    it('polls and saves YouTube progress every tick interval while playing', async () => {
      let onStateChange;
      window.YT = {
        Player: sinon.stub().callsFake((_id, { events }) => { onStateChange = events.onStateChange; return {}; }),
        PlayerState: { ENDED: 0, PLAYING: 1 },
      };
      sessions.value = [session({ id: 'current', playlistOnSessionPage: ['3d'] })];
      document.head.innerHTML = `
        <meta name="session-id" content="current">
        <meta name="session-times" content='[{"videos":[{"provider":"youtube","url":"dQw4w9WgXcQ","kind":"onDemand"}]}]'>
      `;
      document.body.innerHTML = `<div class="section">${playlistHtml()}</div>`;
      el = document.querySelector('.video-playlist');
      await init(el);
      await new Promise((resolve) => { setTimeout(resolve, 0); });

      const clock = sinon.useFakeTimers();
      try {
        const target = { getCurrentTime: () => 12, getDuration: () => 100 };
        onStateChange({ data: window.YT.PlayerState.PLAYING, target });
        clock.tick(5000);

        expect(getVideoProgress('current')).to.deep.equal({ secondsWatched: 12, length: 100, completed: false });
      } finally {
        clock.restore();
      }
    });

    it('reveals rows beyond the initial cap when Show more is clicked', async () => {
      const current = session({ id: 'current', playlistOnSessionPage: ['3d'] });
      const matches = [1, 2, 3, 4, 5, 6].map((i) => session({ id: `match-${i}`, playlistAssignment: ['3d'] }));
      sessions.value = [current, ...matches];

      document.body.innerHTML = playlistHtml();
      el = document.querySelector('.video-playlist');
      await init(el);

      const list = document.body.querySelector('.video-playlist-list');
      const showMore = document.body.querySelector('.video-playlist-show-more');
      expect(showMore).to.exist;
      expect(list.classList.contains('is-showing-more')).to.be.false;

      showMore.click();

      expect(list.classList.contains('is-showing-more')).to.be.true;
      expect(showMore.textContent).to.equal('Show less');
    });

    it('does not render Show more when rows are at or below the initial cap', async () => {
      const current = session({ id: 'current', playlistOnSessionPage: ['3d'] });
      // 3 matches + the now-included current session = 4, exactly at the cap.
      const matches = [1, 2, 3].map((i) => session({ id: `match-${i}`, playlistAssignment: ['3d'] }));
      sessions.value = [current, ...matches];

      document.body.innerHTML = playlistHtml({ minimumSessions: '3' });
      el = document.querySelector('.video-playlist');
      await init(el);

      expect(document.body.querySelector('.video-playlist-show-more')).to.not.exist;
    });
  });
});
