import { createTag } from '../../../utils/utils.js';

const ICON_ARROW_RIGHT = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"><path d="M3.5 8H12.5M12.5 8L8.5 4M12.5 8L8.5 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';

let autoId = 0;

function nextAutoId() {
  autoId += 1;
  return `carousel-${autoId}`;
}

function locateTrack(el) {
  let sib = el.nextElementSibling;
  if (sib?.classList.contains('carousel-track')) return sib;

  sib = el.previousElementSibling;
  if (sib?.classList.contains('carousel-track')) return sib;

  const forward = [];
  sib = el.nextElementSibling;
  while (sib?.classList.contains('card-c2')) {
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
  while (sib?.classList.contains('card-c2')) {
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
    }, label);
    if (i === 0) pill.classList.add('is-active');
    pill.addEventListener('click', () => {
      pillsContainer.querySelectorAll('.carousel-pill').forEach((btn) => {
        btn.classList.remove('is-active');
        btn.setAttribute('aria-selected', 'false');
      });
      pill.classList.add('is-active');
      pill.setAttribute('aria-selected', 'true');
    });
    pillsContainer.append(pill);
  });
  return pillsContainer;
}

// The mobile centered-peek gutter (see slider.css) is real padding on the track, so
// `scrollLeft` never actually reaches 0 there — the first card's "resting" position
// already sits past that leading gutter (see alignInitialScroll). 0 on desktop, where
// there's no such padding.
function getLeadingGutter(track) {
  return parseFloat(getComputedStyle(track).paddingInlineStart) || 0;
}

function updateArrowState(track, prevBtn, nextBtn) {
  const minScroll = getLeadingGutter(track);
  const maxScroll = track.scrollWidth - track.clientWidth;
  prevBtn.disabled = track.scrollLeft <= minScroll;
  nextBtn.disabled = track.scrollLeft >= maxScroll - 1;
}

// scroll-snap-align only affects where the browser snaps *after* a scroll gesture —
// it never auto-positions the initial scroll offset. Without this, the mobile
// centered-peek gutter (padding-inline on .carousel-track) would just render as dead
// blank space in front of the first card at scrollLeft: 0 on page load.
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
    const card = track.querySelector('.card-c2');
    const distance = card ? card.getBoundingClientRect().width + 8 : track.clientWidth;
    track.scrollBy({ left: direction * distance, behavior: reduceMotion ? 'auto' : 'smooth' });
  };

  prevBtn.addEventListener('click', () => scrollByCard(-1));
  nextBtn.addEventListener('click', () => scrollByCard(1));

  const refresh = () => updateArrowState(track, prevBtn, nextBtn);
  track.addEventListener('scroll', refresh);
  // The initial synchronous pass runs before the cards are decorated/sized, so the
  // track's scrollWidth still equals its clientWidth and "next" would wrongly disable
  // until the first scroll. Re-evaluate whenever the track or its cards change size
  // (card decoration settling, images loading, viewport resize). Observing a card as
  // well as the track catches the common case where only the track's scrollWidth
  // grows while its own border-box stays fixed.
  const resizeObserver = new ResizeObserver(refresh);
  resizeObserver.observe(track);
  const firstCard = track.querySelector('.card-c2');
  if (firstCard) resizeObserver.observe(firstCard);
  refresh();

  const arrowsContainer = createTag('div', { class: 'carousel-arrows' }, [prevBtn, nextBtn]);
  return arrowsContainer;
}

export default async function init(el) {
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

  el.innerHTML = '';
  el.classList.add('carousel-controls');
  if (header) el.append(header);
  if (pills) el.append(pills);
  el.append(arrows);
}
