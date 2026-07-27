import { detectUserTimezone } from './time.js';

// Shared by sessions-guide.js and sessions-guide-full-page.js so authoring-table keys
// only need to be handled in one place — previously duplicated per-file, which let
// sessions-guide-full-page.js's copy silently drift out of sync (missing the
// 'featured-sessions' case sessions-guide.js already supported).
const DEFAULT_FILTER_CATEGORIES = [
  { id: 'track', label: 'Channel' },
  { id: 'type', label: 'Session Type' },
];

export function parseSessionsGuideConfig(el, { logPrefix, forcedSurface } = {}) {
  const config = {
    title: '',
    filterCategories: DEFAULT_FILTER_CATEGORIES,
    featuredSessionIds: [],
    theme: null,
  };
  [...el.querySelectorAll(':scope > div')].forEach((row) => {
    const cells = row.querySelectorAll(':scope > div');
    const key = cells[0]?.textContent?.trim().toLowerCase();
    const val = cells[1]?.textContent?.trim();
    if (!key || val === undefined) return;
    switch (key) {
      case 'event-title': config.title = val; break;
      case 'theme': if (val) config.theme = val; break;
      case 'filter-categories':
        try { config.filterCategories = JSON.parse(val); } catch {
          window.lana?.log(`[${logPrefix}] invalid filter-categories JSON`);
        }
        break;
      case 'featured-sessions':
        try { config.featuredSessionIds = JSON.parse(val); } catch {
          window.lana?.log(`[${logPrefix}] invalid featured-sessions JSON`);
        }
        break;
      default: break;
    }
  });
  config.surface = forcedSurface || (el.classList.contains('page') ? 'page' : 'widget');
  config.userTz = detectUserTimezone();
  // Default theme by surface when not explicitly authored:
  // widget → dark (overlaid drawer sits on any host page background)
  // page   → light (full-page layout; dark tokens cascade into all rendered content)
  if (!config.theme) {
    config.theme = config.surface === 'page' ? 'light' : 'dark';
  }
  return config;
}
