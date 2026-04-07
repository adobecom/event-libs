import BlockMediator from '../../deps/block-mediator.min.js';
import { createTag, getMetadata, getSusiOptions } from '../../utils/utils.js';
import { signIn } from '../../utils/decorate.js';
import {
  getSVGsfromFile, createSocialIcon, PLATFORM_PATTERNS, SUPPORTED_PLATFORMS,
} from '../profile-cards/profile-cards.js';
import { convertUtcTimestampToLocalDateTime } from '../../utils/date-time-helper.js';
import {
  getEvent,
  getAllSeriesSpeakers,
  getVenueLocation,
  getMyEventSessions,
  registerForSessionTime,
} from '../../utils/esp-controller.js';

const CALENDAR_ICON = '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8.25 15H6.75C5.78516 15 5 14.2148 5 13.25V11.75C5 10.7852 5.78516 10 6.75 10H8.25C9.21484 10 10 10.7852 10 11.75V13.25C10 14.2148 9.21484 15 8.25 15ZM6.75 11.5C6.6123 11.5 6.5 11.6123 6.5 11.75V13.25C6.5 13.3877 6.6123 13.5 6.75 13.5H8.25C8.3877 13.5 8.5 13.3877 8.5 13.25V11.75C8.5 11.6123 8.3877 11.5 8.25 11.5H6.75Z" fill="#292929"/><path d="M15.75 3H13.75V2C13.75 1.58594 13.4141 1.25 13 1.25C12.5859 1.25 12.25 1.58594 12.25 2V3H7.75V2C7.75 1.58594 7.41406 1.25 7 1.25C6.58594 1.25 6.25 1.58594 6.25 2V3H4.25C3.00977 3 2 4.00977 2 5.25V15.75C2 16.9902 3.00977 18 4.25 18H15.75C16.9902 18 18 16.9902 18 15.75V5.25C18 4.00977 16.9902 3 15.75 3ZM4.25 4.5H6.25V5C6.25 5.41406 6.58594 5.75 7 5.75C7.41406 5.75 7.75 5.41406 7.75 5V4.5H12.25V5C12.25 5.41406 12.5859 5.75 13 5.75C13.4141 5.75 13.75 5.41406 13.75 5V4.5H15.75C16.1631 4.5 16.5 4.83691 16.5 5.25V7H3.5V5.25C3.5 4.83691 3.83691 4.5 4.25 4.5ZM15.75 16.5H4.25C3.83691 16.5 3.5 16.1631 3.5 15.75V8.5H16.5V15.75C16.5 16.1631 16.1631 16.5 15.75 16.5Z" fill="#292929"/></svg>';
const PIN_ICON = '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M10 9.99023C8.62109 9.99023 7.5 8.86914 7.5 7.49023C7.5 6.11132 8.62109 4.99023 10 4.99023C11.3789 4.99023 12.5 6.11132 12.5 7.49023C12.5 8.86914 11.3789 9.99023 10 9.99023ZM10 6.49023C9.44824 6.49023 9 6.93847 9 7.49023C9 8.04199 9.44824 8.49023 10 8.49023C10.5518 8.49023 11 8.04199 11 7.49023C11 6.93847 10.5518 6.49023 10 6.49023Z" fill="#292929"/><path d="M10.0049 18.583H10.001C9.44434 18.582 8.92969 18.335 8.58789 17.9043C6.68848 15.5137 3.5 10.9805 3.5 7.49023C3.5 4.04394 6.41602 1.24023 10 1.24023C13.584 1.24023 16.5 4.04394 16.5 7.49023C16.5 11.04 13.3145 15.542 11.416 17.9111C11.0742 18.3379 10.5596 18.583 10.0049 18.583ZM10 2.74022C7.24317 2.74022 5.00001 4.87108 5.00001 7.49022C5.00001 10.6377 8.33106 15.1699 9.76271 16.9717C9.84279 17.0723 9.95802 17.083 10.0039 17.083C10.0498 17.083 10.166 17.0723 10.2442 16.9736C11.6739 15.1904 15 10.6973 15 7.49022C15 4.87108 12.7569 2.74022 10 2.74022Z" fill="#292929"/></svg>';
const PLUS_CIRCLE_ICON = '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M10 18.7793C5.1748 18.7793 1.25 14.8545 1.25 10.0293C1.25 5.2041 5.1748 1.2793 10 1.2793C14.8252 1.2793 18.75 5.2041 18.75 10.0293C18.75 14.8545 14.8252 18.7793 10 18.7793ZM10 2.7793C6.00195 2.7793 2.75 6.03125 2.75 10.0293C2.75 14.0273 6.00195 17.2793 10 17.2793C13.998 17.2793 17.25 14.0273 17.25 10.0293C17.25 6.03125 13.998 2.7793 10 2.7793Z" fill="#292929"/><path d="M13.25 9.25H10.75V6.75C10.75 6.33594 10.4141 6 10 6C9.58594 6 9.25 6.33594 9.25 6.75V9.25H6.75C6.33594 9.25 6 9.58594 6 10C6 10.4141 6.33594 10.75 6.75 10.75H9.25V13.25C9.25 13.6641 9.58594 14 10 14C10.4141 14 10.75 13.6641 10.75 13.25V10.75H13.25C13.6641 10.75 14 10.4141 14 10C14 9.58594 13.6641 9.25 13.25 9.25Z" fill="#292929"/></svg>';
const MINUS_CIRCLE_ICON = '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M10 18.7793C5.1748 18.7793 1.25 14.8545 1.25 10.0293C1.25 5.2041 5.1748 1.2793 10 1.2793C14.8252 1.2793 18.75 5.2041 18.75 10.0293C18.75 14.8545 14.8252 18.7793 10 18.7793ZM10 2.7793C6.00195 2.7793 2.75 6.03125 2.75 10.0293C2.75 14.0273 6.00195 17.2793 10 17.2793C13.998 17.2793 17.25 14.0273 17.25 10.0293C17.25 6.03125 13.998 2.7793 10 2.7793Z" fill="#292929"/><path d="M13.25 10.75H6.75C6.33594 10.75 6 10.4141 6 10C6 9.58594 6.33594 9.25 6.75 9.25H13.25C13.6641 9.25 14 9.58594 14 10C14 10.4141 13.6641 10.75 13.25 10.75Z" fill="#292929"/></svg>';
const CTA_CALENDAR_ICON = '<svg width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M17.325 3.3H15.125V2.2C15.125 1.74453 14.7554 1.375 14.3 1.375C13.8445 1.375 13.475 1.74453 13.475 2.2V3.3H8.52495V2.2C8.52495 1.74453 8.15542 1.375 7.69995 1.375C7.24449 1.375 6.87495 1.74453 6.87495 2.2V3.3H4.67495C3.31016 3.3 2.19995 4.41075 2.19995 5.775V17.325C2.19995 18.6893 3.31016 19.8 4.67495 19.8H17.325C18.6897 19.8 19.8 18.6893 19.8 17.325V5.775C19.8 4.41075 18.6897 3.3 17.325 3.3ZM4.67495 4.95H6.87495V5.5C6.87495 5.95547 7.24449 6.325 7.69995 6.325C8.15542 6.325 8.52495 5.95547 8.52495 5.5V4.95H13.475V5.5C13.475 5.95547 13.8445 6.325 14.3 6.325C14.7554 6.325 15.125 5.95547 15.125 5.5V4.95H17.325C17.7799 4.95 18.15 5.3206 18.15 5.775V7.7H3.84995V5.775C3.84995 5.3206 4.22002 4.95 4.67495 4.95ZM17.325 18.15H4.67495C4.22002 18.15 3.84995 17.7794 3.84995 17.325V9.35H18.15V17.325C18.15 17.7794 17.7799 18.15 17.325 18.15Z" fill="currentColor"/><path d="M7.7 12.1C7.7 11.4925 7.20751 11 6.6 11C5.99249 11 5.5 11.4925 5.5 12.1C5.5 12.7075 5.99249 13.2 6.6 13.2C7.20751 13.2 7.7 12.7075 7.7 12.1Z" fill="currentColor"/><path d="M12.0999 12.1C12.0999 11.4925 11.6074 11 10.9999 11C10.3924 11 9.8999 11.4925 9.8999 12.1C9.8999 12.7075 10.3924 13.2 10.9999 13.2C11.6074 13.2 12.0999 12.7075 12.0999 12.1Z" fill="currentColor"/><path d="M16.5 12.1C16.5 11.4925 16.0076 11 15.4 11C14.7925 11 14.3 11.4925 14.3 12.1C14.3 12.7075 14.7925 13.2 15.4 13.2C16.0076 13.2 16.5 12.7075 16.5 12.1Z" fill="currentColor"/><path d="M7.7 15.4C7.7 14.7925 7.20751 14.3 6.6 14.3C5.99249 14.3 5.5 14.7925 5.5 15.4C5.5 16.0076 5.99249 16.5 6.6 16.5C7.20751 16.5 7.7 16.0076 7.7 15.4Z" fill="currentColor"/><path d="M12.0999 15.4C12.0999 14.7925 11.6074 14.3 10.9999 14.3C10.3924 14.3 9.8999 14.7925 9.8999 15.4C9.8999 16.0076 10.3924 16.5 10.9999 16.5C11.6074 16.5 12.0999 16.0076 12.0999 15.4Z" fill="currentColor"/><path d="M16.5 15.4C16.5 14.7925 16.0076 14.3 15.4 14.3C14.7925 14.3 14.3 14.7925 14.3 15.4C14.3 16.0076 14.7925 16.5 15.4 16.5C16.0076 16.5 16.5 16.0076 16.5 15.4Z" fill="currentColor"/></svg>';
const CHECKMARK_ICON = '<svg width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8.65072 17.3078C8.40579 17.3078 8.17377 17.1994 8.01693 17.0114L3.89515 12.0635C3.60297 11.7133 3.6513 11.1923 4.00042 10.9012C4.34954 10.609 4.86946 10.6552 5.16272 11.0065L8.63138 15.1712L16.8148 4.75559C17.0962 4.39681 17.6161 4.33557 17.9728 4.61595C18.3316 4.89739 18.3939 5.41624 18.1124 5.77395L9.29953 16.992C9.14591 17.1886 8.91173 17.3046 8.66252 17.3078L8.65072 17.3078Z" fill="currentColor"/></svg>';
const FILTER_ICON = '<svg width="26" height="26" viewBox="0 0 26 26" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M11.6986 24.3472C11.2314 24.3472 10.7668 24.2196 10.3504 23.9663C9.56709 23.4909 9.09991 22.66 9.09991 21.744V13.6374C9.09991 13.3956 9.01104 13.1645 8.84982 12.9855L3.41622 6.94887C2.7167 6.18144 2.54024 5.10742 2.963 4.15083C3.38448 3.19424 4.29601 2.6001 5.3421 2.6001H20.6577C21.7038 2.6001 22.6153 3.19424 23.0368 4.15083C23.4596 5.10742 23.2831 6.18144 22.5785 6.95332L17.15 12.9855C16.9888 13.1645 16.8999 13.3956 16.8999 13.6374V20.1964C16.8999 21.2933 16.2956 22.288 15.3232 22.7926L12.8984 24.0514C12.5188 24.2488 12.1074 24.3472 11.6986 24.3472ZM5.3421 4.5501C4.95871 4.5501 4.79874 4.82115 4.74669 4.93794C4.69464 5.05473 4.60323 5.35625 4.86095 5.63936L10.2996 11.6804C10.7833 12.2181 11.0499 12.9131 11.0499 13.6374V21.744C11.0499 22.0741 11.2683 22.2423 11.3622 22.2994C11.4562 22.3572 11.7075 22.4714 11.9995 22.321L14.4243 21.0616C14.7493 20.8934 14.9499 20.5621 14.9499 20.1964V13.6374C14.9499 12.9131 15.2165 12.2181 15.7002 11.6804L21.1338 5.6438C21.3966 5.35625 21.3052 5.05474 21.2531 4.93794C21.2011 4.82113 21.0411 4.5501 20.6577 4.5501H5.3421Z" fill="#292929"/></svg>';
const SEARCH_ICON = '<svg width="26" height="26" viewBox="0 0 26 26" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="11" cy="11" r="7.25" stroke="#6e6e6e" stroke-width="2"/><path d="M16.5 16.5L23 23" stroke="#6e6e6e" stroke-width="2" stroke-linecap="round"/></svg>';
const CHEVRON_DOWN_ICON = '<svg width="14" height="14" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4,7.01a1,1,0,0,1,1.7055-.7055l3.289,3.286,3.289-3.286a1,1,0,0,1,1.437,1.3865l-.0245.0245L9.7,11.7075a1,1,0,0,1-1.4125,0L4.293,7.716A.9945.9945,0,0,1,4,7.01Z" fill="#505050"/></svg>';

