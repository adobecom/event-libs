import {
  createTag, loadStyle, getEventConfig, getFallbackLocale, getMetadata,
} from '../../utils/utils.js';
import { FALLBACK_LOCALES } from '../../utils/constances.js';
import { dictionaryManager } from '../../utils/dictionary-manager.js';
import { getRelativeTime, createTemplatedDateRange } from '../../utils/date-time-helper.js';
import { getNowMs } from '../../utils/session-state.js';
import { logError, logWarning } from '../../utils/lana-log.js';
import {
  notifications, notificationsReady, markRead, markAllRead, dismissEntry, getEntries, flushNotifications,
} from './notification-store.js';
import { STAGE_COPY } from './swan-payload.js';
import { waitForElement } from './gnav-wait.js';
import { fetchFederalTrackIcon } from '../icons/federal-icons.js';
import { isGnavNotificationsEnabled } from './swan-config.js';
import { bindNotificationPanel } from './notification-panel.js';

// Mounted into federal's .feds-notifications-wrapper placeholder (federal#203, MWPW-207209).
const MOUNT_SELECTOR = '.feds-notifications-wrapper';

// Gnav bell glyph with fill="currentColor" so notification-widget.css can theme it.
const BELL_ICON_FALLBACK = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true" focusable="false"><path fill="currentColor" d="M17.7862 12.6758C17.6177 12.3672 17.4454 12.0684 17.2749 11.7734C16.4483 10.3389 15.7339 9.10059 15.7339 7.15332C15.7339 4.03418 13.1963 1.49609 10.0767 1.49609C6.95706 1.49609 4.41946 4.03418 4.41946 7.15332C4.41946 8.91992 3.66067 10.2022 2.85745 11.5586C2.63724 11.9307 2.41604 12.3047 2.20804 12.6895C1.83206 13.3857 1.85111 14.21 2.25882 14.8936C2.67093 15.584 3.39554 15.9961 4.1973 15.9961H7.24955C7.24955 17.5127 8.48295 18.7461 9.99955 18.7461C11.5162 18.7461 12.7496 17.5127 12.7496 15.9961H15.8047C16.608 15.9961 17.3326 15.583 17.7437 14.8906C18.1514 14.2031 18.1675 13.375 17.7862 12.6758ZM9.99955 17.2461C9.3101 17.2461 8.74955 16.6855 8.74955 15.9961H11.2496C11.2496 16.6855 10.689 17.2461 9.99955 17.2461ZM16.4537 14.125C16.3872 14.2363 16.1914 14.4961 15.8047 14.4961H4.19731C3.92876 14.4961 3.68559 14.3574 3.54692 14.125C3.48247 14.0166 3.35161 13.7295 3.52837 13.4023C3.72661 13.0342 3.93804 12.6777 4.148 12.3232C5.01909 10.8525 5.91948 9.33105 5.91948 7.15332C5.91948 4.89941 7.82329 2.99609 10.0767 2.99609C12.3301 2.99609 14.2339 4.89941 14.2339 7.15332C14.2339 9.50195 15.1192 11.0371 15.9756 12.5225C16.1402 12.8076 16.3062 13.0957 16.4693 13.3945C16.65 13.7256 16.5186 14.0156 16.4537 14.125Z"/></svg>';

// MAX badge mark for rows without an icon; colored via currentColor.
const SESSION_ICON_FALLBACK = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" width="28" height="28" aria-hidden="true" focusable="false"><path fill="currentColor" d="M33.7558 14L32.1593 16.9232L30.5797 14H26.3195L29.6859 19.5165L27.0938 23.7592L23.3992 14H19.6011L15.8728 23.8086L14.4783 14H10.2022L9.02142 19.5823L7.83982 14H3.56368L2 25H5.30241L5.98915 19.0246L7.37778 25H10.4892L11.8778 18.9917L12.5797 25H15.42H16.0428H22.5054L21.7716 22.3903H19.9041L21.3886 18.2038L23.7661 25H26.3355H27.5642H30.2767L32.0003 21.914L33.7399 25H38L34.4897 19.2541L37.697 14H33.7558Z"/></svg>';

const CLOSE_ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" width="10" height="10" aria-hidden="true" focusable="false"><path d="M1 1l8 8M9 1l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';

// Also dictionary keys (getValue() falls back to the key). SWAN's "reminder" shows as "Upcoming".
const STAGE_PILL_LABEL = { reminder: 'Upcoming', live: 'Live', 'on-demand': 'On Demand' };

let mounted = false;

function resolveLocale() {
  return getEventConfig()?.miloConfig?.locale?.ietf || getFallbackLocale(FALLBACK_LOCALES)?.ietf;
}

// In-person events use the venue timezone; everything else uses the viewer's.
function resolveTimezone() {
  return getMetadata('event-type') === 'InPerson' ? getMetadata('timezone') : null;
}

