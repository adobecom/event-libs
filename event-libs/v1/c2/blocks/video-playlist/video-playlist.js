import { createTag, getMetadata } from '../../../utils/utils.js';
import {
  sessions, sessionsStatus, initSessionState, liveStreamActiveIds, favorited, pendingActions,
} from '../../../utils/session-store.js';
import { deriveSessionState, getNowMs } from '../../../utils/session-state.js';
import { extractCustomAttributeSlugs, extractCustomAttributeValue } from '../../../services/sessions/sessions-api.js';
import { toggleFavoriteWithFeedback } from '../../../services/sessions/action-feedback.js';
import { readBackgroundConfig } from '../../utils/background-config.js';
import BlockMediator from '../../../deps/block-mediator.min.js';

// Shared getter/setter/subscriber store (same imsProfile/rsvpData pattern
// session-store.js already uses) — set once this block knows whether it has anything to
// show; both video-player instances on the page read/subscribe to it (see that block's
// own awaitEmbedDecision) to decide which one actually embeds.
const VIDEO_LAYOUT_DECISION_KEY = 'videoLayoutDecision';

const EVENT_CONFIG = { title: '', registerUrl: '/register' };

const BLOCK_CSS_URL = new URL('./video-playlist.css', import.meta.url).href;

const DEFAULT_MIN_SESSIONS = 4;
// Temporary fallback for IPOD premiere timing (hasPremiered) until the backend actually
// passes the event's own start time via local-start-time-millis page metadata — per
// product, November 8 8am America/New_York (Miami/Eastern, GMT-4). Remove once that
// metadata is reliably present; real metadata always takes precedence over this below.
const FALLBACK_EVENT_START_MS = new Date('2026-11-08T08:00:00-04:00').getTime();
const DESKTOP_BREAKPOINT_PX = 1024;
const DRAWER_GAP_PX = 16;
const DRAWER_FLOOR_PX = 75;
const DRAWER_MIN_EXPANDED_PX = 150;
const TITLE_LINE_CAP = 2;
const AUTOPLAY_STORAGE_KEY = 'video-playlist:play-all';
const PROGRESS_STORAGE_KEY = 'video-playlist:progress';
const SHOW_MORE_INITIAL_ROWS = 4;
const DEFAULT_MAX_SESSIONS = 7;


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

export function getVideoProgress(sessionId) {
  return readJson(PROGRESS_STORAGE_KEY, {})[sessionId] || null;
}

export function computeProgressPercent(progress) {
  if (!progress) return 0;
  if (progress.completed) return 100;
  if (!progress.length) return 0;
  return Math.max(0, Math.min(100, (progress.secondsWatched / progress.length) * 100));
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

function hasPremiered(session, eventStartMs, nowMs) {
  if (session.startTimeUtc && session.endTimeUtc) return isOnDemand(session, nowMs);
  if (!session.dvrTimingHours) return true;
  if (eventStartMs == null) return false;
  return nowMs >= eventStartMs + session.dvrTimingHours * MS_PER_HOUR;
}

// than hiding a page we can't positively evaluate.
function currentSessionHasEnded(sessionTimes, nowMs) {
  const entry = (sessionTimes || [])[0];
  if (!entry || !Number.isFinite(entry.endTimeMillis)) return true;
  return nowMs >= entry.endTimeMillis;
}

const EMBEDDABLE_PROVIDERS = ['mpc', 'youtube'];

function hasEmbeddableVideo(sessionTimes) {
  const videos = (sessionTimes || []).flatMap((t) => t?.videos || []);
  return videos.some((v) => EMBEDDABLE_PROVIDERS.includes(v.provider) && v.kind === 'onDemand');
}

function compareByStartTime(a, b) {
  if (!a.startTimeUtc && !b.startTimeUtc) return 0;
  if (!a.startTimeUtc) return 1;
  if (!b.startTimeUtc) return -1;
  return new Date(a.startTimeUtc).getTime() - new Date(b.startTimeUtc).getTime();
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
    && s.hasVideoSource
    && (s.playlistAssignment || []).some((t) => topicSet.has(t))
    && hasPremiered(s, eventStartMs, nowMs));

  return rows.length >= minSessions ? rows.slice().sort(compareByStartTime) : [];
}

