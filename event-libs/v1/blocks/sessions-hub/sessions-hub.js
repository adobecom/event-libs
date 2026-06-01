import BlockMediator from '../../deps/block-mediator.min.js';
import {
  createTag,
  getMetadata,
  getSusiOptions,
  LIBS,
  getEventConfig,
  loadStyle,
  getValidCampaignIdFromUrl,
} from '../../utils/utils.js';
import { dictionaryManager, getInviteOnlyNoCampaignMessage, getEventWaitlistBannerMessage } from '../../utils/dictionary-manager.js';
import { signIn } from '../../utils/decorate.js';
import { buildModalContent } from '../profile-cards/profile-cards.js';
import { createSmartDateRange } from '../../utils/date-time-helper.js';
import {
  getCaasTags,
  getEvent,
  getVenueLocation,
  getMyEventSessions,
  registerForSessionTime,
  unregisterFromSessionTime,
} from '../../utils/esp-controller.js';

const CALENDAR_ICON = '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8.25 15H6.75C5.78516 15 5 14.2148 5 13.25V11.75C5 10.7852 5.78516 10 6.75 10H8.25C9.21484 10 10 10.7852 10 11.75V13.25C10 14.2148 9.21484 15 8.25 15ZM6.75 11.5C6.6123 11.5 6.5 11.6123 6.5 11.75V13.25C6.5 13.3877 6.6123 13.5 6.75 13.5H8.25C8.3877 13.5 8.5 13.3877 8.5 13.25V11.75C8.5 11.6123 8.3877 11.5 8.25 11.5H6.75Z" fill="#292929"/><path d="M15.75 3H13.75V2C13.75 1.58594 13.4141 1.25 13 1.25C12.5859 1.25 12.25 1.58594 12.25 2V3H7.75V2C7.75 1.58594 7.41406 1.25 7 1.25C6.58594 1.25 6.25 1.58594 6.25 2V3H4.25C3.00977 3 2 4.00977 2 5.25V15.75C2 16.9902 3.00977 18 4.25 18H15.75C16.9902 18 18 16.9902 18 15.75V5.25C18 4.00977 16.9902 3 15.75 3ZM4.25 4.5H6.25V5C6.25 5.41406 6.58594 5.75 7 5.75C7.41406 5.75 7.75 5.41406 7.75 5V4.5H12.25V5C12.25 5.41406 12.5859 5.75 13 5.75C13.4141 5.75 13.75 5.41406 13.75 5V4.5H15.75C16.1631 4.5 16.5 4.83691 16.5 5.25V7H3.5V5.25C3.5 4.83691 3.83691 4.5 4.25 4.5ZM15.75 16.5H4.25C3.83691 16.5 3.5 16.1631 3.5 15.75V8.5H16.5V15.75C16.5 16.1631 16.1631 16.5 15.75 16.5Z" fill="#292929"/></svg>';
const PIN_ICON = '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M10 9.99023C8.62109 9.99023 7.5 8.86914 7.5 7.49023C7.5 6.11132 8.62109 4.99023 10 4.99023C11.3789 4.99023 12.5 6.11132 12.5 7.49023C12.5 8.86914 11.3789 9.99023 10 9.99023ZM10 6.49023C9.44824 6.49023 9 6.93847 9 7.49023C9 8.04199 9.44824 8.49023 10 8.49023C10.5518 8.49023 11 8.04199 11 7.49023C11 6.93847 10.5518 6.49023 10 6.49023Z" fill="#292929"/><path d="M10.0049 18.583H10.001C9.44434 18.582 8.92969 18.335 8.58789 17.9043C6.68848 15.5137 3.5 10.9805 3.5 7.49023C3.5 4.04394 6.41602 1.24023 10 1.24023C13.584 1.24023 16.5 4.04394 16.5 7.49023C16.5 11.04 13.3145 15.542 11.416 17.9111C11.0742 18.3379 10.5596 18.583 10.0049 18.583ZM10 2.74022C7.24317 2.74022 5.00001 4.87108 5.00001 7.49022C5.00001 10.6377 8.33106 15.1699 9.76271 16.9717C9.84279 17.0723 9.95802 17.083 10.0039 17.083C10.0498 17.083 10.166 17.0723 10.2442 16.9736C11.6739 15.1904 15 10.6973 15 7.49022C15 4.87108 12.7569 2.74022 10 2.74022Z" fill="#292929"/></svg>';
const PLUS_CIRCLE_ICON = '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M10 18.7793C5.1748 18.7793 1.25 14.8545 1.25 10.0293C1.25 5.2041 5.1748 1.2793 10 1.2793C14.8252 1.2793 18.75 5.2041 18.75 10.0293C18.75 14.8545 14.8252 18.7793 10 18.7793ZM10 2.7793C6.00195 2.7793 2.75 6.03125 2.75 10.0293C2.75 14.0273 6.00195 17.2793 10 17.2793C13.998 17.2793 17.25 14.0273 17.25 10.0293C17.25 6.03125 13.998 2.7793 10 2.7793Z" fill="#292929"/><path d="M13.25 9.25H10.75V6.75C10.75 6.33594 10.4141 6 10 6C9.58594 6 9.25 6.33594 9.25 6.75V9.25H6.75C6.33594 9.25 6 9.58594 6 10C6 10.4141 6.33594 10.75 6.75 10.75H9.25V13.25C9.25 13.6641 9.58594 14 10 14C10.4141 14 10.75 13.6641 10.75 13.25V10.75H13.25C13.6641 10.75 14 10.4141 14 10C14 9.58594 13.6641 9.25 13.25 9.25Z" fill="#292929"/></svg>';
const MINUS_CIRCLE_ICON = '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M10 18.7793C5.1748 18.7793 1.25 14.8545 1.25 10.0293C1.25 5.2041 5.1748 1.2793 10 1.2793C14.8252 1.2793 18.75 5.2041 18.75 10.0293C18.75 14.8545 14.8252 18.7793 10 18.7793ZM10 2.7793C6.00195 2.7793 2.75 6.03125 2.75 10.0293C2.75 14.0273 6.00195 17.2793 10 17.2793C13.998 17.2793 17.25 14.0273 17.25 10.0293C17.25 6.03125 13.998 2.7793 10 2.7793Z" fill="#292929"/><path d="M13.25 10.75H6.75C6.33594 10.75 6 10.4141 6 10C6 9.58594 6.33594 9.25 6.75 9.25H13.25C13.6641 9.25 14 9.58594 14 10C14 10.4141 13.6641 10.75 13.25 10.75Z" fill="#292929"/></svg>';
const CTA_CALENDAR_ICON = '<svg width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M17.325 3.3H15.125V2.2C15.125 1.74453 14.7554 1.375 14.3 1.375C13.8445 1.375 13.475 1.74453 13.475 2.2V3.3H8.52495V2.2C8.52495 1.74453 8.15542 1.375 7.69995 1.375C7.24449 1.375 6.87495 1.74453 6.87495 2.2V3.3H4.67495C3.31016 3.3 2.19995 4.41075 2.19995 5.775V17.325C2.19995 18.6893 3.31016 19.8 4.67495 19.8H17.325C18.6897 19.8 19.8 18.6893 19.8 17.325V5.775C19.8 4.41075 18.6897 3.3 17.325 3.3ZM4.67495 4.95H6.87495V5.5C6.87495 5.95547 7.24449 6.325 7.69995 6.325C8.15542 6.325 8.52495 5.95547 8.52495 5.5V4.95H13.475V5.5C13.475 5.95547 13.8445 6.325 14.3 6.325C14.7554 6.325 15.125 5.95547 15.125 5.5V4.95H17.325C17.7799 4.95 18.15 5.3206 18.15 5.775V7.7H3.84995V5.775C3.84995 5.3206 4.22002 4.95 4.67495 4.95ZM17.325 18.15H4.67495C4.22002 18.15 3.84995 17.7794 3.84995 17.325V9.35H18.15V17.325C18.15 17.7794 17.7799 18.15 17.325 18.15Z" fill="currentColor"/><path d="M7.7 12.1C7.7 11.4925 7.20751 11 6.6 11C5.99249 11 5.5 11.4925 5.5 12.1C5.5 12.7075 5.99249 13.2 6.6 13.2C7.20751 13.2 7.7 12.7075 7.7 12.1Z" fill="currentColor"/><path d="M12.0999 12.1C12.0999 11.4925 11.6074 11 10.9999 11C10.3924 11 9.8999 11.4925 9.8999 12.1C9.8999 12.7075 10.3924 13.2 10.9999 13.2C11.6074 13.2 12.0999 12.7075 12.0999 12.1Z" fill="currentColor"/><path d="M16.5 12.1C16.5 11.4925 16.0076 11 15.4 11C14.7925 11 14.3 11.4925 14.3 12.1C14.3 12.7075 14.7925 13.2 15.4 13.2C16.0076 13.2 16.5 12.7075 16.5 12.1Z" fill="currentColor"/><path d="M7.7 15.4C7.7 14.7925 7.20751 14.3 6.6 14.3C5.99249 14.3 5.5 14.7925 5.5 15.4C5.5 16.0076 5.99249 16.5 6.6 16.5C7.20751 16.5 7.7 16.0076 7.7 15.4Z" fill="currentColor"/><path d="M12.0999 15.4C12.0999 14.7925 11.6074 14.3 10.9999 14.3C10.3924 14.3 9.8999 14.7925 9.8999 15.4C9.8999 16.0076 10.3924 16.5 10.9999 16.5C11.6074 16.5 12.0999 16.0076 12.0999 15.4Z" fill="currentColor"/><path d="M16.5 15.4C16.5 14.7925 16.0076 14.3 15.4 14.3C14.7925 14.3 14.3 14.7925 14.3 15.4C14.3 16.0076 14.7925 16.5 15.4 16.5C16.0076 16.5 16.5 16.0076 16.5 15.4Z" fill="currentColor"/></svg>';
const CHECKMARK_ICON = '<svg width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8.65072 17.3078C8.40579 17.3078 8.17377 17.1994 8.01693 17.0114L3.89515 12.0635C3.60297 11.7133 3.6513 11.1923 4.00042 10.9012C4.34954 10.609 4.86946 10.6552 5.16272 11.0065L8.63138 15.1712L16.8148 4.75559C17.0962 4.39681 17.6161 4.33557 17.9728 4.61595C18.3316 4.89739 18.3939 5.41624 18.1124 5.77395L9.29953 16.992C9.14591 17.1886 8.91173 17.3046 8.66252 17.3078L8.65072 17.3078Z" fill="currentColor"/></svg>';
const FILTER_ICON = '<svg width="26" height="26" viewBox="0 0 26 26" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M11.6986 24.3472C11.2314 24.3472 10.7668 24.2196 10.3504 23.9663C9.56709 23.4909 9.09991 22.66 9.09991 21.744V13.6374C9.09991 13.3956 9.01104 13.1645 8.84982 12.9855L3.41622 6.94887C2.7167 6.18144 2.54024 5.10742 2.963 4.15083C3.38448 3.19424 4.29601 2.6001 5.3421 2.6001H20.6577C21.7038 2.6001 22.6153 3.19424 23.0368 4.15083C23.4596 5.10742 23.2831 6.18144 22.5785 6.95332L17.15 12.9855C16.9888 13.1645 16.8999 13.3956 16.8999 13.6374V20.1964C16.8999 21.2933 16.2956 22.288 15.3232 22.7926L12.8984 24.0514C12.5188 24.2488 12.1074 24.3472 11.6986 24.3472ZM5.3421 4.5501C4.95871 4.5501 4.79874 4.82115 4.74669 4.93794C4.69464 5.05473 4.60323 5.35625 4.86095 5.63936L10.2996 11.6804C10.7833 12.2181 11.0499 12.9131 11.0499 13.6374V21.744C11.0499 22.0741 11.2683 22.2423 11.3622 22.2994C11.4562 22.3572 11.7075 22.4714 11.9995 22.321L14.4243 21.0616C14.7493 20.8934 14.9499 20.5621 14.9499 20.1964V13.6374C14.9499 12.9131 15.2165 12.2181 15.7002 11.6804L21.1338 5.6438C21.3966 5.35625 21.3052 5.05474 21.2531 4.93794C21.2011 4.82113 21.0411 4.5501 20.6577 4.5501H5.3421Z" fill="#292929"/></svg>';
const SEARCH_ICON = '<svg width="26" height="26" viewBox="0 0 26 26" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="11" cy="11" r="7.25" stroke="#6e6e6e" stroke-width="2"/><path d="M16.5 16.5L23 23" stroke="#6e6e6e" stroke-width="2" stroke-linecap="round"/></svg>';
const DOWNLOAD_ICON = '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M10 13.25a.747.747 0 0 1-.53-.22l-3.5-3.5a.75.75 0 1 1 1.06-1.06l2.22 2.22V3.5a.75.75 0 0 1 1.5 0v7.19l2.22-2.22a.75.75 0 1 1 1.06 1.06l-3.5 3.5a.747.747 0 0 1-.53.22Z" fill="#292929"/><path d="M15.25 16.5H4.75a.75.75 0 0 1 0-1.5h10.5a.75.75 0 0 1 0 1.5Z" fill="#292929"/></svg>';
const CLOSE_ICON = '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M7.06 6l3.47-3.47a.75.75 0 1 0-1.06-1.06L6 4.94 2.53 1.47a.75.75 0 0 0-1.06 1.06L4.94 6 1.47 9.47a.75.75 0 1 0 1.06 1.06L6 7.06l3.47 3.47a.75.75 0 0 0 1.06-1.06L7.06 6Z" fill="#292929"/></svg>';
const CHEVRON_DOWN_ICON = '<svg width="14" height="14" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4,7.01a1,1,0,0,1,1.7055-.7055l3.289,3.286,3.289-3.286a1,1,0,0,1,1.437,1.3865l-.0245.0245L9.7,11.7075a1,1,0,0,1-1.4125,0L4.293,7.716A.9945.9945,0,0,1,4,7.01Z" fill="#000"/></svg>';

