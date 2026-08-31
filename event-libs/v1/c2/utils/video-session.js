import { getMetadata } from '../../utils/utils.js';

/**
 * Shared foundation for the `video-player` / `video-playlist` block pair. Both blocks
 * read the same page metadata, the same localStorage progress map, and the same
 * layout-decision store, so these live here rather than being maintained as two
 * hand-synced copies.
 */

/** BlockMediator key the two blocks coordinate their layout decision through. */
export const VIDEO_LAYOUT_DECISION_KEY = 'videoLayoutDecision';

/** localStorage key for the per-session watch-progress map. */
export const PROGRESS_STORAGE_KEY = 'video-playlist:progress';

/** Providers either block knows how to embed. */
export const EMBEDDABLE_PROVIDERS = ['mpc', 'youtube'];

/** Author-applied Section Metadata "Style" classes marking each candidate layout. */
export const VIDEO_CONTAINER_CLASS = 'video-container';
export const VIDEO_PLAYLIST_CONTAINER_CLASS = 'video-playlist-container';

function logError(scope, message) {
  window.lana?.log(`[${scope}] ${message}`);
}

/**
 * Whether a section carries the given Style-row class.
 *
 * Checking `classList` alone is NOT enough. Milo's own decorateSection() resets
 * `section.className = 'section'`, wiping every authored class; the Style row's classes
 * are re-applied later by the `section-metadata` BLOCK, on the normal block-loading
 * schedule. So a section can legitimately be mid-decoration — `class="section"
 * data-status="decorated"` with nothing else — at the moment these blocks run, which made
 * both video-player instances conclude they were the full-width one and both embed.
 *
 * The authored `.section-metadata` table is in the DOM from the start either way, so it's
 * read directly as the fallback (same approach event-marquee.js already uses for its own
 * section metadata).
 */
export function sectionHasStyle(section, styleClass) {
  if (!section) return false;
  if (section.classList.contains(styleClass)) return true;

  const metadataBlock = section.querySelector(':scope > .section-metadata');
  if (!metadataBlock) return false;

  return [...metadataBlock.querySelectorAll(':scope > div')].some((row) => {
    const [labelCell, valueCell] = row.querySelectorAll(':scope > div');
    if (labelCell?.textContent.trim().toLowerCase() !== 'style') return false;
    // Authored comma-separated, and spaces become dashes — same normalization
    // section-metadata.js applies before adding the classes.
    return (valueCell?.textContent || '')
      .split(',')
      .map((style) => style.trim().replaceAll(' ', '-'))
      .includes(styleClass);
  });
}

/** The nearest ancestor section carrying the given Style-row class, decorated or not. */
export function closestSectionWithStyle(el, styleClass) {
  let section = el?.closest('.section');
  while (section) {
    if (sectionHasStyle(section, styleClass)) return section;
    section = section.parentElement?.closest('.section');
  }
  return null;
}

/** The page's one section carrying the given Style-row class, decorated or not. */
export function findSectionWithStyle(styleClass) {
  return [...document.querySelectorAll('.section')]
    .find((section) => sectionHasStyle(section, styleClass)) || null;
}

/** Reads and parses a JSON value from localStorage, falling back on any failure. */
export function readJsonFromStorage(key, fallback, scope) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (error) {
    logError(scope, `localStorage read failed for "${key}": ${error.message}`);
    return fallback;
  }
}

/** Writes a JSON value to localStorage, swallowing quota/serialization failures. */
export function writeJsonToStorage(key, value, scope) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    logError(scope, `localStorage write failed for "${key}": ${error.message}`);
  }
}

/**
 * Individual Session Pages carry several JSON blobs as page metadata
 * (`custom-attributes`, `session-times`) — same parse-with-guard shape each time.
 */
export function parseJsonMetadata(name, scope) {
  const raw = getMetadata(name);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (error) {
    logError(scope, `invalid ${name} page metadata: ${error.message}`);
    return null;
  }
}

/**
 * Per-session watch progress, keyed by the SESSION's own id rather than any provider's
 * video id — only the session's own page ever embeds its video, so which session is
 * playing is always unambiguous.
 */
export function getVideoProgress(sessionId, scope) {
  return readJsonFromStorage(PROGRESS_STORAGE_KEY, {}, scope)[sessionId] || null;
}

/**
 * The current session's own end time, read straight off the page's own `session-times`
 * metadata so it's known synchronously — no catalog fetch to wait on. Permissive when
 * the field is missing or malformed, rather than hiding a page we can't positively
 * evaluate.
 */
export function currentSessionHasEnded(sessionTimes, nowMs) {
  const firstEntry = (sessionTimes || [])[0];
  if (!firstEntry || !Number.isFinite(firstEntry.endTimeMillis)) return true;
  return nowMs >= firstEntry.endTimeMillis;
}

/**
 * Every embeddable video entry across all `session-times` entries. Strictly
 * `onDemand`-only: a `liveStream` entry is never embeddable here, with no fallback —
 * these blocks only ever show the on-demand recording.
 */
export function findOnDemandVideos(sessionTimes) {
  return (sessionTimes || [])
    .flatMap((entry) => entry?.videos || [])
    .filter((video) => EMBEDDABLE_PROVIDERS.includes(video?.provider) && video?.kind === 'onDemand');
}

/**
 * Reads a block's authored key/value config rows into a plain object, lowercasing and
 * dash-normalizing each label the way every C2 block in this repo does.
 */
export function readAuthoredConfig(el) {
  return [...el.querySelectorAll(':scope > div > div:first-child')].reduce((config, labelCell) => {
    const key = labelCell.textContent.trim().toLowerCase().replace(/ /g, '-');
    return { ...config, [key]: labelCell.nextElementSibling?.textContent?.trim() || '' };
  }, {});
}

/**
 * The current session's id: page metadata first (the Individual Session Page's own
 * identity), falling back to an authored `session-id` row for authoring environments
 * where that metadata isn't present.
 */
export function resolveSessionId(config) {
  return getMetadata('session-id') || config['session-id'] || '';
}

/** Injects a stylesheet once per page, keyed by a stable element id. */
export function ensureStylesheet(id, href) {
  if (document.getElementById(id)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  link.id = id;
  document.head.append(link);
}
