import { constructRequestOptions } from '../../utils/esp-controller.js';
import { getEventServiceEnv } from '../../utils/utils.js';
import { ENV_MAP } from '../../utils/constances.js';

// Fallback speaker photo — real ESL data has no photo field yet (see
// mapEslPayloadToRawSessions(), which sets photo: null), so this fills the gap for
// visual testing of the speaker details view without ever overwriting a real one.
const TEST_SPEAKER_PHOTO = 'https://MWPW-199065--event-libs--adobecom.aem.live/event-libs/v1/blocks/sessions-guide/assets/Kristy-Campbell.jpg';

// Realistic raw ESL/ESP catalog payload — same shape as the real `GET /v1/events/:id/session-catalog`
// response (payload.sessions[] / payload.sessionTimes[] / payload.speakers[], joined by id,
// customAttributes carrying track/audience/etc.) rather than the app's post-mapped session
// shape. Piped through the same mapEslPayloadToRawSessions()/normalizeSessions() pipeline the
// real fetch uses (see fetchSessions() below), so this can never structurally drift from what
// the real API actually returns. Used as a local fallback whenever no real event-id is
// authored, or the real API is unavailable.
function customAttr(name, values) {
  return { name, values };
}

function selectValue(label, value = label.toLowerCase().replace(/\s+/g, '-')) {
  return {
    valueId: `${value}-id`, label, value, ordinal: 0,
  };
}

function textValue(value) {
  return { value };
}

function watchAnchor(url) {
  return textValue(`<br><a href="${url}" target="_blank">Watch</a>`);
}

const MOCK_SPEAKERS = [
  { speakerId: 'sp-narayen', firstName: 'Shantanu', lastName: 'Narayen', localizations: { 'en-US': { title: 'CEO, Adobe' } } },
  { speakerId: 'sp-belsky', firstName: 'Scott', lastName: 'Belsky', localizations: { 'en-US': { title: 'Chief Strategy Officer' } } },
  { speakerId: 'sp-rendle', firstName: 'Robin', lastName: 'Rendle', localizations: { 'en-US': { title: 'Design Systems Lead' } } },
  { speakerId: 'sp-eden', firstName: 'Daniel', lastName: 'Eden', localizations: { 'en-US': { title: 'Design Engineer' } } },
  { speakerId: 'sp-torres', firstName: 'Alex', lastName: 'Torres', localizations: { 'en-US': { title: 'Developer Advocate' } } },
  { speakerId: 'sp-mchen', firstName: 'Mia', lastName: 'Chen', localizations: { 'en-US': { title: 'Platform Engineer' } } },
  { speakerId: 'sp-montalbano', firstName: 'James', lastName: 'Montalbano', localizations: { 'en-US': { title: 'Type Designer' } } },
  { speakerId: 'sp-stossinger', firstName: 'Nina', lastName: 'Stössinger', localizations: { 'en-US': { title: 'Typographer' } } },
  { speakerId: 'sp-park', firstName: 'Yuna', lastName: 'Park', localizations: { 'en-US': { title: 'Commercial Photographer' } } },
  { speakerId: 'sp-faleolo', firstName: 'Tavita', lastName: 'Faleolo', localizations: { 'en-US': { title: 'Senior Video Producer' } } },
  { speakerId: 'sp-hassan', firstName: 'Laila', lastName: 'Hassan', localizations: { 'en-US': { title: 'Content Ops Lead' } } },
  { speakerId: 'sp-nair', firstName: 'Priya', lastName: 'Nair', localizations: { 'en-US': { title: 'UX Research Lead' } } },
  { speakerId: 'sp-sparks', firstName: 'Jenna', lastName: 'Sparks', localizations: { 'en-US': { title: 'Creative Director, Trend Desk' } } },
  { speakerId: 'sp-fernandez', firstName: 'Lucia', lastName: 'Fernandez', localizations: { 'en-US': { title: 'Product Manager, Express' } } },
  { speakerId: 'sp-weber', firstName: 'Stefan', lastName: 'Weber', localizations: { 'en-US': { title: 'AEM Principal Engineer' } } },
  { speakerId: 'sp-sato', firstName: 'Fumiko', lastName: 'Sato', localizations: { 'en-US': { title: 'Solutions Architect' } } },
  { speakerId: 'sp-skov', firstName: 'Ingrid', lastName: 'Skov', localizations: { 'en-US': { title: 'Retouching Specialist' } } },
];