const DESC_CHAR_LIMIT = 500;

// ─── Module-level state singleton ──────────────────────────────────────────

const [getState, setState] = (() => {
  let state = null;
  return [() => state, (s) => { state = s; }];
})();

let rsvpUnsubscribe = null;
let pendingSessionId = null;

function openRsvpModal(hash) {
  if (window.location.hash === hash) {
    const { pathname, search } = window.location;
    window.history.replaceState(null, '', `${pathname}${search}`);
  }
  window.location.hash = hash;
}

// ─── Filter state ───────────────────────────────────────────────────────────

const [getFilterState, setFilterState] = (() => {
  let fs = { query: '', activeTags: new Set(), activeTab: 'all' };
  return [() => fs, (s) => { fs = s; }];
})();

// ─── Utilities ──────────────────────────────────────────────────────────────

function deriveTagLabels(tagIdList) {
  if (!tagIdList) return [];
  return tagIdList
    .split(',')
    .map((id) => {
      const seg = id.trim().split('/').at(-1);
      return seg ? seg.charAt(0).toUpperCase() + seg.slice(1) : '';
    })
    .filter(Boolean);
}

function formatICSDate(millis) {
  return new Date(millis).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
}

function generateICS(sessionTime, title, locationName) {
  const start = formatICSDate(sessionTime.startTimeMillis);
  const end = formatICSDate(sessionTime.endTimeMillis);
  const uid = `${sessionTime.sessionTimeId}@aem-event-libs`;
  const now = formatICSDate(Date.now());
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
}

