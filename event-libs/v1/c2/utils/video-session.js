import { getMetadata } from '../../utils/utils.js';

export const VIDEO_LAYOUT_DECISION_KEY = 'videoLayoutDecision';

export const PROGRESS_STORAGE_KEY = 'session-video-playlist:progress';

export const EMBEDDABLE_PROVIDERS = ['mpc', 'youtube'];

export const VIDEO_CONTAINER_CLASS = 'session-video-container';
export const VIDEO_PLAYLIST_CONTAINER_CLASS = 'session-video-playlist-container';

function logError(scope, message) {
  window.lana?.log(`[${scope}] ${message}`);
}

export function sectionHasStyle(section, styleClass) {
  if (!section) return false;
  if (section.classList.contains(styleClass)) return true;

  const metadataBlock = section.querySelector(':scope > .section-metadata');
  if (!metadataBlock) return false;

  return [...metadataBlock.querySelectorAll(':scope > div')].some((row) => {
    const [labelCell, valueCell] = row.querySelectorAll(':scope > div');
    if (labelCell?.textContent.trim().toLowerCase() !== 'style') return false;

    return (valueCell?.textContent || '')
      .split(',')
      .map((style) => style.trim().replaceAll(' ', '-'))
      .includes(styleClass);
  });
}

export function closestSectionWithStyle(el, styleClass) {
  let section = el?.closest('.section');
  while (section) {
    if (sectionHasStyle(section, styleClass)) return section;
    section = section.parentElement?.closest('.section');
  }
  return null;
}

export function findSectionWithStyle(styleClass) {
  return [...document.querySelectorAll('.section')]
    .find((section) => sectionHasStyle(section, styleClass)) || null;
}

export function readJsonFromStorage(key, fallback, scope) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (error) {
    logError(scope, `localStorage read failed for "${key}": ${error.message}`);
    return fallback;
  }
}

export function writeJsonToStorage(key, value, scope) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    logError(scope, `localStorage write failed for "${key}": ${error.message}`);
  }
}

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

export function getVideoProgress(sessionId, scope) {
  return readJsonFromStorage(PROGRESS_STORAGE_KEY, {}, scope)[sessionId] || null;
}

export function currentSessionHasEnded(sessionTimes, nowMs) {
  const firstEntry = (sessionTimes || [])[0];
  if (!firstEntry || !Number.isFinite(firstEntry.endTimeMillis)) return false;
  return nowMs >= firstEntry.endTimeMillis;
}

export function findEmbeddableVideos(sessionTimes) {
  return (sessionTimes || [])
    .flatMap((entry) => entry?.videos || [])
    .filter((video) => EMBEDDABLE_PROVIDERS.includes(video?.provider));
}

export function readAuthoredConfig(el) {
  return [...el.querySelectorAll(':scope > div > div:first-child')].reduce((config, labelCell) => {
    const key = labelCell.textContent.trim().toLowerCase().replace(/ /g, '-');
    return { ...config, [key]: labelCell.nextElementSibling?.textContent?.trim() || '' };
  }, {});
}

export function resolveSessionId(config) {
  return getMetadata('session-id') || config['session-id'] || '';
}

export function ensureStylesheet(id, href) {
  if (document.getElementById(id)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  link.id = id;
  document.head.append(link);
}