function ms(iso) {
  return Date.parse(iso);
}

const MOCK_SESSION_TIMES = [
  { sessionId: 'k-001', startTimeMillis: ms('2026-11-10T17:00:00Z'), endTimeMillis: ms('2026-11-10T19:00:00Z') },
  { sessionId: 's-001', startTimeMillis: ms('2026-11-10T19:30:00Z'), endTimeMillis: ms('2026-11-10T20:30:00Z') },
  { sessionId: 's-002', startTimeMillis: ms('2026-11-10T19:30:00Z'), endTimeMillis: ms('2026-11-10T20:30:00Z') },
  { sessionId: 's-003', startTimeMillis: ms('2026-11-10T21:00:00Z'), endTimeMillis: ms('2026-11-10T22:00:00Z') },
  // s-004 is deliberately absent — real ancillary/overflow sessions can have no scheduled
  // sessionTime yet, which mapEslPayloadToRawSessions() must degrade gracefully from.
  { sessionId: 's-005', startTimeMillis: ms('2026-11-10T21:00:00Z'), endTimeMillis: ms('2026-11-10T22:00:00Z') },
  { sessionId: 's-006', startTimeMillis: ms('2026-11-11T17:00:00Z'), endTimeMillis: ms('2026-11-11T18:00:00Z') },
  { sessionId: 's-007', startTimeMillis: ms('2026-11-11T17:00:00Z'), endTimeMillis: ms('2026-11-11T18:00:00Z') },
  { sessionId: 's-008', startTimeMillis: ms('2026-11-11T18:30:00Z'), endTimeMillis: ms('2026-11-11T19:30:00Z') },
  { sessionId: 's-009', startTimeMillis: ms('2026-11-11T18:30:00Z'), endTimeMillis: ms('2026-11-11T19:30:00Z') },
  { sessionId: 's-010', startTimeMillis: ms('2026-11-11T20:00:00Z'), endTimeMillis: ms('2026-11-11T21:30:00Z') },
  { sessionId: 's-011', startTimeMillis: ms('2026-11-12T17:00:00Z'), endTimeMillis: ms('2026-11-12T18:30:00Z') },
  { sessionId: 's-012', startTimeMillis: ms('2026-11-12T19:00:00Z'), endTimeMillis: ms('2026-11-12T20:00:00Z') },
  { sessionId: 's-013', startTimeMillis: ms('2026-11-12T19:00:00Z'), endTimeMillis: ms('2026-11-12T20:00:00Z') },
  { sessionId: 's-014', startTimeMillis: ms('2026-11-12T20:30:00Z'), endTimeMillis: ms('2026-11-12T21:30:00Z') },
];

function draftUrl(slug) {
  return `https://www.adobe.com/drafts/esp-dev/max/2026/sessions/${slug}`;
}

function thumb(seed) {
  return [{ imageKind: 'session-card-image', imageUrl: `https://placehold.co/400x225?text=${seed}` }];
}

