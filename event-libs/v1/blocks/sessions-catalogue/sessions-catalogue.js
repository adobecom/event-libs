import BlockMediator from '../../deps/block-mediator.min.js';
import { createTag, getMetadata } from '../../utils/utils.js';
import {
  getSVGsfromFile, createSocialIcon, PLATFORM_PATTERNS, SUPPORTED_PLATFORMS,
} from '../profile-cards/profile-cards.js';
import { convertUtcTimestampToLocalDateTime } from '../../utils/date-time-helper.js';
import {
  getEvent,
  getSessions,
  getSessionTimes,
  getSessionSpeakers,
  getAllSeriesSpeakers,
  getVenueLocation,
  getMyEventSessions,
  registerForSessionTime,
} from '../../utils/esp-controller.js';

const CALENDAR_ICON = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" xmlns="http://www.w3.org/2000/svg"><rect x="1" y="3" width="14" height="12" rx="1.5" ry="1.5"/><path d="M1 7h14M5 1v4M11 1v4"/></svg>';
const PIN_ICON = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><path d="M8 14s-5-4.686-5-8a5 5 0 0 1 10 0c0 3.314-5 8-5 8z"/><circle cx="8" cy="6" r="2"/></svg>';

// ─── Module-level state singleton ──────────────────────────────────────────

const [getState, setState] = (() => {
  let state = null;
  return [() => state, (s) => { state = s; }];
})();

let rsvpUnsubscribe = null;

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
  const span = createTag('span', { class: 'sc-icon', 'aria-hidden': 'true' });
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

async function fetchSessionDetails(sessions) {
  await Promise.all(sessions.map(async (session) => {
    const [timesResp, speakersResp] = await Promise.all([
      getSessionTimes(session.sessionId),
      getSessionSpeakers(session.sessionId),
    ]);
    session.rawTimes = timesResp.ok ? timesResp.data : [];
    session.rawSpeakers = speakersResp.ok ? speakersResp.data : [];
  }));
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

  listEl.querySelectorAll('.sc-card').forEach((card) => {
    card.hidden = !filteredIds.has(card.dataset.sessionId);
  });
}

// ─── Render: CTA group ───────────────────────────────────────────────────────

function renderCTAGroup(session, isEventRegistered) {
  const group = createTag('div', { class: 'sc-cta-group' });

  if (!isEventRegistered) {
    group.append(createTag('button', { class: 'sc-btn sc-btn-register-event', type: 'button' }, 'Register for session'));
  } else if (!session.isRegistered) {
    group.append(createTag('button', { class: 'sc-btn sc-btn-register-session', type: 'button' }, 'Register for session'));
  } else {
    const calBtn = createTag('button', { class: 'sc-btn sc-btn-cal', type: 'button' });
    calBtn.append(createIcon(CALENDAR_ICON), ' Download to calendar');
    group.append(calBtn);
    group.append(createTag('span', { class: 'sc-registered-badge' }, '\u2713 Registered'));
  }

  return group;
}

function updateCTAGroup(cardEl, session, isEventRegistered) {
  const old = cardEl.querySelector('.sc-cta-group');
  if (old) old.replaceWith(renderCTAGroup(session, isEventRegistered));
}

// ─── Render: session card ────────────────────────────────────────────────────

function renderTagPills(tags) {
  const list = createTag('ul', { class: 'sc-tag-list' });
  tags.forEach((tag) => list.append(createTag('li', { class: 'sc-tag-pill' }, tag)));
  return list;
}

