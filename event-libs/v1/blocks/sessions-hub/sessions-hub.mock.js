/**
 * sessions-hub.mock.js
 *
 * Dev-only fetch interceptor for the sessions catalogue block.
 * Loaded automatically when ?mockSessions is present in the URL.
 * Stubs window.adobeIMS and fires BlockMediator imsProfile so the
 * block loads without waiting for real IMS authentication.
 *
 * To enable: add ?mockSessions to the page URL.
 * To disable: remove ?mockSessions.
 */

import BlockMediator from '../../deps/block-mediator.min.js';

// ─── Fixture data ────────────────────────────────────────────────────────────

const EVENT_ID = '6f838242-ffe3-41f3-9bea-dea4ee318a9c';
const SERIES_ID = 'series-mock-1';
const VENUE_ID = 'venue-mock-1';

const MOCK_EVENT = {
  eventId: EVENT_ID,
  title: 'Adobe Summit 2027',
  startDate: '2027-01-01',
  endDate: '2027-01-03',
  seriesId: SERIES_ID,
  venueId: VENUE_ID,
  timezone: 'America/Los_Angeles',
};

// Jan 1 2027 9:00–10:00 AM PST
const TIME_9AM = 1798808400000;
const TIME_10AM = 1798812000000;
// Jan 1 2027 11:00 AM–12:00 PM PST
const TIME_11AM = 1798815600000;
const TIME_12PM = 1798819200000;
// Jan 2 2027 2:00–3:00 PM PST
const TIME_2PM = 1798909200000;
const TIME_3PM = 1798912800000;

const MOCK_SESSIONS = [
  {
    sessionId: 'session-1',
    title: 'Keynote: The Future of Digital Experience',
    enTitle: 'Keynote: The Future of Digital Experience',
    description: 'Join us for the opening keynote as Adobe leaders share the vision for the next generation of digital experience creation. Learn how AI, automation, and creative tools are converging to empower teams at every level. This session sets the tone for the entire summit and is not to be missed.',
    tags: 'caas:events/session-type/keynote,caas:events/track/creativity',
    published: true,
    status: 'active',
    localizations: {
      'en-US': {
        title: 'Keynote: The Future of Digital Experience',
        description: 'Join us for the opening keynote as Adobe leaders share the vision for the next generation of digital experience creation. Learn how AI, automation, and creative tools are converging to empower teams at every level. This session sets the tone for the entire summit and is not to be missed.',
      },
    },
  },
  {
    sessionId: 'session-2',
    title: 'Building Accessible Components at Scale',
    enTitle: 'Building Accessible Components at Scale',
    description: 'Accessibility is not a checkbox—it is a design principle. In this hands-on session, two senior engineers walk through how Adobe Spectrum approaches accessible component design from the ground up, covering ARIA patterns, keyboard navigation, and automated testing strategies that scale across large design systems.',
    tags: 'caas:events/track/engineering',
    published: true,
    status: 'active',
    localizations: {
      'en-US': {
        title: 'Building Accessible Components at Scale',
        description: 'Accessibility is not a checkbox—it is a design principle. In this hands-on session, two senior engineers walk through how Adobe Spectrum approaches accessible component design from the ground up, covering ARIA patterns, keyboard navigation, and automated testing strategies that scale across large design systems.',
      },
    },
  },
  {
    sessionId: 'session-3',
    title: 'Content Supply Chain: From Concept to Campaign',
    enTitle: 'Content Supply Chain: From Concept to Campaign',
    description: 'A deep dive into how leading brands are restructuring their content operations using Adobe Experience Cloud. This session covers workflow automation, asset governance, and cross-channel delivery strategies that reduce time-to-market without sacrificing creative quality.',
    tags: null,
    published: true,
    status: 'active',
    localizations: {
      'en-US': {
        title: 'Content Supply Chain: From Concept to Campaign',
        description: 'A deep dive into how leading brands are restructuring their content operations using Adobe Experience Cloud. This session covers workflow automation, asset governance, and cross-channel delivery strategies that reduce time-to-market without sacrificing creative quality.',
      },
    },
  },
];

