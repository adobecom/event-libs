import { detectUserTimezone } from './time.js';

// Authored { attributeId, displayName, enabled } -> FilterPanel's { id, label }. `id` is the
// attributeId getFilterValue() resolves against customAttributeValues. Order is display order.
function mapAuthoredFilterCategories(authoredCategories) {
  return authoredCategories
    .filter((c) => c.enabled !== false)
    .map((c) => ({ id: c.attributeId, label: c.displayName || c.label }));
}

// Config comes solely from the data-session-guide-config attribute decorate.js sets.
export function parseSessionsGuideConfig(el, { logPrefix, forcedSurface } = {}) {
  let authored = {};
  try {
    authored = JSON.parse(el.dataset.sessionGuideConfig || '{}');
  } catch {
    window.lana?.log(`[${logPrefix}] invalid data-session-guide-config JSON`);
  }

  const surface = forcedSurface || authored.surface || 'widget';
  // widget defaults dark (overlays any host page); page defaults light.
  const theme = authored.theme || (surface === 'page' ? 'light' : 'dark');

  return {
    eventId: authored.eventId,
    surface,
    theme,
    userTz: detectUserTimezone(),
    // [] renders no panel at all, so a malformed value degrades instead of throwing.
    filterCategories: Array.isArray(authored.filterCategories)
      ? mapAuthoredFilterCategories(authored.filterCategories)
      : [],
    headings: authored.headings,
    behaviorFlags: authored.behaviorFlags,
    swimlaneOrder: authored.swimlaneOrder,
    recommendedSessions: authored.recommendedSessions,
  };
}