// ─── Module-level state singleton ──────────────────────────────────────────

const [getState, setState] = (() => {
  let state = null;
  return [() => state, (s) => { state = s; }];
})();

let rsvpUnsubscribe = null;
let pendingSessionId = null;
let disconnectDescOverflowObserver = null;

async function openRsvpModal({ hash, path }) {
  const miloLibs = getEventConfig()?.miloConfig?.miloLibs || LIBS;
  const { getModal } = await import(`${miloLibs}/blocks/modal/modal.js`);
  // Update URL for deep-link / page-refresh support.
  // pushState rather than location.hash= so the hashchange listener doesn't fire
  // (Milo's hashchange handler looks for a[data-modal-hash] which is gone after
  // el.innerHTML='', causing findDetails to return a null path and skip the modal).
  window.history.pushState(null, '', `${window.location.pathname}${window.location.search}${hash}`);
  return getModal({ id: hash.slice(1), path });
}

// ─── Filter state ───────────────────────────────────────────────────────────

const [getFilterState, setFilterState] = (() => {
  let fs = { query: '', activeTags: new Map(), activeTab: 'all' };
  return [() => fs, (s) => { fs = s; }];
})();

// ─── Utilities ──────────────────────────────────────────────────────────────

function resolveTagWithGroup(tagId, tagsData) {
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
}

function resolveTagObjects(tagIdList, tagsData) {
  if (!tagIdList) return [];
  return tagIdList
    .split(',')
    .map((id) => resolveTagWithGroup(id.trim(), tagsData))
    .filter((t) => t.label);
}

function formatICSDate(millis) {
  return new Date(millis).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
}

function buildVEvent(sessionTime, title, locationName) {
  const lines = [
    'BEGIN:VEVENT',
    `UID:${sessionTime.sessionTimeId}@aem-event-libs`,
    `DTSTAMP:${formatICSDate(Date.now())}`,
    `DTSTART:${formatICSDate(sessionTime.startTimeMillis)}`,
    `DTEND:${formatICSDate(sessionTime.endTimeMillis)}`,
    `SUMMARY:${title.replace(/\n/g, '\\n')}`,
  ];
  if (locationName) lines.push(`LOCATION:${locationName.replace(/\n/g, '\\n')}`);
  lines.push('END:VEVENT');
  return lines;
}

function wrapVCalendar(eventLines) {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Adobe Event Libs//Sessions Catalogue//EN',
    ...eventLines,
    'END:VCALENDAR',
  ].join('\r\n');
}

function generateICS(sessionTime, title, locationName) {
  return wrapVCalendar(buildVEvent(sessionTime, title, locationName));
}