const MOCK_ESL_SESSIONS = [
  {
    sessionId: 'k-001', sessionCode: 'K001', url: draftUrl('max-keynote-2026'), sessionLengthInMinutes: 120,
    localizations: { 'en-US': { title: 'Adobe MAX 2026 Keynote', description: 'The creative conference that puts the world\'s best creative minds on stage. Join us for a spectacular opening keynote featuring major product announcements and inspiring stories from the world\'s top creators.' } },
    speakers: [{ speakerId: 'sp-narayen', ordinal: 0 }, { speakerId: 'sp-belsky', ordinal: 1 }],
    images: thumb('Keynote'),
    customAttributes: [
      customAttr('Track', [selectValue('Mainstage')]),
      customAttr('Primary Track for Agenda (Digital Agenda)', [selectValue('Mainstage')]),
      customAttr('Session Type', [selectValue('Keynote')]),
      customAttr('Technical Level', [selectValue('All Levels')]),
      customAttr('Audience', [selectValue('All')]),
      customAttr('Product', [selectValue('Adobe Creative Cloud')]),
      customAttr('Format', [selectValue('In person'), selectValue('Online')]),
      customAttr('Watch ', [watchAnchor('/max')]),
    ],
  },
  {
    sessionId: 's-001', sessionCode: 'S001', url: draftUrl('design-systems-at-scale'), sessionLengthInMinutes: 60,
    localizations: { 'en-US': { title: 'Design Systems at Scale', description: 'How large product teams keep design systems consistent across dozens of surfaces without losing velocity.' } },
    speakers: [{ speakerId: 'sp-rendle', ordinal: 0 }, { speakerId: 'sp-eden', ordinal: 1 }],
    images: thumb('DesignSystems'),
    customAttributes: [
      customAttr('Track', [selectValue('Graphic Design and Illustration')]),
      customAttr('Primary Track for Agenda (Digital Agenda)', [selectValue('Graphic Design and Illustration')]),
      customAttr('Session Type', [selectValue('Breakout')]),
      customAttr('Technical Level', [selectValue('Intermediate')]),
      customAttr('Audience', [selectValue('Designer')]),
      customAttr('Product', [selectValue('Adobe Express')]),
      customAttr('Format', [selectValue('In person')]),
    ],
  },
  {
    sessionId: 's-002', sessionCode: 'S002', url: draftUrl('ai-powered-creative-workflows'), sessionLengthInMinutes: 60,
    localizations: { 'en-US': { title: 'AI-Powered Creative Workflows', description: 'Practical patterns for weaving generative AI into an existing production pipeline without disrupting it.' } },
    speakers: [{ speakerId: 'sp-torres', ordinal: 0 }, { speakerId: 'sp-mchen', ordinal: 1 }],
    images: thumb('GenAI'),
    customAttributes: [
      customAttr('Track', [selectValue('Generative AI')]),
      customAttr('Primary Track for Agenda (Digital Agenda)', [selectValue('Generative AI')]),
      customAttr('Programming Category', [selectValue('How To')]),
      customAttr('Session Type', [selectValue('Breakout')]),
      customAttr('Technical Level', [selectValue('Intermediate')]),
      customAttr('Audience', [selectValue('Developer'), selectValue('Designer')]),
      customAttr('Product', [selectValue('Adobe Firefly')]),
      customAttr('Format', [selectValue('Online'), selectValue('On demand, post event')]),
      customAttr('Watch ', [watchAnchor('/max')]),
    ],
  },
  {
    sessionId: 's-003', sessionCode: 'S003', url: draftUrl('typography-variable-fonts'), sessionLengthInMinutes: 60,
    localizations: { 'en-US': { title: 'Typography in the Age of Variable Fonts', description: 'What variable fonts unlock for editorial and product design, and how to adopt them without breaking existing layouts.' } },
    speakers: [{ speakerId: 'sp-montalbano', ordinal: 0 }, { speakerId: 'sp-stossinger', ordinal: 1 }],
    images: thumb('Typography'),
    customAttributes: [
      customAttr('Track', [selectValue('Design and Illustration', 'design-and-illustration')]),
      customAttr('Primary Track for Agenda (Digital Agenda)', [selectValue('Design and Illustration', 'design-and-illustration')]),
      customAttr('Session Type', [selectValue('Breakout')]),
      customAttr('Technical Level', [selectValue('Beginner')]),
      customAttr('Audience', [selectValue('Designer')]),
      customAttr('Product', [selectValue('Adobe Fonts')]),
      customAttr('Format', [selectValue('In person')]),
    ],
  },
  {
    // Real ancillary/overflow session: no sessionTime scheduled yet, no speakers, no
    // customAttributes at all — exercises mapEslPayloadToRawSessions()'s graceful
    // degradation (empty startTimeUtc, empty track/category, no CategoryBadge crash).
    sessionId: 's-004', sessionCode: 'S004', url: draftUrl('overflow-room-tbd'), sessionLengthInMinutes: 0,
    localizations: { 'en-US': { title: 'Overflow Room — Session TBD', description: '' } },
    speakers: [],
    images: [],
    customAttributes: [],
  },
  {
    sessionId: 's-005', sessionCode: 'S005', url: draftUrl('photography-storytelling'), sessionLengthInMinutes: 60,
    localizations: { 'en-US': { title: 'Photography as Storytelling', description: 'Building a narrative arc across a single shoot, from pre-visualization through final sequencing.' } },
    speakers: [{ speakerId: 'sp-park', ordinal: 0 }],
    images: thumb('Photography'),
    customAttributes: [
      customAttr('Track', [selectValue('Photography')]),
      customAttr('Primary Track for Agenda (Digital Agenda)', [selectValue('Photography')]),
      customAttr('Session Type', [selectValue('Breakout')]),
      customAttr('Technical Level', [selectValue('Intermediate')]),
      customAttr('Audience', [selectValue('Photographer')]),
      customAttr('Product', [selectValue('Adobe Lightroom')]),
      customAttr('Format', [selectValue('In person')]),
    ],
  },
  {
    sessionId: 's-006', sessionCode: 'S006', url: draftUrl('motion-graphics-fundamentals'), sessionLengthInMinutes: 60,
    localizations: { 'en-US': { title: 'Motion Graphics Fundamentals', description: 'Core animation principles applied to short-form social and product marketing deliverables.' } },
    speakers: [{ speakerId: 'sp-faleolo', ordinal: 0 }],
    images: thumb('Motion'),
    customAttributes: [
      customAttr('Track', [selectValue('Video, Audio, and Motion', 'video-audio-and-motion')]),
      customAttr('Primary Track for Agenda (Digital Agenda)', [selectValue('Video, Audio, and Motion', 'video-audio-and-motion')]),
      customAttr('Session Type', [selectValue('Lab')]),
      customAttr('Technical Level', [selectValue('Beginner')]),
      customAttr('Audience', [selectValue('Designer'), selectValue('Marketer')]),
      customAttr('Product', [selectValue('Adobe After Effects')]),
      customAttr('Format', [selectValue('In person')]),
    ],
  },
  {
    sessionId: 's-007', sessionCode: 'S007', url: draftUrl('brand-systems-that-scale'), sessionLengthInMinutes: 60,
    localizations: { 'en-US': { title: 'Building Brand Systems That Scale', description: 'How global brand teams keep visual identity consistent across hundreds of local campaigns.' } },
    speakers: [{ speakerId: 'sp-hassan', ordinal: 0 }, { speakerId: 'sp-nair', ordinal: 1 }],
    images: thumb('Branding'),
    customAttributes: [
      customAttr('Track', [selectValue('Branding')]),
      customAttr('Primary Track for Agenda (Digital Agenda)', [selectValue('Branding')]),
      customAttr('Session Type', [selectValue('Panel')]),
      customAttr('Technical Level', [selectValue('All Levels')]),
      customAttr('Audience', [selectValue('Marketer'), selectValue('Designer')]),
      customAttr('Product', [selectValue('Adobe Express')]),
      customAttr('Format', [selectValue('In person'), selectValue('Online')]),
      customAttr('Watch ', [watchAnchor('/max')]),
      customAttr('LegalDisclaimer', [textValue('<p>Session content subject to change. Recorded with audience consent.</p>')]),
    ],
  },
  {
    sessionId: 's-008', sessionCode: 'S008', url: draftUrl('social-content-at-speed'), sessionLengthInMinutes: 60,
    localizations: { 'en-US': { title: 'Social Media Content at Speed', description: 'Templated, on-brand social content production for teams shipping daily across five-plus channels.' } },
    speakers: [{ speakerId: 'sp-sparks', ordinal: 0 }],
    images: thumb('Social'),
    customAttributes: [
      customAttr('Track', [selectValue('Social Media and Marketing', 'social-media-and-marketing')]),
      customAttr('Primary Track for Agenda (Digital Agenda)', [selectValue('Social Media and Marketing', 'social-media-and-marketing')]),
      customAttr('Session Type', [selectValue('Breakout')]),
      customAttr('Technical Level', [selectValue('Beginner')]),
      customAttr('Audience', [selectValue('Marketer')]),
      customAttr('Product', [selectValue('Adobe Express')]),
      customAttr('Format', [selectValue('In person')]),
    ],
  },
  {
    sessionId: 's-009', sessionCode: 'S009', url: draftUrl('express-for-teams-playbook'), sessionLengthInMinutes: 60,
    localizations: { 'en-US': { title: 'Express for Teams: Collaboration Playbook', description: 'Rolling out shared brand kits, templates, and approval workflows across a growing marketing org.' } },
    speakers: [{ speakerId: 'sp-fernandez', ordinal: 0 }],
    images: thumb('ExpressTeams'),
    customAttributes: [
      customAttr('Track', [selectValue('Creativity and Marketing in Business', 'creativity-and-marketing-in-business')]),
      customAttr('Primary Track for Agenda (Digital Agenda)', [selectValue('Creativity and Marketing in Business', 'creativity-and-marketing-in-business')]),
      customAttr('Session Type', [selectValue('Breakout')]),
      customAttr('Technical Level', [selectValue('Beginner')]),
      customAttr('Audience', [selectValue('Marketer'), selectValue('Business')]),
      customAttr('Product', [selectValue('Adobe Express')]),
      customAttr('Format', [selectValue('In person'), selectValue('Online')]),
      customAttr('Watch ', [watchAnchor('/max')]),
    ],
  },
  {
    sessionId: 's-010', sessionCode: 'S010', url: draftUrl('3d-product-visualization'), sessionLengthInMinutes: 90,
    localizations: { 'en-US': { title: '3D Product Visualization Deep Dive', description: 'End-to-end pipeline from CAD import to photoreal render for e-commerce product imagery.' } },
    speakers: [{ speakerId: 'sp-weber', ordinal: 0 }, { speakerId: 'sp-sato', ordinal: 1 }],
    images: thumb('3D'),
    customAttributes: [
      customAttr('Track', [selectValue('3D')]),
      customAttr('Primary Track for Agenda (Digital Agenda)', [selectValue('3D')]),
      customAttr('Session Type', [selectValue('Lab')]),
      customAttr('Technical Level', [selectValue('Advanced')]),
      customAttr('Audience', [selectValue('Designer'), selectValue('Developer')]),
      customAttr('Product', [selectValue('Adobe Substance 3D')]),
      customAttr('Format', [selectValue('In person')]),
    ],
  },
  {
    sessionId: 's-011', sessionCode: 'S011', url: draftUrl('closing-keynote-future-of-creativity'), sessionLengthInMinutes: 90,
    localizations: { 'en-US': { title: 'Closing Keynote: The Future of Creativity', description: 'A look at where creative tools are headed next, and what it means for every kind of creator.' } },
    speakers: [{ speakerId: 'sp-narayen', ordinal: 0 }],
    images: thumb('ClosingKeynote'),
    customAttributes: [
      customAttr('Track', [selectValue('Mainstage')]),
      customAttr('Primary Track for Agenda (Digital Agenda)', [selectValue('Mainstage')]),
      customAttr('Session Type', [selectValue('Keynote')]),
      customAttr('Technical Level', [selectValue('All Levels')]),
      customAttr('Audience', [selectValue('All')]),
      customAttr('Product', [selectValue('Adobe Creative Cloud')]),
      customAttr('Format', [selectValue('In person'), selectValue('Online')]),
      customAttr('Watch ', [watchAnchor('/max')]),
      customAttr('LegalDisclaimer', [textValue('<p>Session content subject to change. Recorded with audience consent.</p>')]),
    ],
  },
  {
    sessionId: 's-012', sessionCode: 'S012', url: draftUrl('retouching-at-scale-lightroom'), sessionLengthInMinutes: 60,
    localizations: { 'en-US': { title: 'Retouching at Scale in Lightroom', description: 'Batch retouching techniques for high-volume shoots without sacrificing per-image quality.' } },
    speakers: [{ speakerId: 'sp-skov', ordinal: 0 }],
    images: [],
    customAttributes: [
      customAttr('Track', [selectValue('Photography')]),
      customAttr('Primary Track for Agenda (Digital Agenda)', [selectValue('Photography')]),
      customAttr('Session Type', [selectValue('Breakout')]),
      customAttr('Technical Level', [selectValue('Intermediate')]),
      customAttr('Audience', [selectValue('Photographer')]),
      customAttr('Product', [selectValue('Adobe Lightroom')]),
      customAttr('Format', [selectValue('On demand, post event')]),
    ],
  },
  {
    sessionId: 's-013', sessionCode: 'S013', url: draftUrl('creator-economy-monetizing-craft'), sessionLengthInMinutes: 60,
    localizations: { 'en-US': { title: 'Creator Economy: Monetizing Your Craft', description: 'What\'s actually working right now for independent creators building a sustainable practice.' } },
    speakers: [{ speakerId: 'sp-sparks', ordinal: 0 }, { speakerId: 'sp-fernandez', ordinal: 1 }],
    images: thumb('Creator'),
    customAttributes: [
      customAttr('Track', [selectValue('Creator')]),
      customAttr('Primary Track for Agenda (Digital Agenda)', [selectValue('Creator')]),
      customAttr('Session Type', [selectValue('Panel')]),
      customAttr('Technical Level', [selectValue('All Levels')]),
      customAttr('Audience', [selectValue('Creator')]),
      customAttr('Product', [selectValue('Adobe Express')]),
      customAttr('Format', [selectValue('In person'), selectValue('Online')]),
    ],
  },
  {
    sessionId: 's-014', sessionCode: 'S014', url: draftUrl('teaching-creative-tools'), sessionLengthInMinutes: 60,
    localizations: { 'en-US': { title: 'Education Track: Teaching Creative Tools', description: 'Curriculum patterns that get students productive in creative software in a single semester.' } },
    speakers: [{ speakerId: 'sp-nair', ordinal: 0 }],
    images: thumb('Education'),
    customAttributes: [
      customAttr('Track', [selectValue('Education')]),
      customAttr('Primary Track for Agenda (Digital Agenda)', [selectValue('Education')]),
      customAttr('Session Type', [selectValue('Breakout')]),
      customAttr('Technical Level', [selectValue('Beginner')]),
      customAttr('Audience', [selectValue('Educator'), selectValue('Student')]),
      customAttr('Product', [selectValue('Adobe Express')]),
      customAttr('Format', [selectValue('In person')]),
    ],
  },
];