function downloadICS(sessionTime, title, locationName) {
  const ics = generateICS(sessionTime, title, locationName);
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = createTag('a', { href: url, download: `${title.replace(/\s+/g, '-')}.ics` });
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}


function createIcon(svgString) {
  const span = createTag('span', { class: 'sh-icon', 'aria-hidden': 'true' });
  span.innerHTML = svgString;
  return span;
}

// ─── Social icon platform detection ─────────────────────────────────────────

function detectPlatform(href) {
  try {
    const { hostname } = new URL(href);
    const matched = Object.entries(PLATFORM_PATTERNS).find(([, re]) => re.test(hostname.toLowerCase()));
    return matched ? matched[0] : 'web';
  } catch {
    return 'web';
  }
}

// ─── Data loading ────────────────────────────────────────────────────────────

async function resolveEventData() {
  const eventId = getMetadata('event-id');
  if (!eventId) return null;

  const resp = await getEvent(eventId);
  if (!resp.ok) return null;

  return resp.data;
}

async function buildSpeakerMap(seriesId) {
  const resp = await getAllSeriesSpeakers(seriesId);
  const map = new Map();
  if (resp.ok) {
    resp.data.forEach((s) => map.set(s.speakerId, s));
  }
  return map;
}

async function buildLocationMap(venueId, sessions) {
  const map = new Map();
  const seen = new Set();
  const pairs = [];

  sessions.forEach((session) => {
    (session.rawTimes || []).forEach((t) => {
      if (t.locationId && venueId) {
        const key = `${venueId}:${t.locationId}`;
        if (!seen.has(key)) {
          seen.add(key);
          pairs.push([venueId, t.locationId]);
        }
      }
    });
  });

  await Promise.all(pairs.map(async ([vId, lId]) => {
    const resp = await getVenueLocation(vId, lId);
    if (resp.ok) map.set(`${vId}:${lId}`, resp.data);
  }));

  return map;
}

