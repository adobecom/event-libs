import { createTag, getMetadata, LIBS } from '../../../utils/utils.js';
import { sessions, initSessionState, liveStreamActiveIds } from '../../../utils/session-store.js';
import { deriveSessionState, getNowMs } from '../../../utils/session-state.js';
import { extractCustomAttributeSlugs } from '../../../services/sessions/sessions-api.js';

const BLOCK_CSS_URL = new URL('./video-playlist.css', import.meta.url).href;
const MILO_IFRAME_CSS_URL = `${LIBS}/styles/iframe.css`;

// Real adobetv.js/youtube.js autoblocks only ever run via Milo's own block loader,
// which auto-attaches each block's own CSS (adobetv.css itself is just `@import
// url('../../styles/iframe.css');`) as a side effect of loading it — .milo-video's
// aspect-ratio/sizing rules live there, not in this block's own CSS. buildMiloVideo below
// mirrors that markup directly (bypassing the autoblock entirely, since there may be no
// authored link for it to decorate at all), so nothing else ever triggers that load —
// without this, a freshly-built .milo-video has no intrinsic size at all.
function ensureMiloIframeCss() {
  if (document.getElementById('milo-iframe-css')) return;
  createTag('link', { rel: 'stylesheet', href: MILO_IFRAME_CSS_URL, id: 'milo-iframe-css' }, '', { parent: document.head });
}

const DEFAULT_MIN_SESSIONS = 4;
const DESKTOP_BREAKPOINT_PX = 1024;
const DRAWER_GAP_PX = 16;
const DRAWER_FLOOR_PX = 75;
const TITLE_LINE_CAP = 2;
const AUTOPLAY_STORAGE_KEY = 'video-playlist:play-all';
const PROGRESS_STORAGE_KEY = 'video-playlist:progress';
const FAVORITES_STORAGE_KEY = 'video-playlist:favorites';
const PROGRESS_TICK_SECONDS = 5;
const RESUME_RESTART_THRESHOLD_SECONDS = 30;
const SHOW_MORE_INITIAL_ROWS = 4;