// eslint-disable-next-line no-unused-vars
const MOCK_ESL_PAYLOAD = {
  speakers: MOCK_SPEAKERS,
  sessionTimes: MOCK_SESSION_TIMES,
  sessions: MOCK_ESL_SESSIONS,
};

function coerceArray(value) {
  if (Array.isArray(value)) return value;
  return value ? [value] : [];
}

export function normalizeSessions(rawSessions) {
  return rawSessions.map((s) => ({
    id: s.id || '',
    slug: s.slug || '',
    rfCode: s.rfCode || '',
    title: s.title || '',
    description: s.description || '',
    startTimeUtc: s.startTimeUtc || '',
    endTimeUtc: s.endTimeUtc || '',
    duration: s.duration || 0,
    track: s.track || '',
    type: s.type || '',
    technicalLevel: s.technicalLevel || '',
    category: coerceArray(s.category),
    contentCategory: coerceArray(s.contentCategory),
    audience: coerceArray(s.audience),
    speakers: (s.speakers || []).map((sp) => ({ ...sp, photo: sp.photo || TEST_SPEAKER_PHOTO })),
    products: s.products || [],
    resources: s.resources || [],
    mrStreamId: s.mrStreamId ?? null,
    videoAvailable: Boolean(s.videoAvailable),
    inPerson: Boolean(s.inPerson),
    sessionPageUrl: s.sessionPageUrl || '',
    watchUrl: s.watchUrl || '',
    isKeynote: Boolean(s.isKeynote),
    thumbnailUrl: s.thumbnailUrl ?? null,
    ...(s.copyrightDisclaimer ? { copyrightDisclaimer: s.copyrightDisclaimer } : {}),
  }));
}

