import { getSchedulePagePaths, indexPathToSchedule } from '../../utils/esp-controller.js';

const CHRONO_BOX_SELECTOR = '.chrono-box';

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

export default async function autoIndexPageSchedules() {
  const schedules = extractSchedulesFromDOM();
  if (schedules.length === 0) return;

  const pagePath = window.location.pathname;
  await enrichSchedulesWithIndexData(schedules, pagePath);

  const toIndex = schedules.filter((s) => !s.indexed && !s.unindexable);
  if (toIndex.length === 0) return;

  await Promise.all(toIndex.map((s) => indexPathToSchedule(s.id, pagePath)));
}
