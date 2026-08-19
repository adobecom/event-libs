import { createTag, getMetadata } from '../../../utils/utils.js';

const DISMISSED_STORAGE_KEY = 'in-person-banner:dismissed';
// fill="currentColor" (not the Figma dark-mode paste's literal #DBDBDB) so the icon
// inherits .in-person-banner-close's own themed color and stays visible in both light
// and dark mode, rather than washing out against whichever theme it wasn't drawn for.
const CLOSE_ICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M8.84849 8.0001L13.0137 3.83526C13.248 3.60088 13.248 3.22119 13.0137 2.98682C12.7793 2.75244 12.3996 2.75244 12.1652 2.98682L8 7.15166L3.83477 2.98682C3.60039 2.75244 3.2207 2.75244 2.98633 2.98682C2.75195 3.22119 2.75195 3.60088 2.98633 3.83526L7.15151 8.0001L2.98633 12.1649C2.75195 12.3993 2.75195 12.779 2.98633 13.0134C3.10351 13.1306 3.25703 13.1892 3.41054 13.1892C3.56406 13.1892 3.71758 13.1306 3.83476 13.0134L7.99999 8.84854L12.1652 13.0134C12.2824 13.1306 12.4359 13.1892 12.5894 13.1892C12.743 13.1892 12.8965 13.1306 13.0137 13.0134C13.248 12.779 13.248 12.3993 13.0137 12.1649L8.84849 8.0001Z" fill="currentColor"/></svg>';

// Own storage helpers rather than a shared getVideoProgress-style utility — a single
// small, banner-scoped map (bannerId -> true) is all this needs, and keeping it local
// avoids coupling this generic, reusable block to session-specific storage elsewhere.
function readDismissed() {
  try {
    return JSON.parse(window.localStorage.getItem(DISMISSED_STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

function isDismissed(bannerId) {
  if (!bannerId) return false;
  return Boolean(readDismissed()[bannerId]);
}

function setDismissed(bannerId) {
  if (!bannerId) return;
  try {
    const all = readDismissed();
    all[bannerId] = true;
    window.localStorage.setItem(DISMISSED_STORAGE_KEY, JSON.stringify(all));
  } catch {
    // storage unavailable (private browsing, quota) — non-fatal, banner just
    // reappears next visit rather than blocking dismissal of the current one.
  }
}

// Per the registration-status-consumer-guide.md contract (da-events#51) — this repo is a
// separate origin/deployment from da-events, so it cannot import registration-cache.js
// directly; window.events.* is the only supported cross-repo contract. Always guarded,
// since these globals only exist on pages with an event-code metadata value.
async function isRegisteredInPerson() {
  // window.events itself missing (no event-code metadata, or da-events' script never
  // loaded) is a genuinely unknown state, not a resolved "not registered" — fails open.
  if (!window.events?.getRegistrationStatus) return true;
  try {
    const { isRegistered, inPersonAttendee } = await window.events.getRegistrationStatus();
    // Fail open: only hide once we've positively confirmed the visitor is NOT an
    // in-person attendee. `inPersonAttendee` can be legitimately unresolved for a beat
    // right after a registration redirect (see consumer guide's landing-page nuance) —
    // treating "not yet known" as "hide" would flicker the banner away from a visitor
    // who actually is registered, right as they land back from registering.
    return isRegistered !== false && inPersonAttendee !== false;
  } catch (e) {
    window.lana?.log(`[in-person-banner] registration status check failed: ${e.message}`);
    return true;
  }
}

function buildBanner(contentEl, bannerId) {
  const banner = createTag('div', { class: 'in-person-banner-inner' });
  const copy = createTag('div', { class: 'in-person-banner-copy' }, contentEl.innerHTML, { parent: banner });
  copy.querySelectorAll('a').forEach((a) => a.classList.add('in-person-banner-link'));

  const closeBtn = createTag('button', {
    type: 'button',
    class: 'in-person-banner-close',
    'aria-label': 'Dismiss banner',
  }, CLOSE_ICON_SVG, { parent: banner });
  closeBtn.addEventListener('click', () => {
    setDismissed(bannerId);
    banner.closest('.in-person-banner')?.remove();
  });

  return banner;
}

const CONFIG_KEYS = new Set(['banner-id', 'rf-data-check', 'below-nav', 'message']);

export default async function init(el) {
  // Config rows are labeled key/value pairs (banner-id, rf-data-check, and optionally
  // an explicit `message` row); the copy itself can also be authored as a bare,
  // unlabeled row (a single cell, or a first cell that isn't a recognized config key)
  // — both authoring shapes are in real use, so both are supported. Whichever appears
  // last wins as the content row if more than one bare row is present.
  const rows = [...el.querySelectorAll(':scope > div')];
  const config = {};
  let contentCell = null;
  rows.forEach((row) => {
    const cells = [...row.querySelectorAll(':scope > div')];
    const key = cells[0]?.textContent.trim().toLowerCase();
    if (cells.length >= 2 && key && CONFIG_KEYS.has(key)) {
      if (key === 'message') contentCell = cells[1];
      else config[key] = cells[1].textContent.trim();
    } else {
      contentCell = cells[0] || row;
    }
  });
  if (!contentCell) return;

  const bannerId = config['banner-id'] || getMetadata('banner-id') || '';
  const rfGateEnabled = Boolean(config['rf-data-check'] ?? getMetadata('rf-data-check'));
  // Authors placing this banner at the very top of the page (above/overlapping the
  // sticky GNAV header) opt into a top offset that clears it — engineering-owned
  // exception to the "no fixed placement" rule (see README), since GNAV's own height
  // isn't something this generic block can detect on its own.
  const belowNav = Boolean(config['below-nav'] ?? getMetadata('below-nav'));

  if (isDismissed(bannerId)) {
    el.remove();
    return;
  }

  if (rfGateEnabled && !(await isRegisteredInPerson())) {
    el.remove();
    return;
  }

  // Milo's own block-modifier syntax already resolved "In-Person Banner (dark)" into a
  // `dark` class on `el` before init() runs — data-theme is the mechanism this repo's
  // own C2 token CSS (tokens.css/sessions-guide-tokens.css) actually keys off, not the
  // .dark class alone (see sessions-guide.js for the same pattern).
  el.dataset.theme = el.classList.contains('dark') ? 'dark' : 'light';
  el.classList.toggle('in-person-banner-below-nav', belowNav);

  const banner = buildBanner(contentCell, bannerId);
  el.replaceChildren(banner);
}
