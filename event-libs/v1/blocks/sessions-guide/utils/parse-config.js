import { detectUserTimezone } from './time.js';

// Legacy fallback for FilterPanel.js, which still filters directly against session
// fields by id (s[id]) — untouched until it's rewired to consume the ESP-derived
// authoredFilterCategories shape below (deferred, separate work).
const DEFAULT_FILTER_CATEGORIES = [
  { id: 'track', label: 'Channel' },
  { id: 'type', label: 'Session Type' },
];

// Reads the block's config from the data-session-guide-config attribute that
// decorate.js's prebuildAutoBlock sets at decoration time (Session Guide
// Configurator's Copy Link output, decoded there via parseEncodedConfig). There's no
// authoring-table path anymore — the URL-encoded config is the only source of truth.
//
// Only surface/theme/userTz/registerUrl are consumed by the component tree today.
// headings/behaviorFlags/swimlaneOrder/authoredFilterCategories are carried through
// as new fields so they're available once DrawerHeader.js/FilterPanel.js/
// OnDemandView.js are rewired to read them — that rewiring is separate work.
// filterCategories itself is deliberately left as the legacy track/type default
// above (not the new authored shape) to avoid silently breaking FilterPanel.js,
// which indexes sessions by category id, not by ESP attributeId.
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
