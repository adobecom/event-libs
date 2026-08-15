import { detectUserTimezone } from './time.js';

// Session Guide Configurator's authored filterCategories entries — { attributeId, label,
// displayName, enabled } — map to FilterPanel.js's { id, label } shape; `id` becomes the
// attributeId, which session-filters.js's getFilterValue() resolves against each
// session's customAttributeValues map. Disabled entries are dropped; array order is
// preserved as display order.
function mapAuthoredFilterCategories(authoredCategories) {
  return authoredCategories
    .filter((c) => c.enabled !== false)
    .map((c) => ({ id: c.attributeId, label: c.displayName || c.label }));
}

// Config comes solely from the data-session-guide-config attribute decorate.js sets
// (decoded via parseEncodedConfig); there is no authoring-table path.
// headings (DrawerHeader.js), behaviorFlags (behavior-flags.js's isBehaviorEnabled(),
// read by LiveCard/SessionCard/SessionDetailOverlay), swimlaneOrder (groupByTrack()'s
// callers), recommendedSessions (LiveUpcomingView.js/OnDemandView.js), and
// filterCategories (FilterPanel.js/session-filters.js) are all consumed.
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
    // No authored config, every category disabled, or a malformed (non-array)
    // filterCategories value all naturally yield [] — which FilterPanel.js already
    // renders as no panel at all (filters are opt-in, not defaulted) — rather than
    // throwing out of the whole parse on a corrupted/hand-edited config.
    filterCategories: Array.isArray(authored.filterCategories)
      ? mapAuthoredFilterCategories(authored.filterCategories)
      : [],
    headings: authored.headings,
    behaviorFlags: authored.behaviorFlags,
    swimlaneOrder: authored.swimlaneOrder,
    recommendedSessions: authored.recommendedSessions,
  };
}
