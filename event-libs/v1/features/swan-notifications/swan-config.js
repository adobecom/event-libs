// Page-level config for SWAN — no more DA-authored sheet/configId lookup. There's no
// external endpoint to trust or author here anymore (no ANS, no bookkeeping resource),
// so this is now a synchronous metadata read plus a couple of hardcoded defaults.
import { getMetadata } from '../../utils/utils.js';

const DEFAULT_UPCOMING_OFFSET_MINUTES = 5;
const DEFAULT_NOTIFICATION_ICON_URL = '';
const DEFAULT_NOTIFICATION_IMAGE_URL = '';

// Parses the Tier 1 Event Configurator's payload (MWPW-200311); null if absent/invalid.
// Duplicated from session-store.js's own parseTierOneEventConfig() rather than shared,
// so this module stays independent and can't form a circular import with session-store.js.
function parseTierOneEventConfig() {
  const raw = getMetadata('tier-1-event-config');
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (err) {
    window.lana?.log(`[swan-config] invalid tier-1-event-config JSON: ${err.message}`);
    return null;
  }
}

// A single boolean flag replaces the old ansEndpoint-presence check — there's no more
// per-event config to resolve, so enabling the feature is a straight opt-in.
export function isSwanEnabled() {
  return getMetadata('swan-notifications') === 'true';
}

export function getSwanConfig() {
  const tierOneConfig = parseTierOneEventConfig();
  return {
    eventName: tierOneConfig?.backendEventTitle || tierOneConfig?.eventName || 'Event',
    upcomingOffsetMinutes: DEFAULT_UPCOMING_OFFSET_MINUTES,
    defaultNotificationIconUrl: DEFAULT_NOTIFICATION_ICON_URL,
    defaultNotificationImageUrl: DEFAULT_NOTIFICATION_IMAGE_URL,
  };
}
