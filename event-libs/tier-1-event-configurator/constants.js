const DA_ADMIN_ORIGIN = 'https://admin.da.live';

// One config-library sheet per content-repo (da-events, each floodgate space, etc.) —
// resolved against whichever org/repo the DA SDK handshake reports.
const CONFIGS_SHEET_PATH = '/tools/da-apps/tier-1-event-configurator/configs.json';

const PAGES = {
  library: 'library',
  editor: 'editor',
};

// listEvents()/listAllEvents() (the "browse all events" picker) are blocked
// by a CORS gap on ESP's /v1/events route (tracked in MWPW-200897 — see
// PLAN.md §5). The picker code is kept intact, not deleted, so it's a
// one-line flip once that's resolved — ManualEventLookup is the active
// fallback in the meantime (getEspEvent(), confirmed CORS-free).
const EVENT_BROWSE_ENABLED = false;

export {
  DA_ADMIN_ORIGIN,
  CONFIGS_SHEET_PATH,
  PAGES,
  EVENT_BROWSE_ENABLED,
};
