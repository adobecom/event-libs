import { getSchedulePagePaths, indexPathToSchedule } from '../../utils/esp-controller.js';
import { createTag, getIcon } from '../../utils/utils.js';

async function loadWidgetCSS() {
  // Check if CSS is already loaded
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

export default async function addPagePathIndexerWidget() {
  const params = new URLSearchParams(document.location.search);
  if (!params.get('previewMode') || params.get('previewMode') !== 'true') {
    return;
  }

  const chronoBoxes = document.querySelectorAll('.chrono-box');
  const schedules = Array.from(chronoBoxes)
    .map((chronoBox) => {
    return {
      id: chronoBox.dataset.scheduleId,
      name: chronoBox.dataset.scheduleTitle,
      url: chronoBox.dataset.scheduleMakerUrl,
      unindexable: false,
      pagePaths: [],
      indexed: false,
    };
  })
    .filter((schedule) => schedule.id);

  if (schedules.length === 0) return;

  await loadWidgetCSS();

  const pagePath = window.location.pathname;
  const pagePathIndexerWidget = createTag('div', { class: 'page-path-indexer-widget dark' });

  // Create hover tab that remains visible when widget is hidden
  const hoverTab = createTag('div', { class: 'page-path-indexer-hover-tab' }, getIcon('clock-white'), { parent: pagePathIndexerWidget });

  const indexAllButton = createTag('button', { class: 'page-path-indexer-button con-button outline' }, 'Index all schedules on this page', { parent: pagePathIndexerWidget });

  const scheduleIdList = createTag('div', { class: 'page-path-indexer-schedule-id-list' });
  createTag('div', { class: 'page-path-indexer-schedule-id-list-title' }, 'Schedules on this page', { parent: scheduleIdList });
  const scheduleIdListItems = [];
  const individualIndexButtons = [];

  await Promise.all(schedules.map(async (schedule) => {
    const { ok, data } = await getSchedulePagePaths(schedule.id);
    if (ok) {
      schedule.pagePaths = data.pagePaths;
    } else {
      schedule.unindexable = true;
    }
  }));

  schedules.forEach((schedule) => {
    const scheduleIdItem = createTag('div', { class: 'page-path-indexer-schedule-id-item', 'data-schedule-id': schedule.id });
    createTag('span', { class: 'page-path-indexer-schedule-id-item-text' }, schedule.name || schedule.id, { parent: scheduleIdItem });
    const statusArea = createTag('div', { class: 'page-path-indexer-schedule-id-item-status' }, '', { parent: scheduleIdItem });

    const indexedStatusWrapper = createTag('div', { class: 'page-path-indexer-schedule-status-wrapper indexed' }, '', { parent: statusArea });
    const indexedStatusText = createTag('span', { class: 'page-path-indexer-schedule-id-item-status-text' }, 'Indexed', { parent: indexedStatusWrapper });
    const greenDot = getIcon('dot-green');
    const actionWrapper = createTag('div', { class: 'page-path-indexer-schedule-action-wrapper' }, '', { parent: statusArea });
    const indexBtn = createTag('button', {
      class: 'page-path-indexer-button con-button outline',
      role: 'button',
      tabindex: 0,
      'aria-label': `Index this page for schedule ${schedule.id}`,
    }, 'Index', { parent: actionWrapper });
    const backLinkToScheduleMaker = createTag('a', {
      href: schedule.url,
      style: 'height: 16px; width: 16px; display: flex; align-items: center; justify-content: center;',
      target: '_blank',
    }, getIcon('edit-pencil-white'), { parent: actionWrapper });

    if (schedule.unindexable) {
      indexBtn.disabled = true;
      indexBtn.textContent = 'Cannot index';
    }

    indexedStatusWrapper.append(indexedStatusText, greenDot);
    actionWrapper.append(indexBtn, backLinkToScheduleMaker);

    scheduleIdList.append(scheduleIdItem);
    scheduleIdListItems.push(scheduleIdItem);
    individualIndexButtons.push(indexBtn);

    const indexedPagePaths = schedule.pagePaths;
    schedule.indexed = indexedPagePaths.some((p) => p.pagePath === window.location.pathname);

    indexBtn.addEventListener('click', async () => {
      indexBtn.disabled = true;
      const response = await indexPathToSchedule(schedule.id, pagePath);
      
      if (response.ok) {
        scheduleIdItem.classList.add('indexed');
      } else {
        scheduleIdItem.classList.remove('indexed');
        indexBtn.removeAttribute('disabled');
      }
    });
  });

  pagePathIndexerWidget.append(hoverTab);
  pagePathIndexerWidget.append(scheduleIdList);
  pagePathIndexerWidget.append(indexAllButton);
  const allSchedulesIndexedOrUnindexable = schedules.every((schedule) => schedule.indexed || schedule.unindexable);
  indexAllButton.disabled = allSchedulesIndexedOrUnindexable;
  document.body.append(pagePathIndexerWidget);
  // Auto-hide widget after 3 seconds of inactivity
  let hideTimeout;
  const autoHideDelay = 3000;

  const showWidget = () => {
    clearTimeout(hideTimeout);
    pagePathIndexerWidget.classList.remove('hidden');
  };

  const hideWidget = () => {
    hideTimeout = setTimeout(() => {
      pagePathIndexerWidget.classList.add('hidden');
    }, autoHideDelay);
  };

  // Show widget on hover, hide after delay when not hovering
  pagePathIndexerWidget.addEventListener('mouseenter', showWidget);
  pagePathIndexerWidget.addEventListener('mouseleave', hideWidget);

  // Initial auto-hide
  hideWidget();

  indexAllButton.addEventListener('click', async () => {
    indexAllButton.disabled = true;
    // Disable all individual index buttons
    individualIndexButtons.forEach((button) => { button.disabled = true; });

    const indexingPromises = schedules.map(async (schedule) => {
      const scheduleIdItem = scheduleIdListItems.find((s) => s.dataset.scheduleId === schedule.id);
      if (scheduleIdItem && scheduleIdItem.classList.contains('indexed')) {
        return;
      }
      const response = await indexPathToSchedule(schedule.id, pagePath);
      if (response.ok) {
        scheduleIdItem.classList.add('indexed');
      } else {
        scheduleIdItem.classList.remove('indexed');
      }
    });

    await Promise.all(indexingPromises);
    indexAllButton.removeAttribute('disabled');
    // Re-enable all individual index buttons
    individualIndexButtons.forEach((button) => { button.removeAttribute('disabled'); });
  });
}