const MOCK_SESSION_TIMES = {
  'session-1': [
    {
      sessionTimeId: 'time-1a',
      sessionId: 'session-1',
      eventId: EVENT_ID,
      startTimeMillis: TIME_9AM,
      endTimeMillis: TIME_10AM,
      timezone: 'America/Los_Angeles',
      locationId: 'loc-1',
      isFull: false,
      attendeeLimit: 500,
      attendeeCount: 320,
    },
  ],
  'session-2': [
    {
      sessionTimeId: 'time-2a',
      sessionId: 'session-2',
      eventId: EVENT_ID,
      startTimeMillis: TIME_11AM,
      endTimeMillis: TIME_12PM,
      timezone: 'America/Los_Angeles',
      locationId: 'loc-2',
      isFull: false,
      attendeeLimit: 100,
      attendeeCount: 87,
    },
  ],
  'session-3': [
    {
      sessionTimeId: 'time-3a',
      sessionId: 'session-3',
      eventId: EVENT_ID,
      startTimeMillis: TIME_2PM,
      endTimeMillis: TIME_3PM,
      timezone: 'America/Los_Angeles',
      locationId: 'loc-1',
      isFull: true,
      attendeeLimit: 60,
      attendeeCount: 60,
    },
  ],
};

// Ordinal linkage only — no profile data
const MOCK_SESSION_SPEAKERS = {
  'session-1': [
    { speakerId: 'speaker-1', speakerType: 'speaker', ordinal: 1 },
  ],
  'session-2': [
    { speakerId: 'speaker-2', speakerType: 'speaker', ordinal: 1 },
    { speakerId: 'speaker-3', speakerType: 'speaker', ordinal: 2 },
  ],
  'session-3': [],
};

// Full speaker profiles from series
const MOCK_SERIES_SPEAKERS = [
  {
    speakerId: 'speaker-1',
    firstName: 'Alicia',
    lastName: 'Chen',
    company: 'Adobe Inc.',
    photo: null,
    socialLinks: [
      { serviceName: 'X', link: 'https://x.com/aliciachen' },
      { serviceName: 'LinkedIn', link: 'https://linkedin.com/in/aliciachen' },
    ],
    localizations: {
      'en-US': {
        title: 'VP of Product Experience',
        bio: 'Alicia leads product experience strategy at Adobe, focusing on AI-powered creative tools and enterprise workflows. She has over 15 years of experience shipping consumer and enterprise software at scale.',
      },
    },
  },
  {
    speakerId: 'speaker-2',
    firstName: 'Marcus',
    lastName: 'Osei',
    company: 'Adobe Spectrum',
    photo: null,
    socialLinks: [
      { serviceName: 'GitHub', link: 'https://github.com/marcosei' },
    ],
    localizations: {
      'en-US': {
        title: 'Senior Engineer, Design Systems',
        bio: 'Marcus is a senior engineer on the Adobe Spectrum team, specializing in accessible component architecture and cross-platform design token infrastructure.',
      },
    },
  },
  {
    speakerId: 'speaker-3',
    firstName: 'Priya',
    lastName: 'Nair',
    company: 'Adobe Accessibility',
    photo: null,
    socialLinks: [],
    localizations: {
      'en-US': {
        title: 'Principal Accessibility Engineer',
        bio: 'Priya is a principal engineer on Adobe\'s accessibility team, responsible for ARIA standards compliance across Adobe\'s web properties and design system components.',
      },
    },
  },
];

const MOCK_LOCATIONS = {
  'loc-1': { locationId: 'loc-1', name: 'Main Stage — Hall A' },
  'loc-2': { locationId: 'loc-2', name: 'Breakout Room 3B' },
};

// session-1 is pre-registered
const MOCK_MY_SESSION_IDS = ['session-1'];

// ─── URL pattern matchers ────────────────────────────────────────────────────

function matchEvent(url) {
  // /v1/events/{id}  — but NOT /attendees or /sessions sub-paths
  return /\/v1\/events\/[^/]+$/.test(url);
}

function matchEventAttendeeMe(url) {
  return /\/v1\/events\/[^/]+\/attendees\/me$/.test(url);
}

function matchMyEventSessions(url) {
  return /\/v1\/attendees\/me\/events\/[^/]+\/sessions/.test(url);
}