// "Play all" persists across the full-page navigation that advancing to the next
// session's own page requires (see buildTopicView/init) — a plain in-memory flag
// wouldn't survive that reload.
function getShouldAutoPlay() {
  try {
    return localStorage.getItem(AUTOPLAY_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

function setShouldAutoPlay(value) {
  try {
    localStorage.setItem(AUTOPLAY_STORAGE_KEY, String(value));
  } catch (e) {
    window.lana?.log(`[video-playlist] could not persist play-all preference: ${e.message}`);
  }
}

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    window.lana?.log(`[video-playlist] localStorage read failed for "${key}": ${e.message}`);
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    window.lana?.log(`[video-playlist] localStorage write failed for "${key}": ${e.message}`);
  }
}

// Per-session watch progress, keyed by the SESSION's own id rather than any provider's
// video id — only ever written by the session's own page (the only place its video is
// actually embedded), then read by every OTHER session's page listing it as a row.
export function getVideoProgress(sessionId) {
  return readJson(PROGRESS_STORAGE_KEY, {})[sessionId] || null;
}

export function saveVideoProgress(sessionId, secondsWatched, length = null) {
  if (!sessionId) return;
  const all = readJson(PROGRESS_STORAGE_KEY, {});
  const previous = all[sessionId];
  const resolvedLength = length ?? previous?.length ?? null;
  all[sessionId] = {
    secondsWatched,
    length: resolvedLength,
    completed: previous?.completed || Boolean(resolvedLength && secondsWatched >= resolvedLength),
  };
  writeJson(PROGRESS_STORAGE_KEY, all);
}

// 0-100, clamped — `completed` (set once a session's video actually finishes; see
// watchMpcPlayback/watchYouTubePlayback below) always reads back as 100 even if a later
// partial `secondsWatched` update without a `length` would otherwise compute lower.
export function computeProgressPercent(progress) {
  if (!progress) return 0;
  if (progress.completed) return 100;
  if (!progress.length) return 0;
  return Math.max(0, Math.min(100, (progress.secondsWatched / progress.length) * 100));
}

function getFavorites() {
  return new Set(readJson(FAVORITES_STORAGE_KEY, []));
}

export function isFavorite(sessionId) {
  return getFavorites().has(sessionId);
}

// Returns the new state (true = now favorited) — client-only persistence, same as the
// exploratory new-video-playlist branch's own mock favorites adapter (its "real" ESP
// adapter was never actually wired there either).
export function toggleFavoriteLocal(sessionId) {
  const favorites = getFavorites();
  const next = !favorites.has(sessionId);
  if (next) favorites.add(sessionId);
  else favorites.delete(sessionId);
  writeJson(FAVORITES_STORAGE_KEY, [...favorites]);
  return next;
}

// Individual Session Pages carry several JSON blobs as page metadata (custom-attributes,
// session-times) — same parse-with-guard shape each time.
function parseJsonMetadata(name) {
  const raw = getMetadata(name);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (e) {
    window.lana?.log(`[video-playlist] invalid ${name} page metadata: ${e.message}`);
    return null;
  }
}

/**
 * Drawer expand cap ("Option B"): the drawer's open height may never push its top edge
 * above titleBottom + gap, i.e. it can never fully cover the session title. Falls back to
 * a fraction of the viewport when the title hasn't been measured yet (first paint).
 */
export function computeDrawerCapPx(viewportHeight, titleBottom, { floor = 0, gap = 0 } = {}) {
  if (titleBottom == null) return Math.max(floor, viewportHeight * 0.7);
  return Math.max(floor, viewportHeight - titleBottom - gap);
}

/**
 * The Y coordinate below which the drawer may not expand, given the title's own box.
 * If the title already fits within lineCap lines, its real bottom is the limit — no need
 * to extend further. If it wraps past lineCap lines, clamp to exactly lineCap lines' worth,
 * deliberately allowing the drawer to overlap the title's later lines.
 */
export function clampedTitleBottom(titleTop, titleHeight, lineHeight, lineCap) {
  const capHeight = lineHeight * lineCap;
  return titleTop + Math.min(titleHeight, capHeight);
}

function isOnDemand(session, nowMs) {
  return deriveSessionState(session, liveStreamActiveIds.value, nowMs) === 'on-demand';
}

const MS_PER_HOUR = 3600000;

// IPOD sessions (recorded in-person, no scheduled session-times of their own —
// startTimeUtc/endTimeUtc are both '') premiere DVR-hours after the EVENT's own start
// time, not the session's (there isn't one) — real formula confirmed against Northstar's
// SessionsDataSyncServiceImpl.java (addSessionTimeProperties: unscheduled sessions fall
// back to event start, then IPOD/on-demand-post-event sessions get + dvrTimingHours
// added). `dvrTimingHours` is sessions-api.js's normalized "DVR Timing (in hours)" custom
// attribute; `eventStartMs` is the current page's own `local-start-time-millis` metadata
// (same event for every session in the topic playlist, so valid for all of them, not
// just the current session — see event-agenda.js for the same metadata key in use
// elsewhere). Scheduled sessions are unaffected — they still premiere via their own
// endTimeUtc, exactly as isOnDemand/deriveSessionState already computed.
function hasPremiered(session, eventStartMs, nowMs) {
  if (session.startTimeUtc && session.endTimeUtc) return isOnDemand(session, nowMs);
  if (eventStartMs == null) return false;
  return nowMs >= eventStartMs + (session.dvrTimingHours || 0) * MS_PER_HOUR;
}

// Matches OTHER sessions whose "Playlist assignment/name" includes any of the given
// topic value(s) — no mapping table between PISP/PAN needed, both draw from the same
// slug vocabulary (validated against real session-catalog data: see sessions-api.js's
// playlistAssignment/playlistOnSessionPage fields). A qualifying row must also:
//   1) have a video source at all (hasVideoSource — MPC ID or YouTube ID present), and
//   2) have "premiered" — see hasPremiered above (scheduled sessions vs. IPOD).
// Fewer than minSessions qualifying rows renders nothing at all (page just doesn't show a
// playlist). `topics` is resolved by the caller — see resolveCurrentSessionTopics below —
// deliberately not looked up from allSessions here, since the current session's own topic
// value should come from the page's own metadata when available, not require that session
// to already be present in the fetched catalog.
export function resolveTopicPlaylist(
  currentSessionId,
  topics,
  allSessions,
  minSessions = DEFAULT_MIN_SESSIONS,
  eventStartMs = null,
) {
  if (!topics.length) return [];

  const nowMs = getNowMs();
  const rows = allSessions.filter((s) => s.id !== currentSessionId
    && s.hasVideoSource
    && (s.playlistAssignment || []).some((t) => topics.includes(t))
    && hasPremiered(s, eventStartMs, nowMs));

  return rows.length >= minSessions ? rows : [];
}

// Individual Session Pages carry the current session's own identity as page metadata —
// `session-id` (its real catalog id) and `custom-attributes` (its full raw customAttributes
// blob, same shape sessions-api.js reads from the live catalog). Preferring these over the
// fetched catalog means the current session's own topic value (and Keynote-ness) is known
// synchronously, without depending on that session actually being present in the fetched
// list — falls back to the catalog entry only if page metadata is missing.
export function resolveCurrentSessionTopics(pageCustomAttributes, catalogSession) {
  if (pageCustomAttributes) {
    return extractCustomAttributeSlugs({ customAttributes: pageCustomAttributes }, 'Playlist on session page');
  }
  return catalogSession?.playlistOnSessionPage || [];
}

// Chapters have no backend data model (confirmed — nothing in session-catalog represents
// timestamps within a video). Authored as a `chapters` Section Metadata JSON value:
// [{ "label": "...", "timestampSeconds": 0 }, ...] — same "structured JSON in a metadata
// value" convention tier-1-event-config already uses elsewhere in this codebase.
function parseChapters(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((c) => c && typeof c.label === 'string' && Number.isFinite(c.timestampSeconds))
      .map((c, i) => ({ id: `chapter-${i}`, title: c.label, timestampSeconds: c.timestampSeconds }));
  } catch (e) {
    window.lana?.log(`[video-playlist] invalid chapters JSON: ${e.message}`);
    return [];
  }
}

