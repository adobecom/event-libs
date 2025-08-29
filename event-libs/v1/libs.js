// Re-export all utilities from utils.js
const EVENT_BLOCKS = [
  'bento-cards',
  'chrono-box',
  'daa-injection',
  'event-agenda',
  'event-map',
  'event-partners',
  'event-product-blades',
  'event-schema',
  'event-subscription-form',
  'events-form',
  'mobile-rider',
  'preview-bar',
  'profile-cards',
  'promotional-content',
  'venue-additional-info',
  'youtube-chat',
];

export {
  LIBS,
  getEventServiceEnv,
  createTag,
  yieldToMain,
  getMetadata,
  setMetadata,
  handlize,
  flattenObject,
  getCurrentTabId,
  parseMetadataPath,
  createOptimizedPicture,
  getIcon,
  getSusiOptions,
  readBlockConfig,
  setEventConfig,
  updateEventConfig,
  getEventConfig,
} from './utils/utils.js';

// Re-export from decorate.js
export {
  getNonProdData,
  autoUpdateContent,
  validatePageAndRedirect,
} from './utils/decorate.js';

// Re-export from profile.js
export {
  getProfile,
  lazyCaptureProfile,
} from './utils/profile.js';

// Re-export from dictionary-manager.js
export {
  DictionaryManager,
  dictionaryManager,
} from './utils/dictionary-manager.js';

// Re-export from esp-controller.js
export {
  getCaasTags,
  waitForAdobeIMS,
  constructRequestOptions,
  getEvent,
  getEventAttendee,
  getAttendee,
  createAttendee,
  addAttendeeToEvent,
  updateAttendee,
  deleteAttendeeFromEvent,
  getAndCreateAndAddAttendee,
} from './utils/esp-controller.js';

// Re-export from data-utils.js
export {
  EVENT_ATTENDEE_DATA_FILTER,
  BASE_ATTENDEE_DATA_FILTER,
  isValidAttribute,
  getEventAttendeePayload,
  getBaseAttendeePayload,
} from './utils/data-utils.js';

export { EVENT_BLOCKS };
