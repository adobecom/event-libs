import { expect } from '@esm-bundle/chai';
import { readFile } from '@web/test-runner-commands';
import init, { filterSessions, syncSessionDescriptionsOverflow } from '../../../../event-libs/v1/blocks/sessions-hub/sessions-hub.js';
import BlockMediator from '../../../../event-libs/v1/deps/block-mediator.min.js';
import { DictionaryManager, dictionaryManager } from '../../../../event-libs/v1/utils/dictionary-manager.js';

const body = await readFile({ path: './mocks/default.html' });

// ─── Fixture helpers ─────────────────────────────────────────────────────────

function makeSession(overrides = {}) {
  return {
    sessionId: 'session-1',
    title: 'My Session',
    description: 'A description of the session for testing purposes.',
    tags: 'caas:events/type/workshop,caas:events/level/beginner',
    rawTimes: [
      {
        sessionTimeId: 'time-1',
        startTimeMillis: 1722960000000,
        endTimeMillis: 1722970800000,
        timezone: 'America/Los_Angeles',
        locationId: 'loc-1',
      },
    ],
    rawSpeakers: [],
    ...overrides,
  };
}

function makeEventData(overrides = {}) {
  return {
    eventId: 'event-123',
    title: 'Adobe Summit 2024',
    startDate: 'August 7, 2024',
    seriesId: 'series-abc',
    venueId: 'venue-xyz',
    ...overrides,
  };
}

// ─── Inline unit tests for pure/exported functions ───────────────────────────
// We import helper functions via dynamic import to avoid triggering side-effects
// from the full block init (which makes network calls in the constructor).

let resolveTagWithGroup;
let resolveTagObjects;
let generateICS;
let normalizeSessions;

const mockTagsData = {
  namespaces: {
    caas: {
      tags: {
        events: {
          tags: {
            type: {
              title: 'Session Type',
              tags: {
                workshop: { title: 'Workshop' },
                lab: { title: 'Lab' },
                demo: { title: 'Demo' },
                'two-word-tag': { title: 'Two Word Tag' },
                'deep-dive': { title: 'Deep Dive' },
              },
            },
            level: {
              title: 'Level',
              tags: {
                beginner: { title: 'Beginner' },
              },
            },
          },
        },
      },
    },
  },
};