function formatDuration(minutes) {
  if (!minutes) return '';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h}h ${m}m` : `${m}m`;
}

function formatTimestamp(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

// Best-effort seek within the CURRENT player — unlike switching to a different session
// (which may require an entirely different player type, not solved in this pass; see
// README), a chapter seek stays within the SAME already-loaded Mobile Rider player, so it
// only needs that player's own seek API. Verified live before shipping — mobile-rider.js
// exposes window.__mr_player but this codebase has never needed to seek it before now.
function seekCurrentPlayer(seconds) {
  const player = window.__mr_player;
  if (!player) {
    window.lana?.log('[video-playlist] no active player to seek — chapter seek is a no-op');
    return;
  }
  if (typeof player.seek === 'function') player.seek(seconds);
  else if ('currentTime' in player) player.currentTime = seconds;
  else window.lana?.log('[video-playlist] active player exposes no known seek API');
}

// Adobe Analytics reads these declaratively (daa-ll/daa-lh), same convention already
// visible on every other block in this codebase — not a custom JS event dispatch.
function analyticsAttrs(linkName) {
  return { 'daa-ll': linkName };
}

// The Individual Session Page's own `session-times` metadata carries this session's own
// videos[] — entries shaped like { provider: 'mpc', url: 'https://video.tv.adobe.com/v/
// 3458940?autoplay=true&quality=9&end=nothing&learn=on', kind: 'onDemand' } — confirmed
// against real data for 'mpc'. No real 'youtube' sample has been seen yet — its url shape
// (a raw video id? a full watch/embed URL?) isn't confirmed, so buildMiloVideo below
// extracts an id defensively rather than assuming one shape.
const EMBEDDABLE_PROVIDERS = ['mpc', 'youtube'];

function pickEmbeddableVideo(sessionTimes) {
  const videos = (sessionTimes || []).flatMap((t) => t?.videos || []);
  return videos.find((v) => EMBEDDABLE_PROVIDERS.includes(v.provider)) || null;
}

const ADOBE_TV_ORIGIN = 'https://video.tv.adobe.com';
const MPC_MESSAGE_TYPE = 'mpcStatus';
const MPC_ACTION_TYPE = 'mpcAction';
const MPC_STATE_LOAD = 'load';
const MPC_STATE_PAUSE = 'pause';
const MPC_STATE_TICK = 'tick';
const MPC_STATE_COMPLETE = 'complete';

// Best-effort extraction of a bare YouTube video id from whatever shape the (unconfirmed)
// url comes in — an embed URL, a watch URL, or a bare id.
function extractYouTubeId(url) {
  const embedMatch = url.match(/youtube(?:-nocookie)?\.com\/embed\/([a-zA-Z0-9_-]{11})/);
  if (embedMatch) return embedMatch[1];
  const watchMatch = url.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
  if (watchMatch) return watchMatch[1];
  const bareMatch = url.match(/^([a-zA-Z0-9_-]{11})$/);
  return bareMatch ? bareMatch[1] : null;
}

// Mirrors Milo's own adobetv.js/youtube.js autoblock output (class names, iframe attrs —
// see node_modules/@adobecom/milo/libs/blocks/{adobetv,youtube}/*.js), and explicitly
// loads the same CSS (see ensureMiloIframeCss above) that output would otherwise only
// ever get via Milo's own block loader. YouTube additionally gets enablejsapi=1 + an id,
// needed to track completion below — Milo's own autoblock doesn't add these since it
// never needs to observe player state.
function buildMiloVideo(video) {
  ensureMiloIframeCss();
  const container = createTag('div', { class: 'milo-video' });
  if (video.provider === 'youtube') {
    const youtubeId = extractYouTubeId(video.url);
    const src = youtubeId
      ? `https://www.youtube.com/embed/${youtubeId}?enablejsapi=1&origin=${window.location.origin}&autoplay=1`
      : video.url;
    createTag('iframe', {
      src,
      class: 'youtube',
      id: youtubeId ? `video-playlist-yt-${youtubeId}` : '',
      webkitallowfullscreen: '',
      mozallowfullscreen: '',
      allowfullscreen: '',
      scrolling: 'no',
      allow: 'encrypted-media; accelerometer; gyroscope; picture-in-picture',
      title: 'YouTube video player',
    }, '', { parent: container });
    return container;
  }
  createTag('iframe', {
    src: video.url,
    class: 'adobetv',
    webkitallowfullscreen: '',
    mozallowfullscreen: '',
    allowfullscreen: '',
    scrolling: 'no',
    allow: 'encrypted-media',
    title: 'Adobe Video Publishing Cloud Player',
    loading: 'lazy',
  }, '', { parent: container });
  return container;
}