async function resolveRegistrationState(eventId, isEventRegistered) {
  if (!isEventRegistered) return new Set();
  const resp = await getMyEventSessions(eventId);
  if (!resp.ok) return new Set();
  return new Set(resp.data?.sessionIds || []);
}

function normalizeSessions(rawSessions, speakerMap, locationMap, registeredSessionIds, venueId) {
  return rawSessions.map((session) => {
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
      tags: deriveTagLabels(session.tags),
      sessionTimes,
      speakers,
      isRegistered: registeredSessionIds.has(session.sessionId),
      expanded: false,
    };
  });
}

// ─── Filter / search ─────────────────────────────────────────────────────────

function collectFilterOptions(sessions) {
  const tags = new Set();
  sessions.forEach((s) => s.tags.forEach((t) => tags.add(t)));
  return { tags: [...tags].sort() };
}

function filterSessions(sessions, { query, activeTags, activeTab, registeredSessionIds }) {
  const q = query.toLowerCase();
  return sessions.filter((s) => {
    if (activeTab === 'my' && !registeredSessionIds.has(s.sessionId)) return false;

    if (activeTags.size > 0 && !s.tags.some((t) => activeTags.has(t))) return false;

    if (q) {
      const hay = [
        s.title,
        s.description,
        ...s.speakers.map((sp) => `${sp.firstName} ${sp.lastName}`),
      ].join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }

    return true;
  });
}

function applyFilter(listEl, state) {
  const fs = getFilterState();
  const filtered = filterSessions(state.sessions, {
    query: fs.query,
    activeTags: fs.activeTags,
    activeTab: fs.activeTab,
    registeredSessionIds: state.registeredSessionIds,
  });
  const filteredIds = new Set(filtered.map((s) => s.sessionId));

  listEl.querySelectorAll('.sh-card').forEach((card) => {
    card.hidden = !filteredIds.has(card.dataset.sessionId);
  });
}

// ─── Render: CTA group ───────────────────────────────────────────────────────

function renderCTAGroup(session, isEventRegistered) {
  const group = createTag('div', { class: 'sh-cta-group' });

  if (!isEventRegistered) {
    group.append(createTag('button', { class: 'sh-btn sh-btn-register-event', type: 'button' }, 'Register for session'));
  } else if (!session.isRegistered) {
    group.append(createTag('button', { class: 'sh-btn sh-btn-register-session', type: 'button' }, 'Register for session'));
  } else {
    const calBtn = createTag('button', { class: 'sh-btn sh-btn-cal', type: 'button' });
    calBtn.append(createIcon(CTA_CALENDAR_ICON), createTag('span', {}, 'Download to calendar'));
    group.append(calBtn);
    const badge = createTag('span', { class: 'sh-registered-badge' });
    badge.append(createIcon(CHECKMARK_ICON), createTag('span', {}, 'Registered'));
    group.append(badge);
  }

  return group;
}

function updateCTAGroup(cardEl, session, isEventRegistered) {
  const old = cardEl.querySelector('.sh-cta-group');
  if (old) old.replaceWith(renderCTAGroup(session, isEventRegistered));
}

// ─── Render: session card ────────────────────────────────────────────────────

function renderTagPills(tags) {
  const list = createTag('ul', { class: 'sh-tag-list' });
  tags.forEach((tag) => list.append(createTag('li', { class: 'sh-tag-pill' }, tag)));
  return list;
}

function renderSpeakerAvatars(speakers) {
  const wrap = createTag('div', { class: 'sh-speaker-avatars' });
  speakers.forEach((sp) => {
    const btn = createTag('button', {
      class: 'sh-avatar-btn',
      type: 'button',
      'data-speaker-id': sp.speakerId,
      'aria-label': `${sp.firstName} ${sp.lastName}`,
    });
    if (sp.photo?.imageUrl) {
      btn.append(createTag('img', {
        src: sp.photo.imageUrl,
        alt: sp.photo.altText || `${sp.firstName} ${sp.lastName}`,
        width: 32,
        height: 32,
      }));
    } else {
      const initials = `${sp.firstName.charAt(0)}${sp.lastName.charAt(0)}`.toUpperCase();
      btn.append(createTag('span', { class: 'sh-avatar-initials', 'aria-hidden': 'true' }, initials));
    }
    wrap.append(btn);
  });
  return wrap;
}

