import {
  createTag, loadStyle, getEventConfig, getFallbackLocale, getMetadata,
} from '../../utils/utils.js';
import { FALLBACK_LOCALES } from '../../utils/constances.js';
import { dictionaryManager } from '../../utils/dictionary-manager.js';
import { getRelativeTime, createTemplatedDateRange } from '../../utils/date-time-helper.js';
import {
  notifications, markRead, markAllRead, dismissEntry, getEntries,
} from './notification-store.js';
import { STAGE_COPY } from './swan-payload.js';
import { waitForElement } from './gnav-wait.js';

// Page-level, framework-agnostic widget — same shape as features/toast/toast.js (a signal
// for state, createTag/loadStyle for vanilla DOM, a mounted guard) rather than a full
// Preact render tree. Injected directly into `#universal-nav`, inside UniversalNav's own
// rendered `.universal-nav-container` (not just `.feds-utilities`, its outer shell), so it
// sits alongside profile/appswitcher, in place of UNC's own notifications icon. Federal is
// expected to give this widget a real placeholder later — this selector/prepend approach is
// a for-now stopgap.
const MOUNT_SELECTOR = '#universal-nav';

// Real gnav bell glyph, supplied directly (not resolved via features/icons/icon-resolver.js)
// for a closer look/feel match. Both light/dark source files share the same path (only their
// hardcoded fill differs) — using currentColor instead lets the existing fill-based theming
// in notification-widget.css (light/dark/scrolled/popup-open) keep controlling its color.
const BELL_ICON_FALLBACK = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true" focusable="false"><path fill="currentColor" d="M17.7862 12.6758C17.6177 12.3672 17.4454 12.0684 17.2749 11.7734C16.4483 10.3389 15.7339 9.10059 15.7339 7.15332C15.7339 4.03418 13.1963 1.49609 10.0767 1.49609C6.95706 1.49609 4.41946 4.03418 4.41946 7.15332C4.41946 8.91992 3.66067 10.2022 2.85745 11.5586C2.63724 11.9307 2.41604 12.3047 2.20804 12.6895C1.83206 13.3857 1.85111 14.21 2.25882 14.8936C2.67093 15.584 3.39554 15.9961 4.1973 15.9961H7.24955C7.24955 17.5127 8.48295 18.7461 9.99955 18.7461C11.5162 18.7461 12.7496 17.5127 12.7496 15.9961H15.8047C16.608 15.9961 17.3326 15.583 17.7437 14.8906C18.1514 14.2031 18.1675 13.375 17.7862 12.6758ZM9.99955 17.2461C9.3101 17.2461 8.74955 16.6855 8.74955 15.9961H11.2496C11.2496 16.6855 10.689 17.2461 9.99955 17.2461ZM16.4537 14.125C16.3872 14.2363 16.1914 14.4961 15.8047 14.4961H4.19731C3.92876 14.4961 3.68559 14.3574 3.54692 14.125C3.48247 14.0166 3.35161 13.7295 3.52837 13.4023C3.72661 13.0342 3.93804 12.6777 4.148 12.3232C5.01909 10.8525 5.91948 9.33105 5.91948 7.15332C5.91948 4.89941 7.82329 2.99609 10.0767 2.99609C12.3301 2.99609 14.2339 4.89941 14.2339 7.15332C14.2339 9.50195 15.1192 11.0371 15.9756 12.5225C16.1402 12.8076 16.3062 13.0957 16.4693 13.3945C16.65 13.7256 16.5186 14.0156 16.4537 14.125Z"/></svg>';

// Generic calendar glyph shown on a row's colored icon tile when no iconUrl is configured —
// the Figma reference uses Adobe MAX's own branded mark there, which can't be reused for a
// generic library; this at least reads as "a session," not a blank colored square.
const SESSION_ICON_FALLBACK = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false"><rect x="3" y="5" width="18" height="15" rx="2" fill="none" stroke="#fff" stroke-width="1.5"/><path stroke="#fff" stroke-width="1.5" d="M3 9.5h18"/><path stroke="#fff" stroke-width="1.5" stroke-linecap="round" d="M7.5 3v3.5M16.5 3v3.5"/></svg>';

// Same close glyph/markup as features/toast/toast.js's own dismiss button, for visual parity.
const CLOSE_ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" width="10" height="10" aria-hidden="true" focusable="false"><path d="M1 1l8 8M9 1l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';