function renderMaxBadge() {
  return createTag('span', { class: 'swan-notif__icon swan-notif__icon--placeholder', 'aria-hidden': 'true' }, SESSION_ICON_FALLBACK);
}

// Track icon > session thumbnail > MAX badge. `current` is the mounted element, so a late
// load/error can't replace a newer winner.
function renderIcon(entry) {
  let current = entry.iconUrl
    ? createTag('img', { class: 'swan-notif__icon', src: entry.iconUrl, alt: '' })
    : renderMaxBadge();

  if (entry.iconUrl) {
    const img = current;
    img.addEventListener('error', () => {
      if (current !== img || !img.isConnected) return;
      const badge = renderMaxBadge();
      img.replaceWith(badge);
      current = badge;
    }, { once: true });
  }

  if (entry.trackIconName) {
    fetchFederalTrackIcon(entry.trackIconName).then((svg) => {
      if (!svg || !current.isConnected) return;
      svg.setAttribute('width', '28');
      svg.setAttribute('height', '28');
      const trackTile = createTag('span', { class: 'swan-notif__icon swan-notif__icon--placeholder', 'aria-hidden': 'true' }, svg);
      current.replaceWith(trackTile);
      current = trackTile;
    });
  }

  return current;
}

// Drops the hour's leading zero (H:MM only, so {dd} is untouched) and lowercases am/pm.
export function normalizeTimeCasing(dateRangeStr) {
  return dateRangeStr
    .replace(/\b0(\d:\d{2})/g, '$1')
    .replace(/\s(AM|PM)\b/gi, (_match, meridiem) => meridiem.toLowerCase());
}

// Figma 9690:20849: kicker + stage pill, title, relative time; reminders add the start time.
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
  row.append(renderIcon(entry));

  const body = createTag('div', { class: 'swan-notif__body' });

  const categoryRow = createTag('p', { class: 'swan-notif__category-row' });
  // Authored content: set as text, never parsed as HTML.
  const category = createTag('span', { class: 'swan-notif__category' });
  category.textContent = entry.category;
  categoryRow.append(category);
  categoryRow.append(createTag('span', { class: `swan-notif__pill swan-notif__pill--${entry.stage}` }, stageLabel));
  body.append(categoryRow);

  const title = createTag('p', { class: 'swan-notif__title' });
  title.textContent = entry.title;
  body.append(title);

  if (entry.stage === 'reminder') {
    const startTime = normalizeTimeCasing(createTemplatedDateRange(
      entry.startTimeMs,
      entry.endTimeMs,
      locale,
      '{LLL} {dd}, {timeRange} {timeZone}',
      timezone,
    ));
    if (startTime) body.append(createTag('p', { class: 'swan-notif__time' }, startTime));
  }

  body.append(createTag('p', { class: 'swan-notif__time' }, getRelativeTime(entry.updatedAt, locale, getNowMs())));
  row.append(body);

  async function activate() {
    markRead(entry.rfCode);
    await flushNotifications();
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
    e.stopPropagation();
    onDismiss(entry.rfCode);
  });
  // Enter/Space on the button also fires keydown on the row; stop it here.
  dismissBtn.addEventListener('keydown', (e) => e.stopPropagation());
  row.append(dismissBtn);

  return row;
}

