import { createTag, getMetadata } from '../../../utils/utils.js';
import BlockMediator from '../../../deps/block-mediator.min.js';

// Authored audience gate. Each mode is a superset of the next: `all` shows to everyone,
// `signed-in` narrows to authenticated users, `in-person` narrows further to confirmed
// in-person attendees. Legacy `rf-data-check: true` maps onto `in-person`.
const AUDIENCE = { ALL: 'all', SIGNED_IN: 'signed-in', IN_PERSON: 'in-person' };

const DISMISSED_STORAGE_KEY = 'in-person-banner:dismissed';
const CLOSE_ICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M8.84849 8.0001L13.0137 3.83526C13.248 3.60088 13.248 3.22119 13.0137 2.98682C12.7793 2.75244 12.3996 2.75244 12.1652 2.98682L8 7.15166L3.83477 2.98682C3.60039 2.75244 3.2207 2.75244 2.98633 2.98682C2.75195 3.22119 2.75195 3.60088 2.98633 3.83526L7.15151 8.0001L2.98633 12.1649C2.75195 12.3993 2.75195 12.779 2.98633 13.0134C3.10351 13.1306 3.25703 13.1892 3.41054 13.1892C3.56406 13.1892 3.71758 13.1306 3.83476 13.0134L7.99999 8.84854L12.1652 13.0134C12.2824 13.1306 12.4359 13.1892 12.5894 13.1892C12.743 13.1892 12.8965 13.1306 13.0137 13.0134C13.248 12.779 13.248 12.3993 13.0137 12.1649L8.84849 8.0001Z" fill="currentColor"/></svg>';

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
    return;
  }
}

// Resolves the IMS profile, waiting for it if BlockMediator hasn't populated it yet.
// Signed-out users resolve to `{ noProfile: true }` or a `guest` account. Init doesn't
// block on this, so if `imsProfile` is never set (non-event page, IMS never loads) a gated
// banner simply stays hidden — which is the intended fail-closed outcome.
function resolveProfile() {
  const profile = BlockMediator.get('imsProfile');
  if (profile !== undefined) return Promise.resolve(profile);
  return new Promise((resolve) => {
    // subscribe returns an unsubscribe fn; call it so this one-shot listener doesn't leak
    // and fire on every later imsProfile write.
    const unsubscribe = BlockMediator.subscribe('imsProfile', ({ newValue }) => {
      unsubscribe();
      resolve(newValue);
    });
  });
}

function isSignedIn(profile) {
  return Boolean(profile) && !profile.noProfile && profile.account_type !== 'guest';
}

// Fail-closed: hide the banner unless the external signal explicitly confirms an in-person
// attendee. A missing `window.events` (e.g. outside the da-events GNAV) or a throw means
// we cannot confirm, so we do not show.
async function isRegisteredInPerson() {
  if (!window.events?.getRegistrationStatus) return false;
  try {
    const { isRegistered, inPersonAttendee } = await window.events.getRegistrationStatus();
    return isRegistered === true && inPersonAttendee === true;
  } catch (e) {
    window.lana?.log(`[in-person-banner] registration status check failed: ${e.message}`);
    return false;
  }
}

async function isAudienceMatch(audience) {
  if (audience === AUDIENCE.ALL) return true;
  const profile = await resolveProfile();
  if (!isSignedIn(profile)) return false;
  if (audience === AUDIENCE.SIGNED_IN) return true;
  return isRegisteredInPerson();
}

function buildBanner(contentEl, bannerId) {
  const banner = createTag('div', { class: 'in-person-banner-inner', role: 'status', 'aria-live': 'polite' });
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

function observeScrollReveal(el) {
  let ticking = false;
  const update = () => {
    const bannerHeight = el.offsetHeight;
    const progress = Math.min(window.scrollY, bannerHeight);
    document.documentElement.style.setProperty('--in-person-banner-scroll-progress', `${progress}px`);
    el.classList.toggle('in-person-banner-scrolled', progress >= bannerHeight);
    ticking = false;
  };
  window.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(update);
  }, { passive: true });
  update();
}

function syncBannerHeightVar(el) {
  const setHeightVar = () => {
    document.documentElement.style.setProperty('--in-person-banner-height', `${el.offsetHeight}px`);
  };
  setHeightVar();
  new ResizeObserver(setHeightVar).observe(el);
}

const CONFIG_KEYS = new Set(['banner-id', 'audience', 'rf-data-check', 'nav-overlay', 'message']);

// `audience` is authoritative; legacy `rf-data-check: true` is sugar for `in-person`.
function resolveAudience(config) {
  const authored = (config.audience ?? getMetadata('audience') ?? '').trim().toLowerCase();
  if (authored === AUDIENCE.SIGNED_IN || authored === AUDIENCE.IN_PERSON) return authored;
  if (isTruthyConfigValue(config['rf-data-check'] ?? getMetadata('rf-data-check'))) {
    return AUDIENCE.IN_PERSON;
  }
  return AUDIENCE.ALL;
}

function isTruthyConfigValue(value) {
  return (value ?? '').trim().toLowerCase() === 'true';
}

function renderBanner(el, contentCell, bannerId, navOverlay) {
  el.dataset.theme = el.classList.contains('dark') ? 'dark' : 'light';
  el.classList.toggle('in-person-banner-nav-overlay', navOverlay);

  const banner = buildBanner(contentCell, bannerId);
  el.replaceChildren(banner);

  if (navOverlay) {
    document.body.prepend(el);
    syncBannerHeightVar(el);
    observeScrollReveal(el);
  }
}

export default function init(el) {
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
  const audience = resolveAudience(config);
  const navOverlay = isTruthyConfigValue(config['nav-overlay'] ?? getMetadata('nav-overlay'));

  if (isDismissed(bannerId)) {
    el.remove();
    return;
  }

  // `all` is known synchronously, so render immediately with no wait. Gated modes need an
  // async sign-in / registration check — never await it in init (that would block the block
  // from decorating and hold up the page). Keep the banner hidden until the check passes so
  // it doesn't flash for users who shouldn't see it, then reveal or remove once resolved.
  if (audience === AUDIENCE.ALL) {
    renderBanner(el, contentCell, bannerId, navOverlay);
    return;
  }

  el.hidden = true;
  isAudienceMatch(audience).then((matches) => {
    if (!matches) {
      el.remove();
      return;
    }
    el.hidden = false;
    renderBanner(el, contentCell, bannerId, navOverlay);
  });
}
