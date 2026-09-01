import { createTag, getMetadata } from '../../../utils/utils.js';
import {
  sessions, sessionsStatus, initSessionState, liveStreamActiveIds, favorited, pendingActions,
} from '../../../utils/session-store.js';
import { deriveSessionState, getNowMs } from '../../../utils/session-state.js';
import { extractCustomAttributeSlugs, extractCustomAttributeValue } from '../../../services/sessions/sessions-api.js';
import { toggleFavoriteWithFeedback } from '../../../services/sessions/action-feedback.js';
import { initTierOneEventConfig, getEventStartMs } from '../../../utils/tier-1-event-config.js';
import { readBackgroundConfig } from '../../utils/background-config.js';
import BlockMediator from '../../../deps/block-mediator.min.js';
import {
  VIDEO_LAYOUT_DECISION_KEY,
  PROGRESS_STORAGE_KEY,
  VIDEO_CONTAINER_CLASS,
  VIDEO_PLAYLIST_CONTAINER_CLASS,
  findSectionWithStyle,
  readJsonFromStorage,
  parseJsonMetadata as parseSharedJsonMetadata,
  currentSessionHasEnded,
  findOnDemandVideos,
  readAuthoredConfig,
  resolveSessionId,
  ensureStylesheet,
} from '../../utils/video-session.js';

const LOG_SCOPE = 'video-playlist';

function logError(message) {
  window.lana?.log(`[${LOG_SCOPE}] ${message}`);
}

const parseJsonMetadata = (name) => parseSharedJsonMetadata(name, LOG_SCOPE);

const EVENT_CONFIG = { title: '', registerUrl: '/register' };

const BLOCK_CSS_URL = new URL('./video-playlist.css', import.meta.url).href;

const DEFAULT_MIN_SESSIONS = 4;
// Last-resort fallback for IPOD premiere timing (hasPremiered) when the Tier 1 Event
// Configurator's own eventStartDateTime isn't authored — per product, November 8 8am
// America/New_York (Miami/Eastern, GMT-4). The real authored value always takes
// precedence; see resolveEventStartMs below.
const FALLBACK_EVENT_START_MS = new Date('2026-11-08T08:00:00-04:00').getTime();
const DESKTOP_BREAKPOINT_PX = 1024;
const VIEWPORT_CAP_GUTTER_PX = 24;
const DRAWER_GAP_PX = 16;
const DRAWER_FLOOR_PX = 75;
const DRAWER_MIN_EXPANDED_PX = 150;
const TITLE_LINE_CAP = 2;
const AUTOPLAY_STORAGE_KEY = 'video-playlist:play-all';
const SHOW_MORE_INITIAL_ROWS = 4;
const DEFAULT_MAX_SESSIONS = 7;

/**
 * "Play all" persists across the full-page navigation that advancing to the next
 * session's own page requires — an in-memory flag wouldn't survive that reload.
 */
function getShouldAutoPlay() {
  try {
    return localStorage.getItem(AUTOPLAY_STORAGE_KEY) === 'true';
  } catch (error) {
    logError(`could not read play-all preference: ${error.message}`);
    return false;
  }
}

function setShouldAutoPlay(value) {
  try {
    localStorage.setItem(AUTOPLAY_STORAGE_KEY, String(value));
  } catch (error) {
    logError(`could not persist play-all preference: ${error.message}`);
  }
}

/**
 * Written by video-player.js on whichever page actually embeds a given session's video;
 * only ever READ here, purely to render each row's progress bar and duration.
 */
export function getVideoProgress(sessionId) {
  return readJsonFromStorage(PROGRESS_STORAGE_KEY, {}, LOG_SCOPE)[sessionId] || null;
}

/**
 * 0-100, clamped. `completed` reflects the LAST saved secondsWatched rather than a
 * permanent once-true flag, so a rewatch after finishing recomputes a lower percentage.
 */
export function computeProgressPercent(progress) {
  if (!progress) return 0;
  if (progress.completed) return 100;
  if (!progress.length) return 0;
  return Math.max(0, Math.min(100, (progress.secondsWatched / progress.length) * 100));
}

export function computeDrawerCapPx(viewportHeight, titleBottom, {
  floor = 0, gap = 0, playerBottom = null, minExpanded = 0,
} = {}) {
  if (titleBottom == null) return Math.max(floor, viewportHeight * 0.7);
  const titleCap = viewportHeight - titleBottom - gap;
  const playerCap = playerBottom == null ? Infinity : viewportHeight - playerBottom - gap;
  return Math.max(floor, minExpanded, Math.min(titleCap, playerCap));
}

export function clampedTitleBottom(titleTop, titleHeight, lineHeight, lineCap) {
  const capHeight = lineHeight * lineCap;
  return titleTop + Math.min(titleHeight, capHeight);
}

function isOnDemand(session, nowMs) {
  return deriveSessionState(session, liveStreamActiveIds.value, nowMs) === 'on-demand';
}

const MS_PER_HOUR = 3600000;

/**
 * Whether a candidate row's recording is available yet: scheduled sessions premiere via
 * their end time; IPOD sessions premiere `dvrDelayHours` after the event start. A null
 * dvrDelayHours means no wait; a real 0 means available from event start.
 */
function hasPremiered(session, eventStartMs, nowMs) {
  if (session.startTimeUtc && session.endTimeUtc) return isOnDemand(session, nowMs);
  if (session.dvrDelayHours == null) return true;
  if (eventStartMs == null) return false;
  return nowMs >= eventStartMs + session.dvrDelayHours * MS_PER_HOUR;
}