// Resumes playback from a previously-saved position — same postMessage envelope the
// exploratory new-video-playlist branch's startVideoFromSecond used against the real MPC
// player (confirmed working there). Skipped ("start from 0", i.e. a no-op here) when the
// saved position is within RESUME_RESTART_THRESHOLD_SECONDS of the end — resuming a
// session the viewer already finished would just restart 1s before the end.
export function resumeMpcVideo(iframe, progress) {
  if (!progress || !progress.length) return;
  if (progress.secondsWatched >= progress.length - RESUME_RESTART_THRESHOLD_SECONDS) return;
  iframe.contentWindow?.postMessage({
    type: MPC_ACTION_TYPE,
    action: 'play',
    currentTime: Math.floor(progress.secondsWatched),
  }, ADOBE_TV_ORIGIN);
}

// MPC posts window messages from video.tv.adobe.com — same postMessage envelope this
// codebase's earlier video-playlist attempt already relied on: { type: 'mpcStatus',
// state: 'load'|'pause'|'tick'|'complete', id, currentTime, length }. Progress is saved
// under the CURRENT session's own id (the closure's `sessionId`), not `data.id` — this
// page only ever embeds its own session's video, so which session is playing is already
// known unambiguously, unlike the multi-card-on-one-page model the envelope originally
// came from.
function watchMpcPlayback(sessionId, iframe, onComplete) {
  let lastTickSecond = null;
  const handler = (event) => {
    if (event.origin !== ADOBE_TV_ORIGIN) return;
    if (event.data?.type !== MPC_MESSAGE_TYPE) return;
    const { state, currentTime, length } = event.data;
    switch (state) {
      case MPC_STATE_LOAD:
        resumeMpcVideo(iframe, getVideoProgress(sessionId));
        break;
      case MPC_STATE_PAUSE:
        saveVideoProgress(sessionId, currentTime, length);
        break;
      case MPC_STATE_TICK: {
        const tickSecond = Math.floor(currentTime);
        if (tickSecond !== lastTickSecond && tickSecond % PROGRESS_TICK_SECONDS === 0) {
          lastTickSecond = tickSecond;
          saveVideoProgress(sessionId, currentTime, length);
        }
        break;
      }
      case MPC_STATE_COMPLETE: {
        // Real completion events carry `length`; tests (and possibly real edge cases)
        // may dispatch a bare `state: 'complete'` — only persist when a length is
        // actually known (this event's own, or a prior tick/pause's), so this never
        // clobbers previously-saved progress with a bogus undefined secondsWatched.
        const finalLength = length ?? getVideoProgress(sessionId)?.length ?? null;
        if (finalLength != null) saveVideoProgress(sessionId, finalLength, finalLength);
        onComplete();
        break;
      }
      default:
        break;
    }
  };
  window.addEventListener('message', handler);
}

function ensureYouTubeIframeApi() {
  if (window.YT?.Player) return Promise.resolve();
  const hasScript = [...document.scripts].some((s) => s.src.includes('youtube.com/iframe_api'));
  if (!hasScript) {
    createTag('script', { src: 'https://www.youtube.com/iframe_api' }, '', { parent: document.head });
  }
  return new Promise((resolve) => {
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      resolve();
    };
  });
}

async function watchYouTubePlayback(sessionId, iframe, onComplete) {
  await ensureYouTubeIframeApi();
  if (!iframe.id) return;
  let progressInterval = null;
  const stopProgressPolling = () => {
    if (progressInterval == null) return;
    clearInterval(progressInterval);
    progressInterval = null;
  };
  // eslint-disable-next-line no-new -- the player instance manages itself via the events
  // callbacks; nothing here needs to hold a reference to it afterward.
  new window.YT.Player(iframe.id, {
    events: {
      // The IFrame API has no continuous "tick" event (unlike MPC's postMessage
      // stream) — poll getCurrentTime()/getDuration() at the same cadence while
      // actually playing, same PROGRESS_TICK_SECONDS cadence as the MPC path.
      onReady: (event) => {
        const saved = getVideoProgress(sessionId);
        const duration = event.target?.getDuration?.();
        if (saved?.length && duration && saved.secondsWatched < duration - RESUME_RESTART_THRESHOLD_SECONDS) {
          event.target.seekTo(saved.secondsWatched, true);
        }
      },
      onStateChange: (event) => {
        if (event.data === window.YT.PlayerState.PLAYING) {
          stopProgressPolling();
          progressInterval = setInterval(() => {
            const currentTime = event.target?.getCurrentTime?.();
            const duration = event.target?.getDuration?.();
            if (currentTime != null && duration != null) saveVideoProgress(sessionId, currentTime, duration);
          }, PROGRESS_TICK_SECONDS * 1000);
        } else if (event.data === window.YT.PlayerState.ENDED) {
          stopProgressPolling();
          const duration = event.target?.getDuration?.();
          if (duration) saveVideoProgress(sessionId, duration, duration);
          onComplete();
        } else {
          stopProgressPolling();
        }
      },
    },
  });
}