export function resolveCurrentSessionTopics(pageCustomAttributes) {
  return extractCustomAttributeSlugs({ customAttributes: pageCustomAttributes || [] }, 'Playlist on session page');
}

// The playlist's own heading, per product: the SAME `Playlist on session page`
// attribute resolveCurrentSessionTopics above already reads (a multi-select, but only
// ever carrying one value at any given time in practice) takes precedence — its
// human-readable label (e.g. "Social Media and Marketing"), not the machine slug that
// attribute's other use (topic matching) needs. An authored `playlist-title` row is
// only consulted as a fallback when that metadata label isn't available, and the
// hardcoded "More like this" remains the final fallback when neither is.
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

function findPlayerBottom(el) {
  const gridColumn = el.closest('.grid-column');
  const outerSection = gridColumn?.parentElement?.closest('.section') || el.closest('.section');
  const player = outerSection?.querySelector('.video-player');
  return player ? player.getBoundingClientRect().bottom : null;
}

class Drawer {
  constructor(el, { titleEl, toggleEl, handleEl }) {
    this.el = el;
    this.titleEl = titleEl;
    this.toggleEl = toggleEl;
    this.handleEl = handleEl;
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

  // Dragging (see #bindDrag below) is allowed to go all the way to the top of the
  // viewport — deliberately NOT the same title/player-avoiding cap the chevron toggle's
  // own fixed expand target uses (measureCapPx above, left untouched). The user is
  // explicitly choosing to cover the title (and even the player, if they drag that far)
  // via a direct manipulation gesture, which is a different intent than the toggle's own
  // one-tap "open to a sensible default" behavior — per product, this also matters most
  // in landscape, where the toggle's own cap can otherwise be too small to see the list.
  measureDragCapPx() {
    return window.innerHeight;
  }

  applyMobileHeight() {
    if (this.isDesktop()) {
      this.el.style.maxHeight = '';
      return;
    }
    // A persisted drag height (see #bindDrag's own onPointerUp, which no longer clears
    // this on release) is re-clamped against measureDragCapPx() — the same full-viewport
    // ceiling dragging itself respects — not measureCapPx()'s title-avoiding cap, so a
    // free-form height the user chose past that cap doesn't get silently snapped back
    // down the next time this runs (e.g. on window resize).
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

  #bindDrag() {
    let dragStartY = null;
    let dragStartHeight = null;

    const onPointerMove = (event) => {
      if (dragStartY == null) return;
      const cap = this.measureDragCapPx();
      const delta = dragStartY - event.clientY;
      const next = Math.min(Math.max(dragStartHeight + delta, DRAWER_FLOOR_PX), cap);
      this.dragHeightPx = next;
      this.el.style.maxHeight = `${next}px`;
    };

    // Free-form: the drawer stays exactly where the user drags it to, clamped only
    // between DRAWER_FLOOR_PX and measureDragCapPx() (the full viewport, not the
    // toggle's own title/player-avoiding cap) — no snapping to a fixed
    // expanded/collapsed state on release. `expanded` still tracks whether the drawer
    // ended up past the (unrelated) chevron-toggle cap's own midpoint, purely so
    // aria-expanded/the chevron's rotation reflect "open" vs "closed" correctly; it no
    // longer drives the actual rendered height once a drag height is set (see
    // applyMobileHeight's own dragHeightPx branch).
    const onPointerUp = () => {
      if (dragStartY == null) return;
      dragStartY = null;
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      const toggleCap = this.measureCapPx();
      const midpoint = (DRAWER_FLOOR_PX + toggleCap) / 2;
      const endedHeight = this.dragHeightPx ?? dragStartHeight;
      this.expanded = endedHeight >= midpoint;
      this.#apply();
    };

    this.handleEl.addEventListener('pointerdown', (event) => {
      if (this.isDesktop()) return;
      dragStartY = event.clientY;
      dragStartHeight = this.el.getBoundingClientRect().height;
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp, { once: true });
    });
  }
}

