import { createTag, getMetadata } from '../../../utils/utils.js';
import {
  sessions, initSessionState, liveStreamActiveIds, favorited, pendingActions,
} from '../../../utils/session-store.js';
import { deriveSessionState, getNowMs } from '../../../utils/session-state.js';
import { extractCustomAttributeSlugs } from '../../../services/sessions/sessions-api.js';
import { toggleFavoriteWithFeedback } from '../../../services/sessions/action-feedback.js';
import { readBackgroundConfig } from '../../utils/background-config.js';

// Matches the placeholder upcoming-sessions.js uses for the same call — no shared,
// page-level "eventConfig" builder exists yet with this exact {title, registerUrl} shape
// (see action-feedback.js's showAuthToast), so every caller currently hand-rolls one.
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
// Absolute minimum expanded height — roughly one playlist row's worth — so a very
// short viewport (where titleBottom + gap would otherwise squeeze the drawer down to
// almost nothing) still shows at least a sliver of the list, not just the title bar.
const DRAWER_MIN_EXPANDED_PX = 150;
const TITLE_LINE_CAP = 2;
const AUTOPLAY_STORAGE_KEY = 'video-playlist:play-all';
const PROGRESS_STORAGE_KEY = 'video-playlist:progress';
const SHOW_MORE_INITIAL_ROWS = 4;
// Authorable ceiling on total rows ever rendered (default 7 when not authored) — distinct
// from SHOW_MORE_INITIAL_ROWS above, which only controls how many of THOSE rows are
// visible before "Show more" is clicked. Rows beyond this cap are never built at all,
// regardless of how many actually qualify.
const DEFAULT_MAX_SESSIONS = 7;

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

// Per-session watch progress, keyed by the SESSION's own id rather than any provider's
// video id — written by video-player.js (a separate block, on whichever page actually
// embeds that session's video), read here purely from localStorage to render each row's
// progress bar/duration. This block never writes progress itself.
export function getVideoProgress(sessionId) {
  return readJson(PROGRESS_STORAGE_KEY, {})[sessionId] || null;
}

// 0-100, clamped — `completed` reflects the LAST saved secondsWatched, not a permanent
// once-true flag, so a rewatch after finishing correctly recomputes a lower percentage.
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

/**
 * Drawer expand cap ("Option B"): the drawer's open height may never push its top edge
 * above titleBottom + gap (i.e. it can never fully cover the session title), NOR above
 * playerBottom + gap (i.e. it can never cover the video player either, wherever that
 * player's own bottom edge is — see the drag handler's own measurement for how this is
 * found across a fragment boundary). Whichever constraint is more restrictive (smaller
 * cap) wins. Falls back to a fraction of the viewport when the title hasn't been
 * measured yet (first paint). Never returns less than DRAWER_MIN_EXPANDED_PX, even if
 * both constraints would otherwise squeeze it smaller — a very short viewport still
 * shows at least a sliver of the list rather than being crushed to the title bar alone.
 */
