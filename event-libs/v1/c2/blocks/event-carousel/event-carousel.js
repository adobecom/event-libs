import { createTag, loadStyle } from '../../../utils/utils.js';

const ICON_ARROW_RIGHT = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"><path d="M3.5 8H12.5M12.5 8L8.5 4M12.5 8L8.5 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';

const BLOCK_CSS_URL = new URL('./event-carousel.css', import.meta.url).href;

let autoId = 0;

function nextAutoId() {
  autoId += 1;
  return `carousel-${autoId}`;
}

// Mirrors event-card.js's own getTheme(): dark/light is section-driven, read straight
// off the ancestor `.section`'s own "dark" style-metadata class (see decorate.js's
// applyAreaTheme() / DA's Section Metadata "style: dark" authoring) rather than
// anything configured per-block. `dark-carousel` on `el` itself is honored as a manual
// override, for a carousel that needs to force dark independent of its section.
function getTheme(el) {
  if (el.classList.contains('dark-carousel')) return 'dark';
  if (el.closest('.section')?.classList.contains('dark')) return 'dark';
  return 'light';
}

function locateTrack(el) {
  let sib = el.nextElementSibling;
  if (sib?.classList.contains('carousel-track')) return sib;

  sib = el.previousElementSibling;
  if (sib?.classList.contains('carousel-track')) return sib;

  const forward = [];
  sib = el.nextElementSibling;
  while (sib?.classList.contains('event-card')) {
    forward.push(sib);
    sib = sib.nextElementSibling;
  }
  if (forward.length) {
    const track = createTag('div', { class: 'carousel-track' });
    forward[0].before(track);
    track.append(...forward);
    return track;
  }

  const backward = [];
  sib = el.previousElementSibling;
  while (sib?.classList.contains('event-card')) {
    backward.unshift(sib);
    sib = sib.previousElementSibling;
  }
  if (backward.length) {
    const track = createTag('div', { class: 'carousel-track' });
    backward[0].before(track);
    track.append(...backward);
    return track;
  }

  return null;
}

function parseRows(el) {
  const wrapper = el.querySelector(':scope > div');
  const rows = wrapper ? [...wrapper.querySelectorAll(':scope > div')] : [];
  return { headingRow: rows[0], pillsRow: rows[1] };
}

function buildHeader(headingRow) {
  const content = headingRow ? [...headingRow.childNodes].filter(
    (node) => node.nodeType === Node.ELEMENT_NODE && node.textContent.trim(),
  ) : [];
  if (!content.length) return null;
  return createTag('div', { class: 'carousel-heading' }, content);
}

function buildPills(pillsRow) {
  const labels = pillsRow ? [...pillsRow.querySelectorAll(':scope > p')]
    .map((p) => p.textContent.trim())
    .filter(Boolean) : [];
  if (!labels.length) return null;

  const pillsContainer = createTag('div', { class: 'carousel-pills', role: 'tablist' });
  labels.forEach((label, i) => {
    const pill = createTag('button', {
      class: 'carousel-pill',
      type: 'button',
      role: 'tab',
      'aria-selected': i === 0 ? 'true' : 'false',
      tabindex: i === 0 ? '0' : '-1',
    }, label);
    if (i === 0) pill.classList.add('is-active');
    pillsContainer.append(pill);
  });

  const selectPill = (pill, { focus } = {}) => {
    pillsContainer.querySelectorAll('.carousel-pill').forEach((btn) => {
      const isTarget = btn === pill;
      btn.classList.toggle('is-active', isTarget);
      btn.setAttribute('aria-selected', String(isTarget));
      btn.tabIndex = isTarget ? 0 : -1;
    });
    if (focus) pill.focus();
  };

  const tabs = [...pillsContainer.querySelectorAll('.carousel-pill')];
  tabs.forEach((pill, i) => {
    pill.addEventListener('click', () => selectPill(pill));
    pill.addEventListener('keydown', (e) => {
      const keyToIndex = {
        ArrowRight: (i + 1) % tabs.length,
        ArrowLeft: (i - 1 + tabs.length) % tabs.length,
        Home: 0,
        End: tabs.length - 1,
      };
      const nextIndex = keyToIndex[e.key];
      if (nextIndex === undefined) return;
      e.preventDefault();
      selectPill(tabs[nextIndex], { focus: true });
    });
  });

  return pillsContainer;
}

function getLeadingGutter(track) {
  return parseFloat(getComputedStyle(track).paddingInlineStart) || 0;
}

function updateArrowState(track, prevBtn, nextBtn) {
  const minScroll = getLeadingGutter(track);
  const maxScroll = track.scrollWidth - track.clientWidth;
  prevBtn.disabled = track.scrollLeft <= minScroll;
  nextBtn.disabled = track.scrollLeft >= maxScroll - 1;
}

function alignInitialScroll(track) {
  if (track.dataset.scrollAligned) return;
  const gutter = getLeadingGutter(track);
  if (gutter > 0) track.scrollLeft = gutter;
  track.dataset.scrollAligned = 'true';
}

function buildArrows(track) {
  const prevBtn = createTag('button', {
    class: 'carousel-arrow carousel-arrow-prev',
    type: 'button',
    'aria-label': 'Previous',
  }, ICON_ARROW_RIGHT);
  const nextBtn = createTag('button', {
    class: 'carousel-arrow carousel-arrow-next',
    type: 'button',
    'aria-label': 'Next',
  }, ICON_ARROW_RIGHT);

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const scrollByCard = (direction) => {
    const card = track.querySelector('.event-card');
    const distance = card ? card.getBoundingClientRect().width + 8 : track.clientWidth;
    track.scrollBy({ left: direction * distance, behavior: reduceMotion ? 'auto' : 'smooth' });
  };

  prevBtn.addEventListener('click', () => scrollByCard(-1));
  nextBtn.addEventListener('click', () => scrollByCard(1));

  const refresh = () => updateArrowState(track, prevBtn, nextBtn);
  track.addEventListener('scroll', refresh);
  const resizeObserver = new ResizeObserver(refresh);
  resizeObserver.observe(track);
  const firstCard = track.querySelector('.event-card');
  if (firstCard) resizeObserver.observe(firstCard);
  refresh();

  const arrowsContainer = createTag('div', { class: 'carousel-arrows' }, [prevBtn, nextBtn]);
  return arrowsContainer;
}

export default async function init(el) {
  loadStyle(BLOCK_CSS_URL);

  const track = locateTrack(el);
  if (!track) {
    el.remove();
    return;
  }

  const trackId = track.dataset.carouselId || el.dataset.carouselId || nextAutoId();
  track.dataset.carouselId = trackId;
  alignInitialScroll(track);

  const { headingRow, pillsRow } = parseRows(el);
  const header = buildHeader(headingRow);
  const pills = buildPills(pillsRow);
  const arrows = buildArrows(track);
  const theme = getTheme(el);

  el.innerHTML = '';
  el.classList.add('carousel-controls');
  el.dataset.carouselTheme = theme;
  if (header) el.append(header);
  if (pills) el.append(pills);
  el.append(arrows);
}
