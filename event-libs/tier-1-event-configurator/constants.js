const CONFIGS_SHEET_PATH = '/tools/da-apps/tier-1-event-configurator/configs.json';

const PAGES = {
  library: 'library',
  editor: 'editor',
};

const CONFIG_TYPES = {
  GLOBAL: 'global',
  HOMEPAGE_UPCOMING_SESSIONS: 'homepage-upcoming-sessions',
  HOMEPAGE_FEATURED_SESSIONS: 'homepage-featured-sessions',
};

const HOMEPAGE_CONFIG_TYPE_OPTIONS = [
  { value: CONFIG_TYPES.HOMEPAGE_UPCOMING_SESSIONS, label: 'Upcoming Sessions' },
  { value: CONFIG_TYPES.HOMEPAGE_FEATURED_SESSIONS, label: 'Featured Sessions' },
];

const WATCH_DESTINATION_OPTIONS = [
  { value: 'homepage', label: 'Homepage' },
  { value: 'broadcast', label: 'Broadcast Page' },
];

const DA_ORIGIN = 'https://da.live';
const DA_APP_PATH = 'tools/da-apps/tier-1-event-configurator';

const HOMEPAGE_LINK_HASH_KEY = 'tecHomepage';

function isHomepageConfigType(configType) {
  return configType === CONFIG_TYPES.HOMEPAGE_UPCOMING_SESSIONS
    || configType === CONFIG_TYPES.HOMEPAGE_FEATURED_SESSIONS;
}

const HOMEPAGE_SESSION_FIELDS = {
  [CONFIG_TYPES.HOMEPAGE_UPCOMING_SESSIONS]: { field: 'upcomingSessions', metaField: 'upcomingSessionsMeta' },
  [CONFIG_TYPES.HOMEPAGE_FEATURED_SESSIONS]: { field: 'homepageFeaturedSessions', metaField: 'homepageFeaturedSessionsMeta' },
};

const HOMEPAGE_FIELD_BY_TYPE = {
  [CONFIG_TYPES.HOMEPAGE_UPCOMING_SESSIONS]: {
    ...HOMEPAGE_SESSION_FIELDS[CONFIG_TYPES.HOMEPAGE_UPCOMING_SESSIONS],
    headingField: 'upcomingSessionsHeading',
    metaFields: ['mrStreamId'],
    metaHint: 'Mobile Rider stream ID is an optional per-session override',
    label: 'Upcoming Sessions',
    blockHint: 'the upcoming-sessions block',
    linkPrefix: 'event-upcoming-sessions',
  },
  [CONFIG_TYPES.HOMEPAGE_FEATURED_SESSIONS]: {
    ...HOMEPAGE_SESSION_FIELDS[CONFIG_TYPES.HOMEPAGE_FEATURED_SESSIONS],
    metaFields: ['mrStreamId', 'imageUrl', 'watchDestination', 'homepageAnchorId'],
    metaHint: 'Mobile Rider stream ID is an optional per-session override — image is required for a session to appear. Watch destination picks where that session\'s card routes once it goes live; Homepage anchor ID (only used when Homepage is picked) is set via that section\'s own Section Metadata "anchor" row.',
    label: 'Featured Sessions',
    blockHint: 'the featured-sessions block',
    linkPrefix: 'event-featured-sessions',
    ctaFields: {
      prior: 'ctaTextPrior',
      during: 'ctaTextDuring',
      after: 'ctaTextAfter',
    },
    ctaDefaults: {
      prior: 'Learn more',
      during: 'Watch now',
      after: 'Watch on-demand',
    },
    ctaHint: 'CTA text shown on every card, chosen per-session by comparing the session\'s own time to the viewer\'s clock — before it starts, while it\'s live, and after it ends. Leave any blank to fall back to its default.',
  },
};

const EVENT_BROWSE_ENABLED = true;

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
  CONFIG_TYPES,
  HOMEPAGE_CONFIG_TYPE_OPTIONS,
  WATCH_DESTINATION_OPTIONS,
  HOMEPAGE_SESSION_FIELDS,
  HOMEPAGE_FIELD_BY_TYPE,
  isHomepageConfigType,
  DA_ORIGIN,
  DA_APP_PATH,
  HOMEPAGE_LINK_HASH_KEY,
};
