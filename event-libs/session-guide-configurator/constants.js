// Keyed by configId, not eventId — an event can have multiple configs.
const CONFIGS_SHEET_PATH = '/tools/da-apps/session-guide-configurator/configs.json';

// This app's own edit-mode URL, not the admin API origin.
const DA_ORIGIN = 'https://da.live';
const DA_APP_PATH = 'tools/da-apps/session-guide-configurator';

const PAGES = {
  library: 'library',
  editor: 'editor',
};

// Library.js falls back to ManualEventLookup if EventPicker's browse fails; set to
// false to disable browse outright.
const EVENT_BROWSE_ENABLED = true;

// Excludes 'local' — that targets the same endpoints as 'dev' and is only relevant
// to the localhost dev harness.
const EVENT_SERVICE_ENV_OPTIONS = [
  { value: 'prod', label: 'Prod' },
  { value: 'stage', label: 'Stage' },
  { value: 'stage02', label: 'Stage02' },
  { value: 'dev', label: 'Dev' },
  { value: 'dev02', label: 'Dev02' },
];

export {
  CONFIGS_SHEET_PATH,
  DA_ORIGIN,
  DA_APP_PATH,
  PAGES,
  EVENT_BROWSE_ENABLED,
  EVENT_SERVICE_ENV_OPTIONS,
};