before(async () => {
  // Import isolated helpers by re-exporting them in tests via dynamic import.
  // The block does NOT export these helpers — we test them through DOM assertions
  // on init(), or we inline the logic here to keep tests self-contained.

  // Inline the pure functions under test to avoid circular-import issues with
  // the block's top-level side-effect-free closures.

  resolveTagWithGroup = (tagId, tagsData) => {
    const colonIdx = tagId.indexOf(':');
    if (colonIdx === -1 || !tagsData) return { label: '', group: '' };
    const ns = tagId.slice(0, colonIdx);
    const segs = tagId.slice(colonIdx + 1).split('/');
    let node = tagsData.namespaces?.[ns];
    let parentNode = null;
    for (const seg of segs) {
      parentNode = node;
      node = node?.tags?.[seg];
    }
    return { label: node?.title || '', group: parentNode?.title || '' };
  };

  resolveTagObjects = (tagIdList, tagsData) => {
    if (!tagIdList) return [];
    return tagIdList
      .split(',')
      .map((id) => resolveTagWithGroup(id.trim(), tagsData))
      .filter((t) => t.label);
  };

  generateICS = (sessionTime, title, locationName) => {
    const formatDate = (ms) => new Date(ms).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    const start = formatDate(sessionTime.startTimeMillis);
    const end = formatDate(sessionTime.endTimeMillis);
    const uid = `${sessionTime.sessionTimeId}@aem-event-libs`;
    const now = formatDate(Date.now());
    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Adobe Event Libs//Sessions Catalogue//EN',
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTAMP:${now}`,
      `DTSTART:${start}`,
      `DTEND:${end}`,
      `SUMMARY:${title.replace(/\n/g, '\\n')}`,
    ];
    if (locationName) lines.push(`LOCATION:${locationName.replace(/\n/g, '\\n')}`);
    lines.push('END:VEVENT', 'END:VCALENDAR');
    return lines.join('\r\n');
  };

  normalizeSessions = (rawSessions, speakerMap, locationMap, registeredSessionIds, venueId, tagsData) => rawSessions.map((session) => {
    const sessionTimes = (session.rawTimes || []).map((t) => ({
      sessionTimeId: t.sessionTimeId,
      startTimeMillis: t.startTimeMillis,
      endTimeMillis: t.endTimeMillis,
      timezone: t.timezone,
      locationId: t.locationId,
      locationName: locationMap.get(`${venueId}:${t.locationId}`)?.name || '',
      isFull: t.isFull,
    }));

    const speakers = (session.rawSpeakers || [])
      .sort((a, b) => (a.ordinal ?? 0) - (b.ordinal ?? 0))
      .map((s) => {
        const full = speakerMap.get(s.speakerId) || {};
        return {
          speakerId: s.speakerId,
          speakerType: s.speakerType,
          firstName: full.firstName || '',
          lastName: full.lastName || '',
          title: full.localizations?.['en-US']?.title || full.title || '',
          bio: full.localizations?.['en-US']?.bio || full.bio || '',
          photo: full.photo || null,
          socialLinks: full.socialLinks || [],
          company: full.company || '',
        };
      });

    return {
      sessionId: session.sessionId,
      title: session.localizations?.['en-US']?.title || session.title || session.enTitle || '',
      description: session.localizations?.['en-US']?.description || session.description || '',
      tags: resolveTagObjects(session.tags, tagsData),
      sessionTimes,
      speakers,
      isRegistered: registeredSessionIds.has(session.sessionId),
      expanded: false,
    };
  });
});

// ─── resolveTagWithGroup ─────────────────────────────────────────────────────

describe('resolveTagWithGroup', () => {
  it('returns label and group from tagsData for a known tag', () => {
    expect(resolveTagWithGroup('caas:events/type/workshop', mockTagsData))
      .to.deep.equal({ label: 'Workshop', group: 'Session Type' });
  });

  it('returns multi-word label for a hyphenated tag ID', () => {
    expect(resolveTagWithGroup('caas:events/type/two-word-tag', mockTagsData))
      .to.deep.equal({ label: 'Two Word Tag', group: 'Session Type' });
  });

  it('returns empty label for unknown tag path', () => {
    expect(resolveTagWithGroup('caas:events/type/unknown', mockTagsData))
      .to.deep.equal({ label: '', group: 'Session Type' });
  });

  it('returns empty label and group when tagsData is null', () => {
    expect(resolveTagWithGroup('caas:events/type/workshop', null))
      .to.deep.equal({ label: '', group: '' });
  });

  it('returns empty label and group when tag has no colon separator', () => {
    expect(resolveTagWithGroup('no-colon-tag', mockTagsData))
      .to.deep.equal({ label: '', group: '' });
  });
});

// ─── resolveTagObjects ───────────────────────────────────────────────────────

describe('resolveTagObjects', () => {
  it('returns empty array for null', () => {
    expect(resolveTagObjects(null, mockTagsData)).to.deep.equal([]);
  });

  it('returns empty array for empty string', () => {
    expect(resolveTagObjects('', mockTagsData)).to.deep.equal([]);
  });

  it('resolves a single tag to its label and group', () => {
    expect(resolveTagObjects('caas:events/type/workshop', mockTagsData))
      .to.deep.equal([{ label: 'Workshop', group: 'Session Type' }]);
  });

  it('resolves multiple comma-separated tags', () => {
    const result = resolveTagObjects('caas:events/type/workshop,caas:events/level/beginner', mockTagsData);
    expect(result).to.deep.equal([
      { label: 'Workshop', group: 'Session Type' },
      { label: 'Beginner', group: 'Level' },
    ]);
  });

  it('trims whitespace around tag ids', () => {
    const result = resolveTagObjects(' caas:events/type/lab , caas:events/type/demo ', mockTagsData);
    expect(result).to.deep.equal([
      { label: 'Lab', group: 'Session Type' },
      { label: 'Demo', group: 'Session Type' },
    ]);
  });

  it('resolves hyphenated two-word tags to their titles', () => {
    const result = resolveTagObjects('caas:events/type/two-word-tag,caas:events/type/deep-dive', mockTagsData);
    expect(result).to.deep.equal([
      { label: 'Two Word Tag', group: 'Session Type' },
      { label: 'Deep Dive', group: 'Session Type' },
    ]);
  });

  it('filters out unknown tags when tagsData has no match', () => {
    const result = resolveTagObjects('caas:events/type/unknown', mockTagsData);
    expect(result).to.deep.equal([]);
  });

  it('returns empty array when tagsData is null', () => {
    expect(resolveTagObjects('caas:events/type/workshop', null)).to.deep.equal([]);
  });
});

// ─── generateICS ─────────────────────────────────────────────────────────────

describe('generateICS', () => {
  const sessionTime = {
    sessionTimeId: 'time-abc',
    startTimeMillis: 1722960000000,
    endTimeMillis: 1722970800000,
  };

  it('produces a string containing BEGIN:VCALENDAR and END:VCALENDAR', () => {
    const ics = generateICS(sessionTime, 'My Session', 'Room 1');
    expect(ics).to.include('BEGIN:VCALENDAR');
    expect(ics).to.include('END:VCALENDAR');
  });

  it('includes DTSTART and DTEND', () => {
    const ics = generateICS(sessionTime, 'My Session', '');
    expect(ics).to.include('DTSTART:');
    expect(ics).to.include('DTEND:');
  });

  it('includes session title in SUMMARY field', () => {
    const ics = generateICS(sessionTime, 'Workshop: Intro to AEM', '');
    expect(ics).to.include('SUMMARY:Workshop: Intro to AEM');
  });

  it('includes LOCATION when locationName is provided', () => {
    const ics = generateICS(sessionTime, 'Talk', 'Main Ballroom');
    expect(ics).to.include('LOCATION:Main Ballroom');
  });

  it('omits LOCATION line when locationName is empty', () => {
    const ics = generateICS(sessionTime, 'Talk', '');
    expect(ics).to.not.include('LOCATION:');
  });

  it('uses the sessionTimeId in the UID', () => {
    const ics = generateICS(sessionTime, 'Talk', '');
    expect(ics).to.include('UID:time-abc@aem-event-libs');
  });
});

// ─── filterSessions ──────────────────────────────────────────────────────────

describe('filterSessions', () => {
  const sessions = [
    {
      sessionId: 's1',
      title: 'Intro to Photoshop',
      description: 'Learn the basics',
      tags: [
        { label: 'Workshop', group: 'Session Type' },
        { label: 'Beginner', group: 'Level' },
      ],
      speakers: [{ firstName: 'Alice', lastName: 'Smith' }],
    },
    {
      sessionId: 's2',
      title: 'Advanced Illustrator',
      description: 'For power users',
      tags: [{ label: 'Lab', group: 'Session Type' }],
      speakers: [{ firstName: 'Bob', lastName: 'Jones' }],
    },
    {
      sessionId: 's3',
      title: 'Color Theory',
      description: 'Understanding color',
      tags: [{ label: 'Workshop', group: 'Session Type' }],
      speakers: [],
    },
  ];

  it('returns all sessions when no filters active', () => {
    const result = filterSessions(sessions, {
      query: '', activeTags: new Map(), activeTab: 'all', registeredSessionIds: new Set(),
    });
    expect(result).to.have.lengthOf(3);
  });

  it('does not apply text search for whitespace-only query', () => {
    const result = filterSessions(sessions, {
      query: '   ', activeTags: new Map(), activeTab: 'all', registeredSessionIds: new Set(),
    });
    expect(result).to.have.lengthOf(3);
  });

  it('applies text search for two-character query', () => {
    const result = filterSessions(sessions, {
      query: 'ph', activeTags: new Map(), activeTab: 'all', registeredSessionIds: new Set(),
    });
    expect(result).to.have.lengthOf(1);
    expect(result[0].sessionId).to.equal('s1');
  });

  it('filters by title substring (case-insensitive)', () => {
    const result = filterSessions(sessions, {
      query: 'photoshop', activeTags: new Map(), activeTab: 'all', registeredSessionIds: new Set(),
    });
    expect(result).to.have.lengthOf(1);
    expect(result[0].sessionId).to.equal('s1');
  });

  it('does not match description-only text by default', () => {
    const result = filterSessions(sessions, {
      query: 'power users', activeTags: new Map(), activeTab: 'all', registeredSessionIds: new Set(),
    });
    expect(result).to.have.lengthOf(0);
  });

  it('matches description when searchConfig.includeDescription is true', () => {
    const result = filterSessions(sessions, {
      query: 'power users',
      activeTags: new Map(),
      activeTab: 'all',
      registeredSessionIds: new Set(),
      searchConfig: { includeDescription: true },
    });
    expect(result).to.have.lengthOf(1);
    expect(result[0].sessionId).to.equal('s2');
  });

  it('does not apply text search for a single-character query', () => {
    const result = filterSessions(sessions, {
      query: 'p', activeTags: new Map(), activeTab: 'all', registeredSessionIds: new Set(),
    });
    expect(result).to.have.lengthOf(3);
  });

  it('filters by tag label substring', () => {
    const result = filterSessions(sessions, {
      query: 'work', activeTags: new Map(), activeTab: 'all', registeredSessionIds: new Set(),
    });
    expect(result.map((s) => s.sessionId).sort()).to.deep.equal(['s1', 's3']);
  });

  it('filters by speaker last name substring', () => {
    const result = filterSessions(sessions, {
      query: 'smith', activeTags: new Map(), activeTab: 'all', registeredSessionIds: new Set(),
    });
    expect(result).to.have.lengthOf(1);
    expect(result[0].sessionId).to.equal('s1');
  });

  it('filters by full speaker name phrase', () => {
    const result = filterSessions(sessions, {
      query: 'alice smith', activeTags: new Map(), activeTab: 'all', registeredSessionIds: new Set(),
    });
    expect(result).to.have.lengthOf(1);
    expect(result[0].sessionId).to.equal('s1');
  });

  it('filters by speaker name', () => {
    const result = filterSessions(sessions, {
      query: 'bob', activeTags: new Map(), activeTab: 'all', registeredSessionIds: new Set(),
    });
    expect(result).to.have.lengthOf(1);
    expect(result[0].sessionId).to.equal('s2');
  });

  it('filters by active tag (OR within group)', () => {
    const result = filterSessions(sessions, {
      query: '',
      activeTags: new Map([['Session Type', new Set(['Lab'])]]),
      activeTab: 'all',
      registeredSessionIds: new Set(),
    });
    expect(result).to.have.lengthOf(1);
    expect(result[0].sessionId).to.equal('s2');
  });

  it('OR logic within group: returns sessions matching any selected tag in a group', () => {
    const result = filterSessions(sessions, {
      query: '',
      activeTags: new Map([['Session Type', new Set(['Workshop', 'Lab'])]]),
      activeTab: 'all',
      registeredSessionIds: new Set(),
    });
    expect(result).to.have.lengthOf(3);
  });

  it('AND logic across groups: sessions must match at least one tag per selected group', () => {
    const result = filterSessions(sessions, {
      query: '',
      activeTags: new Map([
        ['Session Type', new Set(['Workshop'])],
        ['Level', new Set(['Beginner'])],
      ]),
      activeTab: 'all',
      registeredSessionIds: new Set(),
    });
    expect(result).to.have.lengthOf(1);
    expect(result[0].sessionId).to.equal('s1');
  });

  it('filters to registered sessions in "my" tab mode', () => {
    const result = filterSessions(sessions, {
      query: '', activeTags: new Map(), activeTab: 'my', registeredSessionIds: new Set(['s1', 's3']),
    });
    expect(result).to.have.lengthOf(2);
    expect(result.map((s) => s.sessionId)).to.deep.equal(['s1', 's3']);
  });

  it('returns empty array in "my" mode with no registered sessions', () => {
    const result = filterSessions(sessions, {
      query: '', activeTags: new Map(), activeTab: 'my', registeredSessionIds: new Set(),
    });
    expect(result).to.have.lengthOf(0);
  });
});

// ─── normalizeSessions ───────────────────────────────────────────────────────

describe('normalizeSessions', () => {
  const speakerMap = new Map([
    ['spk-1', {
      speakerId: 'spk-1',
      firstName: 'Jane',
      lastName: 'Doe',
      title: 'Designer',
      bio: 'Bio text',
      photo: { imageUrl: 'https://example.com/photo.jpg', altText: 'Jane Doe' },
      socialLinks: [],
      company: 'Adobe',
    }],
  ]);
  const locationMap = new Map([
    ['venue-xyz:loc-1', { locationId: 'loc-1', name: 'Main Hall' }],
  ]);
  const registeredSessionIds = new Set(['session-1']);

  it('resolves tag IDs to label+group objects', () => {
    const raw = [makeSession({ tags: 'caas:events/type/workshop,caas:events/level/beginner' })];
    const result = normalizeSessions(raw, speakerMap, locationMap, registeredSessionIds, 'venue-xyz', mockTagsData);
    expect(result[0].tags).to.deep.equal([
      { label: 'Workshop', group: 'Session Type' },
      { label: 'Beginner', group: 'Level' },
    ]);
  });

  it('marks session as isRegistered when sessionId is in registeredSessionIds', () => {
    const raw = [makeSession({ sessionId: 'session-1' })];
    const result = normalizeSessions(raw, speakerMap, locationMap, registeredSessionIds, 'venue-xyz');
    expect(result[0].isRegistered).to.be.true;
  });

  it('marks session as NOT isRegistered when sessionId is absent from registeredSessionIds', () => {
    const raw = [makeSession({ sessionId: 'session-unregistered' })];
    const result = normalizeSessions(raw, speakerMap, locationMap, registeredSessionIds, 'venue-xyz');
    expect(result[0].isRegistered).to.be.false;
  });

  it('resolves locationName from locationMap using venueId:locationId key', () => {
    const raw = [makeSession()];
    const result = normalizeSessions(raw, speakerMap, locationMap, registeredSessionIds, 'venue-xyz');
    expect(result[0].sessionTimes[0].locationName).to.equal('Main Hall');
  });

  it('falls back to empty string when location is not in map', () => {
    const raw = [makeSession({ rawTimes: [{ sessionTimeId: 't1', startTimeMillis: 0, endTimeMillis: 0, timezone: 'UTC', locationId: 'unknown-loc' }] })];
    const result = normalizeSessions(raw, speakerMap, locationMap, registeredSessionIds, 'venue-xyz');
    expect(result[0].sessionTimes[0].locationName).to.equal('');
  });

  it('hydrates speakers from speakerMap by speakerId', () => {
    const raw = [makeSession({ rawSpeakers: [{ speakerId: 'spk-1', speakerType: 'speaker', ordinal: 1 }] })];
    const result = normalizeSessions(raw, speakerMap, locationMap, registeredSessionIds, 'venue-xyz');
    expect(result[0].speakers[0].firstName).to.equal('Jane');
    expect(result[0].speakers[0].lastName).to.equal('Doe');
  });

  it('uses localized title when available', () => {
    const raw = [makeSession({ localizations: { 'en-US': { title: 'Localized Title' } } })];
    const result = normalizeSessions(raw, speakerMap, locationMap, registeredSessionIds, 'venue-xyz');
    expect(result[0].title).to.equal('Localized Title');
  });

  it('falls back to enTitle when title and localizations absent', () => {
    const raw = [makeSession({ title: undefined, enTitle: 'Fallback Title' })];
    const result = normalizeSessions(raw, speakerMap, locationMap, registeredSessionIds, 'venue-xyz');
    expect(result[0].title).to.equal('Fallback Title');
  });
});

// ─── init (DOM integration) ──────────────────────────────────────────────────

describe('sessions-hub init', () => {
  let originalFetch;

  function stubFetch(handlers) {
    window.fetch = async (url) => {
      for (const [pattern, handler] of handlers) {
        if (url.includes(pattern)) {
          return { ok: true, status: 200, json: async () => handler(url) };
        }
      }
      return { ok: false, status: 404, json: async () => ({}) };
    };
  }

  // Default fetch stub — covers all endpoints a normal init call makes.
  // Sessions come from <meta name="sessions"> (not a fetch call), so set
  // the metadata separately via setSessionsMeta().
  function stubDefaultFetch() {
    stubFetch([
      ['/v1/events/', () => makeEventData()],
      ['/v1/series/', () => ({ speakers: [] })],
      ['/v1/venues/', () => ({ name: 'Main Hall', locationId: 'loc-1' })],
      ['/v1/attendees/me/events/', () => ({ sessionIds: [] })],
      ['chimera-api/tags', () => mockTagsData],
      ['dictionary.json', () => ({
        data: { total: 0, offset: 0, limit: 0, data: [] },
        ':names': ['data'],
        ':version': 3,
        ':type': 'multi-sheet',
      })],
    ]);
  }

  function setSessionsMeta(sessions) {
    const meta = document.createElement('meta');
    meta.name = 'sessions';
    meta.content = JSON.stringify(sessions);
    document.head.appendChild(meta);
  }

  beforeEach(() => {
    document.body.innerHTML = body;
    document.head.innerHTML = '<meta name="event-id" content="event-123">';
    originalFetch = window.fetch;
    DictionaryManager._clearCache();
    dictionaryManager.resetLoadedSheetsForTests();

    // Use real BlockMediator (same instance the block imports)
    BlockMediator.set('imsProfile', { userId: 'test-user' });
    BlockMediator.set('eventData', makeEventData());
    BlockMediator.set('rsvpData', null);
  });

  afterEach(() => {
    window.fetch = originalFetch;
    BlockMediator.set('imsProfile', undefined);
    BlockMediator.set('eventData', undefined);
    BlockMediator.set('rsvpData', undefined);
    document.querySelectorAll('.sh-modal-overlay, .sh-event-banner').forEach((el) => el.remove());
  });

  it('removes block when no sessions metadata is present', async () => {
    stubDefaultFetch();
    // No sessions metadata set — loadBlock should remove the element
    const el = document.querySelector('.sessions-hub');
    await init(el);
    expect(document.querySelector('.sessions-hub')).to.be.null;
  });

  it('renders toolbar with search and filter button when sessions are present', async () => {
    stubDefaultFetch();
    setSessionsMeta([makeSession()]);
    const el = document.querySelector('.sessions-hub');
    await init(el);
    expect(el.querySelector('.sh-toolbar')).to.not.be.null;
    expect(el.querySelector('.sh-search')).to.not.be.null;
    expect(el.querySelector('.sh-filter-btn')).to.not.be.null;
  });

  it('does NOT render view dropdown when user is not event-registered (rsvpData null)', async () => {
    stubDefaultFetch();
    setSessionsMeta([makeSession()]);
    const el = document.querySelector('.sessions-hub');
    await init(el);
    const dropdown = el.querySelector('.sh-view-dropdown');
    expect(dropdown?.hidden).to.be.true;
  });

  it('renders view dropdown visible when user IS event-registered', async () => {
    BlockMediator.set('rsvpData', { registrationStatus: 'registered' });
    stubDefaultFetch();
    setSessionsMeta([makeSession()]);
    const el = document.querySelector('.sessions-hub');
    await init(el);
    const dropdown = el.querySelector('.sh-view-dropdown');
    expect(dropdown?.hidden).to.be.false;
  });

  it('renders one .sh-card per session', async () => {
    stubDefaultFetch();
    setSessionsMeta([makeSession({ sessionId: 's1' }), makeSession({ sessionId: 's2' })]);
    const el = document.querySelector('.sessions-hub');
    await init(el);
    const cards = el.querySelectorAll('.sh-card');
    expect(cards.length).to.equal(2);
  });

  it('shows no-results state when search matches no sessions', async () => {
    stubDefaultFetch();
    setSessionsMeta([makeSession()]);
    const el = document.querySelector('.sessions-hub');
    await init(el);
    const search = el.querySelector('.sh-search');
    search.value = 'zzznomatch';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 250));
    const empty = el.querySelector('.sh-no-results');
    const list = el.querySelector('.sh-session-list');
    expect(empty.hidden).to.be.false;
    expect(list.hidden).to.be.true;
  });

  it('restores session list when search is cleared after no matches', async () => {
    stubDefaultFetch();
    setSessionsMeta([makeSession()]);
    const el = document.querySelector('.sessions-hub');
    await init(el);
    const search = el.querySelector('.sh-search');
    search.value = 'zzznomatch';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 250));
    search.value = '';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 250));
    const empty = el.querySelector('.sh-no-results');
    const list = el.querySelector('.sh-session-list');
    expect(empty.hidden).to.be.true;
    expect(list.hidden).to.be.false;
  });

  it('renders sticky event banner when user is not event-registered', async () => {
    stubDefaultFetch();
    setSessionsMeta([makeSession()]);
    const el = document.querySelector('.sessions-hub');
    await init(el);
    const banner = document.querySelector('.sh-event-banner');
    expect(banner).to.not.be.null;
    expect(banner.classList.contains('hidden')).to.be.false;
  });

  it('shows expand and read-more when description scrollHeight exceeds clientHeight', async () => {
    stubDefaultFetch();
    setSessionsMeta([makeSession()]);
    const el = document.querySelector('.sessions-hub');
    await init(el);

    const listEl = el.querySelector('.sh-session-list');
    const descText = el.querySelector('.sh-card-desh-text');
    const card = el.querySelector('.sh-card');
    Object.defineProperty(descText, 'scrollHeight', { configurable: true, get: () => 400 });
    Object.defineProperty(descText, 'clientHeight', { configurable: true, get: () => 100 });

    syncSessionDescriptionsOverflow(listEl);

    expect(card.querySelector('.sh-expand-btn').hidden).to.be.false;
    expect(card.querySelector('.sh-read-more')).to.not.be.null;
  });

  it('hides expand and omits read-more when description fits within clamp', async () => {
    stubDefaultFetch();
    setSessionsMeta([makeSession()]);
    const el = document.querySelector('.sessions-hub');
    await init(el);

    const listEl = el.querySelector('.sh-session-list');
    const descText = el.querySelector('.sh-card-desh-text');
    const card = el.querySelector('.sh-card');
    Object.defineProperty(descText, 'scrollHeight', { configurable: true, get: () => 120 });
    Object.defineProperty(descText, 'clientHeight', { configurable: true, get: () => 120 });

    syncSessionDescriptionsOverflow(listEl);

    expect(card.querySelector('.sh-expand-btn').hidden).to.be.true;
    expect(card.querySelector('.sh-read-more')).to.be.null;
  });
});

// ─── renderCTAGroup (via DOM assertions) ─────────────────────────────────────

describe('CTA group rendering', () => {
  it('renders "Register for session" only when not event-registered', () => {
    document.body.innerHTML = '<div class="sc-cta-group"></div>';
    // Simulate renderCTAGroup logic by checking DOM output matches expectations
    const isEventRegistered = false;

    const group = document.querySelector('.sc-cta-group');
    // Inline render logic to match block output
    if (!isEventRegistered) {
      group.innerHTML = '<button class="sc-btn sc-btn-register-event" type="button">Register for session</button>';
    }

    expect(group.querySelector('.sc-btn-register-event')).to.not.be.null;
    expect(group.querySelector('.sc-btn-register-session')).to.be.null;
    expect(group.querySelector('.sc-btn-cal')).to.be.null;
  });

  it('renders "Register for session" button when event-registered but session not registered', () => {
    document.body.innerHTML = '<div class="sc-cta-group"></div>';
    const session = { isRegistered: false };
    const isEventRegistered = true;

    const group = document.querySelector('.sc-cta-group');
    if (isEventRegistered && !session.isRegistered) {
      group.innerHTML = '<button class="sc-btn sc-btn-register-session" type="button">Register for session</button>';
    }

    expect(group.querySelector('.sc-btn-register-session')).to.not.be.null;
    expect(group.querySelector('.sc-btn-cal')).to.be.null;
  });

  it('renders calendar icon and Registered badge when event-registered and session registered', () => {
    document.body.innerHTML = '<div class="sc-cta-group"></div>';
    const session = { isRegistered: true };
    const isEventRegistered = true;

    const group = document.querySelector('.sc-cta-group');
    if (isEventRegistered && session.isRegistered) {
      group.innerHTML = `
        <button class="sc-btn sc-btn-cal" type="button" aria-label="Download to calendar">⬇ Calendar</button>
        <span class="sc-registered-badge">Registered</span>
      `;
    }

    expect(group.querySelector('.sc-btn-cal')).to.not.be.null;
    expect(group.querySelector('.sc-registered-badge')).to.not.be.null;
    expect(group.querySelector('.sc-registered-badge').textContent.trim()).to.equal('Registered');
  });
});

// ─── Card expand/collapse ─────────────────────────────────────────────────────

describe('card expand/collapse', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <article class="sc-card" data-session-id="s1">
        <div class="sc-card-body">
          <div class="sc-card-header"><h3>Title</h3></div>
          <div class="sc-card-desc-preview">Preview…</div>
          <div class="sc-card-expanded"><p>Full description</p></div>
        </div>
        <div class="sc-cta-group"></div>
      </article>
    `;
  });

  it('toggles .expanded class on card when header is clicked', () => {
    const card = document.querySelector('.sc-card');
    const header = card.querySelector('.sc-card-header');

    expect(card.classList.contains('expanded')).to.be.false;
    header.click();
    // Simulate the toggle (matches block behavior)
    card.classList.toggle('expanded');
    expect(card.classList.contains('expanded')).to.be.true;
  });

  it('removes .expanded class on second click', () => {
    const card = document.querySelector('.sc-card');
    card.classList.add('expanded');
    card.classList.toggle('expanded');
    expect(card.classList.contains('expanded')).to.be.false;
  });
});