// "reminder" -> "Upcoming" matches the Figma reference's pill label and the app's broader
// upcoming/live/on-demand vocabulary (see utils/session-state.js) — SWAN's internal stage
// name stays "reminder" (it means something more specific: before the lead-time window).
// Values double as dictionary keys/English fallbacks (dictionaryManager.getValue(key) returns
// the key itself when unloaded/missing), same convention as sessions-hub.js's own copy.
const STAGE_PILL_LABEL = { reminder: 'Upcoming', live: 'Live', 'on-demand': 'On-Demand' };

let mounted = false;

// Resolved once per widget build — locale doesn't change during a page's lifetime.
function resolveLocale() {
  return getEventConfig()?.miloConfig?.locale?.ietf || getFallbackLocale(FALLBACK_LOCALES)?.ietf;
}

// In-person events carry an authored venue timezone; everything else (virtual/on-demand,
// global audiences) shows the viewer's own local time instead — same eventType-gated rule
// date-time-helper.js's own metadata hydration rules and decorate.js already apply.
function resolveTimezone() {
  return getMetadata('event-type') === 'InPerson' ? getMetadata('timezone') : null;
}

// Three lines per the Figma spec (node 9690:20849): category kicker + stage pill, then the
// session title (can wrap), then the relative timestamp alone — not the pill+timestamp
// sharing a line under the title, which an earlier pass got wrong. A fourth, reminder-only
// line shows the session's actual start time/date, since "Upcoming" alone doesn't say when.
function renderRow(entry, locale, timezone, onDismiss) {
  const stageLabel = dictionaryManager.getValue(STAGE_PILL_LABEL[entry.stage] || entry.stage);
  const row = createTag('li', {
    class: `swan-notif__row${entry.read ? '' : ' swan-notif__row--unread'}`,
    tabindex: '0',
    role: 'button',
    'aria-label': `${entry.title} ${dictionaryManager.getValue(STAGE_COPY[entry.stage] || '')}`,
    'daa-ll': `Notification-Row-Click|${entry.title}`,
    'data-rfcode': entry.rfCode,
  });

  row.append(createTag('span', { class: 'swan-notif__dot', 'aria-hidden': 'true' }));
  row.append(entry.iconUrl
    ? createTag('img', { class: 'swan-notif__icon', src: entry.iconUrl, alt: '' })
    : createTag('span', { class: 'swan-notif__icon swan-notif__icon--placeholder', 'aria-hidden': 'true' }, SESSION_ICON_FALLBACK));

  const body = createTag('div', { class: 'swan-notif__body' });

  const categoryRow = createTag('p', { class: 'swan-notif__category-row' });
  // entry.category/entry.title are authored content (RainFocus/CMS), not trusted constants —
  // set as textContent, not createTag's html-insertion path, so they're never parsed as markup.
  const category = createTag('span', { class: 'swan-notif__category' });
  category.textContent = entry.category;
  categoryRow.append(category);
  categoryRow.append(createTag('span', { class: `swan-notif__pill swan-notif__pill--${entry.stage}` }, stageLabel));
  body.append(categoryRow);

  const title = createTag('p', { class: 'swan-notif__title' });
  title.textContent = entry.title;
  body.append(title);

  if (entry.stage === 'reminder') {
    const startTime = createTemplatedDateRange(
      entry.startTimeMs,
      entry.endTimeMs,
      locale,
      '{ddd}, {LLL} {dd} · {timeRange} {timeZone}',
      timezone,
    );
    if (startTime) body.append(createTag('p', { class: 'swan-notif__time' }, startTime));
  }

  body.append(createTag('p', { class: 'swan-notif__time' }, getRelativeTime(entry.updatedAt, locale)));
  row.append(body);

  function activate() {
    markRead(entry.rfCode);
    if (entry.actionUrl) window.location.href = entry.actionUrl;
  }
  row.addEventListener('click', activate);
  row.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      activate();
    }
  });

  const dismissLabel = dictionaryManager.getValue('Dismiss {title}').replace('{title}', entry.title);
  const dismissBtn = createTag('button', {
    class: 'swan-notif__dismiss', type: 'button', 'aria-label': dismissLabel,
  }, CLOSE_ICON);
  dismissBtn.addEventListener('click', (e) => {
    // Stops the row's own click-through/mark-read handler from also firing.
    e.stopPropagation();
    onDismiss(entry.rfCode);
  });
  // A native <button> translates an Enter/Space keydown into its own click automatically —
  // this only needs to stop that keydown from also reaching the row's own keydown listener
  // (a separate event from the click it triggers, so the click-handler's stopPropagation
  // above doesn't cover it).
  dismissBtn.addEventListener('keydown', (e) => e.stopPropagation());
  row.append(dismissBtn);

  return row;
}

