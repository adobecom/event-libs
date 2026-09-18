import { detectUserTimezone } from './time.js';

// RainFocus gives categories a UUID and a label, no slug — this is ours, for the ?filter= key.
function slugifyCategoryLabel(label) {
  return label ? label.toLowerCase().replace(/[\s_]+/g, '-').replace(/[^a-z0-9-]/g, '') : '';
}

// Authored { attributeId, displayName, enabled } -> FilterPanel's { id, label, slug }. Two
// categories slugifying to the same value get -2/-3/... suffixes in authoring order.
function mapAuthoredFilterCategories(authoredCategories) {
  const categories = authoredCategories
    .filter((c) => c.enabled !== false)
    .map((c) => ({ id: c.attributeId, label: c.displayName || c.label }));

  const seen = new Map();
  return categories.map((c) => {
    const base = slugifyCategoryLabel(c.label) || c.id;
    const count = (seen.get(base) || 0) + 1;
    seen.set(base, count);
    return { ...c, slug: count === 1 ? base : `${base}-${count}` };
  });
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
