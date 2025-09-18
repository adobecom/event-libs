// Core constants
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

// Import only the most essential utilities that are always needed
// These are the functions that the importer's scripts.js actually uses
import {
  getEventServiceEnv,
  getMetadata,
  setMetadata,
  getSusiOptions,
  setEventConfig,
  updateEventConfig,
  getEventConfig,
} from './utils/utils.js';

// Pre-load the most commonly used functions from decorate.js
// This reduces the initial network load while keeping critical functions available
import {
  decorateEvent,
  getNonProdData,
  validatePageAndRedirect,
} from './utils/decorate.js';

// Core exports - always available (synchronous)
export {
  getEventServiceEnv,
  getMetadata,
  setMetadata,
  getSusiOptions,
  setEventConfig,
  updateEventConfig,
  getEventConfig,
  decorateEvent,
  getNonProdData,
  validatePageAndRedirect,
  EVENT_BLOCKS,
};

// Lazy-loaded delayed actions for event pages
export const eventsDelayedActions = async () => {
  const { lazyCaptureProfile } = await import('./utils/profile.js');
  lazyCaptureProfile();
};
