const DA_ADMIN_ORIGIN = 'https://admin.da.live';

// One config-library sheet per content-repo (da-events, each floodgate space, etc.) —
// resolved against whichever org/repo the DA SDK handshake reports.
const CONFIGS_SHEET_PATH = '/tools/da-apps/tier-1-event-configurator/configs.json';

const PAGES = {
  library: 'library',
  editor: 'editor',
};

// Default flow for New Config/Duplicate: browse the full ESP catalog
// (EventPicker). If listAllEvents() fails at runtime for any reason —
// e.g. a non-prod tier, where it requires a valid token unlike the
// optional-auth getEspEvent()/getEventSessionCatalog() — Library.js falls
// back to ManualEventLookup (with its own env picker) automatically. Flip
// to false only to disable browse outright; env-specific auth failures are
// already handled by that fallback.
const EVENT_BROWSE_ENABLED = true;

// Selectable in ManualEventLookup.js's env picker (context/EventEnvContext.js).
// Excludes 'local' — that targets the same endpoints as 'dev' (see
// v1/utils/constances.js's ENV_MAP) and is only relevant to the
// localhost-serving dev harness, not a real tier an author would pick.
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