/**
 * Same onDemand-only check video-player.js applies before embedding — there's no point
 * recommending "more like this" beside a player that itself has nothing to show.
 */
function hasEmbeddableVideo(sessionTimes) {
  return findOnDemandVideos(sessionTimes).length > 0;
}

// Ascending by scheduled start time; IPOD sessions (no start time) sort last, stably.
function compareByStartTime(a, b) {
  if (!a.startTimeUtc && !b.startTimeUtc) return 0;
  if (!a.startTimeUtc) return 1;
  if (!b.startTimeUtc) return -1;
  return new Date(a.startTimeUtc).getTime() - new Date(b.startTimeUtc).getTime();
}

// Whether a session has any playable video source (the provider fields are alternatives).
function hasVideoSource(session) {
  return Boolean(session.mpcId || session.youTubeId || session.mrDvrVideoId);
}

export function resolveTopicPlaylist(
  currentSessionId,
  topics,
  allSessions,
  minSessions = DEFAULT_MIN_SESSIONS,
  eventStartMs = null,
) {
  if (!topics.length) return [];

  const topicSet = new Set(topics);
  const nowMs = getNowMs();
  const rows = allSessions.filter((s) => s.id !== currentSessionId
    && hasVideoSource(s)
    && (s.playlistAssignment || []).some((t) => topicSet.has(t))
    && hasPremiered(s, eventStartMs, nowMs));

  return rows.length >= minSessions ? rows.slice().sort(compareByStartTime) : [];
}

export function resolveCurrentSessionTopics(pageCustomAttributes) {
  return extractCustomAttributeSlugs({ customAttributes: pageCustomAttributes || [] }, 'Playlist on session page');
}

// Heading precedence: the `Playlist on session page` attribute's label, then an authored
// `playlist-title`, then the hardcoded "More like this".
export function resolvePlaylistTitle(pageCustomAttributes, authoredTitle) {
  const label = extractCustomAttributeValue(
    { customAttributes: pageCustomAttributes || [] },
    'Playlist on session page',
  );
  return label || authoredTitle || 'More like this';
}