function triggerICSDownload(ics, filename) {
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = createTag('a', { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function downloadICS(sessionTime, title, locationName) {
  triggerICSDownload(generateICS(sessionTime, title, locationName), `${title.replace(/\s+/g, '-')}.ics`);
}

function downloadAllSessionsICS(sessions) {
  const events = sessions.flatMap((s) => {
    const time = s.sessionTimes?.[0];
    return time ? buildVEvent(time, s.title, time.locationName) : [];
  });
  if (!events.length) return;
  const eventTitle = getMetadata('event-title') || 'My-sessions';
  triggerICSDownload(wrapVCalendar(events), `${eventTitle.replace(/\s+/g, '-')}-schedule.ics`);
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


// ─── Data loading ────────────────────────────────────────────────────────────

async function resolveEventData() {
  const eventId = getMetadata('event-id');
  if (!eventId) return null;

  const resp = await getEvent(eventId);
  if (!resp.ok) return null;

  return resp.data;
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

function isSessionTimeFullError(resp) {
  const err = resp?.error;
  if (!err) return false;
  const candidates = [err.code, err.errorCode, err.error, err.type, err.message];
  return candidates.some((v) => typeof v === 'string' && v.includes('SessionTimeFull'));
}

function computeIsEventClosed(eventData) {
  if (!eventData?.isFull) return false;
  // ESP returns allowWaitlisting as either boolean `true` or string `'true'` depending on source.
  // Match both — anything truthy that isn't the literal string 'false' counts as enabled.
  const waitlistEnabled = eventData.allowWaitlisting === true
    || eventData.allowWaitlisting === 'true';
  return !waitlistEnabled;
}

function isSessionRegistrationBlocked({ isEventWaitlisted, isEventClosed, inviteOnlyBlocked }) {
  return Boolean(isEventWaitlisted || isEventClosed || inviteOnlyBlocked);
}

function findConflictingSession(newSession, state) {
  const newTime = newSession.sessionTimes[0];
  if (!newTime) return null;
  for (const session of state.sessions) {
    if (!session.isRegistered || session.sessionId === newSession.sessionId) continue;
    const regTime = session.sessionTimes[0];
    if (!regTime) continue;
    if (newTime.startTimeMillis < regTime.endTimeMillis
        && regTime.startTimeMillis < newTime.endTimeMillis) {
      return session;
    }
  }
  return null;
}

function normalizeSessions(rawSessions, locationMap, registeredSessionIds, venueId, tagsData) {
  const mapped = rawSessions.map((session) => {
    const sessionTimes = (session.rawTimes || []).map((t) => ({
      sessionTimeId: t.sessionTimeId,
      startTimeMillis: t.startTimeMillis,
      endTimeMillis: t.endTimeMillis,
      timezone: t.timezone,
      locationId: t.locationId,
      locationName: locationMap.get(`${venueId}:${t.locationId}`)?.name || t.location?.name || '',
      isFull: t.isFull,
      isAutoRegistrationEnabled: t.isAutoRegistrationEnabled ?? false,
    }));

    const speakers = (session.rawSpeakers || [])
      .sort((a, b) => (a.ordinal ?? 0) - (b.ordinal ?? 0))
      .map((s) => ({
        speakerId: s.speakerId,
        speakerType: s.speakerType,
        firstName: s.firstName || '',
        lastName: s.lastName || '',
        title: s.localizations?.['en-US']?.title || s.title || '',
        bio: s.localizations?.['en-US']?.bio || s.bio || '',
        photo: s.photo || null,
        socialLinks: s.socialLinks || [],
        company: s.company || '',
      }));

    return {
      sessionId: session.sessionId,
      title: session.localizations?.['en-US']?.title || session.title || session.enTitle || '',
      description: session.localizations?.['en-US']?.description || session.description || '',
      tags: resolveTagObjects(session.tags, tagsData),
      sessionTimes,
      speakers,
      isRegistered: registeredSessionIds.has(session.sessionId),
      isWaitlisted: false,
      expanded: false,
    };
  });
  return mapped.sort((a, b) => {
    const aMin = Math.min(...a.sessionTimes.map((t) => t.startTimeMillis).filter(Boolean));
    const bMin = Math.min(...b.sessionTimes.map((t) => t.startTimeMillis).filter(Boolean));
    return (isFinite(aMin) ? aMin : Infinity) - (isFinite(bMin) ? bMin : Infinity);
  });
}

// ─── Filter / search ─────────────────────────────────────────────────────────

const DEFAULT_SEARCH_CONFIG = { includeDescription: false };

function parseSearchConfig(blockEl) {
  return {
    includeDescription: Boolean(blockEl?.classList?.contains('search-include-description')),
  };
}

function getEffectiveSearchQuery(rawQuery) {
  const t = (rawQuery || '').trim().toLowerCase();
  return t.length >= 2 ? t : '';
}

function speakerMatchesQuery(sp, q) {
  const fn = (sp.firstName || '').toLowerCase();
  const ln = (sp.lastName || '').toLowerCase();
  const full = `${fn} ${ln}`.trim();
  return fn.includes(q) || ln.includes(q) || full.includes(q);
}

function sessionMatchesTextSearch(s, q, searchConfig) {
  const cfg = searchConfig || DEFAULT_SEARCH_CONFIG;
  if ((s.title || '').toLowerCase().includes(q)) return true;
  if (s.speakers.some((sp) => speakerMatchesQuery(sp, q))) return true;
  if (s.tags.some((t) => t.label && t.label.toLowerCase().includes(q))) return true;
  if (cfg.includeDescription && (s.description || '').toLowerCase().includes(q)) return true;
  return false;
}

function collectFilterGroups(sessions) {
  const groups = new Map();
  sessions.forEach((s) => s.tags.forEach(({ label, group }) => {
    if (!label) return;
    const key = group || '';
    if (!groups.has(key)) groups.set(key, new Set());
    groups.get(key).add(label);
  }));
  const sorted = new Map();
  [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .forEach(([g, tagSet]) => sorted.set(g, [...tagSet].sort()));
  return sorted;
}

export function filterSessions(sessions, {
  query,
  activeTags,
  activeTab,
  registeredSessionIds,
  searchConfig = DEFAULT_SEARCH_CONFIG,
}) {
  const q = getEffectiveSearchQuery(query);
  return sessions.filter((s) => {
    if (activeTab === 'my' && !registeredSessionIds.has(s.sessionId)) return false;

    if (activeTags.size > 0) {
      for (const [, groupSet] of activeTags) {
        if (groupSet.size > 0 && !s.tags.some((t) => groupSet.has(t.label))) return false;
      }
    }

    if (q && !sessionMatchesTextSearch(s, q, searchConfig)) return false;

    return true;
  });
}

function getSessionListRoot(sessionAreaOrList) {
  if (sessionAreaOrList?.classList?.contains('sh-session-area')) {
    return sessionAreaOrList.querySelector('.sh-session-list') || sessionAreaOrList;
  }
  return sessionAreaOrList;
}

function applyFilter(sessionAreaEl, state) {
  const fs = getFilterState();
  const filtered = filterSessions(state.sessions, {
    query: fs.query,
    activeTags: fs.activeTags,
    activeTab: fs.activeTab,
    registeredSessionIds: state.registeredSessionIds,
    searchConfig: state.searchConfig || DEFAULT_SEARCH_CONFIG,
  });
  const filteredIds = new Set(filtered.map((s) => s.sessionId));
  const effectiveQuery = getEffectiveSearchQuery(fs.query);

  const listRoot = getSessionListRoot(sessionAreaEl);
  listRoot.querySelectorAll('.sh-card').forEach((card) => {
    card.hidden = !filteredIds.has(card.dataset.sessionId);
  });

  const emptyEl = sessionAreaEl.querySelector('.sh-no-results');
  if (emptyEl) {
    const showEmpty = effectiveQuery.length >= 2 && filtered.length === 0;
    emptyEl.hidden = !showEmpty;
    listRoot.hidden = showEmpty;
  }

  scheduleSyncSessionDescriptionsOverflow(sessionAreaEl);
}

// ─── Render: CTA group ───────────────────────────────────────────────────────

function renderCTAGroup(session, { isEventRegistered = false, isBlocked = false } = {}) {
  const group = createTag('div', { class: 'sh-cta-group' });

  // State 1: registered or waitlisted for THIS session — badge with hover-to-unregister
  if (isEventRegistered && (session.isRegistered || session.isWaitlisted)) {
    const calBtn = createTag('button', { class: 'sh-btn sh-btn-cal', type: 'button' });
    calBtn.append(createIcon(CTA_CALENDAR_ICON), createTag('span', {}, dictionaryManager.getValue('Download to calendar')));
    group.append(calBtn);

    const isWaitlisted = !session.isRegistered && session.isWaitlisted;
    const badgeLabel = isWaitlisted
      ? dictionaryManager.getValue('waitlisted-cta-text')
      : dictionaryManager.getValue('Registered');
    const unregisterLabel = isWaitlisted
      ? dictionaryManager.getValue('Leave waitlist')
      : dictionaryManager.getValue('Unregister');

    const badge = createTag('button', { class: 'sh-btn sh-registered-badge', type: 'button', disabled: '' });
    badge.append(createIcon(CHECKMARK_ICON), createTag('span', {}, badgeLabel));
    group.append(badge);

    setTimeout(() => {
      badge.style.minWidth = `${badge.offsetWidth}px`;
      badge.disabled = false;
    }, 2000);

    const setIdleContent = () => {
      badge.innerHTML = '';
      badge.classList.remove('sh-unregister-mode');
      badge.append(createIcon(CHECKMARK_ICON), createTag('span', {}, badgeLabel));
    };
    const setUnregisterContent = () => {
      badge.innerHTML = '';
      badge.classList.add('sh-unregister-mode');
      badge.append(createTag('span', {}, unregisterLabel));
    };
    badge.addEventListener('mouseenter', () => { if (!badge.disabled) setUnregisterContent(); });
    badge.addEventListener('mouseleave', () => { if (!badge.disabled) setIdleContent(); });
    return group;
  }

  // State 3: blocked — disabled button (event-waitlisted, event-closed, or invite-only without campaign)
  if (isBlocked) {
    const btn = createTag('button', {
      class: 'sh-btn sh-btn-blocked',
      type: 'button',
      disabled: '',
      'aria-disabled': 'true',
    }, dictionaryManager.getValue('Registration unavailable'));
    group.append(btn);
    return group;
  }

  // State 2: able to register — direct-API button (no modal)
  if (isEventRegistered) {
    group.append(createTag('button', { class: 'sh-btn sh-btn-register-session', type: 'button' }, dictionaryManager.getValue('Register for session')));
    return group;
  }

  // Default: not yet event-registered, not blocked — opens RSVP modal
  group.append(createTag('button', { class: 'sh-btn sh-btn-register-event', type: 'button' }, dictionaryManager.getValue('Register for session')));
  return group;
}

function updateCTAGroup(cardEl, session, opts = {}) {
  const old = cardEl.querySelector('.sh-cta-group');
  if (!old) return;
  old.replaceWith(renderCTAGroup(session, opts));
}

// ─── Session description overflow (matches CSS -webkit-line-clamp) ───────────

function syncSessionCardDescriptionOverflow(card) {
  const descText = card.querySelector('.sh-card-desh-text');
  const expandBtn = card.querySelector('.sh-expand-btn');
  if (!descText || !expandBtn) return;

  if (card.hidden) return;

  if (card.classList.contains('expanded')) {
    expandBtn.hidden = false;
    const readMoreEl = card.querySelector('.sh-read-more');
    if (readMoreEl) readMoreEl.hidden = false;
    return;
  }

  const truncated = descText.scrollHeight > descText.clientHeight;
  expandBtn.hidden = !truncated;

  const desc = card.querySelector('.sh-card-desc');
  let readMore = card.querySelector('.sh-read-more');
  if (truncated) {
    if (!readMore && desc) {
      readMore = createTag('button', { class: 'sh-read-more', type: 'button' }, dictionaryManager.getValue('Read more'));
      desc.append(readMore);
    } else if (readMore) {
      readMore.hidden = false;
    }
  } else if (readMore) {
    readMore.remove();
  }
}

export function syncSessionDescriptionsOverflow(sessionAreaOrList) {
  if (!sessionAreaOrList) return;
  sessionAreaOrList.querySelectorAll('.sh-card').forEach((card) => {
    syncSessionCardDescriptionOverflow(card);
  });
}

function scheduleSyncSessionDescriptionsOverflow(listEl) {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      syncSessionDescriptionsOverflow(listEl);
    });
  });
}

function connectSessionDescriptionsOverflowObserver(sessionAreaEl) {
  if (typeof ResizeObserver === 'undefined') return;
  disconnectSessionDescriptionsOverflow();
  const observeEl = getSessionListRoot(sessionAreaEl);
  const debouncedSync = debounce(() => {
    syncSessionDescriptionsOverflow(sessionAreaEl);
  }, 100);
  const ro = new ResizeObserver(() => {
    debouncedSync();
  });
  ro.observe(observeEl);
  disconnectDescOverflowObserver = () => {
    ro.disconnect();
    disconnectDescOverflowObserver = null;
  };
}

function disconnectSessionDescriptionsOverflow() {
  if (disconnectDescOverflowObserver) {
    disconnectDescOverflowObserver();
  }
}

// ─── Render: session card ────────────────────────────────────────────────────

function renderTagPills(tags) {
  const list = createTag('ul', { class: 'sh-tag-list', 'aria-label': dictionaryManager.getValue('Tags') });
  tags.forEach((tag) => list.append(createTag('li', { class: 'sh-tag-pill' }, tag.label)));
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

function renderSessionCard(session, opts = {}) {
  const primaryTime = session.sessionTimes[0];
  const timeStr = primaryTime
    ? createSmartDateRange(primaryTime.startTimeMillis, primaryTime.endTimeMillis, 'en-US', primaryTime.timezone)
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
    'aria-label': dictionaryManager.getValue('Expand session'),
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

  if (primaryTime?.isFull) {
    left.append(createTag('span', { class: 'sh-full-badge' }, dictionaryManager.getValue('Session full')));
  }

  if (session.tags.length) left.append(renderTagPills(session.tags));

  if (session.speakers.length) {
    const speakersWrap = createTag('div', { class: 'sh-card-speakers' });
    speakersWrap.append(createTag('span', { class: 'sh-speakers-label' }, dictionaryManager.getValue('Speakers')));
    speakersWrap.append(renderSpeakerAvatars(session.speakers));
    left.append(speakersWrap);
  }

  // ── Right column ─────────────────────────────────────────────────────────
  const right = createTag('div', { class: 'sh-card-right' });

  const desc = createTag('div', { class: 'sh-card-desc' });
  const descText = createTag('div', { class: 'sh-card-desh-text' });
  const fullDesc = session.description || '';
  descText.innerHTML = fullDesc;

  desc.append(descText);
  right.append(desc, renderCTAGroup(session, opts));

  card.append(left, right);
  return card;
}

function renderSessionList(sessions, opts = {}) {
  const area = createTag('div', { class: 'sh-session-area' });
  const list = createTag('div', { class: 'sh-session-list' });
  const empty = createTag('div', {
    class: 'sh-no-results',
    hidden: '',
    role: 'status',
    'aria-live': 'polite',
    'aria-atomic': 'true',
  });
  empty.append(createTag('p', {}, dictionaryManager.getValue('No matching sessions')));
  sessions.forEach((s) => list.append(renderSessionCard(s, opts)));
  area.append(list, empty);
  return area;
}

// ─── Render: toolbar ────────────────────────────────────────────────────────

function renderViewDropdown(isEventRegistered) {
  const wrap = createTag('div', { class: 'sh-view-dropdown' });
  if (!isEventRegistered) wrap.hidden = true;
  const toggle = createTag('button', {
    class: 'sh-view-toggle',
    type: 'button',
    'aria-haspopup': 'listbox',
    'aria-expanded': 'false',
  });
  toggle.append(
    createTag('span', { class: 'sh-view-label' }, dictionaryManager.getValue('All sessions')),
    createIcon(CHEVRON_DOWN_ICON),
  );
  const menu = createTag('div', { class: 'sh-view-menu hidden', role: 'listbox', 'aria-hidden': 'true' });
  [['all', 'All sessions'], ['my', 'My sessions']].forEach(([tab, label], i) => {
    menu.append(createTag('button', {
      class: `sh-view-option${i === 0 ? ' active' : ''}`,
      type: 'button',
      role: 'option',
      'data-tab': tab,
      'aria-selected': i === 0 ? 'true' : 'false',
    }, dictionaryManager.getValue(label)));
  });
  wrap.append(toggle, menu);
  return wrap;
}

function renderFilterPanel(sessions) {
  const panel = createTag('div', { class: 'sh-filter-panel hidden', 'aria-hidden': 'true' });
  const groups = collectFilterGroups(sessions);
  let tagIdx = 0;
  groups.forEach((tagLabels, groupName) => {
    const section = createTag('div', { class: 'sh-filter-group' });
    if (groupName) {
      section.append(createTag('span', { class: 'sh-filter-group-label' }, groupName));
    }
    tagLabels.forEach((tag) => {
      const id = `sh-filter-tag-${tagIdx++}`;
      const lbl = createTag('label', { class: 'sh-filter-item', for: id });
      lbl.append(createTag('input', {
        id,
        type: 'checkbox',
        value: tag,
        'data-filter-type': 'tag',
        'data-filter-group': groupName,
      }));
      lbl.append(createTag('span', {}, tag));
      section.append(lbl);
    });
    panel.append(section);
  });
  return panel;
}

function renderToolbar(state) {
  const toolbar = createTag('div', { class: 'sh-toolbar', role: 'search' });
  const inner = createTag('div', { class: 'sh-toolbar-inner' });
  const dropdown = renderViewDropdown(state.isEventRegistered);
  const downloadBtn = createTag('button', {
    class: 'sh-download-btn',
    type: 'button',
    'aria-label': dictionaryManager.getValue('Download my schedule'),
    title: dictionaryManager.getValue('Download my schedule'),
    hidden: '',
  });
  downloadBtn.append(createIcon(DOWNLOAD_ICON));
  const actions = createTag('div', { class: 'sh-toolbar-actions' });

  const filterWrap = createTag('div', { class: 'sh-filter-wrap' });
  const filterGroups = collectFilterGroups(state.sessions);
  const hasFilters = filterGroups.size > 0;
  const filterBtn = createTag('button', {
    class: 'sh-filter-btn',
    type: 'button',
    'aria-expanded': 'false',
    ...(hasFilters ? {} : { disabled: '' }),
  });
  filterBtn.append(
    createIcon(FILTER_ICON),
    createTag('span', { class: 'sh-filter-btn-label' }, dictionaryManager.getValue('Filter')),
  );
  const filterPanel = renderFilterPanel(state.sessions);
  filterWrap.append(filterBtn, filterPanel);

  const searchWrap = createTag('div', { class: 'sh-search-wrap' });
  const searchToggle = createTag('button', {
    class: 'sh-search-toggle',
    type: 'button',
    'aria-label': dictionaryManager.getValue('Search sessions'),
    'aria-expanded': 'false',
  });
  searchToggle.append(createIcon(SEARCH_ICON));
  const searchInput = createTag('input', {
    class: 'sh-search',
    type: 'search',
    placeholder: dictionaryManager.getValue('Search sessions'),
    'aria-label': dictionaryManager.getValue('Search sessions'),
  });
  const searchClear = createTag('button', {
    class: 'sh-search-clear',
    type: 'button',
    'aria-label': dictionaryManager.getValue('Clear search'),
  });
  searchClear.append(createIcon(CLOSE_ICON));
  searchWrap.append(searchToggle, searchInput, searchClear);

  actions.append(downloadBtn, dropdown, filterWrap, searchWrap);
  inner.append(actions);
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

function buildBannerDateString() {
  const startMillis = getMetadata('local-start-time-millis');
  const endMillis = getMetadata('local-end-time-millis');
  if (!startMillis || !endMillis) return '';

  const eventType = getMetadata('event-type');
  const timezone = eventType === 'InPerson' ? getMetadata('timezone') : null;

  return createSmartDateRange(startMillis, endMillis, 'en-US', timezone);
}

function renderEventBanner(rsvpConfig, { inviteOnlyBlocked = false, inviteOnlyMessage = '', isEventWaitlisted = false, waitlistBannerMessage = '' } = {}) {
  const banner = createTag('aside', { class: 'sh-event-banner', 'aria-label': dictionaryManager.getValue('Event registration') });
  const inner = createTag('div', { class: 'sh-banner-inner' });
  const info = createTag('div', { class: 'sh-banner-info' });

  const title = getMetadata('event-title');
  if (title) {
    info.append(createTag('span', { class: 'sh-banner-title' }, title));
  }

  const dateStr = buildBannerDateString();
  if (dateStr) {
    const dateRow = createTag('span', { class: 'sh-banner-date' });
    const icon = createTag('span', { class: 'sh-icon' });
    icon.innerHTML = CTA_CALENDAR_ICON;
    dateRow.append(icon, dateStr);
    info.append(dateRow);
  }

  if (inviteOnlyBlocked) {
    inner.append(
      info,
      createTag('p', { class: 'sh-banner-invite-only-msg', role: 'status' }, inviteOnlyMessage),
    );
  } else {
    const btn = createTag('button', { class: 'sh-btn sh-btn-event-register', type: 'button' });
    if (isEventWaitlisted) {
      btn.classList.add('sh-event-register-waitlisted');
      btn.append(createIcon(CHECKMARK_ICON), createTag('span', {}, dictionaryManager.getValue('waitlisted-cta-text')));
    } else {
      btn.append(createTag('span', {}, dictionaryManager.getValue('Register')));
    }
    btn.addEventListener('click', () => {
      const profile = BlockMediator.get('imsProfile');
      const isSignedOut = !profile || profile.noProfile || profile.account_type === 'guest';
      if (isSignedOut) {
        sessionStorage.setItem('sessions-hub:pendingEventRsvp', '1');
        signIn({ ...getSusiOptions(), redirect_uri: window.location.href });
      } else if (rsvpConfig) {
        openRsvpModal(rsvpConfig);
      }
    });

    if (isEventWaitlisted) {
      const msg = createTag('p', { class: 'sh-banner-waitlist-msg', role: 'status' }, waitlistBannerMessage);
      inner.append(info, msg, btn);
    } else {
      inner.append(info, btn);
    }
  }

  banner.append(inner);
  return banner;
}

function syncBannerVisibility(bannerEl, isEventRegistered) {
  if (!bannerEl) return;
  bannerEl.classList.toggle('hidden', isEventRegistered);
}

// ─── Conflict modal ──────────────────────────────────────────────────────────

function buildConflictOption(session, { registered = false } = {}) {
  const primaryTime = session.sessionTimes[0];
  const timeStr = primaryTime
    ? createSmartDateRange(primaryTime.startTimeMillis, primaryTime.endTimeMillis, 'en-US', primaryTime.timezone)
    : '';
  const locationName = primaryTime?.locationName || '';

  const option = createTag('div', {
    class: 'sh-conflict-option',
    'data-session-id': session.sessionId,
    role: 'radio',
    tabindex: '0',
    'aria-checked': 'false',
  });
  option.append(createTag('span', { class: 'sh-conflict-radio', 'aria-hidden': 'true' }));

  const content = createTag('div', { class: 'sh-conflict-option-content' });
  const titleRow = createTag('div', { class: 'sh-conflict-option-title-row' });
  titleRow.append(createTag('p', { class: 'sh-conflict-option-title' }, session.title));
  if (registered) {
    titleRow.append(createTag('span', { class: 'sh-conflict-badge' }, dictionaryManager.getValue('Registered')));
  }
  content.append(titleRow);

  if (timeStr) {
    const timeEl = createTag('div', { class: 'sh-conflict-option-meta' });
    timeEl.append(createIcon(CALENDAR_ICON), ` ${timeStr}`);
    content.append(timeEl);
  }

  if (locationName) {
    const locEl = createTag('div', { class: 'sh-conflict-option-meta' });
    locEl.append(createIcon(PIN_ICON), ` ${locationName}`);
    content.append(locEl);
  }

  option.append(content);
  return option;
}

function buildConflictModalContent(newSession, conflictingSession) {
  const wrapper = createTag('div', { class: 'sh-conflict-wrapper' });

  const heading = createTag('div', { class: 'sh-conflict-heading' });
  heading.append(
    createTag('p', { class: 'sh-conflict-title' }, dictionaryManager.getValue('You are registered for a session at this time')),
    createTag('p', { class: 'sh-conflict-subtitle' }, dictionaryManager.getValue('Select the session you would like to keep.')),
  );

  const optionsEl = createTag('div', { class: 'sh-conflict-options', role: 'radiogroup' });
  const newOption = buildConflictOption(newSession);
  const existingOption = buildConflictOption(conflictingSession, { registered: true });
  existingOption.classList.add('selected');
  existingOption.setAttribute('aria-checked', 'true');
  optionsEl.append(newOption, existingOption);

  optionsEl.addEventListener('click', (e) => {
    const opt = e.target.closest('.sh-conflict-option');
    if (!opt) return;
    optionsEl.querySelectorAll('.sh-conflict-option').forEach((o) => {
      o.classList.remove('selected');
      o.setAttribute('aria-checked', 'false');
    });
    opt.classList.add('selected');
    opt.setAttribute('aria-checked', 'true');
  });

  optionsEl.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const opt = e.target.closest('.sh-conflict-option');
    if (!opt) return;
    e.preventDefault();
    opt.click();
  });

  const footer = createTag('div', { class: 'sh-conflict-footer' });
  const cancelBtn = createTag('button', {
    class: 'sh-conflict-cancel',
    type: 'button',
  }, dictionaryManager.getValue('Cancel'));
  const confirmBtn = createTag('button', {
    class: 'sh-btn sh-conflict-confirm',
    type: 'button',
  }, dictionaryManager.getValue('Confirm session'));
  footer.append(cancelBtn, confirmBtn);

  wrapper.append(heading, optionsEl, footer);
  return { content: wrapper, confirmBtn, cancelBtn, optionsEl };
}

function setSwapConflictModalPending(confirmBtn, optionsEl) {
  confirmBtn.disabled = true;
  confirmBtn.setAttribute('aria-busy', 'true');
  confirmBtn.textContent = dictionaryManager.getValue('Registering\u2026');
  optionsEl.classList.add('sh-conflict-options-pending');
  optionsEl.querySelectorAll('.sh-conflict-option').forEach((o) => {
    o.setAttribute('tabindex', '-1');
  });
}

function restoreSwapConflictModalUi(confirmBtn, optionsEl) {
  confirmBtn.disabled = false;
  confirmBtn.removeAttribute('aria-busy');
  confirmBtn.textContent = dictionaryManager.getValue('Confirm session');
  optionsEl.classList.remove('sh-conflict-options-pending');
  optionsEl.querySelectorAll('.sh-conflict-option').forEach((o) => {
    o.setAttribute('tabindex', '0');
  });
}

async function openConflictModal(newSession, conflictingSession) {
  const miloLibs = getEventConfig()?.miloConfig?.miloLibs || LIBS;
  const { getModal, closeModal } = await import(`${miloLibs}/blocks/modal/modal.js`);
  const {
    content, confirmBtn, cancelBtn, optionsEl,
  } = buildConflictModalContent(newSession, conflictingSession);

  let dialogEl;
  return new Promise((resolve) => {
    let confirmed = false;

    cancelBtn.addEventListener('click', () => closeModal(dialogEl));

    confirmBtn.addEventListener('click', () => {
      confirmed = true;
      const sel = optionsEl.querySelector('.sh-conflict-option.selected');
      const selectedId = sel?.dataset.sessionId || newSession.sessionId;

      if (selectedId === conflictingSession.sessionId) {
        closeModal(dialogEl);
        resolve({ selectedId, finalize: () => {} });
        return;
      }

      setSwapConflictModalPending(confirmBtn, optionsEl);
      resolve({
        selectedId,
        finalize: (ok) => {
          if (ok) {
            closeModal(dialogEl);
          } else {
            restoreSwapConflictModalUi(confirmBtn, optionsEl);
          }
        },
      });
    });

    const onClose = () => {
      window.removeEventListener('milo:modal:closed', onClose);
      if (!confirmed) resolve(null);
    };
    window.addEventListener('milo:modal:closed', onClose);

    getModal(null, { id: 'sh-conflict-modal', content, class: 'sh-conflict-modal' })
      .then((modal) => { dialogEl = modal; });
  });
}

// ─── Speaker modal ───────────────────────────────────────────────────────────

async function openSpeakerModal(speaker) {
  if (!speaker) return;

  const profileCardsCssUrl = new URL('../profile-cards/profile-cards.css', import.meta.url).href;
  const miloLibs = getEventConfig()?.miloConfig?.miloLibs || LIBS;
  const [{ getModal }] = await Promise.all([
    import(`${miloLibs}/blocks/modal/modal.js`),
    new Promise((resolve) => { loadStyle(profileCardsCssUrl, resolve); }),
  ]);

  const content = await buildModalContent(speaker);
  await getModal(null, {
    id: `sh-speaker-${speaker.speakerId}`,
    content,
    class: 'profile-cards-modal',
    title: `${speaker.firstName} ${speaker.lastName}`,
  });
}

// ─── Event binding ───────────────────────────────────────────────────────────

function bindToolbarEvents(toolbarEl, listEl, state) {
  const searchInput = toolbarEl.querySelector('.sh-search');
  const filterBtn = toolbarEl.querySelector('.sh-filter-btn');
  const filterPanel = toolbarEl.querySelector('.sh-filter-panel');
  const downloadBtn = toolbarEl.querySelector('.sh-download-btn');
  const searchWrap = toolbarEl.querySelector('.sh-search-wrap');
  const searchToggle = toolbarEl.querySelector('.sh-search-toggle');
  const searchClear = toolbarEl.querySelector('.sh-search-clear');

  searchInput.addEventListener('input', debounce(() => {
    setFilterState({ ...getFilterState(), query: searchInput.value });
    applyFilter(listEl, state);
  }, 200));

  searchToggle.addEventListener('click', () => {
    const expanded = searchWrap.classList.toggle('expanded');
    searchToggle.setAttribute('aria-expanded', String(expanded));
    if (expanded) setTimeout(() => searchInput.focus(), 0);
  });

  searchInput.addEventListener('blur', () => {
    if (searchInput.value) return;
    searchWrap.classList.remove('expanded');
    searchToggle.setAttribute('aria-expanded', 'false');
  });

  searchClear.addEventListener('click', () => {
    searchInput.value = '';
    setFilterState({ ...getFilterState(), query: '' });
    applyFilter(listEl, state);
    searchWrap.classList.remove('expanded');
    searchToggle.setAttribute('aria-expanded', 'false');
    searchToggle.focus();
  });

  downloadBtn?.addEventListener('click', () => {
    const registered = state.sessions.filter((s) => state.registeredSessionIds?.has(s.sessionId));
    downloadAllSessionsICS(registered);
  });

  filterBtn.addEventListener('click', () => {
    if (filterBtn.disabled) return;
    const isHidden = filterPanel.classList.toggle('hidden');
    filterBtn.setAttribute('aria-expanded', String(!isHidden));
    filterPanel.setAttribute('aria-hidden', String(isHidden));
    if (!isHidden) {
      const firstCheckbox = filterPanel.querySelector('input[type="checkbox"]');
      if (firstCheckbox) setTimeout(() => firstCheckbox.focus(), 0);
    }
  });

  filterPanel.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    filterPanel.classList.add('hidden');
    filterBtn.setAttribute('aria-expanded', 'false');
    filterPanel.setAttribute('aria-hidden', 'true');
    filterBtn.focus();
  });

  document.addEventListener('click', (e) => {
    const filterWrap = toolbarEl.querySelector('.sh-filter-wrap');
    if (!filterWrap?.contains(e.target)) {
      const wasOpen = !filterPanel.classList.contains('hidden');
      filterPanel.classList.add('hidden');
      filterBtn.setAttribute('aria-expanded', 'false');
      filterPanel.setAttribute('aria-hidden', 'true');
      if (wasOpen) filterBtn.focus();
    }
  });

  filterPanel.addEventListener('change', (e) => {
    const cb = e.target;
    if (cb.type !== 'checkbox') return;
    const fs = getFilterState();
    const newTags = new Map(fs.activeTags);
    if (cb.dataset.filterType === 'tag') {
      const group = cb.dataset.filterGroup || '';
      const groupSet = new Set(newTags.get(group));
      cb.checked ? groupSet.add(cb.value) : groupSet.delete(cb.value);
      if (groupSet.size === 0) newTags.delete(group);
      else newTags.set(group, groupSet);
    }
    setFilterState({ ...fs, activeTags: newTags });
    applyFilter(listEl, state);
  });

  const viewDropdown = toolbarEl.querySelector('.sh-view-dropdown');
  const viewToggle = toolbarEl.querySelector('.sh-view-toggle');
  const viewMenu = toolbarEl.querySelector('.sh-view-menu');
  const viewLabel = toolbarEl.querySelector('.sh-view-label');

  const closeViewMenu = () => {
    viewMenu?.classList.add('hidden');
    viewToggle?.setAttribute('aria-expanded', 'false');
    viewMenu?.setAttribute('aria-hidden', 'true');
  };

  viewToggle?.addEventListener('click', () => {
    const isHidden = viewMenu.classList.toggle('hidden');
    viewToggle.setAttribute('aria-expanded', String(!isHidden));
    viewMenu.setAttribute('aria-hidden', String(isHidden));
  });

  viewMenu?.addEventListener('click', (e) => {
    const opt = e.target.closest('.sh-view-option');
    if (!opt) return;
    viewMenu.querySelectorAll('.sh-view-option').forEach((o) => {
      const isActive = o === opt;
      o.classList.toggle('active', isActive);
      o.setAttribute('aria-selected', String(isActive));
    });
    viewLabel.textContent = opt.textContent;
    setFilterState({ ...getFilterState(), activeTab: opt.dataset.tab });
    if (downloadBtn) downloadBtn.hidden = opt.dataset.tab !== 'my';
    closeViewMenu();
    applyFilter(listEl, state);
  });

  viewDropdown?.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    closeViewMenu();
    viewToggle.focus();
  });

  document.addEventListener('click', (e) => {
    if (!viewDropdown?.contains(e.target)) closeViewMenu();
  });
}

