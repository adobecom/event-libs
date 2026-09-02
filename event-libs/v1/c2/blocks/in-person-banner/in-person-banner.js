import { createTag, getMetadata } from '../../../utils/utils.js';

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
    // storage unavailable (private browsing, quota) — non-fatal, banner just
    // reappears next visit rather than blocking dismissal of the current one.
  }
}

async function isRegisteredInPerson() {
  if (!window.events?.getRegistrationStatus) return true;
  try {
    const { isRegistered, inPersonAttendee } = await window.events.getRegistrationStatus();
    return isRegistered !== false && inPersonAttendee !== false;
  } catch (e) {
    window.lana?.log(`[in-person-banner] registration status check failed: ${e.message}`);
    return true;
  }
}

function buildBanner(contentEl, bannerId) {
  // role="status" + aria-live="polite" — same live-region primitive as
  // features/toast/toast.js — so assistive tech both perceives the message on render
  // and gets an announcement when dismissal removes this container from the DOM.
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

// Threshold, in px, past which the overlaying banner slides away to reveal
// the sticky GNAV header underneath. A small value rather than the banner's
// own height — it should get out of the way as soon as the visitor starts
// reading the page, not only once fully scrolled past.
const SCROLL_REVEAL_THRESHOLD = 10;

function observeScrollReveal(el) {
  let ticking = false;
  const updateScrolledState = () => {
    el.classList.toggle('in-person-banner-scrolled', window.scrollY > SCROLL_REVEAL_THRESHOLD);
    ticking = false;
  };
  window.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(updateScrolledState);
  }, { passive: true });
  updateScrolledState();
}

// GNAV's own CSS pulls <main> up by --feds-nav-total-height so hero content
// bleeds under the (transparent) nav. Pushing GNAV down to clear this banner
// (in-person-banner.css's sibling-selector `top` override) shifts GNAV's
// visual position but leaves that pull-up unaware of the banner's height, so
// hero content stays put and ends up hugging the taller combined bar. Fixing
// it means main's pull-up needs to shrink by exactly the banner's rendered
// height (see the `--in-person-banner-height`-driven override in
// in-person-banner.css) — measured live via ResizeObserver, not a hard-coded
// constant, since the banner's height varies by viewport (mobile wrapping)
// and content length.
function syncBannerHeightVar(el) {
  const setHeightVar = () => {
    document.documentElement.style.setProperty('--in-person-banner-height', `${el.offsetHeight}px`);
  };
  setHeightVar();
  new ResizeObserver(setHeightVar).observe(el);
}

const CONFIG_KEYS = new Set(['banner-id', 'rf-data-check', 'nav-overlay', 'message']);

// Authors write the literal word "false" for an off boolean row (see nav-overlay in the
// README example) — Boolean(str) can't tell that apart from any other non-empty string,
// so this parses the actual authored value instead of just checking presence.
function isTruthyConfigValue(value) {
  return (value ?? '').trim().toLowerCase() === 'true';
}

export default async function init(el) {
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
  const rfGateEnabled = isTruthyConfigValue(config['rf-data-check'] ?? getMetadata('rf-data-check'));
  const navOverlay = isTruthyConfigValue(config['nav-overlay'] ?? getMetadata('nav-overlay'));

  if (isDismissed(bannerId)) {
    el.remove();
    return;
  }

  if (rfGateEnabled && !(await isRegisteredInPerson())) {
    el.remove();
    return;
  }

  el.dataset.theme = el.classList.contains('dark') ? 'dark' : 'light';
  el.classList.toggle('in-person-banner-nav-overlay', navOverlay);

  const banner = buildBanner(contentCell, bannerId);
  el.replaceChildren(banner);

  if (navOverlay) {
    // position: fixed only pins to the true viewport if every ancestor is a
    // plain, non-transformed box — a transform/filter/will-change anywhere
    // between here and <body> (common on animated hero/marquee sections)
    // turns this element's containing block into that ancestor instead,
    // making it track that box's position rather than overlay the GNAV
    // header at the true top of the viewport. Reparenting to <body> removes
    // that risk regardless of what the rest of the page does.
    document.body.prepend(el);
    syncBannerHeightVar(el);
    observeScrollReveal(el);
  }
}