export function computeDrawerCapPx(viewportHeight, titleBottom, {
  floor = 0, gap = 0, playerBottom = null, minExpanded = 0,
} = {}) {
  if (titleBottom == null) return Math.max(floor, viewportHeight * 0.7);
  const titleCap = viewportHeight - titleBottom - gap;
  const playerCap = playerBottom == null ? Infinity : viewportHeight - playerBottom - gap;
  return Math.max(floor, minExpanded, Math.min(titleCap, playerCap));
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

// Delegates to the shared deriveSessionState utility (not a plain nowMs > endTimeUtc
// comparison) specifically FOR its MR-stream awareness: an MR-backed session
// (mrStreamId present) can still be genuinely live/in-progress past its own
// SCHEDULED end time if Mobile Rider's poll API reports the stream still active — the
// authored end time is only ever a plan, not a guarantee the session actually ended on
// schedule. A candidate only belongs in the playlist once it's truly in the on-demand
// state, not merely "past its scheduled end time."
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
// elsewhere). Scheduled sessions are unaffected — they still premiere via isOnDemand
// above (their own endTimeUtc, MR-stream-aware). No DVR time configured at all
// (0/missing) means the IPOD recording has no wait — available immediately (with a
// video source, already required separately by the caller), not gated on eventStartMs
// at all.
function hasPremiered(session, eventStartMs, nowMs) {
  if (session.startTimeUtc && session.endTimeUtc) return isOnDemand(session, nowMs);
  if (!session.dvrTimingHours) return true;
  if (eventStartMs == null) return false;
  return nowMs >= eventStartMs + session.dvrTimingHours * MS_PER_HOUR;
}

// The CURRENT session's own end time — unlike hasPremiered above (which resolves OTHER
// candidate rows against the fetched catalog), this reads directly off the page's own
// `session-times` metadata (confirmed real shape: an array of entries each carrying their
// own `endTimeMillis`, epoch ms, as a sibling of `videos`), so it's known synchronously at
// init() time — no catalog fetch to wait on. There's no point loading the player (or
// showing "more like this") for a session that hasn't actually ended yet. Permissive when
// the field is missing/malformed (matches this block's prior no-check behavior) rather
// than hiding a page we can't positively evaluate.
function currentSessionHasEnded(sessionTimes, nowMs) {
  const entry = (sessionTimes || [])[0];
  if (!entry || !Number.isFinite(entry.endTimeMillis)) return true;
  return nowMs >= entry.endTimeMillis;
}

// Same check video-player.js's pickEmbeddableVideo uses to decide whether it has
// anything to embed at all (duplicated deliberately rather than shared via an event/
// import, per product: this block should render only when the player itself would
// actually have something playing, using the same logic it uses — not a separate "did
// the player block actually load" signal from a cross-block event). onDemand-gated the
// same way: a page whose only video entry is e.g. a liveStream is treated as having no
// embeddable video at all, matching the player's own strict onDemand-only selection —
// no point showing "more like this" alongside a page with nothing actually playing.
const EMBEDDABLE_PROVIDERS = ['mpc', 'youtube'];

function hasEmbeddableVideo(sessionTimes) {
  const videos = (sessionTimes || []).flatMap((t) => t?.videos || []);
  return videos.some((v) => EMBEDDABLE_PROVIDERS.includes(v.provider) && v.kind === 'onDemand');
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
// Ascending by the session's own scheduled start time — IPOD sessions (no session-times
// of their own, startTimeUtc is '') have no real start time to compare, so they sort
// after every scheduled session rather than at an arbitrary position. Array.sort is
// already stable (spec-guaranteed since ES2019), so IPOD sessions keep their original
// catalog-relative order among themselves, same as scheduled sessions with an identical
// start time.
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

  // A Set so each session's own membership check is O(1) rather than re-scanning the
  // full topics array per playlistAssignment value, per session — this loop already
  // runs over the WHOLE catalog on every call, so an O(n) lookup repeated per session
  // adds up fast on a large event with hundreds of sessions.
  const topicSet = new Set(topics);
  const nowMs = getNowMs();
  const rows = allSessions.filter((s) => s.id !== currentSessionId
    && s.hasVideoSource
    && (s.playlistAssignment || []).some((t) => topicSet.has(t))
    && hasPremiered(s, eventStartMs, nowMs));

  return rows.length >= minSessions ? rows.slice().sort(compareByStartTime) : [];
}

// Individual Session Pages carry the current session's own identity as page metadata —
// `session-id` (its real catalog id) and `custom-attributes` (its full raw customAttributes
// blob, same shape sessions-api.js reads from the live catalog). `Playlist on session
// page` is a hard gate, not just a data source with a fallback: if the current
// session's own custom attributes don't carry it at all, this session has no playlist
// — full stop, regardless of whether the fetched catalog might have a value for it
// under playlistOnSessionPage. No catalog fallback is consulted for this at all.
export function resolveCurrentSessionTopics(pageCustomAttributes) {
  return extractCustomAttributeSlugs({ customAttributes: pageCustomAttributes || [] }, 'Playlist on session page');
}

function formatDuration(minutes) {
  if (!minutes) return '';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h}h ${m}m` : `${m}m`;
}

// Adobe Analytics reads these declaratively (daa-ll/daa-lh), same convention already
// visible on every other block in this codebase — not a custom JS event dispatch.
function analyticsAttrs(linkName) {
  return { 'daa-ll': linkName };
}

// Live-updates the current session's OWN row (pinned first in the topic playlist, per
// its "now playing" highlight — see render()) as its video actually plays. This block no
// longer embeds/tracks the player itself (see video-player.js, a separate block/fragment
// on the same page) — it's called in response to that block's own
// 'video-player:progress' custom event (see the listener wired in render() below),
// reading progress purely from localStorage rather than any player state directly.
function updateRowProgressUI(sessionId) {
  const row = [...document.querySelectorAll('.video-playlist-row')]
    .find((r) => r.dataset.itemId === sessionId);
  if (!row) return;
  const progress = getVideoProgress(sessionId);
  const fill = row.querySelector('.video-playlist-row-progress-fill');
  if (fill) fill.style.width = `${computeProgressPercent(progress)}%`;
  // Self-corrects the row's own duration label the moment the real, player-reported
  // length is known — the catalog's own scheduled-slot duration can genuinely differ
  // from it (see buildTopicView).
  const durationEl = row.querySelector('.video-playlist-row-duration');
  if (durationEl && progress?.length) durationEl.textContent = formatDuration(Math.round(progress.length / 60));
}

// .video-player may live in a sibling fragment (the two-column mobile/tablet layout),
// so a plain el.closest('.section') never reaches it — same structural lookup
// announceVideoDecision/isInsidePlaylistContainer already use elsewhere in this repo.
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
    // aria-expanded belongs on the toggle button (the ARIA disclosure control), not the
    // drawer content it controls — this.el only ever gets the CSS state class.
    this.toggleEl = toggleEl;
    this.handleEl = handleEl;
    this.expanded = false;
    // Persisted across resizes/re-applies while dragging is in progress — a live
    // px value the user chose via the handle, distinct from the two fixed floor/cap
    // states toggle() switches between. Cleared back to null on toggle() so a chevron
    // tap always returns to one of those two clean, known states.
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

  // The single, authoritative expanded-height ceiling — never covers the title's first
  // TITLE_LINE_CAP lines, never covers the player, never smaller than
  // DRAWER_MIN_EXPANDED_PX. Used both by the fixed expand/collapse states AND as the
  // upper clamp while dragging, so a drag gesture can never exceed what a chevron tap
  // would already allow.
  measureCapPx() {
    return computeDrawerCapPx(window.innerHeight, this.measureTitleBottom(), {
      floor: DRAWER_FLOOR_PX,
      gap: DRAWER_GAP_PX,
      playerBottom: findPlayerBottom(this.el),
      minExpanded: DRAWER_MIN_EXPANDED_PX,
    });
  }

  // Guarded here, not just at call sites — confirmed live: the window resize listener
  // (see render() below) called this directly, bypassing #apply()'s own isDesktop()
  // check, so resizing the browser at ANY width (including full desktop) was setting an
  // inline max-height meant only for the mobile bottom-sheet, visibly squeezing the
  // desktop card. Desktop's own height comes from plain CSS (max-height: 100% within
  // its flex row), never from this JS-computed cap.
  applyMobileHeight() {
    if (this.isDesktop()) {
      this.el.style.maxHeight = '';
      return;
    }
    const cap = this.measureCapPx();
    if (this.dragHeightPx != null) {
      this.el.style.maxHeight = `${Math.min(Math.max(this.dragHeightPx, DRAWER_FLOOR_PX), cap)}px`;
      return;
    }
    this.el.style.maxHeight = this.expanded ? `${cap}px` : `${DRAWER_FLOOR_PX}px`;
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

  // Real drag-to-resize on the handle bar — per the Figma annotation ("Drawer can be
  // swiped up to open all the way, or swiped down to close"): dragging moves the
  // drawer's top edge freely between DRAWER_FLOOR_PX (fully collapsed) and this.cap
  // (title/player-avoiding ceiling, same one the chevron toggle respects), rather than
  // only jumping between those two fixed states. Pointer Events (not separate touch/
  // mouse listeners) so the same code path covers touchscreens and mouse-drag alike.
  #bindDrag() {
    let dragStartY = null;
    let dragStartHeight = null;

    const onPointerMove = (event) => {
      if (dragStartY == null) return;
      const cap = this.measureCapPx();
      const delta = dragStartY - event.clientY;
      const next = Math.min(Math.max(dragStartHeight + delta, DRAWER_FLOOR_PX), cap);
      this.dragHeightPx = next;
      this.el.style.maxHeight = `${next}px`;
    };

    const onPointerUp = () => {
      if (dragStartY == null) return;
      dragStartY = null;
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      // Snaps to whichever fixed state the drag ended closer to, so releasing mid-drag
      // doesn't leave the drawer parked at an arbitrary height with no toggle affordance
      // (aria-expanded/the chevron's own rotation) reflecting it correctly.
      const cap = this.measureCapPx();
      const midpoint = (DRAWER_FLOOR_PX + cap) / 2;
      const endedHeight = this.dragHeightPx ?? dragStartHeight;
      this.dragHeightPx = null;
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
const TOGGLE_CHEVRON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="17" height="10" viewBox="0 0 17 10" fill="none" aria-hidden="true"><path d="M16.7969 0.992758C16.7969 1.24793 16.6966 1.50437 16.4973 1.69481L9.08321 8.8283C8.70616 9.19265 8.10948 9.19265 7.73243 8.8283L0.300593 1.6783C-0.0878861 1.30505 -0.0993168 0.686787 0.273927 0.300856C0.64717 -0.0876221 1.26416 -0.10031 1.65137 0.274194L8.40782 6.77292L15.1465 0.290691C15.5337 -0.0838252 16.1507 -0.0711232 16.5239 0.317355C16.7067 0.505244 16.7969 0.748995 16.7969 0.992758Z" fill="#DBDBDB"/></svg>';
// Per Figma's "Show more" spec — distinct from TOGGLE_CHEVRON_SVG (the mobile drawer's
// own chevron), which wasn't part of this spec.
const SHOW_MORE_CHEVRON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="5" viewBox="0 0 8 5" fill="none" aria-hidden="true"><path d="M1 1L4 4L7 1" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function setFavoriteButtonState(button, item, isFav) {
  button.classList.toggle('is-favorited', isFav);
  button.setAttribute('aria-pressed', String(isFav));
  button.setAttribute('aria-label', `${isFav ? 'Remove' : 'Add'} ${item.title} ${isFav ? 'from' : 'to'} favorites`);
  button.setAttribute('daa-ll', isFav ? 'playlist-item-unfavorite' : 'playlist-item-favorite');
}

// The favorite button is a real, separate <button> sibling — never nested inside the
// row's own <button>-like control, which would be invalid HTML. See buildRow: the row
// itself is a plain div (not a <button>) specifically so this can sit alongside it.
//
// Same shared favorite mechanism upcoming-sessions.js/sessions-guide use (real RF-backed
// state via session-store.js's `favorited` signal + action-feedback.js's
// toggleFavoriteWithFeedback, not a local reimplementation) — `item` must carry the same
// `id`/`rfSessionId` fields sessions-api.js's normalized catalog objects already have
// (see buildTopicView), which is exactly what toggleFavoriteAction/toggleFavorite read.
function buildFavoriteButton(item) {
  const button = createTag('button', { type: 'button', class: 'video-playlist-row-favorite' }, FAVORITE_ICON_SVG);
  setFavoriteButtonState(button, item, favorited.value.has(item.id));

  button.addEventListener('click', async (event) => {
    // Otherwise this click would bubble up to the row's own click listener and also
    // trigger row selection/navigation.
    event.stopPropagation();
    if (pendingActions.value.has(item.id)) return;
    // toggleFavoriteWithFeedback degrades gracefully on its own (login/registration
    // toast) rather than throwing — the `favorited` signal (and so this button, via the
    // subscription set up in buildTopicView) only actually updates once it succeeds.
    await toggleFavoriteWithFeedback(item, {
      eventConfig: EVENT_CONFIG,
      isFavorited: favorited.value.has(item.id),
    });
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

// Every row is a topic-playlist row — real <a href> (navigates to the matched session's
// own page) rather than a synthetic click handler, giving native browser affordances
// (status-bar URL preview on hover, right-click/middle-click/ctrl-click "open in new
// tab"). The outer row stays a plain div, not the <a> itself — the favorite/play
// <button>s below must sit outside the anchor (an <a> can never validly contain another
// focusable control), so the row is the shared container for both the real <a>
// (thumbnail/title/progress) and the actions column, as siblings.
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

  // Favorite + play sit stacked together as a hover/focus-revealed action column (per
  // Figma's "Hover" row state) — outside the <a> above, as its sibling, since a <button>
  // can never nest inside a real <a> any more than inside a real <button>.
  const actions = createTag('div', { class: 'video-playlist-row-actions' }, '', { parent: row });
  actions.appendChild(buildFavoriteButton(item));
  actions.appendChild(buildPlayButton(activate));

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
  // Rows beyond the configured (or default) max are never built at all — not just
  // hidden — so "Show more" can never reveal more than this ceiling. The current
  // session (prepended by render() when present) counts toward this same cap.
  const rows = allRows.slice(0, maxSessions);
  const list = createTag('div', { class: 'video-playlist-list', role: 'list' }, '', { parent: el });
  rows.forEach((session) => {
    const row = buildRow(
      {
        id: session.id,
        // toggleFavoriteAction/toggleFavorite (session-store.js) read this off the
        // session object passed to buildFavoriteButton — sessions-api.js's normalized
        // catalog objects already carry it, so no extra lookup/mapping is needed.
        rfSessionId: session.rfSessionId,
        title: session.title,
        // Falls back to the author-configured default-thumbnail when this particular
        // session has none of its own — otherwise the row would render with no thumbnail
        // (and no play-icon overlay, since that's gated on thumbnailUrl too).
        thumbnailUrl: session.thumbnailUrl || defaultThumbnail,
        // The catalog's own `duration` is the originally-scheduled slot length (minutes)
        // — it can genuinely differ from the real recorded video's own length (edits,
        // Q&A trimmed, etc.), which is exactly what the visible player reports. Prefer
        // the real, player-reported length (seconds, saved locally the first time either
        // this or the current session's own page actually loaded that video) whenever
        // it's known, so the row's duration matches what the player itself shows.
        durationLabel: (() => {
          const realLengthSeconds = getVideoProgress(session.id)?.length;
          return realLengthSeconds
            ? formatDuration(Math.round(realLengthSeconds / 60))
            : formatDuration(session.duration);
        })(),
        href: session.sessionPageUrl,
      },
      {
        // Navigates to the selected session's own page — always correct, since every
        // session already has a working page, and that page's own video-player block
        // loads its video from its own `session-times` metadata the same way.
        onSelect: (item) => {
          if (item.href) window.location.assign(item.href);
        },
      },
    );
    list.append(row);
  });

  // Marks the current session's own row as "now playing" so the viewer can tell which
  // one is theirs.
  if (currentSessionId) highlightRow(list, currentSessionId);

  // Reflects favorite/unfavorite actions taken anywhere else on the page (or a previous
  // page, since `favorited` is populated from the real RF backend, not per-block state) —
  // same live-update pattern upcoming-sessions.js uses for its own favorite buttons.
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

  // Desktop-only affordance (hidden on mobile via CSS — the bottom-sheet already
  // scrolls its full list) — reveals rows beyond SHOW_MORE_INITIAL_ROWS (up to the
  // maxSessions ceiling above) via CSS, so it never touches the mobile drawer's own
  // unrelated `is-expanded` state (see Drawer). The list itself gets an internal scroll
  // once expanded (see .video-playlist-list.is-showing-more in the CSS) so the header
  // stays in view even when maxSessions is large.
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

// "Play all": a checkbox next to the topic playlist that persists across the full-page
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

// Two whole SECTIONS are authored on every session page — a full-width, player-only
// section, and a two-column section (this block's own) shared with OTHER, unrelated
// blocks (event-featured-products, event-speakers, event-session-resources, etc.) —
// each with its OWN, separate `.video-player` block instance. Neither embeds a video in
// its own init() — both instances wait for this decision first (see video-player.js's
// own awaitEmbedDecision), so dispatching it here is what actually triggers the WINNING
// instance to embed for the first time; the LOSING instance never embeds at all.
// Dispatched exactly once, as early as possible (every early-exit path in init()/
// render() below routes through removeBlock(), so nothing can forget to announce it).
// Only the LOSING section is torn down — with a fade-out transition (see .is-collapsing
// in the CSS) so the layout settles smoothly instead of an abrupt empty-space jump.
//
// Deliberately NOT keyed off an authored marker class (`.video-container`/
// `.video-playlist-container`) — a real page has been seen where that Section Metadata
// Style row was missing, which silently broke this entirely with no visible error.
// Instead: every `.section` on the page that contains a `.video-player` is a candidate
// (there are exactly two — the full-width player-only one, and this block's own,
// alongside `.video-playlist`); whichever one does NOT match `hasPlaylist`'s outcome is
// the loser. `.grid-column` is the fragment-loader wrapper each `.video-player` actually
// sits inside — its own parent is the real shared ancestor to search from, since a
// fragment's own inner `.section` (`el.closest('.section')` alone) never reaches its
// sibling fragment's content.
function findVideoSections() {
  return [...new Set([...document.querySelectorAll('.video-player')]
    .map((player) => player.closest('.grid-column')?.parentElement?.closest('.section') || player.closest('.section'))
    .filter(Boolean))];
}

function announceVideoDecision(hasPlaylist) {
  // Milo inits each block's own module independently — there's no guarantee
  // video-player.js's own 'video-playlist:decision' listener is already attached by
  // the time this fires (block init order isn't strictly sequenced). A transient
  // CustomEvent alone could be missed entirely by a late listener, stalling the WINNING
  // player behind its own multi-second fallback timeout. Latching the result on window
  // lets a late listener read it synchronously instead of only ever listening for the
  // event — see video-player.js's own awaitEmbedDecision.
  window.__videoPlaylistDecision = hasPlaylist;
  window.dispatchEvent(new CustomEvent('video-playlist:decision', { detail: { hasPlaylist } }));
  const losingSection = findVideoSections()
    .find((section) => Boolean(section.querySelector('.video-playlist')) !== hasPlaylist);
  if (!losingSection || losingSection.classList.contains('is-collapsing')) return;
  losingSection.classList.add('is-collapsing');
  losingSection.addEventListener('transitionend', () => losingSection.remove(), { once: true });
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

  // Same authored "Background" row + shared C2 utility every other block in this
  // section (event-featured-products, event-speakers, event-session-resources,
  // event-session-details) already uses — read before render() below ever touches
  // el's children. An inline style deliberately outranks the light/dark --vp-bg theme
  // token below, matching those other blocks' own convention of overriding their
  // default background when one is authored.
  // Set as a custom property, not `background` directly — an inline `background` would
  // have higher specificity than the mobile drawer's own dark-theme --vp-bg at every
  // width, including the ≤1023px bottom-sheet, which must keep its own dark background
  // regardless of what's authored here (confirmed regression: the authored value was
  // bleeding into the mobile drawer). CSS decides whether/where --vp-authored-bg
  // actually applies (see the min-width:1024px rule using it) — desktop only.
  const background = readBackgroundConfig(el);
  if (background) el.style.setProperty('--vp-authored-bg', background);

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
    removeBlock(el);
    return;
  }

  const sessionTimes = parseJsonMetadata('session-times');
  // No point recommending "more like this" alongside a page that has no video actually
  // playing at all — same check video-player.js uses to decide whether it has anything
  // to embed (see hasEmbeddableVideo above).
  if (!hasEmbeddableVideo(sessionTimes)) {
    window.lana?.log('[video-playlist] no embeddable video on this page — nothing to render');
    removeBlock(el);
    return;
  }

  // No recording to show (or "more like this" to recommend) for a session that hasn't
  // actually ended yet — checked synchronously off the page's own session-times metadata
  // (real shape confirmed: each entry carries its own endTimeMillis, epoch ms, as a
  // sibling of videos), not the catalog, so this never has to wait on sessions.value.
  if (!currentSessionHasEnded(sessionTimes, getNowMs())) {
    window.lana?.log('[video-playlist] current session has not ended yet — nothing to render');
    removeBlock(el);
    return;
  }

  const pageCustomAttributes = parseJsonMetadata('custom-attributes');
  // Same page-metadata key event-agenda.js already reads for the event's own start time —
  // needed for IPOD sessions' premiere formula (see hasPremiered above). One event start
  // time applies to every session in the topic playlist, not just the current one.
  const eventStartMs = (() => {
    const ms = Number(getMetadata('local-start-time-millis'));
    if (Number.isFinite(ms) && ms > 0) return ms;
    return FALLBACK_EVENT_START_MS;
  })();

  // video-player.js (a separate block, on whichever page actually embeds this session's
  // video) dispatches this on its own progress-tracking row once progress changes —
  // page-wide listener since the two blocks may live in entirely separate grid-column
  // fragments with no common ancestor below <body>.
  window.addEventListener('video-player:progress', (event) => {
    updateRowProgressUI(event.detail.sessionId);
  });

  // "Play all" advance is owned entirely here, not by video-player.js — that block only
  // reports raw playback state (play/pause/ended); THIS block decides whether/where to
  // navigate, reading its own "Play all" preference and resolving the next session off
  // its own rendered rows (the first row whose data-item-id isn't the current session,
  // in whatever order render() below produced — see resolveTopicPlaylist's own
  // ascending-by-start-time sort). Ignores play/pause events entirely; only 'ended'
  // matters, and only for the CURRENT session's own video (a different session's video
  // is never embedded on this page).
  window.addEventListener('video-player:state', (event) => {
    if (event.detail.sessionId !== sessionId) return;
    if (event.detail.state !== 'ended') return;
    if (!getShouldAutoPlay()) return;
    const nextRow = [...el.querySelectorAll('.video-playlist-row[data-href]')]
      .find((row) => row.dataset.itemId !== sessionId);
    if (!nextRow?.dataset.href) return;
    // window.location.assign itself isn't stubbable in a real browser test env (a
    // non-configurable Location property) — exposing the resolved target here is the
    // part of this behavior worth asserting on directly, same convention buildTopicView
    // already uses via each row's data-href.
    el.dataset.autoAdvanceHref = nextRow.dataset.href;
    window.location.assign(nextRow.dataset.href);
  });

  initSessionState();

  const minSessions = Number.parseInt(cfg['minimum-sessions'], 10) || DEFAULT_MIN_SESSIONS;
  const maxSessions = Number.parseInt(cfg['maximum-sessions'], 10) || DEFAULT_MAX_SESSIONS;
  const defaultThumbnail = cfg['default-thumbnail'] || '';

  // The current session isn't guaranteed to be present in the fetched catalog at all
  // (confirmed live: an IPOD test session's own entry, matching the page's own
  // session-id, was simply absent from the payload) — without this, `current` comes
  // back undefined, the current session's own row is never prepended to the list, and
  // highlightRow(list, sessionId) below silently finds nothing to highlight, since no
  // row in the list carries that id at all. Synthesizes a minimal stand-in directly
  // from page metadata/DOM so the current session's row (and its "now playing"
  // highlight) always exists, matching the design intent regardless of whether the
  // catalog happened to include it.
  function synthesizeCurrentSession() {
    const gridColumn = el.closest('.grid-column');
    const outerSection = gridColumn?.parentElement?.closest('.section') || el.closest('.section');
    const titleFromDom = outerSection?.querySelector('h1, h2')?.textContent?.trim();
    // If session-times carries its own startTimeMillis (unconfirmed on this shape —
    // only endTimeMillis is documented as always present), use it so this entry sorts
    // into its real chronological position via compareByStartTime, same as every other
    // row, rather than always falling to the end of the list.
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
    // The minSessions gate above is about OTHER qualifying sessions only — unaffected by
    // this. Including the current session is purely a display concern: the viewer sees
    // it as the highlighted/"now playing" row (see highlightRow call in buildTopicView
    // below), so they know which one is theirs, without it counting toward minSessions.
    // "Play all"'s actual next-session target is resolved by video-player.js (a separate
    // block) directly off these rendered rows' own data-href, not tracked here.
    //
    // Sorted into its correct chronological position alongside `rows` (NOT force-
    // prepended to the top) — the current session premiered at its own real start time
    // like any other, and the list is already sorted that way; pinning it first would
    // contradict the sort order rows already have.
    const displayRows = current ? [current, ...rows].sort(compareByStartTime) : rows;

    el.replaceChildren();

    // Real swipe-to-resize affordance — mobile-only (see CSS), hidden from assistive
    // tech since dragging it changes no information the toggle button below doesn't
    // already expose via aria-expanded (see Drawer's own #bindDrag).
    const handle = createTag('div', { class: 'video-playlist-handle', 'aria-hidden': 'true' }, '', { parent: el });

    const top = createTag('div', { class: 'video-playlist-top' }, '', { parent: el });

    const title = cfg['playlist-title'] || 'More like this';
    createTag('h3', { class: 'video-playlist-title' }, title, { parent: top });

    const toggle = createTag('button', {
      type: 'button',
      class: 'video-playlist-toggle',
      'aria-expanded': 'false',
      ...analyticsAttrs('playlist-toggle-switch'),
    }, TOGGLE_CHEVRON_SVG, { parent: top });

    buildAutoplayToggle(top);
    buildTopicView(el, displayRows, { maxSessions, defaultThumbnail, currentSessionId: sessionId });

    // .section is only this fragment's own inner wrapper on the two-column mobile/
    // tablet layout — the actual session title lives in a sibling fragment, same
    // structural-lookup limitation findPlayerBottom above works around.
    const gridColumn = el.closest('.grid-column');
    const outerSection = gridColumn?.parentElement?.closest('.section') || el.closest('.section');
    const titleEl = outerSection?.querySelector('h1, h2') || null;
    const drawer = new Drawer(el, { titleEl, toggleEl: toggle, handleEl: handle });
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