// Returns the unread count for the announcer.
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
    'aria-haspopup': 'dialog',
    'aria-controls': 'swan-notifications-panel',
    'aria-expanded': 'false',
    'aria-label': dictionaryManager.getValue('Notifications'),
    'daa-ll': 'Notification-Bell-Open',
  });
  button.append(createTag('span', { class: 'swan-notif__bell-icon' }, BELL_ICON_FALLBACK));
  const badge = createTag('span', { class: 'swan-notif__badge', 'aria-hidden': 'true' });
  badge.hidden = true;
  button.append(badge);

  const tooltip = createTag('span', { class: 'swan-notif__tooltip', 'aria-hidden': 'true' });
  tooltip.hidden = true;
  tooltip.append(createTag('span', { class: 'swan-notif__tooltip-tip' }));
  tooltip.append(createTag('span', { class: 'swan-notif__tooltip-label' }, dictionaryManager.getValue('Notifications')));

  // Lets the list scroll under Milo's Lenis smooth scroll.
  const panel = createTag('dialog', {
    id: 'swan-notifications-panel',
    class: 'swan-notif__panel', 'aria-label': dictionaryManager.getValue('Notifications'), 'data-lenis-prevent': '',
  });
  panel.hidden = true;
  const header = createTag('div', { class: 'swan-notif__panel-header', tabindex: '-1' });
  header.append(createTag('p', { class: 'swan-notif__panel-title' }, dictionaryManager.getValue('Notifications')));
  panel.append(header);
  panel.append(createTag('div', { class: 'swan-notif__divider', 'aria-hidden': 'true' }));
  const scroller = createTag('div', { class: 'swan-notif__scroll', 'data-lenis-prevent': '' });
  const sectionTitle = createTag('p', { class: 'swan-notif__section-title' }, dictionaryManager.getValue('Important'));
  scroller.append(sectionTitle);
  const list = createTag('ul', { class: 'swan-notif__list' });
  scroller.append(list);
  panel.append(scroller);

  const announcer = createTag('div', {
    class: 'swan-notif__sr-only', role: 'status', 'aria-live': 'polite',
  });

  wrapper.append(button, tooltip, panel, announcer);
  mount.prepend(wrapper);

  function closeOtherGnavPopups() {
    document.querySelectorAll('header.global-navigation [aria-expanded="true"]').forEach((trigger) => {
      if (wrapper.contains(trigger)) return;
      trigger.setAttribute('aria-expanded', 'false');
    });
  }

  // UNav's profile menu is in <account-menu-trigger>'s shadow DOM with its own state: click its
  // trigger to close it. Bound before bindNotificationPanel() so its outside-click can't see it.
  button.addEventListener('click', () => {
    if (button.getAttribute('aria-expanded') === 'true') return;
    document.querySelectorAll('header.global-navigation account-menu-trigger').forEach((menu) => {
      menu.shadowRoot?.querySelector('[aria-expanded="true"]')?.click();
    });
  });

  const resetPanel = bindNotificationPanel(panel, button, header, () => {
    closeOtherGnavPopups();
    if (notificationsReady.value) markAllRead();
  });

  // Re-mount after a gnav re-render and reset the dialog's modal/scroll state.
  new MutationObserver(() => {
    if (!wrapper.isConnected) {
      mount.prepend(wrapper);
      resetPanel();
    }
  }).observe(mount, { childList: true });

  // Dismissing removes the focused row: move focus to the next row, then the previous, then the bell.
  function dismissAndRefocus(rfCode) {
    // Match the rendered list (dismissed entries are hidden, not deleted).
    const current = getEntries().filter((e) => !e.dismissed);
    const idx = current.findIndex((e) => e.rfCode === rfCode);
    const neighborRfCode = current[idx + 1]?.rfCode ?? current[idx - 1]?.rfCode ?? null;
    dismissEntry(rfCode);
    const neighborRow = neighborRfCode
      && [...list.querySelectorAll('.swan-notif__row')].find((row) => row.dataset.rfcode === neighborRfCode);
    (neighborRow?.querySelector('.swan-notif__dismiss') || (panel.matches(':modal') ? header : button)).focus();
  }

  // Announce increases only; null skips subscribe()'s initial call with persisted entries.
  let previousUnreadCount = null;
  function updateList() {
    const focused = document.activeElement;
    const focusedRow = focused?.closest('.swan-notif__row');
    const restoreListFocus = focusedRow && list.contains(focused);
    // Dismissed entries stay in the store for the stage guard but never render or count.
    const visibleEntries = notificationsReady.value
      ? notifications.value.filter((entry) => !entry.dismissed) : [];
    const unreadCount = renderList(sectionTitle, list, badge, visibleEntries, locale, timezone, dismissAndRefocus);
    if (restoreListFocus && panel.open) {
      const replacement = [...list.children].find((row) => row.dataset.rfcode === focusedRow.dataset.rfcode);
      const target = focused.matches('.swan-notif__dismiss')
        ? replacement?.querySelector('.swan-notif__dismiss') : replacement;
      (target || (panel.matches(':modal') ? header : button)).focus({ preventScroll: true });
    }
    if (!notificationsReady.value) {
      previousUnreadCount = null;
      announcer.textContent = '';
      return;
    }
    if (previousUnreadCount !== null && unreadCount > previousUnreadCount) {
      const key = unreadCount === 1 ? '{count} new notification' : '{count} new notifications';
      announcer.textContent = dictionaryManager.getValue(key).replace('{count}', unreadCount);
    }
    previousUnreadCount = unreadCount;
  }
  notifications.subscribe(updateList);
  notificationsReady.subscribe((ready) => {
    if (ready && button.getAttribute('aria-expanded') === 'true') markAllRead();
    updateList();
  });
}

export function mountNotificationWidget() {
  if (mounted) return;
  // No placeholder without gnav-notifications=on, so don't wait for it.
  if (!isGnavNotificationsEnabled()) return;
  mounted = true;

  loadStyle(new URL('./notification-widget.css', import.meta.url).href);

  // Not awaited, so it never delays the mount wait; getValue() shows English until it loads.
  dictionaryManager.initialize().catch((err) => {
    logError('notification-widget', 'dictionary failed to load, using fallback copy', err);
  });

  waitForElement(MOUNT_SELECTOR).then((mount) => {
    if (!mount) {
      // Reset so the next syncAuth() call retries; gnav's mount timing is unpredictable.
      mounted = false;
      logWarning('notification-widget', 'gnav notifications placeholder never appeared — bell not mounted, will retry on next call');
      return;
    }
    buildWidget(mount);
  });
}