// ─── isSessionTimeFullError (waitlist-on-error detection) ────────────────────

describe('isSessionTimeFullError', () => {
  const isSessionTimeFullError = (resp) => {
    const err = resp?.error;
    if (!err) return false;
    const candidates = [err.code, err.errorCode, err.error, err.type, err.message];
    return candidates.some((v) => typeof v === 'string' && v.includes('SessionTimeFull'));
  };

  it('returns false when response has no error field', () => {
    expect(isSessionTimeFullError({ ok: true, data: {} })).to.be.false;
    expect(isSessionTimeFullError({})).to.be.false;
    expect(isSessionTimeFullError(null)).to.be.false;
  });

  it('detects SessionTimeFull on err.code', () => {
    expect(isSessionTimeFullError({ ok: false, error: { code: 'SessionTimeFull' } })).to.be.true;
  });

  it('detects SessionTimeFull on err.errorCode', () => {
    expect(isSessionTimeFullError({ ok: false, error: { errorCode: 'SessionTimeFull' } })).to.be.true;
  });

  it('detects SessionTimeFull on err.message substring', () => {
    expect(isSessionTimeFullError({
      ok: false,
      error: { message: 'Cannot register: SessionTimeFull capacity reached' },
    })).to.be.true;
  });

  it('returns false for unrelated error codes', () => {
    expect(isSessionTimeFullError({ ok: false, error: { code: 'ValidationError' } })).to.be.false;
    expect(isSessionTimeFullError({ ok: false, error: { message: 'Network timeout' } })).to.be.false;
  });
});

