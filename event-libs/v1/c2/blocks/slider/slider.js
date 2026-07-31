import { createTag } from '../../../utils/utils.js';

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

function updateArrowState(track, prevBtn, nextBtn) {
  const maxScroll = track.scrollWidth - track.clientWidth;
  prevBtn.disabled = track.scrollLeft <= 0;
  nextBtn.disabled = track.scrollLeft >= maxScroll - 1;
}

function buildArrows(track) {
  const prevBtn = createTag('button', {
    class: 'carousel-arrow carousel-arrow-prev',
    type: 'button',
    'aria-label': 'Previous',
  }, '<span class="carousel-arrow-icon"></span>');
  const nextBtn = createTag('button', {
    class: 'carousel-arrow carousel-arrow-next',
    type: 'button',
    'aria-label': 'Next',
  }, '<span class="carousel-arrow-icon"></span>');

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const scrollByCard = (direction) => {
    const card = track.querySelector('.card-c2');
    const distance = card ? card.getBoundingClientRect().width + 8 : track.clientWidth;
    track.scrollBy({ left: direction * distance, behavior: reduceMotion ? 'auto' : 'smooth' });
  };

  prevBtn.addEventListener('click', () => scrollByCard(-1));
  nextBtn.addEventListener('click', () => scrollByCard(1));

  track.addEventListener('scroll', () => updateArrowState(track, prevBtn, nextBtn));
  updateArrowState(track, prevBtn, nextBtn);

  const arrowsContainer = createTag('div', { class: 'carousel-arrows' }, [prevBtn, nextBtn]);
  return arrowsContainer;
}

function buildDots(track) {
  const cards = [...track.querySelectorAll(':scope > .card-c2')];
  const cardWidth = cards[0]?.clientWidth || 0;
  const perView = cardWidth > 0 && track.clientWidth > 0
    ? Math.max(1, Math.round(track.clientWidth / cardWidth))
    : cards.length;
  if (cards.length <= perView) return null;

  const pageCount = Math.ceil(cards.length / perView);
  const dotsList = createTag('ul', { class: 'carousel-dots' });
  const dots = [];
  for (let i = 0; i < pageCount; i += 1) {
    const dot = createTag('li', { class: 'carousel-dot', 'data-page': i });
    if (i === 0) dot.classList.add('is-active');
    dotsList.append(dot);
    dots.push(dot);
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const index = cards.indexOf(entry.target);
      const page = Math.floor(index / perView);
      dots.forEach((dot, i) => dot.classList.toggle('is-active', i === page));
    });
  }, { root: track, threshold: 0.6 });

  cards.forEach((card, i) => {
    if (i % perView === 0) observer.observe(card);
  });

  return dotsList;
}

export default async function init(el) {
  const track = locateTrack(el);
  if (!track) {
    el.remove();
    return;
  }

  const trackId = track.dataset.carouselId || el.dataset.carouselId || nextAutoId();
  track.dataset.carouselId = trackId;

  const { headingRow, pillsRow } = parseRows(el);
  const header = buildHeader(headingRow);
  const pills = buildPills(pillsRow);
  const arrows = buildArrows(track);
  const dots = buildDots(track);

  el.innerHTML = '';
  el.classList.add('carousel-controls');
  if (header) el.append(header);
  if (pills) el.append(pills);
  el.append(arrows);
  if (dots) el.append(dots);
}
