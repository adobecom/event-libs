import { createTag, getMetadata } from './utils.js';

// Adobe Launch (rule WL-04-initMediaTrack) enables MobileRider media tracking only if
// `.mobileRider_container` exists when the Launch library loads, and never re-checks. Players
// often mount later (chrono-box fragments, lazy sections), so every entry point that may render
// one calls this synchronously, before its first await, to leave a hidden marker for that check.
const LAUNCH_SELECTOR = '.mobileRider_container';

function parseJSON(str) {
  try {
    return JSON.parse(str);
  } catch (e) {
    return null;
  }
}

function readChronoBoxSchedule(box) {
  const rows = Object.fromEntries([...box.querySelectorAll(':scope > div')].map((row) => [
    row.children[0]?.textContent.trim().toLowerCase(),
    row.children[1]?.textContent.trim(),
  ]));
  return parseJSON(rows.schedule) || parseJSON(getMetadata('schedules'))?.[rows['schedule-id']];
}

// Mirrors chrono-box's plugin detection: any schedule item with a `mobileRider` entry.
function mayRenderMobileRider(el) {
  if (el.classList?.contains('mobile-rider')) return true;
  if (!el.classList?.contains('chrono-box')) return false;
  const schedule = readChronoBoxSchedule(el);
  return Array.isArray(schedule) && schedule.some((item) => item?.mobileRider);
}

/**
 * Adds one hidden `.mobileRider_container` marker to <body> if `area` (or anything in it)
 * may render a MobileRider player and no such element exists yet.
 * @param {Element|Document} area
 */
export default function markMobileRiderForLaunch(area) {
  if (!area?.querySelectorAll || !document.body || document.querySelector(LAUNCH_SELECTOR)) return;
  const candidates = [area, ...area.querySelectorAll('.mobile-rider, .chrono-box')];
  if (!candidates.some(mayRenderMobileRider)) return;

  createTag('div', {
    class: 'mobileRider_container mr-launch-marker',
    hidden: '',
    'aria-hidden': 'true',
  }, '', { parent: document.body });
}