function formatDuration(minutes) {
  if (!minutes) return '';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h}h ${m}m` : `${m}m`;
}

// Catalog `videoDuration` ("HH:MM:SS", the real recorded length) in minutes, or null.
// Preferred over `duration`, which is the scheduled slot length and can differ.
function parseVideoDurationMinutes(hms) {
  const match = /^(\d+):(\d{2}):(\d{2})$/.exec(hms || '');
  if (!match) return null;
  const [, hours, minutes, seconds] = match.map(Number);
  return Math.round(((hours * 3600) + (minutes * 60) + seconds) / 60);
}

function analyticsAttrs(linkName) {
  return { 'daa-ll': linkName };
}

function updateRowProgressUI(sessionId) {
  const row = [...document.querySelectorAll('.video-playlist-row')]
    .find((r) => r.dataset.itemId === sessionId);
  if (!row) return;
  const progress = getVideoProgress(sessionId);
  const fill = row.querySelector('.video-playlist-row-progress-fill');
  if (fill) fill.style.width = `${computeProgressPercent(progress)}%`;
  const durationEl = row.querySelector('.video-playlist-row-duration');
  if (durationEl && progress?.length) durationEl.textContent = formatDuration(Math.round(progress.length / 60));
}

// Nearest section seeing both this block and its siblings — the outer grid section, since
// this block's own .closest('.section') only reaches its fragment-local one.
function findEnclosingSection(el) {
  const gridColumn = el.closest('.grid-column');
  return gridColumn?.parentElement?.closest('.section') || el.closest('.section');
}

/** The session page's own visible heading, used as the drawer's expand ceiling. */
function findSessionHeading(el) {
  return findEnclosingSection(el)?.querySelector('h1, h2') || null;
}

function findSessionHeadingText(el) {
  return findSessionHeading(el)?.textContent?.trim() || '';
}

function findPlayerBottom(el) {
  const player = findEnclosingSection(el)?.querySelector('.video-player');
  return player ? player.getBoundingClientRect().bottom : null;
}

/**
 * Runs `teardown` once the element leaves the document, so page-wide listeners and
 * pending frames don't outlive the block that owns them.
 */
function onElementDetached(element, teardown) {
  const observer = new MutationObserver(() => {
    if (element.isConnected) return;
    observer.disconnect();
    teardown();
  });
  observer.observe(document.body, { childList: true, subtree: true });
  return observer;
}

class Drawer {
  constructor(el, { titleEl, toggleEl, handleEl, headerEl }) {
    this.el = el;
    this.titleEl = titleEl;
    this.toggleEl = toggleEl;
    this.handleEl = handleEl;
    this.headerEl = headerEl;
    this.expanded = false;
    this.dragHeightPx = null;
    if (this.handleEl) this.#bindDrag();
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

  measureCapPx() {
    return computeDrawerCapPx(window.innerHeight, this.measureTitleBottom(), {
      floor: DRAWER_FLOOR_PX,
      gap: DRAWER_GAP_PX,
      playerBottom: findPlayerBottom(this.el),
      minExpanded: DRAWER_MIN_EXPANDED_PX,
    });
  }

  // Dragging may cover the full viewport — unlike the chevron toggle's title/player-avoiding
  // cap (measureCapPx) — since it's an explicit direct-manipulation gesture.
  measureDragCapPx() {
    return window.innerHeight;
  }

  applyMobileHeight() {
    if (this.isDesktop()) {
      this.el.style.maxHeight = '';
      return;
    }
    // A persisted drag height is re-clamped against the full-viewport cap (not the
    // title-avoiding one) so a free-form height isn't snapped back down on resize.
    if (this.dragHeightPx != null) {
      const dragCap = this.measureDragCapPx();
      this.el.style.maxHeight = `${Math.min(Math.max(this.dragHeightPx, DRAWER_FLOOR_PX), dragCap)}px`;
      return;
    }
    this.el.style.maxHeight = this.expanded ? `${this.measureCapPx()}px` : `${DRAWER_FLOOR_PX}px`;
  }

  #apply() {
    this.el.classList.toggle('is-expanded', this.expanded);
    this.toggleEl?.setAttribute('aria-expanded', String(this.expanded));
    if (!this.isDesktop()) this.applyMobileHeight();
  }

  toggle() {
    this.expanded = !this.expanded;
    this.dragHeightPx = null;
    this.#apply();
  }

  setInitial({ expanded }) {
    this.expanded = expanded;
    this.#apply();
  }

  // While a drag is in flight, pointer-events:none on each `.video-player` stops the
  // cross-origin iframe under the finger from panning/scrubbing instead of the drawer.
  #addPlayerGuard() {
    if (this.guardReleaseTimer) { clearTimeout(this.guardReleaseTimer); this.guardReleaseTimer = null; }
    if (this.guardedPlayers?.length) return;
    this.guardedPlayers = [...document.querySelectorAll('.video-player')];
    this.guardedPlayers.forEach((player) => { player.style.pointerEvents = 'none'; });
  }

  #releasePlayerGuard() {
    this.guardedPlayers?.forEach((player) => { player.style.pointerEvents = ''; });
    this.guardedPlayers = [];
  }

  // Held ~350ms past release so the synthesised tap on the just-uncovered player is absorbed.
  #scheduleGuardRelease() {
    if (this.guardReleaseTimer) clearTimeout(this.guardReleaseTimer);
    this.guardReleaseTimer = setTimeout(() => {
      this.guardReleaseTimer = null;
      this.#releasePlayerGuard();
    }, 350);
  }

  #bindDrag() {
    let dragStartY = null;
    let dragStartHeight = null;
    let activePointerId = null;
    let captureEl = null;

    let rafId = null;
    let pendingHeight = null;
    const flush = () => {
      rafId = null;
      if (pendingHeight == null) return;
      this.dragHeightPx = pendingHeight;
      this.el.style.maxHeight = `${pendingHeight}px`;
    };
    const onPointerMove = (event) => {
      if (dragStartY == null) return;
      const cap = this.measureDragCapPx();
      const delta = dragStartY - event.clientY;
      // Coalesce to one style write per frame so moves don't queue a backlog of layout.
      pendingHeight = Math.min(Math.max(dragStartHeight + delta, DRAWER_FLOOR_PX), cap);
      if (rafId == null) rafId = requestAnimationFrame(flush);
    };

    // Free-form: the drawer keeps its dragged height; `expanded` only tracks past-midpoint
    // for aria/chevron state, not the rendered height (see applyMobileHeight).
    const onPointerUp = () => {
      if (dragStartY == null) return;
      dragStartY = null;
      if (rafId != null) { cancelAnimationFrame(rafId); flush(); }
      if (activePointerId != null && captureEl?.hasPointerCapture?.(activePointerId)) {
        captureEl.releasePointerCapture(activePointerId);
      }
      activePointerId = null;
      this.#scheduleGuardRelease();
      captureEl?.removeEventListener('pointermove', onPointerMove);
      captureEl?.removeEventListener('pointerup', onPointerUp);
      captureEl?.removeEventListener('pointercancel', onPointerUp);
      captureEl = null;
      // Re-enable the max-height transition (suppressed during drag) so the settle animates.
      this.el.classList.remove('is-dragging');
      const toggleCap = this.measureCapPx();
      const midpoint = (DRAWER_FLOOR_PX + toggleCap) / 2;
      const endedHeight = this.dragHeightPx ?? dragStartHeight;
      this.expanded = endedHeight >= midpoint;
      // Closing: drop the drag height so it settles to the collapsed peek, keeping height
      // and is-expanded chrome in sync (otherwise the padding/handle jump out of step).
      if (!this.expanded) this.dragHeightPx = null;
      this.#apply();
    };

    // The header band is a drag surface too (the 24px handle alone was too small to grab
    // reliably) — but only while expanded and not on its own controls (toggle, "Play all").
    const interactiveInHeader = (target) => Boolean(
      target.closest?.('button, a, input, label, [role="switch"], [role="button"]'),
    );
    const startDrag = (event) => {
      if (this.isDesktop()) return;
      if (dragStartY != null) return;
      const surface = event.currentTarget;
      if (surface === this.headerEl && (!this.expanded || interactiveInHeader(event.target))) return;
      dragStartY = event.clientY;
      dragStartHeight = this.el.getBoundingClientRect().height;
      // Capture keeps the gesture on this surface even as the pointer travels over the
      // player <iframe>, which would otherwise swallow the stream mid-drag.
      activePointerId = event.pointerId;
      captureEl = surface;
      captureEl.setPointerCapture?.(activePointerId);
      // Suppress the max-height transition while dragging so it tracks the finger 1:1.
      this.el.classList.add('is-dragging');
      this.#addPlayerGuard();
      captureEl.addEventListener('pointermove', onPointerMove);
      captureEl.addEventListener('pointerup', onPointerUp, { once: true });
      captureEl.addEventListener('pointercancel', onPointerUp, { once: true });
    };

    this.handleEl.addEventListener('pointerdown', startDrag);
    this.headerEl?.addEventListener('pointerdown', startDrag);
  }
}

const PLAY_ICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3.79922 14.4001C3.48086 14.4001 3.16289 14.3141 2.87656 14.1431C2.32773 13.8149 2 13.2368 2 12.5977V3.39617C2 2.75711 2.32774 2.17899 2.87656 1.85086C3.425 1.52352 4.08867 1.50711 4.65195 1.81102L13.2129 6.41181C13.7973 6.72587 14.1602 7.33368 14.1602 7.99696C14.1602 8.66025 13.7973 9.26806 13.2129 9.58212L4.65195 14.1829C4.38281 14.3282 4.09062 14.4001 3.79922 14.4001ZM3.80195 2.79383C3.65938 2.79383 3.54726 2.84852 3.49218 2.88133C3.4043 2.93368 3.2 3.08915 3.2 3.39617V12.5977C3.2 12.9048 3.4043 13.0602 3.49218 13.1126C3.58007 13.1649 3.81328 13.2712 4.08398 13.1266L12.6445 8.52585C12.9293 8.37195 12.9602 8.10476 12.9602 7.99695C12.9602 7.88914 12.9293 7.62195 12.6445 7.46804L4.08398 2.86727C3.98282 2.81336 3.88711 2.79383 3.80195 2.79383Z" fill="currentColor"/></svg>';
const THUMB_PLAY_ICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="15" viewBox="0 0 13 15" fill="none" aria-hidden="true"><path d="M11.925 6.11782C12.625 6.52196 12.625 7.53232 11.925 7.93647L1.575 13.912C0.875 14.3162 0 13.811 0 13.0027V1.05157C0 0.243276 0.875 -0.261905 1.575 0.14224L11.925 6.11782Z" fill="currentColor"/></svg>';
// Favorited state swaps to a solid heart (matching event-session-details/favorite.js).
const FAVORITE_ICON_OUTLINE_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M7.99957 14.3999C7.60855 14.3999 7.21753 14.2717 6.89097 14.0155C5.62222 13.0202 2.72886 10.4061 1.79137 8.87253C1.04527 7.65222 0.789022 6.14206 1.10582 4.83346C1.37769 3.71002 2.03551 2.80378 3.00856 2.21081C4.10777 1.53971 5.42692 1.41315 6.44997 1.88034C6.97809 2.12174 7.54059 2.54206 7.99293 3.01706C8.45543 2.51315 9.01129 2.10534 9.56677 1.8733C10.616 1.4319 11.9289 1.56314 12.991 2.21081C13.9636 2.80378 14.6215 3.71002 14.8933 4.83346C15.2101 6.14206 14.9539 7.65222 14.2078 8.87253C13.2722 10.403 10.3781 13.0186 9.10817 14.0155C8.78201 14.2717 8.39058 14.3999 7.99957 14.3999ZM5.10933 2.79909C4.62417 2.79909 4.10504 2.94753 3.63317 3.23581C2.93785 3.65925 2.46754 4.30925 2.27223 5.1155C2.02848 6.12174 2.23161 7.29206 2.81481 8.24597C3.5773 9.49284 6.13433 11.8968 7.63161 13.0718C7.84801 13.2421 8.15075 13.2421 8.36716 13.0718C9.86599 11.8952 12.4234 9.4905 13.184 8.24597C13.7675 7.29206 13.9707 6.12175 13.7269 5.1155C13.5316 4.30925 13.0613 3.65925 12.3664 3.23581C11.6258 2.78425 10.7304 2.68659 10.0304 2.97956C9.48474 3.20846 8.88396 3.72956 8.4992 4.30769C8.27654 4.64206 7.72264 4.64206 7.49998 4.30769C7.15193 3.78503 6.50077 3.22331 5.95154 2.97253C5.69685 2.85612 5.40972 2.79909 5.10933 2.79909Z" fill="currentColor"/></svg>';
const FAVORITE_ICON_FILLED_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M8.61426 17.5195C9.02246 17.8398 9.51123 18 10 18C10.4888 18 10.9781 17.8398 11.3858 17.5195C12.9732 16.2734 16.5908 13.0039 17.7603 11.0908C18.6929 9.56543 19.0132 7.67773 18.6172 6.04199C18.2774 4.63769 17.4551 3.50488 16.2393 2.76367C14.9116 1.95409 13.2705 1.79003 11.959 2.34179C11.2647 2.63183 10.5698 3.1416 9.99171 3.77148C9.42628 3.17773 8.72316 2.65234 8.063 2.35058C6.78419 1.7666 5.13526 1.9248 3.76124 2.76367C2.54493 3.50488 1.72266 4.63769 1.38282 6.04199C0.98682 7.67773 1.30713 9.56543 2.23975 11.0908C3.41162 13.0078 7.02832 16.2754 8.61426 17.5195Z" fill="currentColor"/></svg>';
const TOGGLE_CHEVRON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="17" height="10" viewBox="0 0 17 10" fill="none" aria-hidden="true"><path d="M16.7969 0.992758C16.7969 1.24793 16.6966 1.50437 16.4973 1.69481L9.08321 8.8283C8.70616 9.19265 8.10948 9.19265 7.73243 8.8283L0.300593 1.6783C-0.0878861 1.30505 -0.0993168 0.686787 0.273927 0.300856C0.64717 -0.0876221 1.26416 -0.10031 1.65137 0.274194L8.40782 6.77292L15.1465 0.290691C15.5337 -0.0838252 16.1507 -0.0711232 16.5239 0.317355C16.7067 0.505244 16.7969 0.748995 16.7969 0.992758Z" fill="#DBDBDB"/></svg>';
const SHOW_MORE_CHEVRON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="5" viewBox="0 0 8 5" fill="none" aria-hidden="true"><path d="M1 1L4 4L7 1" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function setFavoriteButtonState(button, item, isFav) {
  button.innerHTML = isFav ? FAVORITE_ICON_FILLED_SVG : FAVORITE_ICON_OUTLINE_SVG;
  button.classList.toggle('is-favorited', isFav);
  button.setAttribute('aria-pressed', String(isFav));
  // Per Figma's accessibility spec: "Favorite [session title]" / "Unfavorite [session
  // title]" — not the previous "Add/Remove ... to/from favorites" phrasing.
  button.setAttribute('aria-label', `${isFav ? 'Unfavorite' : 'Favorite'} ${item.title}`);
  button.setAttribute('daa-ll', isFav ? 'playlist-item-unfavorite' : 'playlist-item-favorite');
}

function buildFavoriteButton(item) {
  // Icon is set by setFavoriteButtonState below, which owns both states.
  const button = createTag('button', { type: 'button', class: 'video-playlist-row-favorite' });
  setFavoriteButtonState(button, item, favorited.value.has(item.id));

  button.addEventListener('click', async (event) => {
    event.stopPropagation();
    // Blur only on mouse clicks (event.detail > 0, unlike keyboard's 0) so the row's
    // :focus-within doesn't keep the actions column stuck open after the pointer leaves.
    if (event.detail > 0) button.blur();
    if (pendingActions.value.has(item.id)) return;
    await toggleFavoriteWithFeedback(item, {
      eventConfig: EVENT_CONFIG,
      isFavorited: favorited.value.has(item.id),
    });
  });
  return button;
}

// A real, focusable, separately-named ("Play [title]") button; its click does the same as
// activating the row, giving keyboard/AT users an explicit labeled control.
function buildPlayButton(activate, title) {
  const button = createTag('button', {
    type: 'button',
    class: 'video-playlist-row-play',
    'aria-label': `Play ${title}`,
  }, PLAY_ICON_SVG);
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    if (event.detail > 0) button.blur();
    activate();
  });
  return button;
}

function buildRow(item, { onSelect }) {
  const row = createTag('div', {
    class: 'video-playlist-row',
    role: 'listitem',
    'data-item-id': item.id,
    'data-href': item.href,
    ...analyticsAttrs('playlist-item-select'),
  });

  const content = createTag('a', { class: 'video-playlist-row-content', href: item.href }, '', { parent: row });

  if (item.thumbnailUrl) {
    const thumbWrap = createTag('div', { class: 'video-playlist-row-thumb-wrap' }, '', { parent: content });
    createTag('img', { class: 'video-playlist-row-thumb', src: item.thumbnailUrl, alt: '' }, '', { parent: thumbWrap });
    createTag('span', { class: 'video-playlist-row-play-icon' }, THUMB_PLAY_ICON_SVG, { parent: thumbWrap });
  }

  const meta = createTag('div', { class: 'video-playlist-row-meta' }, '', { parent: content });
  createTag('span', { class: 'video-playlist-row-title' }, item.title, { parent: meta });

  const progress = createTag('div', { class: 'video-playlist-row-progress' }, '', { parent: meta });
  const track = createTag('div', { class: 'video-playlist-row-progress-track' }, '', { parent: progress });
  const fill = createTag('div', { class: 'video-playlist-row-progress-fill' }, '', { parent: track });
  fill.style.width = `${computeProgressPercent(getVideoProgress(item.id))}%`;
  if (item.durationLabel) createTag('span', { class: 'video-playlist-row-duration' }, item.durationLabel, { parent: progress });

  const activate = () => onSelect(item, row);
  const actions = createTag('div', { class: 'video-playlist-row-actions' }, '', { parent: row });
  actions.appendChild(buildFavoriteButton(item));
  actions.appendChild(buildPlayButton(activate, item.title));

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

/**
 * Caps the expanded list at `maximum-sessions` whole rows (a max-height, so a shorter list
 * keeps its natural height and doesn't scroll). Desktop only; `isDesktop` is a parameter so
 * the measurement is testable below the breakpoint.
 */
export function applyExpandedHeightCap(
  list,
  maxSessions,
  isDesktop = window.innerWidth >= DESKTOP_BREAKPOINT_PX,
) {
  const isExpanded = list.classList.contains('is-showing-more');
  if (!isDesktop || !isExpanded) {
    list.style.maxHeight = '';
    return;
  }

  const firstRow = list.querySelector('.video-playlist-row');
  if (!firstRow) return;

  const rowHeight = firstRow.getBoundingClientRect().height;
  if (!rowHeight) return;

  const gap = parseFloat(getComputedStyle(list).rowGap) || 0;
  const listStyle = getComputedStyle(list);
  const verticalPadding = parseFloat(listStyle.paddingTop) + parseFloat(listStyle.paddingBottom);
  // N rows plus the N-1 gaps between them, plus the list's own padding.
  const rowsCap = (rowHeight * maxSessions) + (gap * (maxSessions - 1)) + verticalPadding;

  // Also clamp to the space left on screen, so a large `maximum-sessions` can't push the
  // card past the viewport (which makes the PAGE scroll instead of the list). Falls back to
  // rowsCap if the list isn't laid out yet (top === 0).
  const listTop = list.getBoundingClientRect().top;
  const viewportCap = window.innerHeight - listTop - VIEWPORT_CAP_GUTTER_PX;
  const cap = listTop > 0 && viewportCap > rowHeight
    ? Math.min(rowsCap, viewportCap)
    : rowsCap;
  list.style.maxHeight = `${cap}px`;
}

function buildTopicView(el, allRows, {
  maxSessions = DEFAULT_MAX_SESSIONS, defaultThumbnail = '', currentSessionId = null,
} = {}) {
  // Every qualifying session gets a row — `maximum-sessions` caps how many are VISIBLE
  // at once (see applyExpandedHeightCap), not how many exist, so the list can scroll to
  // reach the rest rather than silently dropping them.
  const rows = allRows;
  const list = createTag('div', { class: 'video-playlist-list', role: 'list' }, '', { parent: el });
  rows.forEach((session) => {
    const row = buildRow(
      {
        id: session.id,
        rfSessionId: session.rfSessionId,
        title: session.title,
        thumbnailUrl: session.thumbnailUrl || defaultThumbnail,
        // Most accurate source first: the length the player itself reported once someone
        // actually watched it, then the authored recording length, then the scheduled
        // slot length as a last resort.
        durationLabel: (() => {
          const watchedLengthSeconds = getVideoProgress(session.id)?.length;
          if (watchedLengthSeconds) return formatDuration(Math.round(watchedLengthSeconds / 60));
          return formatDuration(
            parseVideoDurationMinutes(session.videoDuration) ?? session.duration,
          );
        })(),
        href: session.sessionPageUrl,
      },
      {
        onSelect: (item) => {
          if (item.href) window.location.assign(item.href);
        },
      },
    );
    list.append(row);
  });

  if (currentSessionId) highlightRow(list, currentSessionId);

  const favoriteButtons = [...list.querySelectorAll('.video-playlist-row-favorite')];
  if (favoriteButtons.length) {
    favorited.subscribe(() => {
      favoriteButtons.forEach((button) => {
        const row = button.closest('.video-playlist-row');
        const title = row.querySelector('.video-playlist-row-title')?.textContent || '';
        setFavoriteButtonState(button, { id: row.dataset.itemId, title }, favorited.value.has(row.dataset.itemId));
      });
    });
  }

  if (rows.length > SHOW_MORE_INITIAL_ROWS) {
    const showMore = createTag('button', {
      type: 'button',
      class: 'video-playlist-show-more',
      'aria-expanded': 'false',
      // Per Figma's accessibility spec: accessible name "Show more sessions" (not just
      // the visible "Show more" text) — the visible label stays "Show more"/"Show less"
      // per the design, but the aria-label spells out what's being expanded for
      // assistive tech, same as it toggles below.
      'aria-label': 'Show more sessions',
      ...analyticsAttrs('playlist-show-more'),
    }, '', { parent: el });
    const label = createTag('span', {}, 'Show more', { parent: showMore });
    createTag('span', { class: 'video-playlist-show-more-chevron' }, SHOW_MORE_CHEVRON_SVG, { parent: showMore });

    showMore.addEventListener('click', () => {
      const expanded = list.classList.toggle('is-showing-more');
      showMore.setAttribute('aria-expanded', String(expanded));
      showMore.setAttribute('aria-label', expanded ? 'Show less sessions' : 'Show more sessions');
      label.textContent = expanded ? 'Show less' : 'Show more';
      applyExpandedHeightCap(list, maxSessions);
    });
  }

  applyExpandedHeightCap(list, maxSessions);
  // Row height changes with the breakpoint, and the cap is desktop-only, so it has to be
  // recomputed rather than measured once. Throttled to one measurement per frame — resize
  // fires continuously while dragging a window edge.
  let pendingFrame = null;
  const handleResize = () => {
    if (pendingFrame != null) return;
    pendingFrame = requestAnimationFrame(() => {
      pendingFrame = null;
      applyExpandedHeightCap(list, maxSessions);
    });
  };
  window.addEventListener('resize', handleResize);
  onElementDetached(el, () => {
    window.removeEventListener('resize', handleResize);
    if (pendingFrame != null) cancelAnimationFrame(pendingFrame);
  });
}

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

// Matches the CSS collapse transition. Safety net for when transitionend never fires
// (reduced-motion, already-hidden, CSS not yet applied) so the element still leaves the DOM.
const COLLAPSE_TRANSITION_MS = 250;
const COLLAPSE_FALLBACK_MS = COLLAPSE_TRANSITION_MS + 100;

/**
 * Fades an element out, then removes it. Re-entry safe: an element already collapsing is
 * left alone rather than restarting its transition.
 */
function collapseAndRemove(target) {
  if (!target || target.classList.contains('is-collapsing')) return;
  target.classList.add('is-collapsing');

  let removed = false;
  const removeOnce = () => {
    if (removed) return;
    removed = true;
    clearTimeout(fallbackTimer);
    target.remove();
  };

  target.addEventListener('transitionend', removeOnce, { once: true });
  const fallbackTimer = setTimeout(removeOnce, COLLAPSE_FALLBACK_MS);
}

/**
 * Whether an instance already embedded a real video (data-embedded set by loadVideoPlayer).
 * A late-arriving decision must never tear out an already-playing video.
 */
function hasEmbeddedVideoPlayer(container) {
  return container?.querySelector('.video-player')?.dataset.embedded === 'true';
}

/**
 * Publishes the page-wide layout decision and tears down whichever side lost. Sections are
 * found by their author-applied marker class, never by inferred DOM structure.
 */
function announceVideoDecision(hasPlaylist) {
  BlockMediator.set(VIDEO_LAYOUT_DECISION_KEY, { hasPlaylist });

  if (hasPlaylist) {
    // The full-width container only ever holds a `.video-player`, so there's nothing
    // else in it to protect — the whole section goes.
    const videoContainer = findSectionWithStyle(VIDEO_CONTAINER_CLASS);
    if (!hasEmbeddedVideoPlayer(videoContainer)) collapseAndRemove(videoContainer);
    return;
  }

  // The playlist container is SHARED with unrelated blocks (event-featured-products,
  // event-speakers, event-session-resources, ...), so only its own two video blocks are
  // removed — never the container itself or any sibling.
  const playlistContainer = findSectionWithStyle(VIDEO_PLAYLIST_CONTAINER_CLASS);
  if (!hasEmbeddedVideoPlayer(playlistContainer)) {
    collapseAndRemove(playlistContainer?.querySelector('.video-player'));
  }
  collapseAndRemove(playlistContainer?.querySelector('.video-playlist'));
}

function removeBlock(el) {
  window.dispatchEvent(new CustomEvent('video-playlist:removed'));
  announceVideoDecision(false);
  el.remove();
}

/**
 * The event's start time (for hasPremiered's IPOD path), read from the Tier 1 Event
 * Configurator's authored `eventStartDateTime`, not page-level `local-start-time-millis`.
 * initTierOneEventConfig() is idempotent, so calling it again here is order-independent.
 */
function resolveEventStartMs() {
  initTierOneEventConfig();
  return getEventStartMs() ?? FALLBACK_EVENT_START_MS;
}

/**
 * Everything this block needs from the page, or null when any gate fails. Each gate is
 * checked synchronously off page metadata — no catalog fetch to wait on.
 */
function resolveRenderContext(el) {
  const config = readAuthoredConfig(el);

  const sessionId = resolveSessionId(config);
  if (!sessionId) {
    logError('no session-id (page metadata or authored) — nothing to render');
    return null;
  }

  const sessionTimes = parseJsonMetadata('session-times');
  if (!hasEmbeddableVideo(sessionTimes)) {
    logError('no embeddable video on this page — nothing to render');
    return null;
  }

  if (!currentSessionHasEnded(sessionTimes, getNowMs())) {
    logError('current session has not ended yet — nothing to render');
    return null;
  }

  return {
    config,
    sessionId,
    sessionTimes,
    pageCustomAttributes: parseJsonMetadata('custom-attributes'),
    eventStartMs: resolveEventStartMs(),
    minSessions: Number.parseInt(config['minimum-sessions'], 10) || DEFAULT_MIN_SESSIONS,
    maxSessions: Number.parseInt(config['maximum-sessions'], 10) || DEFAULT_MAX_SESSIONS,
    defaultThumbnail: config['default-thumbnail'] || '',
  };
}

/**
 * Page-wide listeners for the separate video-player block's own events. Returns a
 * teardown so they don't outlive this block — Milo can re-decorate an area, and a removed
 * playlist shouldn't keep reacting to playback.
 */
function listenForPlayerEvents(el, sessionId) {
  const handleProgress = (event) => updateRowProgressUI(event.detail.sessionId);

  // "Play all" advance is owned entirely here: video-player.js only reports raw playback
  // state, and this block decides whether/where to navigate off its own rendered rows.
  const handleState = (event) => {
    if (event.detail.sessionId !== sessionId) return;
    if (event.detail.state !== 'ended') return;
    if (!getShouldAutoPlay()) return;

    const nextRow = [...el.querySelectorAll('.video-playlist-row[data-href]')]
      .find((row) => row.dataset.itemId !== sessionId);
    if (!nextRow?.dataset.href) return;

    // window.location.assign isn't stubbable in a real browser, so the resolved target is
    // exposed here first — that attribute is the assertable part of this behavior.
    el.dataset.autoAdvanceHref = nextRow.dataset.href;
    window.location.assign(nextRow.dataset.href);
  };

  window.addEventListener('video-player:progress', handleProgress);
  window.addEventListener('video-player:state', handleState);

  return () => {
    window.removeEventListener('video-player:progress', handleProgress);
    window.removeEventListener('video-player:state', handleState);
  };
}

export default async function init(el) {
  ensureStylesheet('video-playlist-css', BLOCK_CSS_URL);

  const background = readBackgroundConfig(el);
  if (background) el.style.setProperty('--vp-authored-bg', background);

  const context = resolveRenderContext(el);
  if (!context) {
    removeBlock(el);
    return;
  }
  const {
    sessionId, sessionTimes, pageCustomAttributes, eventStartMs,
    minSessions, maxSessions, defaultThumbnail, config: cfg,
  } = context;

  // Registered before any render/removal path below, so the listeners are cleaned up
  // however this block ends up leaving the DOM (a failed gate, an empty catalog, or a
  // later re-decorate) — not only after a successful render.
  const stopListeningForPlayerEvents = listenForPlayerEvents(el, sessionId);
  onElementDetached(el, stopListeningForPlayerEvents);

  initSessionState();

  // The current session may be absent from the catalog (e.g. IPOD); build a minimal
  // stand-in from page metadata so its row and "now playing" highlight still render.
  function synthesizeCurrentSession() {
    const startTimeMillis = (sessionTimes || [])[0]?.startTimeMillis;
    return {
      id: sessionId,
      title: findSessionHeadingText(el) || getMetadata('og:title') || '',
      thumbnailUrl: getMetadata('og:image') || null,
      duration: 0,
      sessionPageUrl: '',
      // Sorts into its real chronological position like any other row when known.
      startTimeUtc: Number.isFinite(startTimeMillis) ? new Date(startTimeMillis).toISOString() : '',
    };
  }

  /** Header: the collapsed "Up next" peek, the playlist title, and the drawer toggle. */
  function buildHeader(displayRows) {
    const header = createTag('div', { class: 'video-playlist-top' }, '', { parent: el });

    // Per Figma, the collapsed drawer shows what's coming next rather than the playlist's
    // own title. "Next" is the row after the current session — the same one "Play all"
    // would advance to — falling back to the first row when the current session sorts
    // last or isn't found.
    const currentIndex = displayRows.findIndex((row) => row.id === sessionId);
    const nextSession = displayRows[currentIndex + 1] || displayRows[0];
    const upNext = createTag('div', { class: 'video-playlist-up-next' }, '', { parent: header });
    createTag('span', { class: 'video-playlist-up-next-label' }, 'Up next', { parent: upNext });
    createTag('span', { class: 'video-playlist-up-next-title' }, nextSession.title, { parent: upNext });

    const title = resolvePlaylistTitle(pageCustomAttributes, cfg['playlist-title']);
    createTag('h3', { class: 'video-playlist-title' }, title, { parent: header });

    const toggle = createTag('button', {
      type: 'button',
      class: 'video-playlist-toggle',
      'aria-expanded': 'false',
      ...analyticsAttrs('playlist-toggle-switch'),
    }, TOGGLE_CHEVRON_SVG, { parent: header });

    buildAutoplayToggle(header);
    return { header, toggle };
  }

  /** Wires the mobile bottom-sheet drawer and its resize handling. */
  function setUpDrawer({ header, toggle, handle }) {
    const drawer = new Drawer(el, {
      titleEl: findSessionHeading(el),
      toggleEl: toggle,
      handleEl: handle,
      headerEl: header,
    });

    toggle.addEventListener('click', () => drawer.toggle());

    // Per Figma the entire collapsed peek opens the drawer — but only while collapsed, so
    // an expanded header's own controls (title, "Play all") stay independently clickable.
    header.addEventListener('click', (event) => {
      if (drawer.expanded || toggle.contains(event.target)) return;
      drawer.toggle();
    });

    // Throttled to one measurement per frame: resize fires continuously while dragging a
    // window edge, and applyMobileHeight() reads layout (getBoundingClientRect,
    // getComputedStyle) on every call.
    let pendingResizeFrame = null;
    const handleResize = () => {
      if (pendingResizeFrame != null) return;
      pendingResizeFrame = requestAnimationFrame(() => {
        pendingResizeFrame = null;
        drawer.applyMobileHeight();
      });
    };
    window.addEventListener('resize', handleResize);
    onElementDetached(el, () => {
      window.removeEventListener('resize', handleResize);
      if (pendingResizeFrame != null) cancelAnimationFrame(pendingResizeFrame);
    });

    // Desktop is not a drawer at all (always open); mobile opens to the collapsed peek.
    drawer.setInitial({ expanded: drawer.isDesktop() });
  }

  const render = (sessionList) => {
    const topics = resolveCurrentSessionTopics(pageCustomAttributes);
    const rows = resolveTopicPlaylist(sessionId, topics, sessionList, minSessions, eventStartMs);
    if (!rows.length) {
      removeBlock(el);
      return;
    }
    announceVideoDecision(true);

    // The current session is a DISPLAY concern only — it never counted toward
    // minSessions above, but it does occupy one of the maxSessions slots, and it sorts
    // into its own chronological position rather than being pinned first.
    const current = sessionList.find((s) => s.id === sessionId) || synthesizeCurrentSession();
    const displayRows = [current, ...rows].sort(compareByStartTime);

    el.replaceChildren();
    const handle = createTag('div', { class: 'video-playlist-handle', 'aria-hidden': 'true' }, '', { parent: el });
    const { header, toggle } = buildHeader(displayRows);
    buildTopicView(el, displayRows, { maxSessions, defaultThumbnail, currentSessionId: sessionId });
    setUpDrawer({ header, toggle, handle });

    el.dispatchEvent(new CustomEvent('video-playlist:view', { bubbles: true }));
  };

  // sessionsStatus reaching 'ready' (even empty) or 'error' is the fetch's terminal signal:
  // without handling it, an errored/empty fetch would leave the block waiting on
  // sessions.subscribe forever, stuck undecided in the layout.
  const existing = sessions.value;
  if (existing.length) {
    render(existing);
  } else if (sessionsStatus.value === 'ready' || sessionsStatus.value === 'error') {
    removeBlock(el);
  } else {
    // Both `.subscribe()` calls below fire synchronously once, with each signal's
    // current value, before either assignment below completes — declared as `let`
    // upfront (not `const` at each call site) so neither callback can reference the
    // other before it's assigned, regardless of subscribe order.
    let unsubscribeSessions;
    let unsubscribeStatus;
    unsubscribeSessions = sessions.subscribe((list) => {
      if (!list.length) return;
      unsubscribeSessions();
      unsubscribeStatus();
      render(list);
    });
    unsubscribeStatus = sessionsStatus.subscribe((status) => {
      if (status !== 'ready' && status !== 'error') return;
      if (sessions.value.length) return;
      unsubscribeSessions();
      unsubscribeStatus();
      removeBlock(el);
    });
  }
}