// Loads the current session's own video into the player mounted alongside this block
// (the Individual Session Page's own `.milo-video` container, in the same .section), and
// watches for it to finish — provider-specific, since MPC (postMessage) and YouTube
// (IFrame API) use entirely different completion signals. Real pages have been seen with
// no video block authored in the section at all (just this block) — in that case (or when
// only a `.mobile-rider` container is present, which can't host either embed as-is),
// builds a fresh `.milo-video` container and inserts it as a sibling, same markup a real
// Milo-decorated embed would have.
function loadVideoPlayer(el, sessionId, video, onComplete) {
  const section = el.closest('.section');
  if (!section) return false;

  const built = buildMiloVideo(video);
  const iframe = built.firstElementChild;

  const existingMiloVideo = section.querySelector('.milo-video');
  if (existingMiloVideo) {
    existingMiloVideo.replaceChildren(iframe);
  } else {
    section.querySelector('.mobile-rider')?.remove();
    section.insertBefore(built, el);
  }

  if (video.provider === 'youtube') watchYouTubePlayback(sessionId, iframe, onComplete);
  else watchMpcPlayback(sessionId, iframe, onComplete);
  return true;
}

class Drawer {
  constructor(el, { titleEl, toggleEl }) {
    this.el = el;
    this.titleEl = titleEl;
    // aria-expanded belongs on the toggle button (the ARIA disclosure control), not the
    // drawer content it controls — this.el only ever gets the CSS state class.
    this.toggleEl = toggleEl;
    this.expanded = false;
  }

  isDesktop() {
    return window.innerWidth >= DESKTOP_BREAKPOINT_PX;
  }

  measureTitleBottom() {
    if (!this.titleEl) return null;
    const rect = this.titleEl.getBoundingClientRect();
    const lineHeight = parseFloat(getComputedStyle(this.titleEl).lineHeight) || rect.height;
    return clampedTitleBottom(rect.top, rect.height, lineHeight, TITLE_LINE_CAP);
  }

  applyMobileHeight() {
    const cap = computeDrawerCapPx(window.innerHeight, this.measureTitleBottom(), {
      floor: DRAWER_FLOOR_PX,
      gap: DRAWER_GAP_PX,
    });
    this.el.style.maxHeight = this.expanded ? `${cap}px` : `${DRAWER_FLOOR_PX}px`;
  }

  #apply() {
    this.el.classList.toggle('is-expanded', this.expanded);
    this.toggleEl?.setAttribute('aria-expanded', String(this.expanded));
    if (!this.isDesktop()) this.applyMobileHeight();
  }

  toggle() {
    this.expanded = !this.expanded;
    this.#apply();
  }

  setInitial({ expanded }) {
    this.expanded = expanded;
    this.#apply();
  }
}

// Kept minimal/generic — not copied from any design system, just a plain triangle-in-a-
// circle overlay and heart outline matching the Figma renders' shapes.
// A plain glyph (no baked-in circle) — the row's own .video-playlist-row-play button
// supplies the circular background via CSS, same convention as the favorite heart icon.
// Per Figma — fill is currentColor (not the literal white in Figma's own export) so the
// frosted-glass button's own `color` (always a fixed dark value, regardless of the row's
// light/dark theme — see .video-playlist-row-favorite/-play) controls it.
const PLAY_ICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3.79922 14.4001C3.48086 14.4001 3.16289 14.3141 2.87656 14.1431C2.32773 13.8149 2 13.2368 2 12.5977V3.39617C2 2.75711 2.32774 2.17899 2.87656 1.85086C3.425 1.52352 4.08867 1.50711 4.65195 1.81102L13.2129 6.41181C13.7973 6.72587 14.1602 7.33368 14.1602 7.99696C14.1602 8.66025 13.7973 9.26806 13.2129 9.58212L4.65195 14.1829C4.38281 14.3282 4.09062 14.4001 3.79922 14.4001ZM3.80195 2.79383C3.65938 2.79383 3.54726 2.84852 3.49218 2.88133C3.4043 2.93368 3.2 3.08915 3.2 3.39617V12.5977C3.2 12.9048 3.4043 13.0602 3.49218 13.1126C3.58007 13.1649 3.81328 13.2712 4.08398 13.1266L12.6445 8.52585C12.9293 8.37195 12.9602 8.10476 12.9602 7.99695C12.9602 7.88914 12.9293 7.62195 12.6445 7.46804L4.08398 2.86727C3.98282 2.81336 3.88711 2.79383 3.80195 2.79383Z" fill="currentColor"/></svg>';
// Mobile-only thumbnail overlay (distinct from the desktop row-actions play button above
// — mobile shows play centered on the thumbnail instead of a hover-revealed side button).
const THUMB_PLAY_ICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="15" viewBox="0 0 13 15" fill="none" aria-hidden="true"><path d="M11.925 6.11782C12.625 6.52196 12.625 7.53232 11.925 7.93647L1.575 13.912C0.875 14.3162 0 13.811 0 13.0027V1.05157C0 0.243276 0.875 -0.261905 1.575 0.14224L11.925 6.11782Z" fill="currentColor"/></svg>';
const FAVORITE_ICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M7.99957 14.3999C7.60855 14.3999 7.21753 14.2717 6.89097 14.0155C5.62222 13.0202 2.72886 10.4061 1.79137 8.87253C1.04527 7.65222 0.789022 6.14206 1.10582 4.83346C1.37769 3.71002 2.03551 2.80378 3.00856 2.21081C4.10777 1.53971 5.42692 1.41315 6.44997 1.88034C6.97809 2.12174 7.54059 2.54206 7.99293 3.01706C8.45543 2.51315 9.01129 2.10534 9.56677 1.8733C10.616 1.4319 11.9289 1.56314 12.991 2.21081C13.9636 2.80378 14.6215 3.71002 14.8933 4.83346C15.2101 6.14206 14.9539 7.65222 14.2078 8.87253C13.2722 10.403 10.3781 13.0186 9.10817 14.0155C8.78201 14.2717 8.39058 14.3999 7.99957 14.3999ZM5.10933 2.79909C4.62417 2.79909 4.10504 2.94753 3.63317 3.23581C2.93785 3.65925 2.46754 4.30925 2.27223 5.1155C2.02848 6.12174 2.23161 7.29206 2.81481 8.24597C3.5773 9.49284 6.13433 11.8968 7.63161 13.0718C7.84801 13.2421 8.15075 13.2421 8.36716 13.0718C9.86599 11.8952 12.4234 9.4905 13.184 8.24597C13.7675 7.29206 13.9707 6.12175 13.7269 5.1155C13.5316 4.30925 13.0613 3.65925 12.3664 3.23581C11.6258 2.78425 10.7304 2.68659 10.0304 2.97956C9.48474 3.20846 8.88396 3.72956 8.4992 4.30769C8.27654 4.64206 7.72264 4.64206 7.49998 4.30769C7.15193 3.78503 6.50077 3.22331 5.95154 2.97253C5.69685 2.85612 5.40972 2.79909 5.10933 2.79909Z" fill="currentColor"/></svg>';
const TOGGLE_CHEVRON_SVG = '<svg viewBox="0 0 16 10" aria-hidden="true"><path d="M1 1l7 7 7-7" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';
// Per Figma's "Show more" spec — distinct from TOGGLE_CHEVRON_SVG (the mobile drawer's
// own chevron), which wasn't part of this spec.
const SHOW_MORE_CHEVRON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="5" viewBox="0 0 8 5" fill="none" aria-hidden="true"><path d="M1 1L4 4L7 1" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