function renderSessionCard(session, isEventRegistered) {
  const primaryTime = session.sessionTimes[0];
  const timeStr = primaryTime
    ? convertUtcTimestampToLocalDateTime(primaryTime.startTimeMillis, 'en-US', primaryTime.timezone)
    : '';
  const locationName = primaryTime?.locationName || '';

  const card = createTag('article', {
    class: 'sh-card',
    'data-session-id': session.sessionId,
  });

  // Expand/collapse toggle (absolute, top-right) — only when description is truncated
  const expandBtn = createTag('button', {
    class: 'sh-expand-btn',
    type: 'button',
    'aria-label': 'Expand session',
  });
  expandBtn.hidden = true;
  expandBtn.innerHTML = PLUS_CIRCLE_ICON;
  card.append(expandBtn);

  // ── Left column ──────────────────────────────────────────────────────────
  const left = createTag('div', { class: 'sh-card-left' });

  left.append(createTag('h3', { class: 'sh-card-title' }, session.title));

  if (timeStr) {
    const timeEl = createTag('div', { class: 'sh-card-time' });
    timeEl.append(createIcon(CALENDAR_ICON), ` ${timeStr}`);
    left.append(timeEl);
  }

  if (locationName) {
    const locEl = createTag('div', { class: 'sh-card-location' });
    locEl.append(createIcon(PIN_ICON), ` ${locationName}`);
    left.append(locEl);
  }

  if (session.tags.length) left.append(renderTagPills(session.tags));

  if (session.speakers.length) {
    const speakersWrap = createTag('div', { class: 'sh-card-speakers' });
    speakersWrap.append(createTag('span', { class: 'sh-speakers-label' }, 'Speakers'));
    speakersWrap.append(renderSpeakerAvatars(session.speakers));
    left.append(speakersWrap);
  }

  // ── Right column ─────────────────────────────────────────────────────────
  const right = createTag('div', { class: 'sh-card-right' });

  const desc = createTag('div', { class: 'sh-card-desc' });
  const descText = createTag('div', { class: 'sh-card-desh-text' });
  const fullDesc = session.description || '';
  descText.innerHTML = fullDesc;
  const needsTruncation = descText.textContent.length > DESC_CHAR_LIMIT;

  desc.append(descText);
  if (needsTruncation) {
    desc.append(createTag('button', { class: 'sh-read-more', type: 'button' }, 'Read more'));
  }

  expandBtn.hidden = !needsTruncation;
  right.append(desc, renderCTAGroup(session, isEventRegistered));

  card.append(left, right);
  return card;
}


function renderSessionList(sessions, isEventRegistered) {
  const list = createTag('div', { class: 'sh-session-list' });
  sessions.forEach((s) => list.append(renderSessionCard(s, isEventRegistered)));
  return list;
}

// ─── Render: toolbar ────────────────────────────────────────────────────────

function renderTabToggle(isEventRegistered) {
  const wrap = createTag('div', { class: 'sh-tab-toggle' });
  if (!isEventRegistered) wrap.hidden = true;
  wrap.append(
    createTag('button', { class: 'sh-tab active', type: 'button', 'data-tab': 'all' }, 'All sessions'),
    createTag('button', { class: 'sh-tab', type: 'button', 'data-tab': 'my' }, 'My sessions'),
  );
  return wrap;
}

function renderFilterPanel(sessions) {
  const panel = createTag('div', { class: 'sh-filter-panel hidden', 'aria-hidden': 'true' });
  const { tags } = collectFilterOptions(sessions);

  tags.forEach((tag) => {
    const lbl = createTag('label', { class: 'sh-filter-item' });
    lbl.append(createTag('input', { type: 'checkbox', value: tag, 'data-filter-type': 'tag' }));
    lbl.append(createTag('span', {}, tag));
    panel.append(lbl);
  });

  return panel;
}

function renderToolbar(state) {
  const toolbar = createTag('div', { class: 'sh-toolbar', role: 'search' });
  const inner = createTag('div', { class: 'sh-toolbar-inner' });
  const toggle = renderTabToggle(state.isEventRegistered);
  const spacer = createTag('div', { class: 'sh-toolbar-spacer' });

  const searchRow = createTag('div', { class: 'sh-search-row' });
  const searchWrap = createTag('div', { class: 'sh-search-wrap' });
  searchWrap.append(createIcon(SEARCH_ICON));
  searchWrap.append(createTag('input', {
    class: 'sh-search',
    type: 'search',
    placeholder: 'Search sessions',
    'aria-label': 'Search sessions',
  }));

  const filterWrap = createTag('div', { class: 'sh-filter-wrap' });
  const { tags: filterTags } = collectFilterOptions(state.sessions);
  const hasFilters = filterTags.length > 0;
  const filterBtn = createTag('button', {
    class: 'sh-filter-btn',
    type: 'button',
    'aria-expanded': 'false',
    ...(hasFilters ? {} : { disabled: '' }),
  });
  filterBtn.append(createIcon(FILTER_ICON), createTag('span', {}, 'Filter'), createIcon(CHEVRON_DOWN_ICON));
  const filterPanel = renderFilterPanel(state.sessions);
  filterWrap.append(filterBtn, filterPanel);

  searchRow.append(searchWrap, filterWrap);
  inner.append(toggle, spacer, searchRow);
  toolbar.append(inner);
  return toolbar;
}

function setToolbarStickyOffset(toolbarEl) {
  const gnav = document.querySelector('header');
  const update = () => {
    const offset = gnav?.offsetHeight ?? 0;
    toolbarEl.style.setProperty('--toolbar-top', `${offset}px`);
  };
  update();
  if (gnav) {
    const ro = new ResizeObserver(update);
    ro.observe(gnav);
  }
}

// ─── Render: sticky event banner ─────────────────────────────────────────────

