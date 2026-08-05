import { detectUserTimezone } from './time.js';

// Legacy fallback for FilterPanel.js, which indexes sessions by category id, not by
// ESP attributeId; the authored categories are exposed separately as authoredFilterCategories.
const DEFAULT_FILTER_CATEGORIES = [
  { id: 'track', label: 'Channel' },
  { id: 'type', label: 'Session Type' },
];

// Config comes solely from the data-session-guide-config attribute decorate.js sets
// (decoded via parseEncodedConfig); there is no authoring-table path.
// headings/behaviorFlags/swimlaneOrder/authoredFilterCategories aren't consumed by the
// component tree yet — keep returning them for callers not yet wired up to read them.
export function parseSessionsGuideConfig(el, { logPrefix, forcedSurface } = {}) {
  let authored = {};
  try {
    authored = JSON.parse(el.dataset.sessionGuideConfig || '{}');
  } catch {
    window.lana?.log(`[${logPrefix}] invalid data-session-guide-config JSON`);
  }

  const surface = forcedSurface || authored.surface || 'widget';
  // Default theme by surface when not explicitly authored:
  // widget → dark (overlaid drawer sits on any host page background)
  // page   → light (full-page layout; dark tokens cascade into all rendered content)
  const theme = authored.theme || (surface === 'page' ? 'light' : 'dark');

  return {
    eventId: authored.eventId,
    surface,
    theme,
    userTz: detectUserTimezone(),
    filterCategories: DEFAULT_FILTER_CATEGORIES,
    headings: authored.headings,
    behaviorFlags: authored.behaviorFlags,
    swimlaneOrder: authored.swimlaneOrder,
    authoredFilterCategories: authored.filterCategories,
  };
}
