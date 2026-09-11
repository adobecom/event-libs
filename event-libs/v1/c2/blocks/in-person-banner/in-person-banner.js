import { createTag, getMetadata } from '../../../utils/utils.js';
import BlockMediator from '../../../deps/block-mediator.min.js';

const AUDIENCE = { ALL: 'all', SIGNED_IN: 'signed-in', IN_PERSON: 'in-person' };

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

function buildBanner(contentEl) {
  const banner = createTag('div', { class: 'in-person-banner-inner', role: 'status', 'aria-live': 'polite' });
  const copy = createTag('div', { class: 'in-person-banner-copy' }, contentEl.innerHTML, { parent: banner });
  copy.querySelectorAll('a').forEach((a) => a.classList.add('in-person-banner-link'));

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
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(update);
  };
  window.addEventListener('scroll', onScroll, { passive: true });
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

function renderBanner(el, contentCell, navOverlay) {
  el.dataset.theme = el.classList.contains('dark') ? 'dark' : 'light';
  el.classList.toggle('in-person-banner-nav-overlay', navOverlay);

  const banner = buildBanner(contentCell);
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

  const audience = resolveAudience(config);
  const navOverlay = isTruthyConfigValue(config['nav-overlay'] ?? getMetadata('nav-overlay'));

  // `all` is known synchronously, so render immediately with no wait. Gated modes need an
  // async sign-in / registration check — never await it in init (that would block the block
  // from decorating and hold up the page). Keep the banner hidden until the check passes so
  // it doesn't flash for users who shouldn't see it, then reveal or remove once resolved.
  if (audience === AUDIENCE.ALL) {
    renderBanner(el, contentCell, navOverlay);
    return;
  }

  el.hidden = true;
  isAudienceMatch(audience).then((matches) => {
    if (!matches) {
      el.remove();
      return;
    }
    el.hidden = false;
    renderBanner(el, contentCell, navOverlay);
  });
}
