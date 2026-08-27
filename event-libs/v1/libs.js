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
  'grid-column',
  'mobile-rider',
  'preview-bar',
  'profile-cards',
  'sessions-hub',
  'promotional-content',
  'venue-additional-info',
  'youtube-chat',
  'image-links',
  'venue-map',
];

const EVENT_BLOCKS_C2 = [
  'event-card',
  'event-carousel',
  'upcoming-sessions',
  'featured-sessions',
  'chrono-box',
  'grid-column',
  'mobile-rider',
  'event-marquee',
  'sessions-guide',
  'sessions-guide-full-page',
  'session-state-demo',
  'in-person-banner',
  'event-session-details',
  'event-featured-products',
  'event-speakers',
  'event-session-resources',
  'event-youtube',
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
  processAutoBlockLinks,
} from './utils/decorate.js';

import { registerHydrator } from './hydrate/hydrate.js';
import repeatTemplate from './hydrate/repeat-template.js';

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
  processAutoBlockLinks,
  registerHydrator,
  repeatTemplate,
  EVENT_BLOCKS,
  EVENT_BLOCKS_C2,
};

// Lazy-loaded delayed actions for event pages
export const eventsDelayedActions = async () => {
  const { lazyCaptureProfile } = await import('./utils/profile.js');
  lazyCaptureProfile();

  if (getMetadata('meta-pixel')) {
    const { default: initMetaPixel } = await import('../scripts/meta-pixel.js');
    initMetaPixel();
  }
};

// Unlike eventsDelayedActions, this must run on any page (no event-id required) --
// consumer sites should call it unconditionally, independent of event-specific
// decoration.
export const initMiloSiteRedesignOverride = async () => {
  if (getMetadata('override-milo-ace1209') !== 'true') return;
  const { default: init } = await import('./features/milo-site-redesign-override/index.js');
  init();
};
