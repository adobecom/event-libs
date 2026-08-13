import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import init, {
  computeDrawerCapPx,
  clampedTitleBottom,
  resolveTopicPlaylist,
  resolveCurrentSessionTopics,
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
    playlistAssignment: [],
    playlistOnSessionPage: [],
    // Ended an hour ago by default — on-demand under deriveSessionState.
    startTimeUtc: new Date(nowMs - 7200000).toISOString(),
    endTimeUtc: new Date(nowMs - 3600000).toISOString(),
    ...overrides,
  };
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
  });

  describe('init', () => {
    let el;

    beforeEach(() => {
      document.body.innerHTML = '';
      document.head.innerHTML = '';
      sessions.value = [];
      delete window.__mr_player;
    });

    afterEach(() => {
      sinon.restore();
      sessions.value = [];
      delete window.__mr_player;
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

      expect(document.body.querySelectorAll('.video-playlist-row')).to.have.lengthOf(4);
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

      expect(document.body.querySelectorAll('.video-playlist-row')).to.have.lengthOf(4);
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
      expect(block.querySelectorAll('.video-playlist-row')).to.have.lengthOf(4);
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

      const firstRow = document.body.querySelector('.video-playlist-row');
      expect(firstRow.dataset.href).to.equal('/sessions/match-1');
    });

    it('swaps an mpc-provider row into the already-mounted player in place, no navigation', async () => {
      const current = session({ id: 'current', playlistOnSessionPage: ['3d'] });
      const mpcVideos = [{ provider: 'mpc', url: 'https://video.tv.adobe.com/v/3458940?autoplay=true&quality=9&end=nothing&learn=on', kind: 'onDemand' }];
      const matches = [1, 2, 3, 4].map((i) => session({
        id: `match-${i}`, playlistAssignment: ['3d'], sessionPageUrl: `/sessions/match-${i}`, videos: i === 1 ? mpcVideos : [],
      }));
      sessions.value = [current, ...matches];

      document.body.innerHTML = `
        <div class="section">
          <div class="milo-video"><a href="/old">old player</a></div>
          ${playlistHtml()}
        </div>
      `;
      el = document.querySelector('.video-playlist');
      await init(el);

      const firstRow = document.body.querySelector('.video-playlist-row');
      expect(firstRow.dataset.videoUrl).to.equal('https://video.tv.adobe.com/v/3458940?autoplay=true&quality=9&end=nothing&learn=on');

      firstRow.click();

      const iframe = document.querySelector('.milo-video iframe');
      expect(iframe).to.exist;
      expect(iframe.src).to.equal('https://video.tv.adobe.com/v/3458940?autoplay=true&quality=9&end=nothing&learn=on');
      expect(firstRow.classList.contains('is-playing')).to.be.true;
    });

    it('falls back to data-href navigation for rows with no mpc entry in videos[], even inside a .section', async () => {
      const current = session({ id: 'current', playlistOnSessionPage: ['3d'] });
      const matches = [1, 2, 3, 4].map((i) => session({
        id: `match-${i}`, playlistAssignment: ['3d'], sessionPageUrl: `/sessions/match-${i}`,
      }));
      sessions.value = [current, ...matches];

      document.body.innerHTML = `
        <div class="section">
          <div class="milo-video"><a href="/old">old player</a></div>
          ${playlistHtml()}
        </div>
      `;
      el = document.querySelector('.video-playlist');
      await init(el);

      const firstRow = document.body.querySelector('.video-playlist-row');
      expect(firstRow.dataset.videoUrl).to.be.undefined;
      expect(document.querySelector('.milo-video iframe')).to.not.exist;
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
  });
});