// The favorite button is a real, separate <button> sibling — never nested inside the
// row's own <button>-like control, which would be invalid HTML. See buildRow: the row
// itself is a plain div (not a <button>) specifically so this can sit alongside it.
function buildFavoriteButton(item) {
  let favorited = isFavorite(item.id);
  const button = createTag('button', {
    type: 'button',
    class: 'video-playlist-row-favorite',
    'aria-pressed': String(favorited),
    'aria-label': `${favorited ? 'Remove' : 'Add'} ${item.title} ${favorited ? 'from' : 'to'} favorites`,
    ...analyticsAttrs(favorited ? 'playlist-item-unfavorite' : 'playlist-item-favorite'),
  }, FAVORITE_ICON_SVG);
  button.classList.toggle('is-favorited', favorited);

  button.addEventListener('click', (event) => {
    // Otherwise this click would bubble up to the row's own click listener and also
    // trigger row selection/navigation.
    event.stopPropagation();
    favorited = toggleFavoriteLocal(item.id);
    button.classList.toggle('is-favorited', favorited);
    button.setAttribute('aria-pressed', String(favorited));
    button.setAttribute('aria-label', `${favorited ? 'Remove' : 'Add'} ${item.title} ${favorited ? 'from' : 'to'} favorites`);
    button.setAttribute('daa-ll', favorited ? 'playlist-item-unfavorite' : 'playlist-item-favorite');
  });
  return button;
}

// A plain, non-interactive play affordance — clicking it does exactly what clicking the
// row itself does (see `activate` in buildRow). stopPropagation isn't strictly needed
// for correctness here (both paths call the same `activate`), but matches the favorite
// button's convention and avoids a redundant double-dispatch up through the row.
function buildPlayButton(activate) {
  const button = createTag('button', {
    type: 'button',
    class: 'video-playlist-row-play',
    'aria-hidden': 'true',
    tabindex: '-1',
  }, PLAY_ICON_SVG);
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    activate();
  });
  return button;
}

