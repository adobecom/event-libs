import { getMetadata } from './utils.js';

// Page-level bootstrap for the Tier 1 Event Configurator app's authored output (Config
// JSON pasted into the `tier-1-event-config` metadata row). Read once during
// decorateEvent, before any block's own init() runs, so any block on the page can call
// getTrackIcon()/getAllowDoubleBooking().
let initialized = false;
let tierOneEventConfig = {};

// No built-in per-track icon/color defaults — authors pick both explicitly. This is the
// one universal fallback color when nothing's authored, used here and in the configurator.
export const DEFAULT_ICON_COLOR = '#000000';

function slugify(name) {
  return name ? name.toLowerCase().replace(/[\s_]+/g, '-').replace(/[^a-z0-9-]/g, '') : '';
}

// Idempotent — safe to call multiple times; no-ops after the first successful init
// and when the tier-1-event-config metadata is absent (mirrors session-store.js's
// initSessionState(), which self-gates on the same metadata).
export function initTierOneEventConfig() {
  if (initialized) return;
  const raw = getMetadata('tier-1-event-config');
  if (!raw) return;
  initialized = true;
  try {
    tierOneEventConfig = JSON.parse(raw);
  } catch (err) {
    window.lana?.log(`[tier-1-event-config] invalid tier-1-event-config JSON: ${err.message}`);
    return;
  }
  // Catches the real failure mode this manual copy/paste hand-off invites: an author
  // pastes the wrong event's Config onto a page. Only warn on an actual mismatch —
  // skip silently if either side is missing (e.g. an older Config with no eventId).
  const pageEventId = getMetadata('event-id');
  if (tierOneEventConfig.eventId && pageEventId && tierOneEventConfig.eventId !== pageEventId) {
    window.lana?.log(`[tier-1-event-config] eventId mismatch: config authored for ${tierOneEventConfig.eventId}, page is ${pageEventId}`);
  }
}

export function getTrackIcon(trackName) {
  if (!trackName) return null;
  const slug = slugify(trackName);
  const trackIcons = tierOneEventConfig.trackIcons || {};
  return trackIcons[trackName] || trackIcons[slug] || null;
}

// Each distinct override text is its own swimlane — overrideTrackIcons.byText maps a
// specific text to its own icon/color, overrideTrackIcons.default is the event-wide
// fallback for any text not yet mapped. Returns null, not a guaranteed object, when
// neither is authored — callers apply DEFAULT_ICON_COLOR themselves (see resolveTrackBadge).
export function getOverrideTrackIcon(overrideText) {
  const override = tierOneEventConfig.overrideTrackIcons || {};
  const byText = override.byText || {};
  return byText[overrideText] || override.default || null;
}

// Returns { icon, pageUrl } for a product, or null. No built-in default map (unlike
// tracks) — no product icons exist anywhere yet (not federal, not event-libs' own
// sprite), so there's nothing sensible to fall back to; this is purely the authored map,
// keyed by the exact product name.
export function getProduct(productName) {
  if (!productName) return null;
  const products = tierOneEventConfig.products || {};
  return products[productName] || null;
}

export function getAllowDoubleBooking() {
  return !!tierOneEventConfig.allowDoubleBooking;
}

// The EVENT's own start, authored once in the Tier 1 Event Configurator as a UTC epoch
// ms (see its own EpochDateTimeField) — the same config `eventEndDateTime` is read from
// in session-store.js. Distinct from the page-level `local-start-time-millis` metadata,
// which carries an individual page's own local timing rather than the event's.
// Returns null when unauthored or non-numeric, so callers can tell "not configured"
// apart from a real 0.
export function getEventStartMs() {
  const startMs = Number(tierOneEventConfig.eventStartDateTime);
  return Number.isFinite(startMs) && startMs > 0 ? startMs : null;
}