async function handleSessionRegistration(cardEl, sessionId, state) {
  const session = state.sessions.find((s) => s.sessionId === sessionId);
  if (!session) return;

  const firstTime = session.sessionTimes[0];
  if (!firstTime) return;

  // Defensive: never attempt session registration when blocked at the event level.
  // The disabled CTA prevents clicks, but an auto-fired flow (e.g. pendingSessionId)
  // could still reach this point.
  if (isSessionRegistrationBlocked({
    isEventWaitlisted: state.isEventWaitlisted,
    isEventClosed: state.isEventClosed,
    inviteOnlyBlocked: state.inviteOnlyBlocked,
  })) return;

  // ── Conflict detection ────────────────────────────────────────────────────
  const conflictingSession = findConflictingSession(session, state);
  let conflictFinalize = null;
  let isDeferredSwap = false;
  if (conflictingSession) {
    const outcome = await openConflictModal(session, conflictingSession);
    if (!outcome) return; // dismissed
    if (outcome.selectedId === conflictingSession.sessionId) return; // user kept existing

    conflictFinalize = outcome.finalize;
    isDeferredSwap = true;

    // User chose new session → unregister from conflicting first
    const conflictTime = conflictingSession.sessionTimes[0];
    if (conflictTime) {
      const unregResp = await unregisterFromSessionTime(conflictTime.sessionTimeId);
      if (!unregResp.ok) {
        window.lana?.log(`Error: Failed to unregister conflicting session ${conflictingSession.sessionId}`);
        conflictFinalize(false);
        return;
      }
      conflictingSession.isRegistered = false;
      state.registeredSessionIds.delete(conflictingSession.sessionId);
      const conflictCard = cardEl.closest('.sh-session-list')
        ?.querySelector(`[data-session-id="${conflictingSession.sessionId}"]`);
      if (conflictCard) updateCTAGroup(conflictCard, conflictingSession, { isEventRegistered: true, isBlocked: false });
      const existing = BlockMediator.get('registeredSessionIds') || new Set();
      const updated = new Set([...existing]);
      updated.delete(conflictingSession.sessionId);
      BlockMediator.set('registeredSessionIds', updated);
    }
  }

  const btn = cardEl.querySelector('.sh-btn-register-session');
  if (!isDeferredSwap && btn) {
    btn.disabled = true;
    btn.setAttribute('aria-busy', 'true');
    btn.textContent = dictionaryManager.getValue('Registering\u2026');
  }

  let resp = await registerForSessionTime(firstTime.sessionTimeId, 'me', { registrationStatus: 'registered' });
  let waitlisted = resp.ok && resp.data?.registrationStatus === 'waitlisted';

  if (!resp.ok && isSessionTimeFullError(resp)) {
    const retry = await registerForSessionTime(firstTime.sessionTimeId, 'me', { registrationStatus: 'waitlisted' });
    if (retry.ok) {
      resp = retry;
      waitlisted = true;
    } else {
      resp = retry;
    }
  }

  if (resp.ok) {
    if (waitlisted) {
      session.isWaitlisted = true;
      session.isRegistered = false;
    } else {
      session.isRegistered = true;
      session.isWaitlisted = false;
      state.registeredSessionIds.add(sessionId);
      const existing = BlockMediator.get('registeredSessionIds') || new Set();
      BlockMediator.set('registeredSessionIds', new Set([...existing, sessionId]));
    }
    updateCTAGroup(cardEl, session, { isEventRegistered: true, isBlocked: false });
    if (conflictFinalize) conflictFinalize(true);
  } else {
    window.lana?.log(`Error: Failed to register for session ${sessionId}. Error:${JSON.stringify(resp.error)}`);
    if (conflictFinalize) {
      conflictFinalize(false);
    } else if (btn) {
      btn.disabled = false;
      btn.removeAttribute('aria-busy');
      btn.textContent = dictionaryManager.getValue('Register for session');
    }
  }
}