// `favoritable` gates every topic-playlist-only addition (progress bar, favorite/play
// buttons) — Chapters rows call this with no third argument at all, so their markup is
// byte-for-byte what it always was.
function buildRow(item, { onSelect, favoritable = false }) {
  // A plain div, not a <button> — a real <button> (favorite/play) needs to sit alongside
  // it as a sibling below, and a <button> can never contain another <button>. tabindex +
  // the keydown handler below restore the keyboard-activation a native button would
  // otherwise have given for free.
  const row = createTag('div', {
    class: 'video-playlist-row',
    role: 'listitem',
    tabindex: '0',
    'data-item-id': item.id,
    ...(item.href ? { 'data-href': item.href } : {}),
    ...analyticsAttrs('playlist-item-select'),
  });

  if (item.thumbnailUrl) {
    const thumbWrap = createTag('div', { class: 'video-playlist-row-thumb-wrap' }, '', { parent: row });
    createTag('img', { class: 'video-playlist-row-thumb', src: item.thumbnailUrl, alt: '' }, '', { parent: thumbWrap });
    if (favoritable) createTag('span', { class: 'video-playlist-row-play-icon' }, THUMB_PLAY_ICON_SVG, { parent: thumbWrap });
  }

  const meta = createTag('div', { class: 'video-playlist-row-meta' }, '', { parent: row });
  createTag('span', { class: 'video-playlist-row-title' }, item.title, { parent: meta });

  if (favoritable) {
    const progress = createTag('div', { class: 'video-playlist-row-progress' }, '', { parent: meta });
    const track = createTag('div', { class: 'video-playlist-row-progress-track' }, '', { parent: progress });
    const fill = createTag('div', { class: 'video-playlist-row-progress-fill' }, '', { parent: track });
    fill.style.width = `${computeProgressPercent(getVideoProgress(item.id))}%`;
    if (item.durationLabel) createTag('span', { class: 'video-playlist-row-duration' }, item.durationLabel, { parent: progress });
  } else if (item.durationLabel) {
    createTag('span', { class: 'video-playlist-row-duration' }, item.durationLabel, { parent: meta });
  }

  const activate = () => onSelect(item, row);

  // Favorite + play sit stacked together as a hover/focus-revealed action column (per
  // Figma's "Hover" row state) — not on the thumbnail as an overlay.
  if (favoritable) {
    const actions = createTag('div', { class: 'video-playlist-row-actions' }, '', { parent: row });
    actions.appendChild(buildFavoriteButton(item));
    actions.appendChild(buildPlayButton(activate));
  }

  row.addEventListener('click', activate);
  row.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    activate();
  });
  return row;
}

function highlightRow(list, activeId) {
  [...list.children].forEach((row) => {
    const isActive = row.dataset.itemId === activeId;
    row.classList.toggle('is-playing', isActive);
    if (isActive) row.setAttribute('aria-current', 'true');
    else row.removeAttribute('aria-current');
  });
}

function buildChaptersView(el, chapters) {
  const list = createTag('div', { class: 'video-playlist-list', role: 'list' }, '', { parent: el });
  chapters.forEach((chapter) => {
    const row = buildRow(
      { ...chapter, durationLabel: formatTimestamp(chapter.timestampSeconds) },
      {
        onSelect: (item) => {
          seekCurrentPlayer(item.timestampSeconds);
          highlightRow(list, item.id);
        },
      },
    );
    list.append(row);
  });
  if (chapters.length) highlightRow(list, chapters[0].id);
}

function buildTopicView(el, rows) {
  const list = createTag('div', { class: 'video-playlist-list', role: 'list' }, '', { parent: el });
  rows.forEach((session) => {
    const row = buildRow(
      {
        id: session.id,
        title: session.title,
        thumbnailUrl: session.thumbnailUrl,
        durationLabel: formatDuration(session.duration),
        href: session.sessionPageUrl,
      },
      {
        // Navigates to the selected session's own page — always correct, since every
        // session already has a working page, and that page loads its own video from
        // its own `session-times` metadata the same way this one does (see
        // pickEmbeddableVideo/loadVideoPlayer in init()).
        onSelect: (item) => {
          if (item.href) window.location.assign(item.href);
        },
        favoritable: true,
      },
    );
    list.append(row);
  });

  // Desktop-only affordance (hidden on mobile via CSS — the bottom-sheet already
  // scrolls its full list) — reveals rows beyond SHOW_MORE_INITIAL_ROWS via CSS, so it
  // never touches the mobile drawer's own unrelated `is-expanded` state (see Drawer).
  if (rows.length > SHOW_MORE_INITIAL_ROWS) {
    const showMore = createTag('button', {
      type: 'button',
      class: 'video-playlist-show-more',
      'aria-expanded': 'false',
      ...analyticsAttrs('playlist-show-more'),
    }, '', { parent: el });
    const label = createTag('span', {}, 'Show more', { parent: showMore });
    createTag('span', { class: 'video-playlist-show-more-chevron' }, SHOW_MORE_CHEVRON_SVG, { parent: showMore });

    showMore.addEventListener('click', () => {
      const expanded = list.classList.toggle('is-showing-more');
      showMore.setAttribute('aria-expanded', String(expanded));
      label.textContent = expanded ? 'Show less' : 'Show more';
    });
  }
}

// "Play all": a checkbox next to the topic playlist (not shown for Chapters — advancing
// to a different session doesn't apply there) that persists across the full-page
// navigation to the next session (see AUTOPLAY_STORAGE_KEY). Reflects the stored
// preference on render; the actual advance-on-complete happens in init()'s onComplete
// callback, which reads this same preference at the moment the current video ends.
function buildAutoplayToggle(el) {
  const label = createTag('label', { class: 'video-playlist-autoplay' }, '', { parent: el });
  const checkbox = createTag('input', {
    type: 'checkbox',
    class: 'video-playlist-autoplay-toggle',
    ...analyticsAttrs('playlist-play-all-toggle'),
  }, '', { parent: label });
  checkbox.checked = getShouldAutoPlay();
  createTag('span', {}, 'Play all', { parent: label });
  checkbox.addEventListener('change', () => setShouldAutoPlay(checkbox.checked));
}

