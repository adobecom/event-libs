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
// (events-service-platform-deploy@52b2631), confirming the CORS gap is
// closed — but listEvents() now returns a real 401 on Dev even with the
// Authorization header attached, a separate auth issue from CORS. Back to
// false until that's root-caused; ManualEventLookup (getEspEvent(), the
// singular lookup) remains the confirmed-working path.
const EVENT_BROWSE_ENABLED = false;

export {
  DA_ADMIN_ORIGIN,
  CONFIGS_SHEET_PATH,
  PAGES,
  EVENT_BROWSE_ENABLED,
};
