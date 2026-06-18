import { html, useState, useRef, useEffect } from '../../../deps/htm-preact.js';
import { LiveCard } from './LiveCard.js';

export const buildCarousel = () => Carousel;

export function Carousel({ sessions, title, formatTime }) {
  if (!sessions || !sessions.length) return null;

  const [offset, setOffset] = useState(0);
  // Desktop pages the strip with a transform (overflow:visible); narrower
  // viewports scroll natively, so arrows must drive scrollLeft instead.
  const [paged, setPaged] = useState(false);
  const [edges, setEdges] = useState({ atStart: true, atEnd: false });
  const stripRef = useRef(null);
  const cardWidthRef = useRef(0);
  const visibleCountRef = useRef(1);

  const refreshEdges = () => {
    const strip = stripRef.current;
    if (!strip) return;
    const maxScroll = strip.scrollWidth - strip.clientWidth;
    const atStart = strip.scrollLeft <= 1;
    const atEnd = strip.scrollLeft >= maxScroll - 1;
    setEdges((prev) => {
      if (prev.atStart === atStart && prev.atEnd === atEnd) return prev;
      return { atStart, atEnd };
    });
  };

  const measure = () => {
    const strip = stripRef.current;
    if (!strip) return;
    const firstCard = strip.querySelector('.sg-carousel__card-wrap');
    if (!firstCard) return;
    const styles = getComputedStyle(strip);
    const gap = parseFloat(styles.columnGap || '16') || 16;
    cardWidthRef.current = firstCard.offsetWidth + gap;
    const trackWidth = strip.parentElement.offsetWidth;
    visibleCountRef.current = Math.max(1, Math.floor(trackWidth / cardWidthRef.current));
    setPaged(styles.overflowX === 'visible');
  };

  useEffect(() => {
    measure();
    refreshEdges();
    const onResize = () => { measure(); refreshEdges(); };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const maxOffset = Math.max(0, sessions.length - visibleCountRef.current);
  const translateX = paged ? offset * (cardWidthRef.current || 576) : 0;
  const atStart = paged ? offset <= 0 : edges.atStart;
  const atEnd = paged ? offset >= maxOffset : edges.atEnd;

  const goPrev = () => {
    if (paged) { setOffset((o) => Math.max(0, o - 1)); return; }
    stripRef.current?.scrollBy({ left: -(cardWidthRef.current || 300), behavior: 'smooth' });
  };
  const goNext = () => {
    if (paged) { setOffset((o) => Math.min(maxOffset, o + 1)); return; }
    stripRef.current?.scrollBy({ left: cardWidthRef.current || 300, behavior: 'smooth' });
  };

  // Desktop shows the focused card's time in the left gutter; mobile (offset
  // stays 0 with native scroll) shows the first session's time inline.
  const focused = sessions[Math.min(offset, sessions.length - 1)];
  const timeLabel = formatTime ? formatTime(focused) : '';

  return html`
    <div class="sg-carousel">
      <div class="sg-carousel__header">
        <h3 class="sg-section-title">
          ${title}
          ${timeLabel && html`<span class="sg-section-time">${timeLabel}</span>`}
        </h3>
      </div>
      <div class="sg-carousel__body">
        ${timeLabel && html`<div class="sg-carousel__time">${timeLabel}</div>`}
        <div class="sg-carousel__track">
          <div class="sg-carousel__cards" ref=${stripRef} onscroll=${refreshEdges} style=${'transform:translateX(-' + translateX + 'px)'}>
            ${sessions.map((s) => html`<div class="sg-carousel__card-wrap" key=${s.id}><${LiveCard} session=${s} /></div>`)}
          </div>
        </div>
        ${sessions.length > 1 && html`
          <div class="sg-carousel__nav">
            <button
              class="sg-carousel__arrow sg-carousel__arrow--prev"
              onclick=${goPrev}
              aria-label="Previous"
              disabled=${atStart}
              type="button"
            >←</button>
            <button
              class="sg-carousel__arrow sg-carousel__arrow--next"
              onclick=${goNext}
              aria-label="Next"
              disabled=${atEnd}
              type="button"
            >→</button>
          </div>
        `}
      </div>
    </div>
  `;
}
