import { createTag, getMetadata } from '../../../utils/utils.js';
import { sessions, initSessionState, liveStreamActiveIds } from '../../../utils/session-store.js';
import { deriveSessionState, getNowMs } from '../../../utils/session-state.js';
import { extractCustomAttributeSlugs } from '../../../services/sessions/sessions-api.js';

const BLOCK_CSS_URL = new URL('./video-playlist.css', import.meta.url).href;

const DEFAULT_MIN_SESSIONS = 4;
const DESKTOP_BREAKPOINT_PX = 1024;
const DRAWER_GAP_PX = 16;
const DRAWER_FLOOR_PX = 75;
const TITLE_LINE_CAP = 2;

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

// Matches OTHER sessions whose "Playlist assignment/name" includes any of the given
// topic value(s) — no mapping table between PISP/PAN needed, both draw from the same
// slug vocabulary (validated against real session-catalog data: see sessions-api.js's
// playlistAssignment/playlistOnSessionPage fields). Only on-demand rows qualify; fewer
// than minSessions qualifying rows renders nothing at all (page just doesn't show a
// playlist). `topics` is resolved by the caller — see resolveCurrentSessionTopics below —
// deliberately not looked up from allSessions here, since the current session's own topic
// value should come from the page's own metadata when available, not require that session
// to already be present in the fetched catalog.
export function resolveTopicPlaylist(currentSessionId, topics, allSessions, minSessions = DEFAULT_MIN_SESSIONS) {
  if (!topics.length) return [];

  const nowMs = getNowMs();
  const rows = allSessions.filter((s) => s.id !== currentSessionId
    && (s.playlistAssignment || []).some((t) => topics.includes(t))
    && isOnDemand(s, nowMs));

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
// against real data. Only 'mpc' URLs are confirmed directly iframe-embeddable as-is;
// other providers (youtube, mobile-rider) likely need their own embed conventions, not
// yet confirmed.
const EMBEDDABLE_PROVIDER = 'mpc';

function pickEmbeddableVideoUrl(sessionTimes) {
  const videos = (sessionTimes || []).flatMap((t) => t?.videos || []);
  return videos.find((v) => v.provider === EMBEDDABLE_PROVIDER)?.url || null;
}

// Mirrors Milo's own adobetv.js autoblock output exactly (class names, iframe attrs) —
// see node_modules/@adobecom/milo/libs/blocks/adobetv/adobetv.js — so a container built
// here picks up the same global .milo-video sizing (libs/styles/iframe.css) a real
// Milo-decorated embed would, whether or not one was already authored on the page.
function buildMiloVideo(url) {
  const container = createTag('div', { class: 'milo-video' });
  createTag('iframe', {
    src: url,
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

// Loads the current session's own video into the player mounted alongside this block
// (the Individual Session Page's own `.milo-video` container, in the same .section).
// Real pages have been seen with no video block authored in the section at all (just
// this block) — in that case (or when only a `.mobile-rider` container is present, which
// can't host an AdobeTV iframe as-is), builds a fresh `.milo-video` container and inserts
// it as a sibling, same markup a real Milo-decorated embed would have.
function loadVideoPlayer(el, url) {
  const section = el.closest('.section');
  if (!section) return false;

  const existingMiloVideo = section.querySelector('.milo-video');
  if (existingMiloVideo) {
    existingMiloVideo.replaceChildren(buildMiloVideo(url).firstElementChild);
    return true;
  }

  section.querySelector('.mobile-rider')?.remove();
  section.insertBefore(buildMiloVideo(url), el);
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

function buildRow(item, { onSelect }) {
  const row = createTag('button', {
    type: 'button',
    class: 'video-playlist-row',
    role: 'listitem',
    'data-item-id': item.id,
    ...(item.href ? { 'data-href': item.href } : {}),
    ...analyticsAttrs('playlist-item-select'),
  });

  if (item.thumbnailUrl) {
    createTag('img', { class: 'video-playlist-row-thumb', src: item.thumbnailUrl, alt: '' }, '', { parent: row });
  }

  const meta = createTag('div', { class: 'video-playlist-row-meta' }, '', { parent: row });
  createTag('span', { class: 'video-playlist-row-title' }, item.title, { parent: meta });
  if (item.durationLabel) {
    createTag('span', { class: 'video-playlist-row-duration' }, item.durationLabel, { parent: meta });
  }

  row.addEventListener('click', () => onSelect(item, row));
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
        // pickEmbeddableVideoUrl/loadVideoPlayer in init()).
        onSelect: (item) => {
          if (item.href) window.location.assign(item.href);
        },
      },
    );
    list.append(row);
  });
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

  // The page's own video, loaded from its own `session-times` metadata — independent of
  // whether the topic-playlist/chapters list below ends up rendering at all, and of
  // whether a video block was separately authored in this section.
  const currentVideoUrl = pickEmbeddableVideoUrl(parseJsonMetadata('session-times'));
  if (currentVideoUrl) loadVideoPlayer(el, currentVideoUrl);

  initSessionState();

  const minSessions = Number.parseInt(cfg['minimum-sessions'], 10) || DEFAULT_MIN_SESSIONS;
  const chapters = parseChapters(cfg.chapters);

  const render = (sessionList) => {
    const current = sessionList.find((s) => s.id === sessionId);
    const isChapterVariant = chapters.length > 0 || isKeynoteFromMetadata || (!pageCustomAttributes && current?.isKeynote);

    const topics = resolveCurrentSessionTopics(pageCustomAttributes, current);
    const rows = isChapterVariant ? chapters : resolveTopicPlaylist(sessionId, topics, sessionList, minSessions);
    if (!rows.length) {
      el.remove();
      return;
    }

    el.replaceChildren();

    const toggle = createTag('button', {
      type: 'button',
      class: 'video-playlist-toggle',
      'aria-expanded': 'false',
      ...analyticsAttrs('playlist-toggle-switch'),
    }, 'Playlist', { parent: el });

    const title = isChapterVariant ? 'Chapters' : (cfg['playlist-title'] || 'More like this');
    createTag('h3', { class: 'video-playlist-title' }, title, { parent: el });

    if (isChapterVariant) buildChaptersView(el, rows);
    else buildTopicView(el, rows);

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