// sectionTitle ("Important") only ever shows when there's something under it — SWAN only ever
// has one section today, but this keeps the render function structured so a second section
// could be added later without a rewrite. Returns the unread count so the caller can decide
// whether to make an aria-live announcement, without a second pass over entries.
function renderList(sectionTitle, list, badge, entries, locale, timezone, onDismiss) {
  sectionTitle.hidden = entries.length === 0;
  list.textContent = '';
  if (!entries.length) {
    list.append(createTag('li', { class: 'swan-notif__empty' }, dictionaryManager.getValue('No notifications yet')));
  } else {
    entries.forEach((entry) => list.append(renderRow(entry, locale, timezone, onDismiss)));
  }
  const unreadCount = entries.filter((entry) => !entry.read).length;
  badge.textContent = unreadCount > 9 ? '9+' : String(unreadCount);
  badge.hidden = unreadCount === 0;
  return unreadCount;
}

function buildWidget(mount) {
  const locale = resolveLocale();
  const timezone = resolveTimezone();
  const wrapper = createTag('div', { class: 'swan-notif' });
  const button = createTag('button', {
    class: 'swan-notif__bell',
    type: 'button',
    'aria-haspopup': 'true',
    'aria-expanded': 'false',
    'aria-label': dictionaryManager.getValue('Notifications'),
    'daa-ll': 'Notification-Bell-Open',
  });
  button.append(createTag('span', { class: 'swan-notif__bell-icon' }, BELL_ICON_FALLBACK));
  const badge = createTag('span', { class: 'swan-notif__badge', 'aria-hidden': 'true' });
  badge.hidden = true;
  button.append(badge);

  // data-lenis-prevent: milo's Lenis smooth-scroll instance (loaded on foundation=c2 pages)
  // hijacks wheel/touch events at the document level; this attribute is Lenis's own
  // documented escape hatch for a nested scrollable region, already used the same way by
  // sessions-guide's DrawerShell.js/FilterPanel.js.
  const panel = createTag('div', {
    class: 'swan-notif__panel', role: 'dialog', 'aria-label': dictionaryManager.getValue('Notifications'), 'data-lenis-prevent': '',
  });
  panel.hidden = true;
  panel.append(createTag('p', { class: 'swan-notif__panel-title' }, dictionaryManager.getValue('Notifications')));
  panel.append(createTag('div', { class: 'swan-notif__divider', 'aria-hidden': 'true' }));
  const sectionTitle = createTag('p', { class: 'swan-notif__section-title' }, dictionaryManager.getValue('Important'));
  panel.append(sectionTitle);
  const list = createTag('ul', { class: 'swan-notif__list' });
  panel.append(list);

  // Visually hidden, always in the DOM (unlike the badge, which is aria-hidden and purely
  // visual) — role="status"/aria-live="polite" is DrawerShell.js's own established pattern
  // for this exact "announce a background state change" need.
  const announcer = createTag('div', {
    class: 'swan-notif__sr-only', role: 'status', 'aria-live': 'polite',
  });

  wrapper.append(button, panel, announcer);
  // Prepend directly into UniversalNav's own rendered container, not just append to its
  // outer .feds-utilities shell — waiting for this more specific element to exist means
  // UniversalNav.js has already finished rendering into it, avoiding the earlier issue where
  // the bell was inserted into the (still-empty) outer shell and then wiped out moments
  // later once UniversalNav.js's own async render/rebuild pass caught up to it.
  mount.prepend(wrapper);

  // Kept as a safety net even with the more specific mount point above — there's no
  // guarantee UniversalNav.js won't re-render this container again later (e.g. on a
  // sign-in state change), and this is cheap insurance against that for the life of the page.
  new MutationObserver(() => {
    if (!wrapper.isConnected) mount.prepend(wrapper);
  }).observe(mount, { childList: true });

  function closePanel() {
    panel.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    document.removeEventListener('click', onOutsideClick);
    document.removeEventListener('keydown', onKeydown);
    // Closing, not opening, is "having seen" the list — marking read on open would clear
    // the unread dot/tint before the attendee ever actually saw it (both happen
    // synchronously, in the same tick, before the browser paints). This still clears the
    // badge for entries never individually clicked, just one interaction later; markAllRead()
    // itself no-ops (no signal write) when nothing is unread.
    markAllRead();
  }

  function onOutsideClick(e) {
    if (!wrapper.contains(e.target)) closePanel();
  }

  function onKeydown(e) {
    if (e.key === 'Escape') closePanel();
  }

  function openPanel() {
    panel.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    document.addEventListener('click', onOutsideClick);
    document.addEventListener('keydown', onKeydown);
  }

  button.addEventListener('click', (e) => {
    e.stopPropagation();
    if (panel.hidden) openPanel();
    else closePanel();
  });

  // Dismissing a row destroys the very DOM node that currently has keyboard focus (renderList
  // rebuilds the whole <ul> from scratch on every store change) — without this, focus would
  // silently drop to <body>. Moves it to the next remaining row's own dismiss button (keeping
  // a keyboard user "in the flow" of dismissing several in a row), falling back to the
  // previous row, then to the bell button once the list is empty.
  function dismissAndRefocus(rfCode) {
    // Neighbor lookup must match what's actually rendered (dismissed entries are filtered
    // out below, not deleted — see dismissEntry's own doc comment for why).
    const current = getEntries().filter((e) => !e.dismissed);
    const idx = current.findIndex((e) => e.rfCode === rfCode);
    const neighborRfCode = current[idx + 1]?.rfCode ?? current[idx - 1]?.rfCode ?? null;
    dismissEntry(rfCode);
    const neighborRow = neighborRfCode
      && [...list.querySelectorAll('.swan-notif__row')].find((row) => row.dataset.rfcode === neighborRfCode);
    (neighborRow?.querySelector('.swan-notif__dismiss') || button).focus();
  }

  // Announces only on an *increase* (a genuinely new thing to notice), not every render —
  // e.g. not when entries are marked read/dismissed, which also lowers/holds the count. Starts
  // at `null`, not `0`: notifications.subscribe() invokes its callback synchronously with
  // whatever's already in the store (e.g. unread entries persisted from an earlier visit),
  // which must never be announced as "new" on this first call.
  let previousUnreadCount = null;
  notifications.subscribe((entries) => {
    // Dismissed entries stay in the store (so the stage guard in swan-notifications.js can
    // still see them) but must never render or count toward the badge/announcer.
    const visibleEntries = entries.filter((entry) => !entry.dismissed);
    const unreadCount = renderList(sectionTitle, list, badge, visibleEntries, locale, timezone, dismissAndRefocus);
    if (previousUnreadCount !== null && unreadCount > previousUnreadCount) {
      const key = unreadCount === 1 ? '{count} new notification' : '{count} new notifications';
      announcer.textContent = dictionaryManager.getValue(key).replace('{count}', unreadCount);
    }
    previousUnreadCount = unreadCount;
  });
}

export function mountNotificationWidget() {
  if (mounted) return;
  mounted = true;

  loadStyle(new URL('./notification-widget.css', import.meta.url).href);

  // Fire-and-forget, in parallel with waitForElement below rather than awaited before it —
  // this must never delay (or, under fake timers in tests, deadlock) the gnav mount wait.
  // buildWidget() calls dictionaryManager.getValue() synchronously regardless of whether this
  // has resolved yet; it just falls back to the English key text until it has.
  dictionaryManager.initialize().catch((err) => {
    window.lana?.log(`[notification-widget] dictionary failed to load, using fallback copy: ${err.message}`);
  });

  waitForElement(MOUNT_SELECTOR).then((mount) => {
    if (!mount) {
      // Reset the guard on a timed-out mount, not just log it — gnav's mount timing is
      // "unpredictable," not merely slow, so a permanent no-op here would silently drop
      // the bell for the rest of the page session even once .feds-utilities does appear.
      // session-store.js's syncAuth() re-invokes this on every imsProfile change, giving
      // this a real retry path rather than needing its own polling loop.
      mounted = false;
      window.lana?.log('[notification-widget] gnav utility bar never appeared — bell not mounted, will retry on next call');
      return;
    }
    buildWidget(mount);
  });
}
