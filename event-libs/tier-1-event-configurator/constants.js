// One config-library sheet per content-repo (da-events, each floodgate space, etc.) —
// resolved against whichever org/repo the DA SDK handshake reports.
const CONFIGS_SHEET_PATH = '/tools/da-apps/tier-1-event-configurator/configs.json';

const PAGES = {
  library: 'library',
  editor: 'editor',
};

// Default flow for New Config/Duplicate is browsing the full ESP catalog
// (EventPicker); Library.js auto-falls-back to ManualEventLookup if that
// fails at runtime. Flip to false to disable browse outright.
const EVENT_BROWSE_ENABLED = true;

// Selectable in ManualEventLookup.js's env picker. Excludes 'local' — that's
// for the localhost dev harness, and targets the same endpoints as 'dev'.
const EVENT_SERVICE_ENV_OPTIONS = [
  { value: 'prod', label: 'Prod' },
  { value: 'stage', label: 'Stage' },
  { value: 'stage02', label: 'Stage02' },
  { value: 'dev', label: 'Dev' },
  { value: 'dev02', label: 'Dev02' },
];

export {
  CONFIGS_SHEET_PATH,
  PAGES,
  EVENT_BROWSE_ENABLED,
  EVENT_SERVICE_ENV_OPTIONS,
};
