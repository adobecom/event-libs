const PAGES = {
  home: 'home',
  schedules: 'schedules',
};

const PAGES_CONFIG = {
  home: {
    label: 'Home',
    pageComponent: PAGES.home,
  },
  editSchedule: {
    label: 'Edit Schedule',
    pageComponent: PAGES.schedules,
    mode: 'edit',
  },
  importSheet: {
    label: 'Import Sheet',
    pageComponent: PAGES.schedules,
    mode: 'import',
  },
};

const DEFAULT_FRAGMENT_PATH = '/events/events-shared/fragments';

const DA_ADMIN_ORIGIN = 'https://admin.da.live';

export {
  PAGES,
  PAGES_CONFIG,
  DEFAULT_FRAGMENT_PATH,
  DA_ADMIN_ORIGIN,
};
