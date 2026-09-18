// Page-level config for SWAN — no more DA-authored sheet/configId lookup. There's no
// external endpoint to trust or author here anymore (no ANS, no bookkeeping resource),
// so this is now a synchronous metadata read plus a couple of hardcoded defaults.
import { getMetadata } from '../../utils/utils.js';
import { logError } from '../../utils/lana-log.js';

const DEFAULT_UPCOMING_OFFSET_MINUTES = 5;
const DEFAULT_NOTIFICATION_ICON_URL = '';
const DEFAULT_LOCAL_NOTIFICATION_PERSIST_TILL_DAYS = 3;
// Event-wide safety-net TTL for every stage (not just on-demand) — a backstop against an
// entry that never reconciles further, mirroring legacy SWAN 1.0's notifExpirationDate wipe.
const DEFAULT_NOTIFICATION_EXPIRATION_DAYS = 14;

// Parses the Tier 1 Event Configurator's payload (MWPW-200311); null if absent/invalid.
// Duplicated from session-store.js's own parseTierOneEventConfig() rather than shared,
// so this module stays independent and can't form a circular import with session-store.js.
function parseTierOneEventConfig() {
  const raw = getMetadata('tier-1-event-config');
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (err) {
    logError('swan-config', 'invalid tier-1-event-config JSON', err);
    return null;
  }
}

// The metadata value itself selects which SWAN implementation runs: 'feds' (this repo's
// local widget), 'unc' (milo gnav's own UNC engine, driven from swan-notifications-unc.js),
// or 'off'/missing/anything else, which no-ops both.
const SWAN_MODES = ['feds', 'unc'];

export function getSwanMode() {
  const raw = getMetadata('swan-notifications');
  return SWAN_MODES.includes(raw) ? raw : 'off';
}

// Federal only renders `.feds-notifications-wrapper` (feds mode's mount point) when the page
// also carries this flag — see notification-widget.js's mountNotificationWidget().
export function isGnavNotificationsEnabled() {
  return getMetadata('gnav-notifications') === 'on';
}

export function getSwanConfig() {
  const tierOneConfig = parseTierOneEventConfig();
  return {
    eventName: tierOneConfig?.backendEventTitle || tierOneConfig?.eventName || 'Event',
    upcomingOffsetMinutes: DEFAULT_UPCOMING_OFFSET_MINUTES,
    defaultNotificationIconUrl: DEFAULT_NOTIFICATION_ICON_URL,
    localNotificationPersistTillDays: DEFAULT_LOCAL_NOTIFICATION_PERSIST_TILL_DAYS,
    notificationExpirationDays: DEFAULT_NOTIFICATION_EXPIRATION_DAYS,
  };
}