async function handleSessionUnregistration(cardEl, sessionId, state) {
  const session = state.sessions.find((s) => s.sessionId === sessionId);
  if (!session) return;

  const firstTime = session.sessionTimes[0];
  if (!firstTime) return;

  const badge = cardEl.querySelector('.sh-registered-badge');
  if (badge) {
    badge.disabled = true;
    badge.setAttribute('aria-busy', 'true');
    badge.textContent = dictionaryManager.getValue('Unregistering\u2026');
  }

  const wasWaitlisted = session.isWaitlisted;
  const resp = await unregisterFromSessionTime(firstTime.sessionTimeId);

  if (resp.ok) {
    session.isRegistered = false;
    session.isWaitlisted = false;
    state.registeredSessionIds.delete(sessionId);
    updateCTAGroup(cardEl, session, { isEventRegistered: true, isBlocked: false });
    const existing = BlockMediator.get('registeredSessionIds') || new Set();
    const updated = new Set([...existing]);
    updated.delete(sessionId);
    BlockMediator.set('registeredSessionIds', updated);
  } else {
    window.lana?.log(`Error: Failed to unregister from session ${sessionId}. Error:${JSON.stringify(resp.error)}`);
    if (badge) {
      badge.disabled = false;
      badge.removeAttribute('aria-busy');
      badge.classList.remove('sh-unregister-mode');
      badge.innerHTML = '';
      const restoreLabel = wasWaitlisted
        ? dictionaryManager.getValue('waitlisted-cta-text')
        : dictionaryManager.getValue('Registered');
      badge.append(createIcon(CHECKMARK_ICON), createTag('span', {}, restoreLabel));
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
      expandBtn.setAttribute('aria-label', isExpanded ? dictionaryManager.getValue('Collapse session') : dictionaryManager.getValue('Expand session'));
      if (!isExpanded) {
        syncSessionCardDescriptionOverflow(card);
      }
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
      applyFilter(listEl, state);
      return;
    }

    if (e.target.closest('.sh-registered-badge:not(:disabled)')) {
      await handleSessionUnregistration(card, sessionId, state);
      applyFilter(listEl, state);
      return;
    }

    if (e.target.closest('.sh-btn-cal')) {
      const session = state.sessions.find((s) => s.sessionId === sessionId);
      const firstTime = session?.sessionTimes[0];
      if (firstTime) downloadICS(firstTime, session.title, firstTime.locationName);
      return;
    }

    if (e.target.closest('.sh-btn-register-event')) {
      const btn = e.target.closest('.sh-btn-register-event');

      if (state.inviteOnlyBlocked) return;

      const profile = BlockMediator.get('imsProfile');
      const isSignedOut = !profile || profile.noProfile || profile.account_type === 'guest';

      if (isSignedOut) {
        sessionStorage.setItem('sessions-hub:pendingSessionId', sessionId);
        signIn({ ...getSusiOptions(), redirect_uri: window.location.href });
        return;
      }

      if (state.rsvpConfig) {
        pendingSessionId = sessionId;
        if (btn) { btn.disabled = true; btn.textContent = dictionaryManager.getValue('Registering\u2026'); }

        // Milo's closeModal uses pushState (not location.hash=) so hashchange never fires.
        // Listen for the milo:modal:closed event instead to detect cancellation.
        const onModalClose = () => {
          window.removeEventListener('milo:modal:closed', onModalClose);
          if (pendingSessionId === sessionId) {
            pendingSessionId = null;
            if (btn) { btn.disabled = false; btn.textContent = dictionaryManager.getValue('Register for session'); }
          }
        };
        window.addEventListener('milo:modal:closed', onModalClose);

        openRsvpModal(state.rsvpConfig);
      }
      return;
    }
  });
}