function matchSessions(url) {
  return /\/v1\/sessions\?eventId=/.test(url);
}

function matchSessionTimes(url) {
  return /\/v1\/session-times\?sessionId=/.test(url);
}

function matchSessionSpeakers(url) {
  return /\/v1\/sessions\/[^/]+\/speakers$/.test(url);
}

function matchSeriesSpeakers(url) {
  return /\/v1\/series\/[^/]+\/speakers$/.test(url);
}

function matchVenueLocation(url) {
  return /\/v1\/venues\/[^/]+\/locations\/[^/]+$/.test(url);
}

function matchRegisterSessionTime(url) {
  return /\/v1\/session-times\/[^/]+\/attendees\/me$/.test(url);
}

// ─── Response helpers ─────────────────────────────────────────────────────────

function jsonResponse(data, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
  };
}

// ─── Fetch interceptor ───────────────────────────────────────────────────────

const originalFetch = window.fetch;

window.fetch = async (url, options) => {
  const urlStr = typeof url === 'string' ? url : url.toString();

  if (matchEvent(urlStr)) {
    console.log('[sessions-hub mock] GET event');
    return jsonResponse(MOCK_EVENT);
  }

  if (matchEventAttendeeMe(urlStr)) {
    console.log('[sessions-hub mock] GET event attendee/me');
    return jsonResponse({ registrationStatus: 'registered' });
  }

  if (matchMyEventSessions(urlStr)) {
    console.log('[sessions-hub mock] GET my event sessions');
    return jsonResponse({ sessionIds: MOCK_MY_SESSION_IDS });
  }

  if (matchSessions(urlStr)) {
    console.log('[sessions-hub mock] GET sessions');
    return jsonResponse({ sessions: MOCK_SESSIONS, count: MOCK_SESSIONS.length });
  }

  if (matchSessionTimes(urlStr)) {
    const match = urlStr.match(/sessionId=([^&]+)/);
    const sessionId = match ? match[1] : null;
    console.log('[sessions-hub mock] GET session-times for', sessionId);
    return jsonResponse({ sessionTimes: MOCK_SESSION_TIMES[sessionId] || [] });
  }

  if (matchSessionSpeakers(urlStr)) {
    const match = urlStr.match(/\/sessions\/([^/]+)\/speakers/);
    const sessionId = match ? match[1] : null;
    console.log('[sessions-hub mock] GET session speakers for', sessionId);
    return jsonResponse({ speakers: MOCK_SESSION_SPEAKERS[sessionId] || [] });
  }

  if (matchSeriesSpeakers(urlStr)) {
    console.log('[sessions-hub mock] GET series speakers');
    return jsonResponse({ speakers: MOCK_SERIES_SPEAKERS });
  }

  if (matchVenueLocation(urlStr)) {
    const match = urlStr.match(/\/locations\/([^/]+)$/);
    const locationId = match ? match[1] : null;
    console.log('[sessions-hub mock] GET venue location', locationId);
    const loc = MOCK_LOCATIONS[locationId] || { locationId, name: locationId };
    return jsonResponse(loc);
  }

  if (matchRegisterSessionTime(urlStr)) {
    const match = urlStr.match(/\/session-times\/([^/]+)\/attendees/);
    const sessionTimeId = match ? match[1] : null;
    console.log('[sessions-hub mock] POST register session time', sessionTimeId);
    return jsonResponse({ sessionTimeId, registrationStatus: 'registered' });
  }

  return originalFetch(url, options);
};

// ─── IMS + imsProfile stubs ──────────────────────────────────────────────────

if (!window.adobeIMS) {
  window.adobeIMS = {
    getAccessToken: () => ({ token: 'mock-ims-token' }),
    getProfile: async () => ({
      email: 'mock.user@example.com',
      first_name: 'Mock',
      last_name: 'User',
      userId: 'mock-user-id',
    }),
    isSignedInUser: () => true,
  };
}

// Fire imsProfile via BlockMediator so the block's subscription resolves
BlockMediator.set('imsProfile', {
  email: 'mock.user@example.com',
  first_name: 'Mock',
  last_name: 'User',
  userId: 'mock-user-id',
});

console.log('[sessions-hub mock] installed — fetch interceptor + IMS stubs active');
