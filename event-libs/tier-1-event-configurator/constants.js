const DA_ADMIN_ORIGIN = 'https://admin.da.live';

// One config-library sheet per content-repo (da-events, each floodgate space, etc.) —
// resolved against whichever org/repo the DA SDK handshake reports.
const CONFIGS_SHEET_PATH = '/tools/da-apps/tier-1-event-configurator/configs.json';

const PAGES = {
  library: 'library',
  editor: 'editor',
};

// listEvents()/listAllEvents() (the "browse all events" picker) is the
// default flow again (2026-07-24, per Daniel), now that the CORS gap
// (MWPW-201634) is confirmed closed and DA's token is confirmed accepted
// against prod ESP (curl-replay, see PLAN.md §5) — prod is where this app
// actually runs once merged. The known remaining wrinkle is Dev/Stage-tier
// testing specifically: listEvents() genuinely requires a valid token there
// (unlike getEspEvent()/getEventSessionCatalog(), which are optional-auth),
// and DA's token is prod-IMS-scoped, so it won't authenticate against a
// non-prod tier. That's exactly what the automatic fallback below is for —
// EventPicker's onError (Library.js's browseFailed) swaps to
// ManualEventLookup (with its own env picker) the moment listAllEvents()
// fails at runtime, so pre-merge non-prod testing still works without
// hardcoding anything. Flip back to false only if browse itself needs to be
// disabled outright, not for env-specific auth issues — the fallback
// already handles those.
const EVENT_BROWSE_ENABLED = true;

// Selectable in ManualEventLookup.js's env picker (context/EventEnvContext.js).
// Excludes 'local' — that's specifically for the localhost-serving dev
// harness (README's "Local development" section), not something an author
// picking a real ESP tier from the UI would want; it targets the exact same
// endpoints as 'dev' anyway (see v1/utils/constances.js's ENV_MAP).
const EVENT_SERVICE_ENV_OPTIONS = [
  { value: 'prod', label: 'Prod' },
  { value: 'stage', label: 'Stage' },
  { value: 'stage02', label: 'Stage02' },
  { value: 'dev', label: 'Dev' },
  { value: 'dev02', label: 'Dev02' },
];

export {
  DA_ADMIN_ORIGIN,
  CONFIGS_SHEET_PATH,
  PAGES,
  EVENT_BROWSE_ENABLED,
  EVENT_SERVICE_ENV_OPTIONS,
};