function refreshEventBanner(el, rsvpConfig, opts) {
  const current = el.querySelector('.sh-event-banner');
  const wasHidden = current?.classList.contains('hidden') ?? false;
  const fresh = renderEventBanner(rsvpConfig, opts);
  if (wasHidden) fresh.classList.add('hidden');
  if (current) current.replaceWith(fresh);
  else el.append(fresh);
  return fresh;
}

function bindMediatorSubscriptions(el, listEl) {
  const handleRsvpDataChange = async (newValue) => {
    const state = getState();
    const isRegistered = newValue?.registrationStatus === 'registered';
    const isWaitlisted = newValue?.registrationStatus === 'waitlisted';
    state.isEventRegistered = isRegistered;
    state.isEventWaitlisted = isWaitlisted;

    // Re-render banner so its button reflects waitlist state, then apply visibility
    const newBanner = refreshEventBanner(el, state.rsvpConfig, {
      inviteOnlyBlocked: state.inviteOnlyBlocked,
      inviteOnlyMessage: state.inviteOnlyMessage,
      isEventWaitlisted: isWaitlisted,
      waitlistBannerMessage: state.waitlistBannerMessage,
    });
    syncBannerVisibility(newBanner, isRegistered);

    const viewDropdown = el.querySelector('.sh-view-dropdown');
    if (viewDropdown) viewDropdown.hidden = !isRegistered;

    const cardMap = new Map(
      [...el.querySelectorAll('.sh-card')].map((c) => [c.dataset.sessionId, c]),
    );

    const isBlocked = isSessionRegistrationBlocked({
      isEventWaitlisted: isWaitlisted,
      isEventClosed: state.isEventClosed,
      inviteOnlyBlocked: state.inviteOnlyBlocked,
    });

    if (isRegistered) {
      const ids = await resolveRegistrationState(state.eventData.eventId, true);
      const alreadyRegistered = BlockMediator.get('registeredSessionIds') || new Set();
      const mergedIds = new Set([...ids, ...alreadyRegistered]);
      state.registeredSessionIds = mergedIds;
      state.sessions.forEach((session) => {
        session.isRegistered = mergedIds.has(session.sessionId);
        const cardEl = cardMap.get(session.sessionId);
        if (cardEl) updateCTAGroup(cardEl, session, { isEventRegistered: true, isBlocked: false });
      });

      if (pendingSessionId) {
        const pid = pendingSessionId;
        pendingSessionId = null;
        const pendingSession = state.sessions.find((s) => s.sessionId === pid);
        const pendingCard = cardMap.get(pid);
        if (pendingSession && pendingCard && !pendingSession.isRegistered) {
          await handleSessionRegistration(pendingCard, pid, state);
        }
      }
    } else {
      state.registeredSessionIds = new Set();
      state.sessions.forEach((session) => {
        session.isRegistered = false;
        const cardEl = cardMap.get(session.sessionId);
        if (cardEl) updateCTAGroup(cardEl, session, { isEventRegistered: false, isBlocked });
      });

      // Reset to "All sessions" view when user un-registers
      const fs = getFilterState();
      if (fs.activeTab === 'my') {
        setFilterState({ ...fs, activeTab: 'all' });
        el.querySelectorAll('.sh-view-option').forEach((o) => {
          const isAll = o.dataset.tab === 'all';
          o.classList.toggle('active', isAll);
          o.setAttribute('aria-selected', String(isAll));
        });
        const viewLabel = el.querySelector('.sh-view-label');
        if (viewLabel) viewLabel.textContent = dictionaryManager.getValue('All sessions');
      }
      const downloadBtn = el.querySelector('.sh-download-btn');
      if (downloadBtn) downloadBtn.hidden = true;
    }

    applyFilter(listEl, state);
  };

  rsvpUnsubscribe = BlockMediator.subscribe('rsvpData', ({ newValue }) => handleRsvpDataChange(newValue));

  // Reconcile against the current rsvpData snapshot in case captureProfile
  // (in profile.js) or the events-form modal set it BETWEEN the initial
  // loadBlock read and this subscription registration. BlockMediator does not
  // replay current values to new subscribers, so we manually apply them once.
  const state = getState();
  const currentRsvp = BlockMediator.get('rsvpData');
  const currentStatus = currentRsvp?.registrationStatus;
  const renderedStatus = state.isEventRegistered
    ? 'registered'
    : (state.isEventWaitlisted ? 'waitlisted' : null);
  if (currentStatus !== renderedStatus) {
    handleRsvpDataChange(currentRsvp);
  }

  BlockMediator.subscribe('registeredSessionIds', ({ newValue }) => {
    const state = getState();
    if (!newValue?.size || !state?.sessions) return;
    const cardMap = new Map(
      [...el.querySelectorAll('.sh-card')].map((c) => [c.dataset.sessionId, c]),
    );
    const isBlocked = isSessionRegistrationBlocked({
      isEventWaitlisted: state.isEventWaitlisted,
      isEventClosed: state.isEventClosed,
      inviteOnlyBlocked: state.inviteOnlyBlocked,
    });
    state.sessions.forEach((session) => {
      if (newValue.has(session.sessionId) && !session.isRegistered) {
        session.isRegistered = true;
        state.registeredSessionIds.add(session.sessionId);
        const cardEl = cardMap.get(session.sessionId);
        if (cardEl) updateCTAGroup(cardEl, session, { isEventRegistered: state.isEventRegistered, isBlocked });
      }
    });
    applyFilter(listEl, state);
  });
}

