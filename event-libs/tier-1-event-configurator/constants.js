const DA_ADMIN_ORIGIN = 'https://admin.da.live';

// One config-library sheet per content-repo (da-events, each floodgate space, etc.) —
// resolved against whichever org/repo the DA SDK handshake reports.
const CONFIGS_SHEET_PATH = '/tools/da-apps/tier-1-event-configurator/configs.json';

const PAGES = {
  library: 'library',
  editor: 'editor',
};

// listEvents()/listAllEvents() (the "browse all events" picker) were blocked
// by a CORS gap on ESP's /v1/events route (tracked in MWPW-200897 — see
// PLAN.md §5). MWPW-201634 whitelisted this branch's da-events origin on Dev
// (events-service-platform-deploy@52b2631) — temporarily flipped to true to
// verify the fix live from this branch's DA preview.
const EVENT_BROWSE_ENABLED = true;

export {
  DA_ADMIN_ORIGIN,
  CONFIGS_SHEET_PATH,
  PAGES,
  EVENT_BROWSE_ENABLED,
};