// Event ID is mock-only on every page today (no page authors real `event-id` metadata
// yet) — fetchSessions() falls back to MOCK_ESL_PAYLOAD whenever it's absent, and only
// attempts the real ESL/ESP call once one is provided.

// Single source of truth so the name only has to change in one place — ESP is expected
// to rename this custom attribute for the MAX 2026 event; swap the string here when the
// new name lands. Exported so tier-1-event-configurator/utils.js (which needs the same
// attribute for its own track editor) doesn't carry a second, independently-drifting copy.
export const TRACK_ATTRIBUTE_NAME = 'Primary Track for Agenda (Digital Agenda)';

// Generic session/track helpers, not Tier-1-specific — moved here (2026-07-30) so both
// tier-1-event-configurator and session-guide-configurator import the same
// implementation instead of one DA app importing from the other's UI code.
export function getSessionTrack(session) {
  const attr = (session?.customAttributes || []).find((a) => a?.name === TRACK_ATTRIBUTE_NAME);
  return attr?.values?.[0]?.label ?? attr?.values?.[0]?.value ?? null;
}

export function extractDistinctTracks(sessions) {
  const tracks = new Set();
  (sessions || []).forEach((session) => {
    const value = getSessionTrack(session);
    if (value) tracks.add(value);
  });
  return [...tracks].sort();
}