function renderEventBanner(eventData, rsvpConfig) {
  const banner = createTag('div', { class: 'sh-event-banner' });
  const inner = createTag('div', { class: 'sh-banner-inner' });
  const info = createTag('div', { class: 'sh-banner-info' });

  if (eventData.title) {
    info.append(createTag('span', { class: 'sh-banner-title' }, eventData.title));
  }

  const dateStr = getMetadata('user-event-date-time-range') || eventData.startDate;
  if (dateStr) {
    const dateRow = createTag('span', { class: 'sh-banner-date' });
    const icon = createTag('span', { class: 'sh-icon' });
    icon.innerHTML = CTA_CALENDAR_ICON;
    dateRow.append(icon, dateStr);
    info.append(dateRow);
  }

  const btn = createTag('button', { class: 'sh-btn sh-btn-event-register', type: 'button' }, 'Register');
  btn.addEventListener('click', () => {
    const profile = BlockMediator.get('imsProfile');
    const isSignedOut = !profile || profile.noProfile || profile.account_type === 'guest';
    if (isSignedOut) {
      signIn({ ...getSusiOptions(), redirect_uri: window.location.href });
    } else if (rsvpConfig) {
      openRsvpModal(rsvpConfig.hash);
    }
  });

  inner.append(info, btn);
  banner.append(inner);
  return banner;
}

function syncBannerVisibility(bannerEl, isEventRegistered) {
  if (!bannerEl) return;
  bannerEl.classList.toggle('hidden', isEventRegistered);
}

// ─── Speaker modal ───────────────────────────────────────────────────────────

let modalOverlay = null;
let previousFocus = null;

function closeSpeakerModal() {
  if (modalOverlay) {
    modalOverlay.remove();
    modalOverlay = null;
  }
  if (previousFocus) {
    previousFocus.focus();
    previousFocus = null;
  }
  document.removeEventListener('keydown', handleModalKeydown);
}

function handleModalKeydown(e) {
  if (e.key === 'Escape') closeSpeakerModal();
}

async function openSpeakerModal(speaker) {
  if (!speaker) return;
  if (modalOverlay) closeSpeakerModal();

  previousFocus = document.activeElement;

  const overlay = createTag('div', {
    class: 'sh-modal-overlay',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': `${speaker.firstName} ${speaker.lastName}`,
  });

  const modal = createTag('div', { class: 'sh-modal' });
  const closeBtn = createTag('button', {
    class: 'sh-modal-close',
    type: 'button',
    'aria-label': 'Close',
  }, '\u00D7');

  const modalBody = createTag('div', { class: 'sh-modal-body' });

  // Photo
  if (speaker.photo?.imageUrl) {
    modalBody.append(createTag('img', {
      class: 'sh-modal-photo',
      src: speaker.photo.imageUrl,
      alt: speaker.photo.altText || `${speaker.firstName} ${speaker.lastName}`,
    }));
  }

  // Speaker info
  const info = createTag('div', { class: 'sh-modal-info' });
  if (speaker.title) info.append(createTag('p', { class: 'sh-modal-speaker-title' }, speaker.title));
  info.append(createTag('h2', { class: 'sh-modal-name' }, `${speaker.firstName} ${speaker.lastName}`));
  if (speaker.company) info.append(createTag('p', { class: 'sh-modal-company' }, speaker.company));
  if (speaker.bio) info.append(createTag('p', { class: 'sh-modal-bio' }, speaker.bio));

  // Social icons
  if (speaker.socialLinks?.length) {
    const svgPath = new URL('../../icons/social-icons.svg', import.meta.url).href;
    const svgEls = await getSVGsfromFile(svgPath, SUPPORTED_PLATFORMS);
    if (svgEls?.length) {
      const socialList = createTag('ul', { class: 'sh-modal-social-icons' });
      speaker.socialLinks.forEach((entry) => {
        const href = typeof entry === 'string' ? entry : entry.link;
        if (!href?.trim()) return;
        const platform = detectPlatform(href);
        const svgEl = svgEls.find((el) => el?.name === platform);
        if (!svgEl) return;
        const icon = createSocialIcon(svgEl.svg, platform);
        if (!icon) return;
        const a = createTag('a', {
          href,
          target: '_blank',
          rel: 'noopener noreferrer',
          'aria-label': typeof entry === 'object' ? (entry.serviceName || platform) : platform,
        });
        a.append(icon);
        const li = createTag('li', {});
        li.append(a);
        socialList.append(li);
      });
      info.append(socialList);
    }
  }

  modalBody.append(info);
  modal.append(closeBtn, modalBody);
  overlay.append(modal);
  document.body.append(overlay);
  modalOverlay = overlay;

  closeBtn.focus();
  document.addEventListener('keydown', handleModalKeydown);

  closeBtn.addEventListener('click', closeSpeakerModal);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeSpeakerModal();
  });
}

// ─── Event binding ───────────────────────────────────────────────────────────

