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
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
                <path fill-rule="evenodd" clip-rule="evenodd" d="M2.67915 6.76384L11.2053 6.76384C11.6361 6.76384 11.9853 6.41462 11.9853 5.98384C11.9853 5.55306 11.6361 5.20384 11.2053 5.20384L2.67935 5.20384L5.44863 2.43455C5.75324 2.12994 5.75324 1.63607 5.44863 1.33146C5.14402 1.02686 4.65015 1.02686 4.34555 1.33147L0.244622 5.4324C-0.0599855 5.737 -0.0599849 6.23087 0.244624 6.53548L4.34556 10.6364C4.65017 10.941 5.14403 10.941 5.44864 10.6364C5.75325 10.3318 5.75325 9.83793 5.44864 9.53332L2.67915 6.76384Z" fill="currentColor"/>
              </svg>
            </button>
            <button
              class="sg-carousel__arrow sg-carousel__arrow--next"
              onclick=${goNext}
              aria-label="Next"
              disabled=${atEnd}
              type="button"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
                <path fill-rule="evenodd" clip-rule="evenodd" d="M9.32279 6.76475L0.796596 6.76475C0.365814 6.76475 0.0165963 6.41554 0.0165958 5.98475C0.0165953 5.55397 0.365812 5.20475 0.796595 5.20475L9.32259 5.20475L6.5533 2.43547C6.24869 2.13086 6.24869 1.63699 6.5533 1.33238C6.85791 1.02777 7.35178 1.02777 7.65639 1.33238L11.7573 5.43331C12.0619 5.73792 12.0619 6.23179 11.7573 6.5364L7.6564 10.6373C7.35179 10.9419 6.85792 10.9419 6.55331 10.6373C6.2487 10.3327 6.2487 9.83885 6.55331 9.53424L9.32279 6.76475Z" fill="currentColor"/>
              </svg>
            </button>
          </div>
        `}
      </div>
    </div>
  `;
}
