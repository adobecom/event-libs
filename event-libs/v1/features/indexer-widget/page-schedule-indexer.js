import { getSchedulePagePaths, indexPathToSchedule } from '../../utils/esp-controller.js';
import { createTag, getIcon } from '../../utils/utils.js';

// Constants
const AUTO_HIDE_DELAY_MS = 3000;
const PREVIEW_MODE_PARAM = 'previewMode';
const CHRONO_BOX_SELECTOR = '.chrono-box';

// CSS Loading
async function loadWidgetCSS() {
  if (document.querySelector('link[href*="page-schedule-indexer.css"]')) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = `${new URL('./page-schedule-indexer.css', import.meta.url).href}`;
    link.onload = resolve;
    link.onerror = reject;
    document.head.appendChild(link);
  });
}

// Data Collection
function extractSchedulesFromDOM() {
  const chronoBoxes = document.querySelectorAll(CHRONO_BOX_SELECTOR);
  return Array.from(chronoBoxes)
    .map((chronoBox) => ({
      id: chronoBox.dataset.scheduleId,
      name: chronoBox.dataset.scheduleTitle,
      url: chronoBox.dataset.scheduleMakerUrl,
      unindexable: false,
      pagePaths: [],
      indexed: false,
    }))
    .filter((schedule) => schedule.id);
}

async function enrichSchedulesWithIndexData(schedules, currentPagePath) {
  await Promise.all(schedules.map(async (schedule) => {
    const { ok, data } = await getSchedulePagePaths(schedule.id);
    if (ok) {
      schedule.pagePaths = data.pagePaths;
      schedule.indexed = data.pagePaths.some((p) => p.pagePath === currentPagePath);
    } else {
      schedule.unindexable = true;
    }
  }));
}

// DOM Creation Helpers
function createWidgetContainer() {
  const widget = createTag('div', { class: 'page-path-indexer-widget dark' });
  const hoverTab = createTag('div', { class: 'page-path-indexer-hover-tab' }, getIcon('clock-white'));
  widget.appendChild(hoverTab);
  return widget;
}

function createScheduleListHeader() {
  const container = createTag('div', { class: 'page-path-indexer-schedule-id-list' });
  createTag('div', { class: 'page-path-indexer-schedule-id-list-title' }, 'Schedules on this page', { parent: container });
  return container;
}

function createScheduleItemDOM(schedule) {
  const item = createTag('div', {
    class: 'page-path-indexer-schedule-id-item',
    'data-schedule-id': schedule.id,
  });

  createTag('span', { class: 'page-path-indexer-schedule-id-item-text' }, schedule.name || schedule.id, { parent: item });

  const statusArea = createTag('div', { class: 'page-path-indexer-schedule-id-item-status' }, '', { parent: item });

  // Indexed status indicator
  const indexedStatusWrapper = createTag('div', { class: 'page-path-indexer-schedule-status-wrapper indexed' }, '', { parent: statusArea });
  createTag('span', { class: 'page-path-indexer-schedule-id-item-status-text' }, 'Indexed', { parent: indexedStatusWrapper });
  indexedStatusWrapper.appendChild(getIcon('dot-green'));

  // Action buttons wrapper
  const actionWrapper = createTag('div', { class: 'page-path-indexer-schedule-action-wrapper' }, '', { parent: statusArea });

  const indexBtn = createTag('button', {
    class: 'page-path-indexer-button con-button outline',
    role: 'button',
    tabindex: 0,
    'aria-label': `Index this page for schedule ${schedule.id}`,
  }, 'Index', { parent: actionWrapper });

  createTag('a', {
    href: schedule.url,
    style: 'height: 16px; width: 16px; display: flex; align-items: center; justify-content: center;',
    target: '_blank',
  }, getIcon('edit-pencil-white'), { parent: actionWrapper });

  return { item, indexBtn };
}

function applyScheduleItemState(itemDOM, schedule) {
  const { item, indexBtn } = itemDOM;

  if (schedule.unindexable) {
    indexBtn.disabled = true;
    indexBtn.textContent = 'Cannot index';
  } else if (schedule.indexed) {
    indexBtn.disabled = true;
    item.classList.add('indexed');
  }
}