function bindToolbarEvents(toolbarEl, listEl, state) {
  const searchInput = toolbarEl.querySelector('.sh-search');
  const filterBtn = toolbarEl.querySelector('.sh-filter-btn');
  const filterPanel = toolbarEl.querySelector('.sh-filter-panel');

  searchInput.addEventListener('input', debounce(() => {
    setFilterState({ ...getFilterState(), query: searchInput.value });
    applyFilter(listEl, state);
  }, 200));

  filterBtn.addEventListener('click', () => {
    if (filterBtn.disabled) return;
    const isHidden = filterPanel.classList.toggle('hidden');
    filterBtn.setAttribute('aria-expanded', String(!isHidden));
    filterPanel.setAttribute('aria-hidden', String(isHidden));
  });

  document.addEventListener('click', (e) => {
    const filterWrap = toolbarEl.querySelector('.sh-filter-wrap');
    if (!filterWrap?.contains(e.target)) {
      filterPanel.classList.add('hidden');
      filterBtn.setAttribute('aria-expanded', 'false');
      filterPanel.setAttribute('aria-hidden', 'true');
    }
  });

  filterPanel.addEventListener('change', (e) => {
    const cb = e.target;
    if (cb.type !== 'checkbox') return;
    const fs = getFilterState();
    const newTags = new Set(fs.activeTags);
    if (cb.dataset.filterType === 'tag') {
      cb.checked ? newTags.add(cb.value) : newTags.delete(cb.value);
    }
    setFilterState({ ...fs, activeTags: newTags });
    applyFilter(listEl, state);
  });

  toolbarEl.addEventListener('click', (e) => {
    const tab = e.target.closest('.sh-tab');
    if (!tab) return;
    toolbarEl.querySelectorAll('.sh-tab').forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');
    setFilterState({ ...getFilterState(), activeTab: tab.dataset.tab });
    applyFilter(listEl, state);
  });
}

async function handleSessionRegistration(cardEl, sessionId, state) {
  const session = state.sessions.find((s) => s.sessionId === sessionId);
  if (!session) return;

  const firstTime = session.sessionTimes[0];
  if (!firstTime) return;

  const btn = cardEl.querySelector('.sh-btn-register-session');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Registering\u2026';
  }

  const resp = await registerForSessionTime(firstTime.sessionTimeId, 'me', { registrationStatus: 'registered' });

  if (resp.ok) {
    session.isRegistered = true;
    state.registeredSessionIds.add(sessionId);
    updateCTAGroup(cardEl, session, true);
  } else {
    window.lana?.log(`Error: Failed to register for session ${sessionId}. Error:${JSON.stringify(resp.error)}`);
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Register for session';
    }
  }
}

function bindCardEvents(listEl, state) {
  listEl.addEventListener('click', async (e) => {
    const card = e.target.closest('.sh-card');
    if (!card) return;
    const sessionId = card.dataset.sessionId;

    if (e.target.closest('.sh-expand-btn') || e.target.closest('.sh-read-more')) {
      const isExpanded = card.classList.toggle('expanded');
      const expandBtn = card.querySelector('.sh-expand-btn');
      expandBtn.innerHTML = isExpanded ? MINUS_CIRCLE_ICON : PLUS_CIRCLE_ICON;
      expandBtn.setAttribute('aria-label', isExpanded ? 'Collapse session' : 'Expand session');
      return;
    }

    if (e.target.closest('.sh-avatar-btn')) {
      const btn = e.target.closest('.sh-avatar-btn');
      const speaker = state.speakerMap.get(btn.dataset.speakerId);
      await openSpeakerModal(speaker);
      return;
    }

    if (e.target.closest('.sh-btn-register-session')) {
      await handleSessionRegistration(card, sessionId, state);
      return;
    }

    if (e.target.closest('.sh-btn-cal')) {
      const session = state.sessions.find((s) => s.sessionId === sessionId);
      const firstTime = session?.sessionTimes[0];
      if (firstTime) downloadICS(firstTime, session.title, firstTime.locationName);
      return;
    }

    if (e.target.closest('.sh-btn-register-event')) {
      const profile = BlockMediator.get('imsProfile');
      const isSignedOut = !profile || profile.noProfile || profile.account_type === 'guest';

      if (isSignedOut) {
        console.log('[sessions-hub] Signed-out user clicked register. Storing pending session and triggering SUSI:', sessionId);
        sessionStorage.setItem('sessions-hub:pendingSessionId', sessionId);
        signIn({ ...getSusiOptions(), redirect_uri: window.location.href });
        return;
      }

      if (state.rsvpConfig) {
        console.log('[sessions-hub] Signed-in, not event-registered. Opening RSVP modal for pending session:', sessionId);
        pendingSessionId = sessionId;
        const btn = e.target.closest('.sh-btn-register-event');
        if (btn) { btn.disabled = true; btn.textContent = 'Registering\u2026'; }

        const onHashChange = () => {
          if (!window.location.hash.includes('rsvp-form')) {
            if (pendingSessionId === sessionId) {
              console.log('[sessions-hub] RSVP modal closed without completing. Re-enabling button for session:', sessionId);
              pendingSessionId = null;
              if (btn) { btn.disabled = false; btn.textContent = 'Register for session'; }
            }
            window.removeEventListener('hashchange', onHashChange);
          }
        };
        window.addEventListener('hashchange', onHashChange);

        openRsvpModal(state.rsvpConfig.hash);
      }
      return;
    }
  });
}