// ─── init ────────────────────────────────────────────────────────────────────

async function loadBlock(el, rsvpConfig) {
  const searchConfig = parseSearchConfig(el);

  const eventData = await resolveEventData();
  if (!eventData?.eventId) {
    el.remove();
    return;
  }

  try {
    await dictionaryManager.initialize();
  } catch (err) {
    window.lana?.log(`sessions-hub: dictionary initialize failed: ${err?.message || err}`);
  }

  const inviteOnlyBlocked = Boolean(eventData.inviteOnly && !getValidCampaignIdFromUrl());
  const inviteOnlyMessage = getInviteOnlyNoCampaignMessage(dictionaryManager);
  const waitlistBannerMessage = getEventWaitlistBannerMessage(dictionaryManager, {
    eventTitle: getMetadata('event-title') || '',
  });

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
  const locationMap = await buildLocationMap(venueId, rawSessions);

  const rsvpData = BlockMediator.get('rsvpData');
  const isEventRegistered = rsvpData?.registrationStatus === 'registered';
  const isEventWaitlisted = rsvpData?.registrationStatus === 'waitlisted';
  const isEventClosed = computeIsEventClosed(eventData);
  const [registeredSessionIds, tagsData] = await Promise.all([
    resolveRegistrationState(eventData.eventId, isEventRegistered),
    Promise.resolve(getCaasTags()).catch(() => null),
  ]);

  const sessions = normalizeSessions(rawSessions, locationMap, registeredSessionIds, venueId, tagsData);

  const speakerMap = new Map();
  sessions.forEach((session) => {
    session.speakers.forEach((sp) => {
      if (!speakerMap.has(sp.speakerId)) speakerMap.set(sp.speakerId, sp);
    });
  });

  const state = {
    eventData,
    sessions,
    speakerMap,
    locationMap,
    registeredSessionIds,
    isEventRegistered,
    isEventWaitlisted,
    isEventClosed,
    rsvpConfig,
    inviteOnlyBlocked,
    inviteOnlyMessage,
    waitlistBannerMessage,
    searchConfig,
  };
  setState(state);

  const isBlocked = isSessionRegistrationBlocked({ isEventWaitlisted, isEventClosed, inviteOnlyBlocked });

  const toolbar = renderToolbar(state);
  setToolbarStickyOffset(toolbar);
  const listEl = renderSessionList(sessions, { isEventRegistered, isBlocked });
  el.append(toolbar, listEl);

  // Always append banner; hide it only if user is already event-registered.
  // (Waitlisted users keep the banner visible so they can manage their waitlist.)
  el.querySelector('.sh-event-banner')?.remove();
  const bannerEl = renderEventBanner(rsvpConfig, { inviteOnlyBlocked, inviteOnlyMessage, isEventWaitlisted, waitlistBannerMessage });
  if (isEventRegistered) bannerEl.classList.add('hidden');
  el.append(bannerEl);

  bindToolbarEvents(toolbar, listEl, state);
  bindCardEvents(listEl, state);
  bindMediatorSubscriptions(el, listEl);

  try {
    await document.fonts?.ready;
  } catch {
    // ignore font loading errors
  }
  scheduleSyncSessionDescriptionsOverflow(listEl);
  connectSessionDescriptionsOverflowObserver(listEl);

  const storedPendingId = sessionStorage.getItem('sessions-hub:pendingSessionId');
  const storedEventRsvp = sessionStorage.getItem('sessions-hub:pendingEventRsvp');
  if (storedEventRsvp) sessionStorage.removeItem('sessions-hub:pendingEventRsvp');

  if (storedPendingId) {
    sessionStorage.removeItem('sessions-hub:pendingSessionId');

    if (isEventRegistered) {
      const pendingSession = sessions.find((s) => s.sessionId === storedPendingId);
      const pendingCard = listEl.querySelector(`[data-session-id="${storedPendingId}"]`);
      if (pendingSession && pendingCard && !pendingSession.isRegistered) {
        await handleSessionRegistration(pendingCard, storedPendingId, state);
      }
    } else if (rsvpConfig && !inviteOnlyBlocked) {
      pendingSessionId = storedPendingId;
      openRsvpModal(rsvpConfig);
    }
  } else if (storedEventRsvp && !isEventRegistered && rsvpConfig && !inviteOnlyBlocked) {
    openRsvpModal(rsvpConfig);
  }
}

