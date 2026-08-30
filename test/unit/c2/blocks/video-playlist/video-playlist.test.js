import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import init, {
  getVideoProgress,
  computeProgressPercent,
  computeDrawerCapPx,
  clampedTitleBottom,
  resolveTopicPlaylist,
  resolveCurrentSessionTopics,
  resolvePlaylistTitle,
} from '../../../../../event-libs/v1/c2/blocks/video-playlist/video-playlist.js';
import {
  sessions, sessionsStatus, favorited, pendingActions, liveStreamActiveIds,
} from '../../../../../event-libs/v1/utils/session-store.js';

const PROGRESS_STORAGE_KEY = 'video-playlist:progress';
const AUTOPLAY_STORAGE_KEY = 'video-playlist:play-all';
const ADOBE_TV_ORIGIN = 'https://video.tv.adobe.com';
const HOUR_MS = 3_600_000;

function setMeta(name, content) {
  const attr = name.includes('og:') ? 'property' : 'name';
  const meta = document.createElement('meta');
  meta.setAttribute(attr, name);
  meta.setAttribute('content', content);
  document.head.append(meta);
}

function sessionTimesMeta({ endTimeMillis = Date.now() - HOUR_MS, videos } = {}) {
  return JSON.stringify([{
    endTimeMillis,
    videos: videos ?? [{ provider: 'mpc', url: `${ADOBE_TV_ORIGIN}/v/1`, kind: 'onDemand' }],
  }]);
}

/** The `Playlist on session page` custom attribute, in the real page-metadata shape. */
function playlistAttribute(slug = 'social-media', label = 'Social Media and Marketing') {
  return JSON.stringify([{
    name: 'Playlist on session page',
    attributeId: 'c39d240a',
    inputType: 'multi-select',
    values: [{ valueId: '34c6', label, value: slug }],
  }]);
}

/** A normalized catalog session, matching what sessions-api.js produces. */
function catalogSession(overrides = {}) {
  return {
    id: 'other-1',
    rfSessionId: 'rf-other-1',
    title: 'Another Session',
    startTimeUtc: new Date(Date.now() - 2 * HOUR_MS).toISOString(),
    endTimeUtc: new Date(Date.now() - HOUR_MS).toISOString(),
    duration: 45,
    hasVideoSource: true,
    playlistAssignment: ['social-media'],
    sessionPageUrl: '/sessions/another-session',
    thumbnailUrl: 'https://example.com/thumb.png',
    dvrTimingHours: 0,
    ...overrides,
  };
}

function buildPage() {
  const main = document.createElement('main');

  const videoSection = document.createElement('div');
  videoSection.className = 'section video-container';
  const fullWidthPlayer = document.createElement('div');
  fullWidthPlayer.className = 'video-player';
  videoSection.append(fullWidthPlayer);

  const playlistSection = document.createElement('div');
  playlistSection.className = 'section video-playlist-container';
  const heading = document.createElement('h1');
  heading.textContent = 'Current Session Title';
  const playlistPlayer = document.createElement('div');
  playlistPlayer.className = 'video-player';
  const playlist = document.createElement('div');
  playlist.className = 'video-playlist';
  const sibling = document.createElement('div');
  sibling.className = 'event-featured-products';
  playlistSection.append(heading, playlistPlayer, playlist, sibling);

  main.append(videoSection, playlistSection);
  document.body.append(main);
  return {
    videoSection, fullWidthPlayer, playlistSection, playlistPlayer, playlist, sibling,
  };
}

function addConfigRow(el, key, value) {
  const row = document.createElement('div');
  const keyCell = document.createElement('div');
  keyCell.textContent = key;
  const valueCell = document.createElement('div');
  valueCell.textContent = value;
  row.append(keyCell, valueCell);
  el.append(row);
}

const flush = () => new Promise((resolve) => { setTimeout(resolve, 0); });

