import { getMetadata } from '../../utils/utils.js';
import { logError } from '../../utils/lana-log.js';

// Adobe Launch's YouTube rule (WL-04-initMediaTrack) looks for a player iframe exactly once, on
// libraryLoaded (~3s). Event pages add their YouTube player much later (scheduled fragments), so
// the rule never activates, `iframe_api` is never injected and no media analytics fire.
// A hidden, Launch-matching iframe present before that scan makes the rule load the YouTube API;
// when the real player registers we remove the seed and ask Launch to attach to it.
// TODO: remove once the Launch rule handles late iframes (needs Marketing Tech).
export const SEED_ID = 'player-launch-seed';

const SEED_EVENT_CODES = ['max2026'];
const SCHEDULE_SELECTOR = 'a[href*="schedule-maker"], .chrono-box';
const LOG_SCOPE = 'youtube-launch-seed';

let seeded = false;

function shouldSeed() {
  return SEED_EVENT_CODES.includes(getMetadata('event-code'))
    && !!document.querySelector(SCHEDULE_SELECTOR)
    && !document.querySelector('.event-youtube');
}

export function seedYouTubeForLaunch() {
  if (seeded || !document.body) return;
  try {
    if (!shouldSeed()) return;
    seeded = true;

    const seed = document.createElement('iframe');
    seed.id = SEED_ID;
    seed.setAttribute('src', 'about:blank#youtube.com?enablejsapi=1');
    seed.setAttribute('aria-hidden', 'true');
    seed.setAttribute('tabindex', '-1');
    seed.setAttribute('title', 'YouTube analytics seed');
    seed.style.cssText = 'position:absolute;width:0;height:0;border:0;visibility:hidden;';
    document.body.append(seed);
  } catch (err) {
    logError(LOG_SCOPE, 'failed to seed YouTube iframe', err);
  }
}

export function activateLaunchYouTube() {
  document.getElementById(SEED_ID)?.remove();
  // If the API is already loaded, Launch won't see the real iframe until asked to re-scan.
  if (typeof window.YT?.Player !== 'function' || typeof window.initiateYTubeTracking !== 'function') return;
  try {
    window.initiateYTubeTracking();
  } catch (err) {
    logError(LOG_SCOPE, 'initiateYTubeTracking failed', err);
  }
}