export default async function init(el) {
  if (rsvpUnsubscribe) { rsvpUnsubscribe(); rsvpUnsubscribe = null; }
  disconnectSessionDescriptionsOverflow();
  setFilterState({ query: '', activeTags: new Map(), activeTab: 'all' });

  let rsvpConfig = null;
  const rows = [...el.querySelectorAll(':scope > div')];
  for (const row of rows) {
    const cells = row.querySelectorAll(':scope > div');
    if (cells[0]?.textContent?.trim().toLowerCase() === 'rsvp-form') {
      const link = cells[1]?.querySelector('a');
      if (link) {
        try {
          const url = new URL(link.href);
          // Strip any secondary modifier (e.g. #_button-fill) from the hash so the resulting
          // modal id is a valid CSS id selector. Milo's closeModal uses querySelectorAll('#id')
          // and a compound id like 'rsvp-form-1#_button-fill' never matches any element.
          const cleanId = url.hash.replace(/^#/, '').split('#')[0];
          // Milo's decorateLinksAsync runs before block init and transforms the RSVP link:
          //   href → just the hash  (so url.pathname now resolves to the current page)
          //   data-modal-path → the ORIGINAL pathname (e.g. the events-form fragment page)
          // We must read data-modal-path first so getPathModal → fragment.js fetches the
          // correct fragment URL.  Fall back to url.pathname for un-decorated links.
          const path = link.dataset.modalPath || url.pathname;
          rsvpConfig = { hash: `#${cleanId}`, path };
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