function bindMediatorSubscriptions(el, bannerEl) {
  rsvpUnsubscribe = BlockMediator.subscribe('rsvpData', async ({ newValue }) => {
    const state = getState();
    const isRegistered = newValue != null;
    state.isEventRegistered = isRegistered;

    syncBannerVisibility(bannerEl, isRegistered);

    const toggle = el.querySelector('.sh-tab-toggle');
    if (toggle) toggle.hidden = !isRegistered;

    const cardMap = new Map(
      [...el.querySelectorAll('.sh-card')].map((c) => [c.dataset.sessionId, c]),
    );

    if (isRegistered) {
      const ids = await resolveRegistrationState(state.eventData.eventId, true);
      state.registeredSessionIds = ids;
      state.sessions.forEach((session) => {
        session.isRegistered = ids.has(session.sessionId);
        const cardEl = cardMap.get(session.sessionId);
        if (cardEl) updateCTAGroup(cardEl, session, true);
      });

      if (pendingSessionId) {
        const pid = pendingSessionId;
        pendingSessionId = null;
        console.log('[sessions-hub] RSVP completed. Auto-registering for pending session:', pid);
        const pendingSession = state.sessions.find((s) => s.sessionId === pid);
        const pendingCard = cardMap.get(pid);
        if (pendingSession && pendingCard && !pendingSession.isRegistered) {
          await handleSessionRegistration(pendingCard, pid, state);
        } else {
          console.log('[sessions-hub] Pending session not found or already registered:', pid);
        }
      }
    } else {
      state.sessions.forEach((session) => {
        session.isRegistered = false;
        const cardEl = cardMap.get(session.sessionId);
        if (cardEl) updateCTAGroup(cardEl, session, false);
      });
    }
  });
}

// ─── init ────────────────────────────────────────────────────────────────────

async function loadBlock(el, rsvpConfig) {
  const eventData = await resolveEventData();
  if (!eventData?.eventId) {
    el.remove();
    return;
  }

  let rawSessions;
  try {
    rawSessions = JSON.parse(getMetadata('sessions'));
  } catch (e) {
    window.lana?.log(`Failed to parse sessions metadata:\n${e.message}`);
  }
  if (!rawSessions?.length) {
    el.remove();
    return;
  }
  rawSessions.forEach((s) => {
    s.rawTimes = s.sessionTimes || [];
    s.rawSpeakers = s.speakers || [];
  });

  const { venueId } = eventData;
  const [speakerMap, locationMap] = await Promise.all([
    buildSpeakerMap(eventData.seriesId),
    buildLocationMap(venueId, rawSessions),
  ]);

  const rsvpData = BlockMediator.get('rsvpData');
  const isEventRegistered = rsvpData != null;
  const registeredSessionIds = await resolveRegistrationState(eventData.eventId, isEventRegistered);

  const sessions = normalizeSessions(
    rawSessions, speakerMap, locationMap, registeredSessionIds, venueId,
  );

  const state = {
    eventData,
    sessions,
    speakerMap,
    locationMap,
    registeredSessionIds,
    isEventRegistered,
    rsvpConfig,
  };
  setState(state);

  const toolbar = renderToolbar(state);
  setToolbarStickyOffset(toolbar);
  const listEl = renderSessionList(sessions, isEventRegistered);
  el.append(toolbar, listEl);

  // Always append banner; hide it if user is already registered
  document.body.querySelector('.sh-event-banner')?.remove();
  const bannerEl = renderEventBanner(eventData, rsvpConfig);
  if (isEventRegistered) bannerEl.classList.add('hidden');
  document.body.append(bannerEl);

  bindToolbarEvents(toolbar, listEl, state);
  bindCardEvents(listEl, state);
  bindMediatorSubscriptions(el, bannerEl);

  const storedPendingId = sessionStorage.getItem('sessions-hub:pendingSessionId');
  if (storedPendingId) {
    sessionStorage.removeItem('sessions-hub:pendingSessionId');
    console.log('[sessions-hub] Found pending session from previous page load:', storedPendingId);

    if (isEventRegistered) {
      console.log('[sessions-hub] User is event-registered. Attempting direct session registration:', storedPendingId);
      const pendingSession = sessions.find((s) => s.sessionId === storedPendingId);
      const pendingCard = listEl.querySelector(`[data-session-id="${storedPendingId}"]`);
      if (pendingSession && pendingCard && !pendingSession.isRegistered) {
        await handleSessionRegistration(pendingCard, storedPendingId, state);
      } else {
        console.log('[sessions-hub] Pending session not found or already registered:', storedPendingId);
      }
    } else if (rsvpConfig) {
      console.log('[sessions-hub] User not event-registered. Auto-opening RSVP modal for pending session:', storedPendingId);
      pendingSessionId = storedPendingId;
      openRsvpModal(rsvpConfig.hash);
    }
  }
}

export default async function init(el) {
  if (new URLSearchParams(window.location.search).has('mockSessions')) {
    await import('./sessions-hub.mock.js');
  }

  if (rsvpUnsubscribe) { rsvpUnsubscribe(); rsvpUnsubscribe = null; }
  if (modalOverlay) closeSpeakerModal();
  setFilterState({ query: '', activeTags: new Set(), activeTab: 'all' });

  let rsvpConfig = null;
  const rows = [...el.querySelectorAll(':scope > div')];
  for (const row of rows) {
    const cells = row.querySelectorAll(':scope > div');
    if (cells[0]?.textContent?.trim().toLowerCase() === 'rsvp-form') {
      const link = cells[1]?.querySelector('a');
      if (link) {
        try {
          const url = new URL(link.href);
          rsvpConfig = { hash: url.hash };
          console.log('[sessions-hub] Parsed RSVP config from authored HTML:', rsvpConfig);
        } catch (e) {
          window.lana?.log(`Failed to parse RSVP form link: ${link.href}`);
        }
      }
      break;
    }
  }

  el.innerHTML = '';

  const profile = BlockMediator.get('imsProfile');
  if (profile) {
    await loadBlock(el, rsvpConfig);
  } else {
    const unsub = BlockMediator.subscribe('imsProfile', async ({ newValue }) => {
      if (!newValue) return;
      unsub();
      await loadBlock(el, rsvpConfig);
    });
  }
}