const PLAY_ICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3.79922 14.4001C3.48086 14.4001 3.16289 14.3141 2.87656 14.1431C2.32773 13.8149 2 13.2368 2 12.5977V3.39617C2 2.75711 2.32774 2.17899 2.87656 1.85086C3.425 1.52352 4.08867 1.50711 4.65195 1.81102L13.2129 6.41181C13.7973 6.72587 14.1602 7.33368 14.1602 7.99696C14.1602 8.66025 13.7973 9.26806 13.2129 9.58212L4.65195 14.1829C4.38281 14.3282 4.09062 14.4001 3.79922 14.4001ZM3.80195 2.79383C3.65938 2.79383 3.54726 2.84852 3.49218 2.88133C3.4043 2.93368 3.2 3.08915 3.2 3.39617V12.5977C3.2 12.9048 3.4043 13.0602 3.49218 13.1126C3.58007 13.1649 3.81328 13.2712 4.08398 13.1266L12.6445 8.52585C12.9293 8.37195 12.9602 8.10476 12.9602 7.99695C12.9602 7.88914 12.9293 7.62195 12.6445 7.46804L4.08398 2.86727C3.98282 2.81336 3.88711 2.79383 3.80195 2.79383Z" fill="currentColor"/></svg>';
const THUMB_PLAY_ICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="15" viewBox="0 0 13 15" fill="none" aria-hidden="true"><path d="M11.925 6.11782C12.625 6.52196 12.625 7.53232 11.925 7.93647L1.575 13.912C0.875 14.3162 0 13.811 0 13.0027V1.05157C0 0.243276 0.875 -0.261905 1.575 0.14224L11.925 6.11782Z" fill="currentColor"/></svg>';
const FAVORITE_ICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M7.99957 14.3999C7.60855 14.3999 7.21753 14.2717 6.89097 14.0155C5.62222 13.0202 2.72886 10.4061 1.79137 8.87253C1.04527 7.65222 0.789022 6.14206 1.10582 4.83346C1.37769 3.71002 2.03551 2.80378 3.00856 2.21081C4.10777 1.53971 5.42692 1.41315 6.44997 1.88034C6.97809 2.12174 7.54059 2.54206 7.99293 3.01706C8.45543 2.51315 9.01129 2.10534 9.56677 1.8733C10.616 1.4319 11.9289 1.56314 12.991 2.21081C13.9636 2.80378 14.6215 3.71002 14.8933 4.83346C15.2101 6.14206 14.9539 7.65222 14.2078 8.87253C13.2722 10.403 10.3781 13.0186 9.10817 14.0155C8.78201 14.2717 8.39058 14.3999 7.99957 14.3999ZM5.10933 2.79909C4.62417 2.79909 4.10504 2.94753 3.63317 3.23581C2.93785 3.65925 2.46754 4.30925 2.27223 5.1155C2.02848 6.12174 2.23161 7.29206 2.81481 8.24597C3.5773 9.49284 6.13433 11.8968 7.63161 13.0718C7.84801 13.2421 8.15075 13.2421 8.36716 13.0718C9.86599 11.8952 12.4234 9.4905 13.184 8.24597C13.7675 7.29206 13.9707 6.12175 13.7269 5.1155C13.5316 4.30925 13.0613 3.65925 12.3664 3.23581C11.6258 2.78425 10.7304 2.68659 10.0304 2.97956C9.48474 3.20846 8.88396 3.72956 8.4992 4.30769C8.27654 4.64206 7.72264 4.64206 7.49998 4.30769C7.15193 3.78503 6.50077 3.22331 5.95154 2.97253C5.69685 2.85612 5.40972 2.79909 5.10933 2.79909Z" fill="currentColor"/></svg>';
const TOGGLE_CHEVRON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="17" height="10" viewBox="0 0 17 10" fill="none" aria-hidden="true"><path d="M16.7969 0.992758C16.7969 1.24793 16.6966 1.50437 16.4973 1.69481L9.08321 8.8283C8.70616 9.19265 8.10948 9.19265 7.73243 8.8283L0.300593 1.6783C-0.0878861 1.30505 -0.0993168 0.686787 0.273927 0.300856C0.64717 -0.0876221 1.26416 -0.10031 1.65137 0.274194L8.40782 6.77292L15.1465 0.290691C15.5337 -0.0838252 16.1507 -0.0711232 16.5239 0.317355C16.7067 0.505244 16.7969 0.748995 16.7969 0.992758Z" fill="#DBDBDB"/></svg>';
const SHOW_MORE_CHEVRON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="5" viewBox="0 0 8 5" fill="none" aria-hidden="true"><path d="M1 1L4 4L7 1" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function setFavoriteButtonState(button, item, isFav) {
  button.classList.toggle('is-favorited', isFav);
  button.setAttribute('aria-pressed', String(isFav));
  // Per Figma's accessibility spec: "Favorite [session title]" / "Unfavorite [session
  // title]" — not the previous "Add/Remove ... to/from favorites" phrasing.
  button.setAttribute('aria-label', `${isFav ? 'Unfavorite' : 'Favorite'} ${item.title}`);
  button.setAttribute('daa-ll', isFav ? 'playlist-item-unfavorite' : 'playlist-item-favorite');
}

