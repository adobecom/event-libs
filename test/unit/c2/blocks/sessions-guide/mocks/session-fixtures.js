/*
 * Realistic session objects on the current ESL-normalized schema, for tests that need
 * components to actually render content rather than an empty state.
 */

const HOUR = 3600e3;

export function makeSession(overrides = {}) {
  return {
    id: 's-1',
    rfCode: 'S001',
    rfSessionId: 'RF-S001',
    title: 'Building with AI: A Practical Guide',
    description: 'Learn how to integrate generative AI into a working creative pipeline.',
    startTimeUtc: new Date(Date.now() + 2 * HOUR).toISOString(),
    endTimeUtc: new Date(Date.now() + 3 * HOUR).toISOString(),
    duration: 60,
    primaryTrack: 'Photography',
    additionalTracks: [],
    trackOverride: '',
    type: 'Breakout',
    technicalLevel: 'General',
    contentCategory: ['How To'],
    audience: ['Designers'],
    industry: [],
    closedCaptions: '',
    ipodOrGdprCopy: '',
    speakers: [
      { name: 'Jane Smith', title: 'Creative Director', photo: null },
      { name: 'Tomasz Wiśniewski', title: 'AEM Engineer', photo: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=' },
    ],
    products: ['Photoshop', 'Adobe Firefly'],
    resources: [{ title: 'Docs', url: 'https://experienceleague.adobe.com/docs' }],
    mrStreamId: null,
    inPerson: false,
    isLivestreamed: false,
    isOnline: true,
    sessionPageUrl: '/sessions/building-with-ai',
    watchUrl: '',
    isKeynote: false,
    thumbnailUrl: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=',
    customAttributeValues: {},
    ...overrides,
  };
}

// One session per state a card or the detail view can be in, so a single scan covers
// every branch that swaps labels, CTAs, or time strings.
export const SESSION_VARIANTS = {
  upcoming: makeSession(),
  live: makeSession({
    id: 's-live',
    title: 'Live Now: Color Theory in Practice',
    startTimeUtc: new Date(Date.now() - 10 * 60e3).toISOString(),
    endTimeUtc: new Date(Date.now() + 50 * 60e3).toISOString(),
    mrStreamId: 'mr-123',
    isLivestreamed: true,
  }),
  onDemand: makeSession({
    id: 's-on-demand',
    title: 'Premiere Rush: Quick Video on Mobile',
    startTimeUtc: new Date(Date.now() - 3 * HOUR).toISOString(),
    endTimeUtc: new Date(Date.now() - 2 * HOUR).toISOString(),
    watchUrl: '/watch/premiere-rush',
  }),
  inPersonOnly: makeSession({
    id: 's-in-person',
    title: 'Hands-on Lab: Lightroom Masking',
    startTimeUtc: new Date(Date.now() - 3 * HOUR).toISOString(),
    endTimeUtc: new Date(Date.now() - 2 * HOUR).toISOString(),
    inPerson: true,
    isOnline: false,
  }),
  keynote: makeSession({
    id: 's-keynote',
    rfCode: 'K001',
    title: 'MAX Keynote',
    primaryTrack: 'Featured',
    type: 'Keynote',
    isKeynote: true,
    duration: 90,
    speakers: [],
    products: [],
    resources: [],
  }),
};

export const CATALOG = Object.values(SESSION_VARIANTS);

// Mirrors the Tier 1 Event Configurator payload: Photoshop is the only product with an
// authored icon/pageUrl, so unmapped-product fallbacks stay exercised.
export const TIER_ONE_CONFIG = {
  products: {
    Photoshop: { icon: 'photoshop-64', pageUrl: 'https://www.adobe.com/products/photoshop' },
  },
  trackIcons: { Photography: { icon: 'camera-64', color: '#c81922' } },
};
