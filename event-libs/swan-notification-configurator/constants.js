// Keyed by configId, not eventId — the same event's SWAN config could in principle be
// re-authored more than once (e.g. testing stage before flipping to production).
// Must stay in sync with event-libs/v1/features/swan-notifications/swan-config.js's
// own copy of this path — this app writes here, that resolves from it.
const CONFIGS_SHEET_PATH = '/tools/da-apps/swan-notification-configurator/configs.json';

const PAGES = {
  library: 'library',
  editor: 'editor',
};

// Locked dropdown, not free text — an author picks an environment, not a URL. The app
// maps the choice to a fixed, code-owned ANS endpoint, so an authored config can never
// point the visitor's live IMS access token at an arbitrary origin (see
// docs/swan-unc-dependencies.md's trust-boundary note). The bookkeeping endpoint isn't
// authored at all — it's resolved from ESP's own ENV_MAP at runtime (see
// ans-controller.js). An option with a null endpoint renders disabled in the UI — fill
// in the real value here, nowhere else, once it exists.
const SWAN_ENV_OPTIONS = [
  {
    value: 'stage',
    label: 'Stage',
    ansEndpoint: 'https://notify-stage.adobe.io/ans/v1/notifications',
  },
  {
    value: 'production',
    label: 'Production (not yet available)',
    // No production ANS endpoint exists anywhere yet — see docs/swan-unc-dependencies.md's
    // open risks. Fill in the value here once the owning team provides it; no other code
    // change is needed.
    ansEndpoint: null,
  },
];

export { CONFIGS_SHEET_PATH, PAGES, SWAN_ENV_OPTIONS };