export default async function init(el) {
  if (!document.getElementById('video-playlist-css')) {
    createTag('link', { rel: 'stylesheet', href: BLOCK_CSS_URL, id: 'video-playlist-css' }, '', { parent: document.head });
  }

  const cfg = [...el.querySelectorAll(':scope > div > div:first-child')].reduce((acc, div) => {
    const key = div.textContent.trim().toLowerCase().replace(/ /g, '-');
    acc[key] = div.nextElementSibling?.textContent?.trim() || '';
    return acc;
  }, {});

  // Page-level metadata (the Individual Session Page's own identity) takes precedence
  // over anything authored on the block itself — session-id no longer needs authoring at
  // all when the page already carries it.
  const sessionId = getMetadata('session-id') || cfg['session-id'];
  if (!sessionId) {
    window.lana?.log('[video-playlist] no session-id (page metadata or authored) — nothing to render');
    el.remove();
    return;
  }

  const pageCustomAttributes = parseJsonMetadata('custom-attributes');
  const isKeynoteFromMetadata = (getMetadata('session-type') || '').toLowerCase() === 'keynote';
  // Same page-metadata key event-agenda.js already reads for the event's own start time —
  // needed for IPOD sessions' premiere formula (see hasPremiered above). One event start
  // time applies to every session in the topic playlist, not just the current one.
  const eventStartMs = (() => {
    const ms = Number(getMetadata('local-start-time-millis'));
    return Number.isFinite(ms) && ms > 0 ? ms : null;
  })();

  // Set by render() below once the topic playlist is resolved — read at the moment the
  // current video actually completes, not at attach time, since that resolution happens
  // asynchronously (after sessions.value loads) while the player/listener are set up here,
  // synchronously, regardless of whether the catalog has loaded yet.
  let nextRow = null;

  // The page's own video, loaded from its own `session-times` metadata — independent of
  // whether the topic-playlist/chapters list below ends up rendering at all, and of
  // whether a video block was separately authored in this section. On complete, "Play
  // all" (if enabled) advances to the next resolved topic-playlist row's own page — that
  // page loads its own video the same way, continuing the chain.
  const currentVideo = pickEmbeddableVideo(parseJsonMetadata('session-times'));
  if (currentVideo) {
    loadVideoPlayer(el, sessionId, currentVideo, () => {
      if (!getShouldAutoPlay() || !nextRow?.sessionPageUrl) return;
      // window.location.assign itself isn't stubbable in a real browser test env (a
      // non-configurable Location property) — exposing the resolved target here is the
      // part of this behavior worth asserting on directly, same convention buildTopicView
      // already uses via each row's data-href.
      el.dataset.autoAdvanceHref = nextRow.sessionPageUrl;
      window.location.assign(nextRow.sessionPageUrl);
    });
  }

  initSessionState();

  const minSessions = Number.parseInt(cfg['minimum-sessions'], 10) || DEFAULT_MIN_SESSIONS;
  const chapters = parseChapters(cfg.chapters);

  const render = (sessionList) => {
    const current = sessionList.find((s) => s.id === sessionId);
    const isChapterVariant = chapters.length > 0 || isKeynoteFromMetadata || (!pageCustomAttributes && current?.isKeynote);

    const topics = resolveCurrentSessionTopics(pageCustomAttributes, current);
    const rows = isChapterVariant
      ? chapters
      : resolveTopicPlaylist(sessionId, topics, sessionList, minSessions, eventStartMs);
    if (!rows.length) {
      el.remove();
      return;
    }
    if (!isChapterVariant) [nextRow] = rows;

    el.replaceChildren();

    // Decorative bottom-sheet drag affordance — mobile-only (see CSS), hidden from
    // assistive tech since it carries no information the toggle button below doesn't
    // already expose via aria-expanded.
    createTag('div', { class: 'video-playlist-handle', 'aria-hidden': 'true' }, '', { parent: el });

    const top = createTag('div', { class: 'video-playlist-top' }, '', { parent: el });

    const title = isChapterVariant ? 'Chapters' : (cfg['playlist-title'] || 'More like this');
    createTag('h3', { class: 'video-playlist-title' }, title, { parent: top });

    const toggle = createTag('button', {
      type: 'button',
      class: 'video-playlist-toggle',
      'aria-expanded': 'false',
      ...analyticsAttrs('playlist-toggle-switch'),
    }, TOGGLE_CHEVRON_SVG, { parent: top });

    if (isChapterVariant) buildChaptersView(el, rows);
    else {
      buildAutoplayToggle(top);
      buildTopicView(el, rows);
    }

    const titleEl = el.closest('.section')?.querySelector('h1, h2') || null;
    const drawer = new Drawer(el, { titleEl, toggleEl: toggle });
    toggle.addEventListener('click', () => drawer.toggle());
    window.addEventListener('resize', () => drawer.applyMobileHeight());

    // Desktop: open by default at player height. Mobile: open on load, per the ticket.
    drawer.setInitial({ expanded: true });
    el.dispatchEvent(new CustomEvent('video-playlist:view', { bubbles: true }));
  };

  const existing = sessions.value;
  if (existing.length) {
    render(existing);
  } else {
    const unsubscribe = sessions.subscribe((list) => {
      if (list.length) {
        render(list);
        unsubscribe();
      }
    });
  }
}