function renderSpeakerAvatars(speakers) {
  const wrap = createTag('div', { class: 'sc-speaker-avatars' });
  speakers.forEach((sp) => {
    const btn = createTag('button', {
      class: 'sc-avatar-btn',
      type: 'button',
      'data-speaker-id': sp.speakerId,
      'aria-label': `${sp.firstName} ${sp.lastName}`,
    });
    if (sp.photo?.imageUrl) {
      btn.append(createTag('img', {
        src: sp.photo.imageUrl,
        alt: sp.photo.altText || `${sp.firstName} ${sp.lastName}`,
        width: 40,
        height: 40,
      }));
    } else {
      const initials = `${sp.firstName.charAt(0)}${sp.lastName.charAt(0)}`.toUpperCase();
      btn.append(createTag('span', { class: 'sc-avatar-initials', 'aria-hidden': 'true' }, initials));
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
    class: 'sc-card',
    'data-session-id': session.sessionId,
  });

  // Expand/collapse toggle (absolute, top-right)
  card.append(createTag('button', {
    class: 'sc-expand-btn',
    type: 'button',
    'aria-label': 'Expand session',
  }, '+'));

  // ── Left column ──────────────────────────────────────────────────────────
  const left = createTag('div', { class: 'sc-card-left' });

  left.append(createTag('h3', { class: 'sc-card-title' }, session.title));

  if (timeStr) {
    const timeEl = createTag('div', { class: 'sc-card-time' });
    timeEl.append(createIcon(CALENDAR_ICON), ` ${timeStr}`);
    left.append(timeEl);
  }

  if (locationName) {
    const locEl = createTag('div', { class: 'sc-card-location' });
    locEl.append(createIcon(PIN_ICON), ` ${locationName}`);
    left.append(locEl);
  }

  if (session.tags.length) left.append(renderTagPills(session.tags));

  if (session.speakers.length) {
    const speakersWrap = createTag('div', { class: 'sc-card-speakers' });
    speakersWrap.append(createTag('span', { class: 'sc-speakers-label' }, 'Speakers'));
    speakersWrap.append(renderSpeakerAvatars(session.speakers));
    left.append(speakersWrap);
  }

  // ── Right column ─────────────────────────────────────────────────────────
  const right = createTag('div', { class: 'sc-card-right' });

  const desc = createTag('div', { class: 'sc-card-desc' });
  desc.append(createTag('p', { class: 'sc-card-desc-text' }, session.description));
  desc.append(createTag('button', { class: 'sc-read-more', type: 'button' }, 'Read more'));
  right.append(desc, renderCTAGroup(session, isEventRegistered));

  card.append(left, right);
  return card;
}

function renderSessionList(sessions, isEventRegistered) {
  const list = createTag('div', { class: 'sc-session-list' });
  sessions.forEach((s) => list.append(renderSessionCard(s, isEventRegistered)));
  return list;
}

// ─── Render: toolbar ────────────────────────────────────────────────────────

function renderTabToggle(isEventRegistered) {
  const wrap = createTag('div', { class: 'sc-tab-toggle' });
  if (!isEventRegistered) wrap.hidden = true;
  wrap.append(
    createTag('button', { class: 'sc-tab active', type: 'button', 'data-tab': 'all' }, 'All sessions'),
    createTag('button', { class: 'sc-tab', type: 'button', 'data-tab': 'my' }, 'My sessions'),
  );
  return wrap;
}

function renderFilterPanel(sessions) {
  const panel = createTag('div', { class: 'sc-filter-panel hidden', 'aria-hidden': 'true' });
  const { tags } = collectFilterOptions(sessions);

  if (tags.length) {
    const fs = createTag('fieldset', { class: 'sc-filter-fieldset' });
    fs.append(createTag('legend', {}, 'Tags'));
    tags.forEach((tag) => {
      const lbl = createTag('label', { class: 'sc-filter-label' });
      lbl.append(createTag('input', { type: 'checkbox', value: tag, 'data-filter-type': 'tag' }));
      lbl.append(` ${tag}`);
      fs.append(lbl);
    });
    panel.append(fs);
  }

  return panel;
}

function renderToolbar(state) {
  const toolbar = createTag('div', { class: 'sc-toolbar', role: 'search' });
  const toggle = renderTabToggle(state.isEventRegistered);

  const searchRow = createTag('div', { class: 'sc-search-row' });
  const search = createTag('input', {
    class: 'sc-search',
    type: 'search',
    placeholder: 'Search sessions\u2026',
    'aria-label': 'Search sessions',
  });
  const filterBtn = createTag('button', { class: 'sc-filter-btn', type: 'button', 'aria-expanded': 'false' }, 'Filter');
  const filterPanel = renderFilterPanel(state.sessions);
  searchRow.append(search, filterBtn, filterPanel);

  toolbar.append(toggle, searchRow);
  return toolbar;
}

// ─── Render: sticky event banner ─────────────────────────────────────────────

function renderEventBanner(eventData) {
  const banner = createTag('div', { class: 'sc-event-banner' });
  const info = createTag('div', { class: 'sc-banner-info' });

  if (eventData.title) info.append(createTag('span', { class: 'sc-banner-title' }, eventData.title));
  if (eventData.startDate) info.append(createTag('span', { class: 'sc-banner-date' }, eventData.startDate));

  const btn = createTag('button', { class: 'sc-btn sc-btn-event-register', type: 'button' }, 'Register');
  banner.append(info, btn);
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
    class: 'sc-modal-overlay',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': `${speaker.firstName} ${speaker.lastName}`,
  });

  const modal = createTag('div', { class: 'sc-modal' });
  const closeBtn = createTag('button', {
    class: 'sc-modal-close',
    type: 'button',
    'aria-label': 'Close',
  }, '\u00D7');

  const modalBody = createTag('div', { class: 'sc-modal-body' });

  // Photo
  if (speaker.photo?.imageUrl) {
    modalBody.append(createTag('img', {
      class: 'sc-modal-photo',
      src: speaker.photo.imageUrl,
      alt: speaker.photo.altText || `${speaker.firstName} ${speaker.lastName}`,
    }));
  }

  // Speaker info
  const info = createTag('div', { class: 'sc-modal-info' });
  if (speaker.title) info.append(createTag('p', { class: 'sc-modal-speaker-title' }, speaker.title));
  info.append(createTag('h2', { class: 'sc-modal-name' }, `${speaker.firstName} ${speaker.lastName}`));
  if (speaker.company) info.append(createTag('p', { class: 'sc-modal-company' }, speaker.company));
  if (speaker.bio) info.append(createTag('p', { class: 'sc-modal-bio' }, speaker.bio));

  // Social icons
  if (speaker.socialLinks?.length) {
    const svgPath = new URL('../../icons/social-icons.svg', import.meta.url).href;
    const svgEls = await getSVGsfromFile(svgPath, SUPPORTED_PLATFORMS);
    if (svgEls?.length) {
      const socialList = createTag('ul', { class: 'sc-modal-social-icons' });
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
  const searchInput = toolbarEl.querySelector('.sc-search');
  const filterBtn = toolbarEl.querySelector('.sc-filter-btn');
  const filterPanel = toolbarEl.querySelector('.sc-filter-panel');

  searchInput.addEventListener('input', debounce(() => {
    setFilterState({ ...getFilterState(), query: searchInput.value });
    applyFilter(listEl, state);
  }, 200));

  filterBtn.addEventListener('click', () => {
    const isHidden = filterPanel.classList.toggle('hidden');
    filterBtn.setAttribute('aria-expanded', String(!isHidden));
    filterPanel.setAttribute('aria-hidden', String(isHidden));
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
    const tab = e.target.closest('.sc-tab');
    if (!tab) return;
    toolbarEl.querySelectorAll('.sc-tab').forEach((t) => t.classList.remove('active'));
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

  const btn = cardEl.querySelector('.sc-btn-register-session');
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
    const card = e.target.closest('.sc-card');
    if (!card) return;
    const sessionId = card.dataset.sessionId;

    if (e.target.closest('.sc-expand-btn') || e.target.closest('.sc-read-more')) {
      const isExpanded = card.classList.toggle('expanded');
      const expandBtn = card.querySelector('.sc-expand-btn');
      expandBtn.textContent = isExpanded ? '\u2212' : '+';
      expandBtn.setAttribute('aria-label', isExpanded ? 'Collapse session' : 'Expand session');
      return;
    }

    if (e.target.closest('.sc-avatar-btn')) {
      const btn = e.target.closest('.sc-avatar-btn');
      const speaker = state.speakerMap.get(btn.dataset.speakerId);
      await openSpeakerModal(speaker);
      return;
    }

    if (e.target.closest('.sc-btn-register-session')) {
      await handleSessionRegistration(card, sessionId, state);
      return;
    }

    if (e.target.closest('.sc-btn-cal')) {
      const session = state.sessions.find((s) => s.sessionId === sessionId);
      const firstTime = session?.sessionTimes[0];
      if (firstTime) downloadICS(firstTime, session.title, firstTime.locationName);
      return;
    }

    if (e.target.closest('.sc-btn-register-event')) {
      // Redirect to or trigger event registration — TBD with PM
      window.dispatchEvent(new CustomEvent('sessions-catalogue:event-register', { detail: { eventId: state.eventData.eventId } }));
    }
  });
}

function bindMediatorSubscriptions(el, bannerEl) {
  rsvpUnsubscribe = BlockMediator.subscribe('rsvpData', async ({ newValue }) => {
    const state = getState();
    const isRegistered = newValue != null;
    state.isEventRegistered = isRegistered;

    syncBannerVisibility(bannerEl, isRegistered);

    const toggle = el.querySelector('.sc-tab-toggle');
    if (toggle) toggle.hidden = !isRegistered;

    const cardMap = new Map(
      [...el.querySelectorAll('.sc-card')].map((c) => [c.dataset.sessionId, c]),
    );

    if (isRegistered) {
      const ids = await resolveRegistrationState(state.eventData.eventId, true);
      state.registeredSessionIds = ids;
      state.sessions.forEach((session) => {
        session.isRegistered = ids.has(session.sessionId);
        const cardEl = cardMap.get(session.sessionId);
        if (cardEl) updateCTAGroup(cardEl, session, true);
      });
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

async function loadBlock(el) {
  const eventData = await resolveEventData();
  if (!eventData?.eventId) {
    el.remove();
    return;
  }

  const sessionsResp = await getSessions(eventData.eventId);
  if (!sessionsResp.ok || !sessionsResp.data.length) {
    el.remove();
    return;
  }

  await fetchSessionDetails(sessionsResp.data);

  const { venueId } = eventData;
  const [speakerMap, locationMap] = await Promise.all([
    buildSpeakerMap(eventData.seriesId),
    buildLocationMap(venueId, sessionsResp.data),
  ]);

  const rsvpData = BlockMediator.get('rsvpData');
  const isEventRegistered = rsvpData != null;
  const registeredSessionIds = await resolveRegistrationState(eventData.eventId, isEventRegistered);

  const sessions = normalizeSessions(
    sessionsResp.data, speakerMap, locationMap, registeredSessionIds, venueId,
  );

  const state = {
    eventData,
    sessions,
    speakerMap,
    locationMap,
    registeredSessionIds,
    isEventRegistered,
  };
  setState(state);

  const toolbar = renderToolbar(state);
  const listEl = renderSessionList(sessions, isEventRegistered);
  el.append(toolbar, listEl);

  // Always append banner; hide it if user is already registered
  const bannerEl = renderEventBanner(eventData);
  if (isEventRegistered) bannerEl.classList.add('hidden');
  document.body.append(bannerEl);

  bindToolbarEvents(toolbar, listEl, state);
  bindCardEvents(listEl, state);
  bindMediatorSubscriptions(el, bannerEl);
}

export default async function init(el) {
  if (new URLSearchParams(window.location.search).has('mockSessions')) {
    await import('./sessions-catalogue.mock.js');
  }

  if (rsvpUnsubscribe) { rsvpUnsubscribe(); rsvpUnsubscribe = null; }
  if (modalOverlay) closeSpeakerModal();
  setFilterState({ query: '', activeTags: new Set(), activeTab: 'all' });
  el.innerHTML = '';

  const profile = BlockMediator.get('imsProfile');
  if (profile) {
    await loadBlock(el);
  } else {
    const unsub = BlockMediator.subscribe('imsProfile', async ({ newValue }) => {
      if (!newValue) return;
      unsub();
      await loadBlock(el);
    });
  }
}