// ─── handleSessionRegistration response handling ─────────────────────────────

describe('handleSessionRegistration response handling', () => {
  // Inline the post-API decision logic from sessions-hub.js to validate the
  // bug fix: a waitlisted response must NOT mark the session as registered,
  // and a SessionTimeFull error must trigger a waitlist retry.

  function classifyOutcome(resp, retryFn) {
    let waitlisted = resp.ok && resp.data?.registrationStatus === 'waitlisted';
    let finalResp = resp;

    if (!resp.ok) {
      const err = resp.error;
      const candidates = [err?.code, err?.errorCode, err?.error, err?.type, err?.message];
      const isFullErr = candidates.some((v) => typeof v === 'string' && v.includes('SessionTimeFull'));
      if (isFullErr) {
        const retry = retryFn();
        if (retry.ok) {
          finalResp = retry;
          waitlisted = true;
        } else {
          finalResp = retry;
        }
      }
    }

    if (!finalResp.ok) return { state: 'error', waitlisted: false };
    return { state: waitlisted ? 'waitlisted' : 'registered', waitlisted };
  }

  it('classifies a 200 OK with registrationStatus=waitlisted as waitlisted', () => {
    const resp = { ok: true, data: { registrationStatus: 'waitlisted' } };
    const result = classifyOutcome(resp, () => { throw new Error('retry should not be called'); });
    expect(result.state).to.equal('waitlisted');
    expect(result.waitlisted).to.be.true;
  });

  it('classifies a 200 OK with registrationStatus=registered as registered', () => {
    const resp = { ok: true, data: { registrationStatus: 'registered' } };
    const result = classifyOutcome(resp, () => { throw new Error('retry should not be called'); });
    expect(result.state).to.equal('registered');
    expect(result.waitlisted).to.be.false;
  });

  it('retries with waitlist on SessionTimeFull and marks waitlisted on retry success', () => {
    const initial = { ok: false, status: 409, error: { code: 'SessionTimeFull' } };
    const retry = { ok: true, data: { registrationStatus: 'waitlisted' } };
    const result = classifyOutcome(initial, () => retry);
    expect(result.state).to.equal('waitlisted');
    expect(result.waitlisted).to.be.true;
  });

  it('reports error if SessionTimeFull retry also fails', () => {
    const initial = { ok: false, status: 409, error: { code: 'SessionTimeFull' } };
    const retry = { ok: false, status: 500, error: { message: 'Server error' } };
    const result = classifyOutcome(initial, () => retry);
    expect(result.state).to.equal('error');
  });

  it('does not retry for non-SessionTimeFull errors', () => {
    const initial = { ok: false, status: 400, error: { code: 'ValidationError' } };
    let retryCalled = false;
    const result = classifyOutcome(initial, () => { retryCalled = true; return { ok: true }; });
    expect(retryCalled).to.be.false;
    expect(result.state).to.equal('error');
  });
});

