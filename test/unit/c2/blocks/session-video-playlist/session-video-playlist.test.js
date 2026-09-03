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
  applyExpandedHeightCap,
  _internals,
} from '../../../../../event-libs/v1/c2/blocks/session-video-playlist/session-video-playlist.js';
import {
  sessions, sessionsStatus, favorited, pendingActions, liveStreamActiveIds,
} from '../../../../../event-libs/v1/utils/session-store.js';

const PROGRESS_STORAGE_KEY = 'session-video-playlist:progress';
const AUTOPLAY_STORAGE_KEY = 'session-video-playlist:play-all';
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
    // Any one provider id is enough to count as having a video (see hasVideoSource).
    mpcId: '3458940',
    youTubeId: '',
    mrDvrVideoId: '',
    videoDuration: '',
    playlistAssignment: ['social-media'],
    sessionPageUrl: '/sessions/another-session',
    thumbnailUrl: 'https://example.com/thumb.png',
    // null means "no delay authored"; a real 0 means "from the event's start".
    dvrDelayHours: null,
    ...overrides,
  };
}

function buildPage() {
  const main = document.createElement('main');

  const videoSection = document.createElement('div');
  videoSection.className = 'section session-video-container';
  const fullWidthPlayer = document.createElement('div');
  fullWidthPlayer.className = 'session-video-player';
  videoSection.append(fullWidthPlayer);

  const playlistSection = document.createElement('div');
  playlistSection.className = 'section session-video-playlist-container';
  const heading = document.createElement('h1');
  heading.textContent = 'Current Session Title';
  const playlistPlayer = document.createElement('div');
  playlistPlayer.className = 'session-video-player';
  const playlist = document.createElement('div');
  playlist.className = 'session-video-playlist';
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

describe('session-video-playlist', () => {
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
      const rows = resolveTopicPlaylist('cur', topics, [catalogSession({ mpcId: '', youTubeId: '', mrDvrVideoId: '' })], 1);
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
      const ipod = catalogSession({ id: 'ipod', startTimeUtc: '', endTimeUtc: '', dvrDelayHours: 1 });
      const eventStartMs = Date.now() - 5 * HOUR_MS;
      expect(resolveTopicPlaylist('cur', topics, [ipod, scheduled], 2, eventStartMs).map((s) => s.id))
        .to.deep.equal(['scheduled', 'ipod']);
    });

    it('excludes an IPOD session with no authored DVR delay', () => {
      const ipod = catalogSession({ id: 'ipod', startTimeUtc: '', endTimeUtc: '', dvrDelayHours: null });
      const eventStartMs = Date.now() - HOUR_MS;
      expect(resolveTopicPlaylist('cur', topics, [ipod], 1, eventStartMs)).to.deep.equal([]);
    });

    // A real 0 is not the same as "unset": it means available from the event's start, so
    // it still has to be measured against eventStartMs rather than passing unconditionally.
    it('includes an IPOD session with a 0h DVR delay once the event has started', () => {
      const ipod = catalogSession({ id: 'ipod', startTimeUtc: '', endTimeUtc: '', dvrDelayHours: 0 });
      const eventStartMs = Date.now() - HOUR_MS;
      expect(resolveTopicPlaylist('cur', topics, [ipod], 1, eventStartMs).map((s) => s.id))
        .to.deep.equal(['ipod']);
    });

    it('excludes an IPOD session with a 0h DVR delay before the event starts', () => {
      const ipod = catalogSession({ id: 'ipod', startTimeUtc: '', endTimeUtc: '', dvrDelayHours: 0 });
      const eventStartMs = Date.now() + HOUR_MS;
      expect(resolveTopicPlaylist('cur', topics, [ipod], 1, eventStartMs)).to.deep.equal([]);
    });

    it('excludes an IPOD session whose DVR delay has not elapsed', () => {
      const ipod = catalogSession({ id: 'ipod', startTimeUtc: '', endTimeUtc: '', dvrDelayHours: 5 });
      const eventStartMs = Date.now() - HOUR_MS;
      expect(resolveTopicPlaylist('cur', topics, [ipod], 1, eventStartMs)).to.deep.equal([]);
    });

    it('includes an IPOD session once its DVR delay has elapsed', () => {
      const ipod = catalogSession({ id: 'ipod', startTimeUtc: '', endTimeUtc: '', dvrDelayHours: 1 });
      const eventStartMs = Date.now() - 5 * HOUR_MS;
      expect(resolveTopicPlaylist('cur', topics, [ipod], 1, eventStartMs).map((s) => s.id))
        .to.deep.equal(['ipod']);
    });

    it('excludes an IPOD session when no event start time is known at all', () => {
      const ipod = catalogSession({ id: 'ipod', startTimeUtc: '', endTimeUtc: '', dvrDelayHours: 5 });
      expect(resolveTopicPlaylist('cur', topics, [ipod], 1, null)).to.deep.equal([]);
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

  /**
   * MUST run before any other init()-driven suite: initTierOneEventConfig() latches on
   * its first successful read and exposes no reset, so whichever test configures it first
   * fixes the event start time for the rest of this file.
   */
  describe('event start time (Tier 1 Event Configurator)', () => {
    it('premieres IPOD rows against the authored eventStartDateTime, not page metadata', async () => {
      // Event started 10h ago per the configurator, so a 5h DVR delay has elapsed.
      setMeta('tier-1-event-config', JSON.stringify({
        eventStartDateTime: Date.now() - 10 * HOUR_MS,
      }));
      // Deliberately contradicts it: if this page-level value were still being used, the
      // 5h delay would NOT have elapsed and the row would be excluded.
      setMeta('local-start-time-millis', String(Date.now() - HOUR_MS));
      setMeta('session-id', 'cur');
      setMeta('session-times', sessionTimesMeta());
      setMeta('custom-attributes', playlistAttribute());

      const { playlist } = buildPage();
      addConfigRow(playlist, 'minimum-sessions', '2');
      sessions.value = [
        catalogSession({
          id: 'ipod-a', startTimeUtc: '', endTimeUtc: '', dvrDelayHours: 5,
        }),
        catalogSession({
          id: 'ipod-b', startTimeUtc: '', endTimeUtc: '', dvrDelayHours: 5,
        }),
      ];

      await init(playlist);
      await flush();

      const renderedIds = [...playlist.querySelectorAll('.session-video-playlist-row')]
        .map((row) => row.dataset.itemId);
      expect(renderedIds).to.include('ipod-a');
      expect(renderedIds).to.include('ipod-b');
    });
  });

  describe('init() render gates', () => {
    it('removes the block when no session-id is available', async () => {
      const { playlist } = buildPage();
      setMeta('session-times', sessionTimesMeta());

      await init(playlist);

      expect(playlist.isConnected).to.be.false;
    });

    it('removes the block when no video has an embeddable provider', async () => {
      const { playlist } = buildPage();
      setMeta('session-id', 'cur');
      setMeta('session-times', sessionTimesMeta({
        videos: [{ provider: 'vimeo', url: 'https://vimeo.com/1', kind: 'onDemand' }],
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

    it('dispatches session-video-playlist:removed when it removes itself', async () => {
      const { playlist } = buildPage();
      setMeta('session-times', sessionTimesMeta());
      const onRemoved = sinon.stub();
      window.addEventListener('session-video-playlist:removed', onRemoved);

      await init(playlist);
      window.removeEventListener('session-video-playlist:removed', onRemoved);

      expect(onRemoved.called).to.be.true;
    });
  });

  describe('layout decision side effects', () => {
    beforeEach(() => {
      setMeta('session-id', 'cur');
      setMeta('session-times', sessionTimesMeta());
    });

    it('collapses the losing session-video-container when a playlist renders', async () => {
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
      expect(playlist.querySelectorAll('.session-video-playlist-row')).to.have.lengthOf(3);
    });

    it('uses the attribute label as the playlist title', () => {
      expect(playlist.querySelector('.session-video-playlist-title').textContent)
        .to.equal('Social Media and Marketing');
    });

    it('shows the next session in the collapsed "Up next" peek', () => {
      expect(playlist.querySelector('.session-video-playlist-up-next-label').textContent)
        .to.equal('Up next');
      expect(playlist.querySelector('.session-video-playlist-up-next-title').textContent)
        .to.not.equal('');
    });

    it('marks the current session\'s row as now playing', () => {
      const playing = playlist.querySelector('.session-video-playlist-row.is-playing');
      expect(playing.dataset.itemId).to.equal('cur');
      expect(playing.getAttribute('aria-current')).to.equal('true');
    });

    it('links each row to its own session page', () => {
      const row = [...playlist.querySelectorAll('.session-video-playlist-row')]
        .find((r) => r.dataset.itemId === 'a');
      expect(row.querySelector('a.session-video-playlist-row-content').getAttribute('href'))
        .to.equal('/sessions/another-session');
    });

    it('gives the favorite button an accessible name per the Figma spec', () => {
      const row = [...playlist.querySelectorAll('.session-video-playlist-row')]
        .find((r) => r.dataset.itemId === 'a');
      expect(row.querySelector('.session-video-playlist-row-favorite').getAttribute('aria-label'))
        .to.equal('Favorite Session A');
    });

    it('gives the play button its own accessible name', () => {
      const row = [...playlist.querySelectorAll('.session-video-playlist-row')]
        .find((r) => r.dataset.itemId === 'a');
      expect(row.querySelector('.session-video-playlist-row-play').getAttribute('aria-label'))
        .to.equal('Play Session A');
    });

    it('reflects a favorited session in the button state', () => {
      favorited.value = new Set(['a']);
      const row = [...playlist.querySelectorAll('.session-video-playlist-row')]
        .find((r) => r.dataset.itemId === 'a');
      const button = row.querySelector('.session-video-playlist-row-favorite');

      expect(button.getAttribute('aria-pressed')).to.equal('true');
      expect(button.getAttribute('aria-label')).to.equal('Unfavorite Session A');
    });

    /**
     * The favorited state is carried by the icon SHAPE, not a colour change — the solid
     * heart's path is a single closed fill, whereas the outline's is a two-subpath donut
     * (its second `M` cuts the hollow centre). Matching event-session-details' own button.
     */
    it('swaps the outline heart for a solid one when favorited', () => {
      const row = [...playlist.querySelectorAll('.session-video-playlist-row')]
        .find((r) => r.dataset.itemId === 'a');
      const button = row.querySelector('.session-video-playlist-row-favorite');
      const subpathCount = () => (button.querySelector('path').getAttribute('d').match(/M/g) || []).length;

      expect(subpathCount(), 'unfavorited heart should be a hollow outline').to.be.greaterThan(1);

      favorited.value = new Set(['a']);

      expect(subpathCount(), 'favorited heart should be a single solid shape').to.equal(1);
    });

    it('renders the row progress bar from saved progress', async () => {
      localStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify({
        a: { secondsWatched: 50, length: 100, completed: false },
      }));
      const { playlist: fresh } = buildPage();
      addConfigRow(fresh, 'minimum-sessions', '2');
      await init(fresh);
      await flush();

      const row = [...fresh.querySelectorAll('.session-video-playlist-row')]
        .find((r) => r.dataset.itemId === 'a');
      expect(row.querySelector('.session-video-playlist-row-progress-fill').style.width).to.equal('50%');
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
      const toggle = playlist.querySelector('.session-video-playlist-toggle');
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
      expect(playlist.querySelector('.session-video-playlist-show-more')).to.not.exist;
    });

    it('appears once there are more than four rows', async () => {
      const playlist = await renderWithRows(6);
      expect(playlist.querySelector('.session-video-playlist-show-more')).to.exist;
    });

    it('toggles label, aria-expanded and aria-label on click', async () => {
      const playlist = await renderWithRows(6);
      const button = playlist.querySelector('.session-video-playlist-show-more');

      button.click();

      expect(button.getAttribute('aria-expanded')).to.equal('true');
      expect(button.getAttribute('aria-label')).to.equal('Show less sessions');
      expect(button.querySelector('span').textContent).to.equal('Show less');
      expect(playlist.querySelector('.session-video-playlist-list').classList.contains('is-showing-more'))
        .to.be.true;
    });

    /**
     * `maximum-sessions` caps how many rows are VISIBLE at once, not how many exist — the
     * list scrolls to reach the rest rather than dropping them. 8 qualifying sessions plus
     * the current one is 9 rows, all built, regardless of a maximum-sessions of 3.
     */
    it('builds every qualifying row regardless of maximum-sessions', async () => {
      setMeta('session-id', 'cur');
      setMeta('session-times', sessionTimesMeta());
      setMeta('custom-attributes', playlistAttribute());
      const { playlist } = buildPage();
      addConfigRow(playlist, 'minimum-sessions', '1');
      addConfigRow(playlist, 'maximum-sessions', '3');
      sessions.value = Array.from({ length: 8 }, (unused, i) => catalogSession({ id: `s${i}` }));

      await init(playlist);
      await flush();

      expect(playlist.querySelectorAll('.session-video-playlist-row')).to.have.lengthOf(9);
    });

    // The cap is a max-height, not a fixed height, so a list shorter than the cap sizes to
    // its own content — no scrollbar and no empty space below the last row.
    it('leaves the expanded list uncapped when there are fewer rows than the maximum', async () => {
      const playlist = await renderWithRows(6);
      addConfigRow(playlist, 'maximum-sessions', '20');
      const list = playlist.querySelector('.session-video-playlist-list');

      playlist.querySelector('.session-video-playlist-show-more').click();

      expect(list.style.maxHeight === '' || parseFloat(list.style.maxHeight) > list.scrollHeight)
        .to.be.true;
    });

  });

  /**
   * Exercised directly rather than through init(): the cap is desktop-only and the test
   * runner's viewport width isn't guaranteed to be >= 1024px, so driving the helper with a
   * controlled DOM is what makes the arithmetic assertable at all.
   */
  describe('applyExpandedHeightCap', () => {
    const ROW_HEIGHT = 40;

    function buildList({ rowCount, expanded }) {
      const list = document.createElement('div');
      list.className = `session-video-playlist-list${expanded ? ' is-showing-more' : ''}`;
      // Inline so the real block CSS (not loaded here) isn't needed for the measurement.
      list.style.cssText = 'display: flex; flex-direction: column; row-gap: 0; padding: 0;';
      Array.from({ length: rowCount }).forEach(() => {
        const row = document.createElement('div');
        row.className = 'session-video-playlist-row';
        row.style.cssText = `height: ${ROW_HEIGHT}px; flex: 0 0 auto;`;
        list.append(row);
      });
      document.body.append(list);
      return list;
    }

    // isDesktop is passed explicitly: the test runner's viewport is 800px wide, so the
    // desktop branch would never execute if it read window.innerWidth.
    it('caps the expanded list to maximum-sessions rows', () => {
      const list = buildList({ rowCount: 9, expanded: true });

      applyExpandedHeightCap(list, 5, true);

      expect(parseFloat(list.style.maxHeight)).to.equal(ROW_HEIGHT * 5);
    });

    it('caps to the full content height when rows and maximum match', () => {
      const list = buildList({ rowCount: 5, expanded: true });

      applyExpandedHeightCap(list, 5, true);

      // Equal to the content, so it renders at natural height with nothing to scroll.
      expect(parseFloat(list.style.maxHeight)).to.equal(list.scrollHeight);
    });

    it('sets a cap taller than the content when fewer rows than the maximum', () => {
      const list = buildList({ rowCount: 5, expanded: true });

      applyExpandedHeightCap(list, 20, true);

      // A max-height above the content height never truncates and never scrolls.
      expect(parseFloat(list.style.maxHeight)).to.be.greaterThan(list.scrollHeight);
    });

    it('clears the cap when the list is collapsed', () => {
      const list = buildList({ rowCount: 9, expanded: true });
      applyExpandedHeightCap(list, 5, true);
      expect(list.style.maxHeight).to.not.equal('');

      list.classList.remove('is-showing-more');
      applyExpandedHeightCap(list, 5, true);

      expect(list.style.maxHeight).to.equal('');
    });

    it('clears the cap on mobile, where the drawer owns the height', () => {
      const list = buildList({ rowCount: 9, expanded: true });
      applyExpandedHeightCap(list, 5, true);
      expect(list.style.maxHeight).to.not.equal('');

      applyExpandedHeightCap(list, 5, false);

      expect(list.style.maxHeight).to.equal('');
    });

    it('does nothing when the list has no rows to measure', () => {
      const list = buildList({ rowCount: 0, expanded: true });

      applyExpandedHeightCap(list, 5, true);

      expect(list.style.maxHeight).to.equal('');
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
      const checkbox = playlist.querySelector('.session-video-playlist-autoplay-toggle');

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

      expect(fresh.querySelector('.session-video-playlist-autoplay-toggle').checked).to.be.true;
    });

    // Navigation is routed through the overridable `_internals.navigate` seam because
    // window.location.assign is non-configurable and firing it for real triggers a full
    // reload that severs the Web Test Runner reporting channel (wiping the whole file's
    // results). Stubbing the seam lets us assert the navigation without any real reload.
    it('records the next href and navigates when the current session ends and autoplay is on', async () => {
      const navigate = sinon.stub(_internals, 'navigate');
      try {
        const nextUrl = '/drafts/hnv/sessions/a';
        const { playlist: selfLinked } = buildPage();
        addConfigRow(selfLinked, 'minimum-sessions', '2');
        sessions.value = [
          catalogSession({ id: 'a', sessionPageUrl: nextUrl }),
          catalogSession({ id: 'b', sessionPageUrl: '/drafts/hnv/sessions/b' }),
        ];
        await init(selfLinked);
        await flush();

        localStorage.setItem(AUTOPLAY_STORAGE_KEY, 'true');
        window.dispatchEvent(new CustomEvent('session-video-player:state', {
          detail: { sessionId: 'cur', state: 'ended' },
        }));

        expect(selfLinked.dataset.autoAdvanceHref).to.equal(nextUrl);
        expect(navigate.calledWith(nextUrl)).to.equal(true);
      } finally {
        navigate.restore();
      }
    });

    it('does not advance when autoplay is off', () => {
      localStorage.setItem(AUTOPLAY_STORAGE_KEY, 'false');

      window.dispatchEvent(new CustomEvent('session-video-player:state', {
        detail: { sessionId: 'cur', state: 'ended' },
      }));

      expect(playlist.dataset.autoAdvanceHref).to.equal(undefined);
    });

    it('ignores ended events for a different session', () => {
      localStorage.setItem(AUTOPLAY_STORAGE_KEY, 'true');

      window.dispatchEvent(new CustomEvent('session-video-player:state', {
        detail: { sessionId: 'someone-else', state: 'ended' },
      }));

      expect(playlist.dataset.autoAdvanceHref).to.equal(undefined);
    });

    it('ignores non-ended states', () => {
      localStorage.setItem(AUTOPLAY_STORAGE_KEY, 'true');

      window.dispatchEvent(new CustomEvent('session-video-player:state', {
        detail: { sessionId: 'cur', state: 'pause' },
      }));

      expect(playlist.dataset.autoAdvanceHref).to.equal(undefined);
    });
  });

  describe('live progress updates', () => {
    it('updates a row\'s progress bar on a session-video-player:progress event', async () => {
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
      window.dispatchEvent(new CustomEvent('session-video-player:progress', {
        detail: { sessionId: 'a' },
      }));

      const row = [...playlist.querySelectorAll('.session-video-playlist-row')]
        .find((r) => r.dataset.itemId === 'a');
      expect(row.querySelector('.session-video-playlist-row-progress-fill').style.width).to.equal('75%');
    });
  });
});