function createIndexAllButton() {
  return createTag('button', {
    class: 'page-path-indexer-button con-button outline',
  }, 'Index all schedules on this page');
}

// Event Handlers
function createIndexButtonHandler(schedule, scheduleItem, pagePath) {
  return async (indexBtn) => {
    indexBtn.disabled = true;
    const response = await indexPathToSchedule(schedule.id, pagePath);

    if (response.ok) {
      scheduleItem.classList.add('indexed');
    } else {
      scheduleItem.classList.remove('indexed');
      indexBtn.disabled = false;
    }
  };
}

function createIndexAllHandler(schedules, scheduleItems, individualButtons, pagePath) {
  return async (indexAllBtn) => {
    indexAllBtn.disabled = true;
    individualButtons.forEach((button) => { button.disabled = true; });

    const indexingPromises = schedules.map(async (schedule) => {
      const scheduleItem = scheduleItems.find((item) => item.dataset.scheduleId === schedule.id);
      if (scheduleItem?.classList.contains('indexed')) {
        return;
      }

      const response = await indexPathToSchedule(schedule.id, pagePath);
      if (response.ok) {
        scheduleItem?.classList.add('indexed');
      } else {
        scheduleItem?.classList.remove('indexed');
      }
    });

    await Promise.all(indexingPromises);
    indexAllBtn.disabled = false;
    individualButtons.forEach((button) => { button.disabled = false; });
  };
}

// Auto-hide Behavior
function setupAutoHideBehavior(widget) {
  let hideTimeout;

  const showWidget = () => {
    clearTimeout(hideTimeout);
    widget.classList.remove('hidden');
  };

  const hideWidget = () => {
    hideTimeout = setTimeout(() => {
      widget.classList.add('hidden');
    }, AUTO_HIDE_DELAY_MS);
  };

  widget.addEventListener('mouseenter', showWidget);
  widget.addEventListener('mouseleave', hideWidget);

  // Initial auto-hide
  hideWidget();
}

// Main Entry Point
export default async function addPagePathIndexerWidget() {
  // Check if preview mode is enabled
  const params = new URLSearchParams(document.location.search);
  if (params.get(PREVIEW_MODE_PARAM) !== 'true') {
    return;
  }

  // Extract and validate schedules from page
  const schedules = extractSchedulesFromDOM();
  if (schedules.length === 0) return;

  // Load CSS and fetch schedule data in parallel
  const pagePath = window.location.pathname;
  await Promise.all([
    loadWidgetCSS(),
    enrichSchedulesWithIndexData(schedules, pagePath),
  ]);

  // Build widget structure
  const widget = createWidgetContainer();
  const scheduleList = createScheduleListHeader();
  const indexAllBtn = createIndexAllButton();

  // Track DOM elements for event handlers
  const scheduleItems = [];
  const indexButtons = [];

  // Create schedule items
  schedules.forEach((schedule) => {
    const itemDOM = createScheduleItemDOM(schedule);
    applyScheduleItemState(itemDOM, schedule);

    scheduleList.appendChild(itemDOM.item);
    scheduleItems.push(itemDOM.item);
    indexButtons.push(itemDOM.indexBtn);

    // Attach individual index handler
    const handler = createIndexButtonHandler(schedule, itemDOM.item, pagePath);
    itemDOM.indexBtn.addEventListener('click', () => handler(itemDOM.indexBtn));
  });

  // Assemble widget
  widget.appendChild(scheduleList);
  widget.appendChild(indexAllBtn);

  // Set initial state for "Index All" button
  const allSchedulesIndexedOrUnindexable = schedules.every(
    (schedule) => schedule.indexed || schedule.unindexable
  );
  indexAllBtn.disabled = allSchedulesIndexedOrUnindexable;

  // Attach "Index All" handler
  const indexAllHandler = createIndexAllHandler(schedules, scheduleItems, indexButtons, pagePath);
  indexAllBtn.addEventListener('click', () => indexAllHandler(indexAllBtn));

  // Add widget to page and setup auto-hide
  document.body.appendChild(widget);
  setupAutoHideBehavior(widget);
}