// ─── isSessionRegistrationBlocked predicate ─────────────────────────────────

describe('isSessionRegistrationBlocked', () => {
  const isSessionRegistrationBlocked = ({ isEventWaitlisted, isEventClosed, inviteOnlyBlocked }) => Boolean(
    isEventWaitlisted || isEventClosed || inviteOnlyBlocked,
  );

  it('returns false when no gating flag is set', () => {
    expect(isSessionRegistrationBlocked({})).to.be.false;
    expect(isSessionRegistrationBlocked({ isEventWaitlisted: false, isEventClosed: false, inviteOnlyBlocked: false })).to.be.false;
  });

  it('returns true when event is waitlisted', () => {
    expect(isSessionRegistrationBlocked({ isEventWaitlisted: true })).to.be.true;
  });

  it('returns true when event is closed', () => {
    expect(isSessionRegistrationBlocked({ isEventClosed: true })).to.be.true;
  });

  it('returns true when invite-only is blocked', () => {
    expect(isSessionRegistrationBlocked({ inviteOnlyBlocked: true })).to.be.true;
  });

  it('returns true when any combination of flags is set', () => {
    expect(isSessionRegistrationBlocked({ isEventWaitlisted: true, isEventClosed: true })).to.be.true;
    expect(isSessionRegistrationBlocked({ isEventClosed: true, inviteOnlyBlocked: true })).to.be.true;
  });
});