describe('video-playlist', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.head.innerHTML = '';
    localStorage.clear();
    sessions.value = [];
    sessionsStatus.value = 'idle';
    favorited.value = new Set();
    pendingActions.value = new Set();
    liveStreamActiveIds.value = new Set();
    window.lana = { log: sinon.stub() };
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('computeProgressPercent', () => {
    it('is 0 without saved progress', () => {
      expect(computeProgressPercent(null)).to.equal(0);
    });

    it('is 100 when flagged completed, regardless of the numbers', () => {
      expect(computeProgressPercent({ completed: true, secondsWatched: 1, length: 100 }))
        .to.equal(100);
    });

    it('is 0 when the length is unknown', () => {
      expect(computeProgressPercent({ secondsWatched: 50, length: null })).to.equal(0);
    });

    it('is the watched fraction, clamped to 0-100', () => {
      expect(computeProgressPercent({ secondsWatched: 25, length: 100 })).to.equal(25);
      expect(computeProgressPercent({ secondsWatched: 500, length: 100 })).to.equal(100);
      expect(computeProgressPercent({ secondsWatched: -5, length: 100 })).to.equal(0);
    });
  });

  describe('clampedTitleBottom', () => {
    it('uses the title\'s real bottom when it fits inside the line cap', () => {
      expect(clampedTitleBottom(100, 40, 20, 2)).to.equal(140);
    });

    it('clamps to exactly lineCap lines when the title wraps past it', () => {
      expect(clampedTitleBottom(100, 200, 20, 2)).to.equal(140);
    });
  });

  describe('computeDrawerCapPx', () => {
    it('falls back to 70% of the viewport when the title is unmeasured', () => {
      expect(computeDrawerCapPx(1000, null, { floor: 75 })).to.equal(700);
    });

    it('never returns less than the floor', () => {
      expect(computeDrawerCapPx(100, null, { floor: 300 })).to.equal(300);
    });

    it('avoids covering the title', () => {
      expect(computeDrawerCapPx(1000, 200, { gap: 16 })).to.equal(784);
    });

    it('takes whichever of title/player is more restrictive', () => {
      expect(computeDrawerCapPx(1000, 200, { gap: 0, playerBottom: 400 })).to.equal(600);
    });

    it('respects minExpanded even when both constraints would squeeze smaller', () => {
      expect(computeDrawerCapPx(1000, 980, { gap: 16, minExpanded: 150 })).to.equal(150);
    });
  });

  describe('resolveCurrentSessionTopics', () => {
    it('returns the attribute slugs', () => {
      expect(resolveCurrentSessionTopics(JSON.parse(playlistAttribute())))
        .to.deep.equal(['social-media']);
    });

    it('returns an empty list when the attribute is absent or metadata is null', () => {
      expect(resolveCurrentSessionTopics(null)).to.deep.equal([]);
      expect(resolveCurrentSessionTopics([{ name: 'Track', values: [{ value: 'x' }] }]))
        .to.deep.equal([]);
    });
  });

  describe('resolvePlaylistTitle', () => {
    it('prefers the attribute label over an authored title', () => {
      expect(resolvePlaylistTitle(JSON.parse(playlistAttribute()), 'Authored'))
        .to.equal('Social Media and Marketing');
    });

    it('falls back to the authored title when no label is available', () => {
      expect(resolvePlaylistTitle(null, 'Authored')).to.equal('Authored');
    });

    it('falls back to "More like this" when neither is available', () => {
      expect(resolvePlaylistTitle(null, '')).to.equal('More like this');
    });
  });

  describe('resolveTopicPlaylist', () => {
    const topics = ['social-media'];

    it('returns nothing when the current session has no topics', () => {
      expect(resolveTopicPlaylist('cur', [], [catalogSession()], 1)).to.deep.equal([]);
    });

    it('excludes the current session from its own playlist', () => {
      const rows = resolveTopicPlaylist('other-1', topics, [catalogSession()], 1);
      expect(rows).to.deep.equal([]);
    });

    it('excludes sessions with no video source', () => {
      const rows = resolveTopicPlaylist('cur', topics, [catalogSession({ hasVideoSource: false })], 1);
      expect(rows).to.deep.equal([]);
    });

    it('excludes sessions whose playlistAssignment does not intersect', () => {
      const rows = resolveTopicPlaylist('cur', topics, [catalogSession({ playlistAssignment: ['other-topic'] })], 1);
      expect(rows).to.deep.equal([]);
    });

    it('returns nothing when fewer than minSessions qualify', () => {
      expect(resolveTopicPlaylist('cur', topics, [catalogSession()], 4)).to.deep.equal([]);
    });

    it('returns qualifying rows once the minimum is met', () => {
      const list = [
        catalogSession({ id: 'a' }),
        catalogSession({ id: 'b' }),
      ];
      expect(resolveTopicPlaylist('cur', topics, list, 2).map((s) => s.id))
        .to.deep.equal(['a', 'b']);
    });

    it('sorts ascending by start time', () => {
      const older = catalogSession({ id: 'older', startTimeUtc: new Date(Date.now() - 5 * HOUR_MS).toISOString() });
      const newer = catalogSession({ id: 'newer', startTimeUtc: new Date(Date.now() - 2 * HOUR_MS).toISOString() });
      expect(resolveTopicPlaylist('cur', topics, [newer, older], 2).map((s) => s.id))
        .to.deep.equal(['older', 'newer']);
    });

    it('sorts sessions with no start time (IPOD) after scheduled ones', () => {
      const scheduled = catalogSession({ id: 'scheduled' });
      const ipod = catalogSession({ id: 'ipod', startTimeUtc: '', endTimeUtc: '' });
      expect(resolveTopicPlaylist('cur', topics, [ipod, scheduled], 2).map((s) => s.id))
        .to.deep.equal(['scheduled', 'ipod']);
    });

    it('includes an IPOD session with no DVR delay', () => {
      const ipod = catalogSession({ id: 'ipod', startTimeUtc: '', endTimeUtc: '', dvrTimingHours: 0 });
      expect(resolveTopicPlaylist('cur', topics, [ipod], 1).map((s) => s.id))
        .to.deep.equal(['ipod']);
    });

    it('excludes an IPOD session whose DVR delay has not elapsed', () => {
      const ipod = catalogSession({ id: 'ipod', startTimeUtc: '', endTimeUtc: '', dvrTimingHours: 5 });
      const eventStartMs = Date.now() - HOUR_MS;
      expect(resolveTopicPlaylist('cur', topics, [ipod], 1, eventStartMs)).to.deep.equal([]);
    });

    it('includes an IPOD session once its DVR delay has elapsed', () => {
      const ipod = catalogSession({ id: 'ipod', startTimeUtc: '', endTimeUtc: '', dvrTimingHours: 1 });
      const eventStartMs = Date.now() - 5 * HOUR_MS;
      expect(resolveTopicPlaylist('cur', topics, [ipod], 1, eventStartMs).map((s) => s.id))
        .to.deep.equal(['ipod']);
    });

    it('excludes a scheduled session that has not ended yet', () => {
      const upcoming = catalogSession({
        id: 'upcoming',
        startTimeUtc: new Date(Date.now() + HOUR_MS).toISOString(),
        endTimeUtc: new Date(Date.now() + 2 * HOUR_MS).toISOString(),
      });
      expect(resolveTopicPlaylist('cur', topics, [upcoming], 1)).to.deep.equal([]);
    });
  });

  describe('init() render gates', () => {
    it('removes the block when no session-id is available', async () => {
      const { playlist } = buildPage();
      setMeta('session-times', sessionTimesMeta());

      await init(playlist);

      expect(playlist.isConnected).to.be.false;
    });

    it('removes the block when the page has no onDemand video', async () => {
      const { playlist } = buildPage();
      setMeta('session-id', 'cur');
      setMeta('session-times', sessionTimesMeta({
        videos: [{ provider: 'mpc', url: `${ADOBE_TV_ORIGIN}/v/1`, kind: 'liveStream' }],
      }));

      await init(playlist);

      expect(playlist.isConnected).to.be.false;
    });

    it('removes the block when the session has not ended', async () => {
      const { playlist } = buildPage();
      setMeta('session-id', 'cur');
      setMeta('session-times', sessionTimesMeta({ endTimeMillis: Date.now() + HOUR_MS }));

      await init(playlist);

      expect(playlist.isConnected).to.be.false;
    });

    it('removes the block when the catalog is already ready but empty', async () => {
      const { playlist } = buildPage();
      setMeta('session-id', 'cur');
      setMeta('session-times', sessionTimesMeta());
      sessionsStatus.value = 'ready';

      await init(playlist);

      expect(playlist.isConnected).to.be.false;
    });

    it('removes the block when the catalog fetch has already errored', async () => {
      const { playlist } = buildPage();
      setMeta('session-id', 'cur');
      setMeta('session-times', sessionTimesMeta());
      sessionsStatus.value = 'error';

      await init(playlist);

      expect(playlist.isConnected).to.be.false;
    });

    it('removes the block when the catalog errors AFTER init subscribed', async () => {
      const { playlist } = buildPage();
      setMeta('session-id', 'cur');
      setMeta('session-times', sessionTimesMeta());
      sessionsStatus.value = 'loading';

      await init(playlist);
      expect(playlist.isConnected).to.be.true;

      sessionsStatus.value = 'error';
      await flush();

      expect(playlist.isConnected).to.be.false;
    });

    it('removes the block when no topic attribute is authored', async () => {
      const { playlist } = buildPage();
      setMeta('session-id', 'cur');
      setMeta('session-times', sessionTimesMeta());
      sessions.value = [catalogSession()];

      await init(playlist);
      await flush();

      expect(playlist.isConnected).to.be.false;
    });

    it('removes the block when too few sessions qualify', async () => {
      const { playlist } = buildPage();
      setMeta('session-id', 'cur');
      setMeta('session-times', sessionTimesMeta());
      setMeta('custom-attributes', playlistAttribute());
      sessions.value = [catalogSession()];

      await init(playlist);
      await flush();

      expect(playlist.isConnected).to.be.false;
    });

    it('dispatches video-playlist:removed when it removes itself', async () => {
      const { playlist } = buildPage();
      setMeta('session-times', sessionTimesMeta());
      const onRemoved = sinon.stub();
      window.addEventListener('video-playlist:removed', onRemoved);

      await init(playlist);
      window.removeEventListener('video-playlist:removed', onRemoved);

      expect(onRemoved.called).to.be.true;
    });
  });

  describe('layout decision side effects', () => {
    beforeEach(() => {
      setMeta('session-id', 'cur');
      setMeta('session-times', sessionTimesMeta());
    });

    it('collapses the losing video-container when a playlist renders', async () => {
      setMeta('custom-attributes', playlistAttribute());
      const { playlist, videoSection } = buildPage();
      sessions.value = [catalogSession({ id: 'a' }), catalogSession({ id: 'b' })];
      addConfigRow(playlist, 'minimum-sessions', '2');

      await init(playlist);
      await flush();

      expect(videoSection.classList.contains('is-collapsing')).to.be.true;
    });

    it('collapses only the video blocks, never the shared container or its siblings', async () => {
      const { playlist, playlistSection, playlistPlayer, sibling } = buildPage();
      // Terminal-but-empty catalog: nothing to show, so this block removes itself and
      // announces hasPlaylist:false — the branch that targets the playlist container.
      sessionsStatus.value = 'ready';

      await init(playlist);
      await flush();

      expect(playlistPlayer.classList.contains('is-collapsing')).to.be.true;
      expect(playlistSection.classList.contains('is-collapsing')).to.be.false;
      expect(sibling.classList.contains('is-collapsing')).to.be.false;
      expect(sibling.isConnected).to.be.true;
    });

    it('leaves an already-embedded player alone rather than tearing it out', async () => {
      setMeta('custom-attributes', playlistAttribute());
      const { playlist, videoSection, fullWidthPlayer } = buildPage();
      fullWidthPlayer.dataset.embedded = 'true';
      sessions.value = [catalogSession({ id: 'a' }), catalogSession({ id: 'b' })];
      addConfigRow(playlist, 'minimum-sessions', '2');

      await init(playlist);
      await flush();

      expect(videoSection.classList.contains('is-collapsing')).to.be.false;
      expect(videoSection.isConnected).to.be.true;
    });
  });

  describe('rendering', () => {
    let playlist;

    beforeEach(async () => {
      setMeta('session-id', 'cur');
      setMeta('session-times', sessionTimesMeta());
      setMeta('custom-attributes', playlistAttribute());
      ({ playlist } = buildPage());
      addConfigRow(playlist, 'minimum-sessions', '2');
      sessions.value = [
        catalogSession({ id: 'a', title: 'Session A' }),
        catalogSession({ id: 'b', title: 'Session B' }),
      ];
      await init(playlist);
      await flush();
    });

    it('renders one row per qualifying session plus the current one', () => {
      expect(playlist.querySelectorAll('.video-playlist-row')).to.have.lengthOf(3);
    });

    it('uses the attribute label as the playlist title', () => {
      expect(playlist.querySelector('.video-playlist-title').textContent)
        .to.equal('Social Media and Marketing');
    });

    it('shows the next session in the collapsed "Up next" peek', () => {
      expect(playlist.querySelector('.video-playlist-up-next-label').textContent)
        .to.equal('Up next');
      expect(playlist.querySelector('.video-playlist-up-next-title').textContent)
        .to.not.equal('');
    });

    it('marks the current session\'s row as now playing', () => {
      const playing = playlist.querySelector('.video-playlist-row.is-playing');
      expect(playing.dataset.itemId).to.equal('cur');
      expect(playing.getAttribute('aria-current')).to.equal('true');
    });

    it('links each row to its own session page', () => {
      const row = [...playlist.querySelectorAll('.video-playlist-row')]
        .find((r) => r.dataset.itemId === 'a');
      expect(row.querySelector('a.video-playlist-row-content').getAttribute('href'))
        .to.equal('/sessions/another-session');
    });

    it('gives the favorite button an accessible name per the Figma spec', () => {
      const row = [...playlist.querySelectorAll('.video-playlist-row')]
        .find((r) => r.dataset.itemId === 'a');
      expect(row.querySelector('.video-playlist-row-favorite').getAttribute('aria-label'))
        .to.equal('Favorite Session A');
    });

    it('gives the play button its own accessible name', () => {
      const row = [...playlist.querySelectorAll('.video-playlist-row')]
        .find((r) => r.dataset.itemId === 'a');
      expect(row.querySelector('.video-playlist-row-play').getAttribute('aria-label'))
        .to.equal('Play Session A');
    });

    it('reflects a favorited session in the button state', () => {
      favorited.value = new Set(['a']);
      const row = [...playlist.querySelectorAll('.video-playlist-row')]
        .find((r) => r.dataset.itemId === 'a');
      const button = row.querySelector('.video-playlist-row-favorite');

      expect(button.getAttribute('aria-pressed')).to.equal('true');
      expect(button.getAttribute('aria-label')).to.equal('Unfavorite Session A');
    });

    it('renders the row progress bar from saved progress', async () => {
      localStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify({
        a: { secondsWatched: 50, length: 100, completed: false },
      }));
      const { playlist: fresh } = buildPage();
      addConfigRow(fresh, 'minimum-sessions', '2');
      await init(fresh);
      await flush();

      const row = [...fresh.querySelectorAll('.video-playlist-row')]
        .find((r) => r.dataset.itemId === 'a');
      expect(row.querySelector('.video-playlist-row-progress-fill').style.width).to.equal('50%');
    });

    it('exposes the saved progress through getVideoProgress', () => {
      localStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify({
        a: { secondsWatched: 10, length: 100, completed: false },
      }));
      expect(getVideoProgress('a')).to.include({ secondsWatched: 10 });
    });

    it('starts expanded on desktop widths', () => {
      // The suite runs in a desktop-width headless viewport.
      expect(playlist.classList.contains('is-expanded')).to.equal(window.innerWidth >= 1024);
    });

    it('toggles expansion via the chevron', () => {
      const toggle = playlist.querySelector('.video-playlist-toggle');
      const before = playlist.classList.contains('is-expanded');

      toggle.click();

      expect(playlist.classList.contains('is-expanded')).to.equal(!before);
      expect(toggle.getAttribute('aria-expanded')).to.equal(String(!before));
    });
  });

  describe('show more', () => {
    async function renderWithRows(count) {
      setMeta('session-id', 'cur');
      setMeta('session-times', sessionTimesMeta());
      setMeta('custom-attributes', playlistAttribute());
      const { playlist } = buildPage();
      addConfigRow(playlist, 'minimum-sessions', '1');
      addConfigRow(playlist, 'maximum-sessions', '10');
      sessions.value = Array.from({ length: count }, (unused, i) => catalogSession({
        id: `s${i}`,
        title: `Session ${i}`,
        startTimeUtc: new Date(Date.now() - (count - i) * HOUR_MS).toISOString(),
      }));
      await init(playlist);
      await flush();
      return playlist;
    }

    it('is absent with four rows or fewer', async () => {
      const playlist = await renderWithRows(3);
      expect(playlist.querySelector('.video-playlist-show-more')).to.not.exist;
    });

    it('appears once there are more than four rows', async () => {
      const playlist = await renderWithRows(6);
      expect(playlist.querySelector('.video-playlist-show-more')).to.exist;
    });

    it('toggles label, aria-expanded and aria-label on click', async () => {
      const playlist = await renderWithRows(6);
      const button = playlist.querySelector('.video-playlist-show-more');

      button.click();

      expect(button.getAttribute('aria-expanded')).to.equal('true');
      expect(button.getAttribute('aria-label')).to.equal('Show less sessions');
      expect(button.querySelector('span').textContent).to.equal('Show less');
      expect(playlist.querySelector('.video-playlist-list').classList.contains('is-showing-more'))
        .to.be.true;
    });

    it('caps total rows at the authored maximum-sessions', async () => {
      setMeta('session-id', 'cur');
      setMeta('session-times', sessionTimesMeta());
      setMeta('custom-attributes', playlistAttribute());
      const { playlist } = buildPage();
      addConfigRow(playlist, 'minimum-sessions', '1');
      addConfigRow(playlist, 'maximum-sessions', '3');
      sessions.value = Array.from({ length: 8 }, (unused, i) => catalogSession({ id: `s${i}` }));

      await init(playlist);
      await flush();

      expect(playlist.querySelectorAll('.video-playlist-row')).to.have.lengthOf(3);
    });
  });

  describe('play all', () => {
    let playlist;

    beforeEach(async () => {
      setMeta('session-id', 'cur');
      setMeta('session-times', sessionTimesMeta());
      setMeta('custom-attributes', playlistAttribute());
      ({ playlist } = buildPage());
      addConfigRow(playlist, 'minimum-sessions', '2');
      sessions.value = [catalogSession({ id: 'a' }), catalogSession({ id: 'b' })];
      await init(playlist);
      await flush();
    });

    it('persists the toggle to localStorage', () => {
      const checkbox = playlist.querySelector('.video-playlist-autoplay-toggle');

      checkbox.checked = true;
      checkbox.dispatchEvent(new Event('change'));

      expect(localStorage.getItem(AUTOPLAY_STORAGE_KEY)).to.equal('true');
    });

    it('reflects a previously stored preference on render', async () => {
      localStorage.setItem(AUTOPLAY_STORAGE_KEY, 'true');
      const { playlist: fresh } = buildPage();
      addConfigRow(fresh, 'minimum-sessions', '2');
      await init(fresh);
      await flush();

      expect(fresh.querySelector('.video-playlist-autoplay-toggle').checked).to.be.true;
    });

    // window.location.assign is non-configurable and cannot be stubbed in a real browser,
    // which is exactly why the source records its resolved target on the element first —
    // that dataset attribute is the assertable part of this behavior. The rows here point
    // at the CURRENT url so the real assign() call is a same-document no-op rather than
    // navigating the test runner away mid-suite.
    it('records the next href when the current session ends and autoplay is on', async () => {
      const selfUrl = window.location.pathname + window.location.search;
      const { playlist: selfLinked } = buildPage();
      addConfigRow(selfLinked, 'minimum-sessions', '2');
      sessions.value = [
        catalogSession({ id: 'a', sessionPageUrl: selfUrl }),
        catalogSession({ id: 'b', sessionPageUrl: selfUrl }),
      ];
      await init(selfLinked);
      await flush();

      localStorage.setItem(AUTOPLAY_STORAGE_KEY, 'true');
      window.dispatchEvent(new CustomEvent('video-player:state', {
        detail: { sessionId: 'cur', state: 'ended' },
      }));

      expect(selfLinked.dataset.autoAdvanceHref).to.equal(selfUrl);
    });

    it('does not advance when autoplay is off', () => {
      localStorage.setItem(AUTOPLAY_STORAGE_KEY, 'false');

      window.dispatchEvent(new CustomEvent('video-player:state', {
        detail: { sessionId: 'cur', state: 'ended' },
      }));

      expect(playlist.dataset.autoAdvanceHref).to.equal(undefined);
    });

    it('ignores ended events for a different session', () => {
      localStorage.setItem(AUTOPLAY_STORAGE_KEY, 'true');

      window.dispatchEvent(new CustomEvent('video-player:state', {
        detail: { sessionId: 'someone-else', state: 'ended' },
      }));

      expect(playlist.dataset.autoAdvanceHref).to.equal(undefined);
    });

    it('ignores non-ended states', () => {
      localStorage.setItem(AUTOPLAY_STORAGE_KEY, 'true');

      window.dispatchEvent(new CustomEvent('video-player:state', {
        detail: { sessionId: 'cur', state: 'pause' },
      }));

      expect(playlist.dataset.autoAdvanceHref).to.equal(undefined);
    });
  });

  describe('live progress updates', () => {
    it('updates a row\'s progress bar on a video-player:progress event', async () => {
      setMeta('session-id', 'cur');
      setMeta('session-times', sessionTimesMeta());
      setMeta('custom-attributes', playlistAttribute());
      const { playlist } = buildPage();
      addConfigRow(playlist, 'minimum-sessions', '2');
      sessions.value = [catalogSession({ id: 'a' }), catalogSession({ id: 'b' })];
      await init(playlist);
      await flush();

      localStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify({
        a: { secondsWatched: 75, length: 100, completed: false },
      }));
      window.dispatchEvent(new CustomEvent('video-player:progress', {
        detail: { sessionId: 'a' },
      }));

      const row = [...playlist.querySelectorAll('.video-playlist-row')]
        .find((r) => r.dataset.itemId === 'a');
      expect(row.querySelector('.video-playlist-row-progress-fill').style.width).to.equal('75%');
    });
  });
});