function buildFavoriteButton(item) {
  const button = createTag('button', { type: 'button', class: 'video-playlist-row-favorite' }, FAVORITE_ICON_SVG);
  setFavoriteButtonState(button, item, favorited.value.has(item.id));

  button.addEventListener('click', async (event) => {
    event.stopPropagation();
    // A mouse/touch click reports a nonzero event.detail (the click count); a
    // keyboard-triggered click (Enter/Space) always reports 0. Blurring only in the
    // mouse case clears the lingering :focus-within that otherwise keeps
    // .video-playlist-row-actions visible after the pointer leaves — clicking the
    // button focuses it by default, and CSS treats focus the same as hover for
    // revealing the actions column, so without this a mouse click leaves the row
    // looking "stuck" open until something else steals focus. Keyboard users still
    // keep the actions column visible while tabbed to it, which is the correct,
    // intentional behavior for that input method.
    if (event.detail > 0) button.blur();
    if (pendingActions.value.has(item.id)) return;
    await toggleFavoriteWithFeedback(item, {
      eventConfig: EVENT_CONFIG,
      isFavorited: favorited.value.has(item.id),
    });
  });
  return button;
}

// Per Figma's accessibility spec: a real, focusable button with its own name ("Play
// [session title]") — not aria-hidden/tabindex="-1" as before. Its own click still does
// exactly what clicking the row itself does (see `activate` in buildRow); this only
// gives keyboard/assistive-tech users an explicit, separately-labeled way to trigger the
// same action, rather than relying solely on the row's own (differently-labeled) link.
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