// Derives facetable custom attributes + their distinct values from an already-fetched
// session catalog. Mirrors the same enabled/inputType/valueId gate ESP's own
// /session-facets applies server-side (see events-service-platform's
// resolveCustomAttributes/buildAttributeIndexItems), so results match it field-for-
// field, without the extra network round-trip — both consumers (session-guide-
// configurator's own Filters step, and sessions-guide's FilterPanel.js) already have
// the full session catalog in memory for other reasons. See
// session-guide-configurator/PLAN.md §7 for the full design writeup.
export function deriveFacetableAttributes(sessions) {
  const attributeMap = new Map(); // attributeId -> { attributeId, label, values: Map<valueId, {...}> }
  (sessions || []).forEach((session) => {
    (session.customAttributes || []).forEach((attr) => {
      if (attr.enabled === false) return;
      if (!['single-select', 'multi-select'].includes(attr.inputType)) return;
      if (!attributeMap.has(attr.attributeId)) {
        attributeMap.set(attr.attributeId, { attributeId: attr.attributeId, label: attr.label, values: new Map() });
      }
      const group = attributeMap.get(attr.attributeId);
      (attr.values || []).forEach((v) => {
        if (!v.valueId) return; // free-text values aren't indexable
        if (!group.values.has(v.valueId)) {
          group.values.set(v.valueId, {
            valueId: v.valueId, label: v.label, ordinal: v.ordinal, count: 0,
          });
        }
        group.values.get(v.valueId).count += 1;
      });
    });
  });
  return [...attributeMap.values()].map((group) => ({
    attributeId: group.attributeId,
    label: group.label,
    values: [...group.values.values()].sort((a, b) => a.ordinal - b.ordinal),
  }));
}

