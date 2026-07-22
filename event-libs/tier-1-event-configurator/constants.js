const DA_ADMIN_ORIGIN = 'https://admin.da.live';

// One config-library sheet per content-repo (da-events, each floodgate space, etc.) —
// resolved against whichever org/repo the DA SDK handshake reports.
const CONFIGS_SHEET_PATH = '/tools/da-apps/tier-1-event-configurator/configs.json';

const PAGES = {
  library: 'library',
  editor: 'editor',
};

export {
  DA_ADMIN_ORIGIN,
  CONFIGS_SHEET_PATH,
  PAGES,
};