function buildTopicView(el, allRows, {
  maxSessions = DEFAULT_MAX_SESSIONS, defaultThumbnail = '', currentSessionId = null,
} = {}) {
  const rows = allRows.slice(0, maxSessions);
  const list = createTag('div', { class: 'video-playlist-list', role: 'list' }, '', { parent: el });
  rows.forEach((session) => {
    const row = buildRow(
      {
        id: session.id,
        rfSessionId: session.rfSessionId,
        title: session.title,
        thumbnailUrl: session.thumbnailUrl || defaultThumbnail,
        durationLabel: (() => {
          const realLengthSeconds = getVideoProgress(session.id)?.length;
          return realLengthSeconds
            ? formatDuration(Math.round(realLengthSeconds / 60))
            : formatDuration(session.duration);
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
    });
  }
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

// Author-applied marker classes (e.g. via Section Metadata's "Style" row) on each
// candidate section — NOT inferred from DOM structure. A prior `.closest('.section')`/
// `.grid-column` walk proved fragile in practice: it broke outright once the two
// columns turned out to be separate `.fragment > .section` trees with no shared
// section reachable via `.closest()` from either side, and any future template change
// could break a structural guess again. `.video-container` = the full-width,
// player-only layout (only ever has a `.video-player` in it, nothing else to protect —
// removing the whole thing when it loses is fine). `.video-playlist-container` = the
// two-column layout, sharing its section with other unrelated blocks (confirmed live:
// event-featured-products/event-speakers/event-session-resources) — so losing there
// only ever removes the specific `.video-player`/`.video-playlist` elements inside it,
// never the container itself or its other siblings.
function collapseAndRemove(target) {
  if (!target || target.classList.contains('is-collapsing')) return;
  target.classList.add('is-collapsing');
  target.addEventListener('transitionend', () => target.remove(), { once: true });
}

function announceVideoDecision(hasPlaylist) {
  BlockMediator.set(VIDEO_LAYOUT_DECISION_KEY, { hasPlaylist });
  if (hasPlaylist) {
    // video-playlist won — the full-width, player-only container (if authored) is the
    // loser, removed entirely.
    collapseAndRemove(document.querySelector('.video-container'));
    return;
  }
  // The full-width container wins by default — the video-playlist-container's own two
  // video blocks are the losers, its other sibling blocks are left untouched.
  const playlistContainer = document.querySelector('.video-playlist-container');
  collapseAndRemove(playlistContainer?.querySelector('.video-player'));
  collapseAndRemove(playlistContainer?.querySelector('.video-playlist'));
}

function removeBlock(el) {
  window.dispatchEvent(new CustomEvent('video-playlist:removed'));
  announceVideoDecision(false);
  el.remove();
}

export default async function init(el) {
  if (!document.getElementById('video-playlist-css')) {
    createTag('link', { rel: 'stylesheet', href: BLOCK_CSS_URL, id: 'video-playlist-css' }, '', { parent: document.head });
  }

  const background = readBackgroundConfig(el);
  if (background) el.style.setProperty('--vp-authored-bg', background);

  const cfg = [...el.querySelectorAll(':scope > div > div:first-child')].reduce((acc, div) => {
    const key = div.textContent.trim().toLowerCase().replace(/ /g, '-');
    acc[key] = div.nextElementSibling?.textContent?.trim() || '';
    return acc;
  }, {});

  const sessionId = getMetadata('session-id') || cfg['session-id'];
  if (!sessionId) {
    window.lana?.log('[video-playlist] no session-id (page metadata or authored) — nothing to render');
    removeBlock(el);
    return;
  }

  const sessionTimes = parseJsonMetadata('session-times');
  if (!hasEmbeddableVideo(sessionTimes)) {
    window.lana?.log('[video-playlist] no embeddable video on this page — nothing to render');
    removeBlock(el);
    return;
  }

  if (!currentSessionHasEnded(sessionTimes, getNowMs())) {
    window.lana?.log('[video-playlist] current session has not ended yet — nothing to render');
    removeBlock(el);
    return;
  }

  const pageCustomAttributes = parseJsonMetadata('custom-attributes');
  const eventStartMs = (() => {
    const ms = Number(getMetadata('local-start-time-millis'));
    if (Number.isFinite(ms) && ms > 0) return ms;
    return FALLBACK_EVENT_START_MS;
  })();

  window.addEventListener('video-player:progress', (event) => {
    updateRowProgressUI(event.detail.sessionId);
  });

  window.addEventListener('video-player:state', (event) => {
    if (event.detail.sessionId !== sessionId) return;
    if (event.detail.state !== 'ended') return;
    if (!getShouldAutoPlay()) return;
    const nextRow = [...el.querySelectorAll('.video-playlist-row[data-href]')]
      .find((row) => row.dataset.itemId !== sessionId);
    if (!nextRow?.dataset.href) return;
    el.dataset.autoAdvanceHref = nextRow.dataset.href;
    window.location.assign(nextRow.dataset.href);
  });

  initSessionState();

  const minSessions = Number.parseInt(cfg['minimum-sessions'], 10) || DEFAULT_MIN_SESSIONS;
  const maxSessions = Number.parseInt(cfg['maximum-sessions'], 10) || DEFAULT_MAX_SESSIONS;
  const defaultThumbnail = cfg['default-thumbnail'] || '';

  function synthesizeCurrentSession() {
    const gridColumn = el.closest('.grid-column');
    const outerSection = gridColumn?.parentElement?.closest('.section') || el.closest('.section');
    const titleFromDom = outerSection?.querySelector('h1, h2')?.textContent?.trim();
    const startTimeMillis = (sessionTimes || [])[0]?.startTimeMillis;
    return {
      id: sessionId,
      title: titleFromDom || getMetadata('og:title') || '',
      thumbnailUrl: getMetadata('og:image') || null,
      duration: 0,
      sessionPageUrl: '',
      startTimeUtc: Number.isFinite(startTimeMillis) ? new Date(startTimeMillis).toISOString() : '',
    };
  }

  const render = (sessionList) => {
    const current = sessionList.find((s) => s.id === sessionId) || synthesizeCurrentSession();

    const topics = resolveCurrentSessionTopics(pageCustomAttributes);
    const rows = resolveTopicPlaylist(sessionId, topics, sessionList, minSessions, eventStartMs);
    if (!rows.length) {
      removeBlock(el);
      return;
    }
    announceVideoDecision(true);
    const displayRows = current ? [current, ...rows].sort(compareByStartTime) : rows;
    el.replaceChildren();
    const handle = createTag('div', { class: 'video-playlist-handle', 'aria-hidden': 'true' }, '', { parent: el });
    const top = createTag('div', { class: 'video-playlist-top' }, '', { parent: el });
    const currentIndex = displayRows.findIndex((row) => row.id === sessionId);
    const nextSession = displayRows[currentIndex + 1] || displayRows[0];
    const upNext = createTag('div', { class: 'video-playlist-up-next' }, '', { parent: top });
    createTag('span', { class: 'video-playlist-up-next-label' }, 'Up next', { parent: upNext });
    createTag('span', { class: 'video-playlist-up-next-title' }, nextSession.title, { parent: upNext });

    const title = resolvePlaylistTitle(pageCustomAttributes, cfg['playlist-title']);
    createTag('h3', { class: 'video-playlist-title' }, title, { parent: top });

    const toggle = createTag('button', {
      type: 'button',
      class: 'video-playlist-toggle',
      'aria-expanded': 'false',
      ...analyticsAttrs('playlist-toggle-switch'),
    }, TOGGLE_CHEVRON_SVG, { parent: top });

    buildAutoplayToggle(top);
    buildTopicView(el, displayRows, { maxSessions, defaultThumbnail, currentSessionId: sessionId });
    const gridColumn = el.closest('.grid-column');
    const outerSection = gridColumn?.parentElement?.closest('.section') || el.closest('.section');
    const titleEl = outerSection?.querySelector('h1, h2') || null;
    const drawer = new Drawer(el, { titleEl, toggleEl: toggle, handleEl: handle });
    toggle.addEventListener('click', () => drawer.toggle());
    top.addEventListener('click', (event) => {
      if (drawer.expanded || event.target === toggle || toggle.contains(event.target)) return;
      drawer.toggle();
    });
    window.addEventListener('resize', () => drawer.applyMobileHeight());
    drawer.setInitial({ expanded: drawer.isDesktop() });
    el.dispatchEvent(new CustomEvent('video-playlist:view', { bubbles: true }));
  };

  // A catalog fetch that errors out, or genuinely resolves with zero sessions, never
  // makes `sessions.value` non-empty — without this, the block below would wait on
  // `sessions.subscribe` forever, leaving a stray, unstyled, never-decided
  // `.video-playlist` stuck in the layout indefinitely (confirmed live: the raw block
  // sits in its two-column section with no rows, no removal, and video-player's own
  // instances never resolve their embed decision either, since announceVideoDecision()
  // is never reached). sessionsStatus reaching 'ready' (even with an empty list) or
  // 'error' is the fetch's own terminal signal — either one means no more sessions are
  // ever coming, so this block has definitively nothing to show.
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