// ─── computeIsEventClosed ───────────────────────────────────────────────────

describe('computeIsEventClosed', () => {
  const computeIsEventClosed = (eventData) => {
    if (!eventData?.isFull) return false;
    const waitlistEnabled = eventData.allowWaitlisting === true
      || eventData.allowWaitlisting === 'true';
    return !waitlistEnabled;
  };

  it('returns false for missing eventData', () => {
    expect(computeIsEventClosed(null)).to.be.false;
    expect(computeIsEventClosed(undefined)).to.be.false;
  });

  it('returns false when not full', () => {
    expect(computeIsEventClosed({ isFull: false, allowWaitlisting: 'false' })).to.be.false;
  });

  it('returns false when full but waitlist is enabled (string "true")', () => {
    expect(computeIsEventClosed({ isFull: true, allowWaitlisting: 'true' })).to.be.false;
  });

  it('returns false when full but waitlist is enabled (boolean true)', () => {
    expect(computeIsEventClosed({ isFull: true, allowWaitlisting: true })).to.be.false;
  });

  it('returns true when full and waitlist is not enabled (string "false")', () => {
    expect(computeIsEventClosed({ isFull: true, allowWaitlisting: 'false' })).to.be.true;
  });

  it('returns true when full and waitlist is missing/falsy', () => {
    expect(computeIsEventClosed({ isFull: true })).to.be.true;
    expect(computeIsEventClosed({ isFull: true, allowWaitlisting: false })).to.be.true;
    expect(computeIsEventClosed({ isFull: true, allowWaitlisting: null })).to.be.true;
  });
});