// customAttributes carry things like track/audience/technical-level as name+values pairs
// rather than plain session fields. `values[]` holds the value(s) actually selected for
// that session (see events-service-platform's resolveCustomAttributes), not the full
// option list.
function extractCustomAttributeValues(session, name) {
  const attr = (session.customAttributes || []).find((a) => a?.name === name);
  return (attr?.values || []).map((v) => v?.label ?? v?.value).filter(Boolean);
}

function extractCustomAttributeValue(session, name) {
  return extractCustomAttributeValues(session, name)[0] || '';
}

// The `Watch ` customAttribute's value is a raw HTML anchor (e.g.
// `<a href="...">Watch</a>`) rather than a bare URL — pull the href out of it.
function extractWatchUrl(session) {
  const html = extractCustomAttributeValue(session, 'Watch ');
  return /href="([^"]+)"/.exec(html)?.[1] || '';
}

// `sessions[].url` is an internal drafts/staging link, not usable as a production page
// URL — but its last path segment is exactly the slug we want.
function slugFromUrl(url) {
  if (!url) return '';
  const segments = url.split('?')[0].split('#')[0].split('/').filter(Boolean);
  return segments[segments.length - 1] || '';
}

// Joins the ESL/ESP catalog payload's flat, relational arrays (sessions/sessionTimes/
// speakers, related by id) into the raw-session shape normalizeSessions() expects — used
// for both the real fetch and MOCK_ESL_PAYLOAD, so mock and real data always agree.
export function mapEslPayloadToRawSessions(payload) {
  const speakersById = new Map((payload.speakers || []).map((sp) => [sp.speakerId, sp]));
  const timesBySessionId = new Map();
  (payload.sessionTimes || []).forEach((t) => {
    if (!timesBySessionId.has(t.sessionId)) timesBySessionId.set(t.sessionId, []);
    timesBySessionId.get(t.sessionId).push(t);
  });

  return (payload.sessions || []).map((session) => {
    // Some real sessions (canceled, TBD, overflow-room placeholders) have no scheduled
    // sessionTime yet — startTimeUtc/endTimeUtc fall through to '' below, and
    // utils/time.js's formatters/getSessionDayKey() are guarded to handle that gracefully.
    const times = (timesBySessionId.get(session.sessionId) || [])
      .slice()
      .sort((a, b) => (a.startTimeMillis ?? 0) - (b.startTimeMillis ?? 0));
    const [firstTime] = times;

    const speakers = (session.speakers || [])
      .slice()
      .sort((a, b) => (a.ordinal ?? 0) - (b.ordinal ?? 0))
      .map((ref) => speakersById.get(ref.speakerId))
      .filter(Boolean)
      .map((sp) => ({
        name: `${sp.firstName || ''} ${sp.lastName || ''}`.trim(),
        title: sp.localizations?.['en-US']?.title || '',
        photo: null,
      }));

    const formatValues = extractCustomAttributeValues(session, 'Format');
    const type = extractCustomAttributeValue(session, 'Session Type');
    const slug = slugFromUrl(session.url);
    const thumbnail = (session.images || []).find((img) => img.imageKind === 'session-card-image');

    return {
      id: session.sessionId,
      slug,
      rfCode: session.sessionCode || '',
      title: session.localizations?.['en-US']?.title || session.enTitle || '',
      description: session.localizations?.['en-US']?.description || '',
      startTimeUtc: firstTime ? new Date(firstTime.startTimeMillis).toISOString() : '',
      endTimeUtc: firstTime ? new Date(firstTime.endTimeMillis).toISOString() : '',
      duration: session.sessionLengthInMinutes || 0,
      // "Track" is topic-like (drives the card icon); "Primary Track for Agenda" is the
      // single value shown as the card/detail track name — two distinct real attributes.
      track: extractCustomAttributeValue(session, TRACK_ATTRIBUTE_NAME),
      category: extractCustomAttributeValues(session, 'Track'),
      contentCategory: extractCustomAttributeValues(session, 'Programming Category'),
      type,
      technicalLevel: extractCustomAttributeValue(session, 'Technical Level'),
      audience: extractCustomAttributeValues(session, 'Audience'),
      speakers,
      products: extractCustomAttributeValues(session, 'Product'),
      inPerson: formatValues.includes('In person'),
      videoAvailable: formatValues.includes('Online') || formatValues.includes('On demand, post event'),
      sessionPageUrl: slug ? `/sessions/${slug}` : '',
      watchUrl: extractWatchUrl(session),
      isKeynote: type === 'Keynote',
      thumbnailUrl: thumbnail?.imageUrl ?? null,
      copyrightDisclaimer: extractCustomAttributeValue(session, 'LegalDisclaimer') || undefined,
      // resources[]/mrStreamId intentionally omitted — no source in this payload yet
      // (resources still in development backend-side; video/stream data is deliberately
      // withheld from this public endpoint until the session goes live). normalizeSessions()
      // defaults both to empty/null.
    };
  });
}

async function fetchEslSessions(eventId) {
  const { serviceApiEndpoints } = ENV_MAP[getEventServiceEnv().name];
  const options = await constructRequestOptions('GET');
  const res = await fetch(`${serviceApiEndpoints.esp}/v1/events/${eventId}/session-catalog`, options);
  if (!res.ok) {
    throw new Error(`ESL sessions fetch failed for event ${eventId}: ${res.status}`);
  }
  const payload = await res.json();
  console.log('[ESL debug] payload:', payload);
  const rawSessions = mapEslPayloadToRawSessions(payload);
  console.log('[ESL debug] rawSessions:', rawSessions);
  return rawSessions;
}

export async function fetchSessions(eventId) {
  // For mock usage, return the mock payload mapped to the raw-session shape
  // return normalizeSessions(mapEslPayloadToRawSessions(MOCK_ESL_PAYLOAD));
  const rawSessions = await fetchEslSessions(eventId);
  return normalizeSessions(rawSessions);
}