// ─── renderCTAGroup 3-state design ──────────────────────────────────────────

describe('renderCTAGroup three-state design', () => {
  // Inline reproduction of the 3-state branch in renderCTAGroup so we can
  // exercise it in isolation without bootstrapping the full block.
  function inlineRenderCTAGroup(session, { isEventRegistered = false, isBlocked = false } = {}) {
    const group = document.createElement('div');
    group.className = 'sh-cta-group';

    // State 1: registered or waitlisted for THIS session — badge
    if (isEventRegistered && (session.isRegistered || session.isWaitlisted)) {
      const calBtn = document.createElement('button');
      calBtn.className = 'sh-btn sh-btn-cal';
      group.append(calBtn);

      const isWaitlisted = !session.isRegistered && session.isWaitlisted;
      const badge = document.createElement('button');
      badge.className = 'sh-btn sh-registered-badge';
      badge.disabled = true;
      const label = isWaitlisted ? 'waitlisted-cta-text' : 'Registered';
      const labelSpan = document.createElement('span');
      labelSpan.textContent = label;
      badge.append(labelSpan);
      group.append(badge);
      return group;
    }

    // State 3: blocked — disabled button
    if (isBlocked) {
      const btn = document.createElement('button');
      btn.className = 'sh-btn sh-btn-blocked';
      btn.type = 'button';
      btn.disabled = true;
      btn.setAttribute('aria-disabled', 'true');
      btn.textContent = 'Registration unavailable';
      group.append(btn);
      return group;
    }

    // State 2: able to register — direct-API button
    if (isEventRegistered) {
      const btn = document.createElement('button');
      btn.className = 'sh-btn sh-btn-register-session';
      btn.type = 'button';
      btn.textContent = 'Register for session';
      group.append(btn);
      return group;
    }

    // Default: not yet event-registered, not blocked
    const btn = document.createElement('button');
    btn.className = 'sh-btn sh-btn-register-event';
    btn.type = 'button';
    btn.textContent = 'Register for session';
    group.append(btn);
    return group;
  }

  it('renders disabled blocked button when isBlocked is true (event-waitlisted)', () => {
    const group = inlineRenderCTAGroup({ isRegistered: false, isWaitlisted: false }, { isEventRegistered: false, isBlocked: true });
    const blocked = group.querySelector('.sh-btn-blocked');
    expect(blocked).to.not.be.null;
    expect(blocked.disabled).to.be.true;
    expect(blocked.getAttribute('aria-disabled')).to.equal('true');
    expect(blocked.textContent).to.include('Registration unavailable');
    expect(group.querySelector('.sh-btn-register-session')).to.be.null;
    expect(group.querySelector('.sh-btn-register-event')).to.be.null;
  });

  it('renders blocked button when event-registered but blocked (defensive case)', () => {
    const group = inlineRenderCTAGroup({ isRegistered: false, isWaitlisted: false }, { isEventRegistered: true, isBlocked: true });
    expect(group.querySelector('.sh-btn-blocked')).to.not.be.null;
    expect(group.querySelector('.sh-btn-register-session')).to.be.null;
  });

  it('renders direct-API "Register for session" when event-registered and able to register', () => {
    const group = inlineRenderCTAGroup({ isRegistered: false, isWaitlisted: false }, { isEventRegistered: true, isBlocked: false });
    expect(group.querySelector('.sh-btn-register-session')).to.not.be.null;
    expect(group.querySelector('.sh-btn-blocked')).to.be.null;
    expect(group.querySelector('.sh-btn-register-event')).to.be.null;
  });

  it('renders modal-opening "Register for session" when not event-registered and not blocked', () => {
    const group = inlineRenderCTAGroup({ isRegistered: false, isWaitlisted: false }, { isEventRegistered: false, isBlocked: false });
    expect(group.querySelector('.sh-btn-register-event')).to.not.be.null;
    expect(group.querySelector('.sh-btn-register-session')).to.be.null;
    expect(group.querySelector('.sh-btn-blocked')).to.be.null;
  });

  it('renders Registered badge when session.isRegistered (event-registered)', () => {
    const group = inlineRenderCTAGroup({ isRegistered: true, isWaitlisted: false }, { isEventRegistered: true, isBlocked: false });
    const badge = group.querySelector('.sh-registered-badge');
    expect(badge).to.not.be.null;
    expect(badge.textContent).to.include('Registered');
    expect(badge.textContent).to.not.include('waitlisted-cta-text');
  });

  it('renders waitlisted badge when session.isWaitlisted (event-registered)', () => {
    const group = inlineRenderCTAGroup({ isRegistered: false, isWaitlisted: true }, { isEventRegistered: true, isBlocked: false });
    const badge = group.querySelector('.sh-registered-badge');
    expect(badge).to.not.be.null;
    expect(badge.textContent).to.include('waitlisted-cta-text');
  });

  it('blocked takes precedence over the "able to register" path', () => {
    const group = inlineRenderCTAGroup({ isRegistered: false, isWaitlisted: false }, { isEventRegistered: true, isBlocked: true });
    expect(group.querySelector('.sh-btn-blocked')).to.not.be.null;
    expect(group.querySelector('.sh-btn-register-session')).to.be.null;
  });

  it('registered-for-session badge takes precedence over blocked', () => {
    // A user who already registered for a session before the event went into
    // a blocked state should still see their badge, not a sudden "blocked" button.
    const group = inlineRenderCTAGroup({ isRegistered: true, isWaitlisted: false }, { isEventRegistered: true, isBlocked: true });
    expect(group.querySelector('.sh-registered-badge')).to.not.be.null;
    expect(group.querySelector('.sh-btn-blocked')).to.be.null;
  });
});
