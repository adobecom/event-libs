import { html, useState, useRef, useEffect } from '../../../../deps/htm-preact.js';
import { LiveCard } from './LiveCard.js';
import { scrollBehavior } from '../utils/motion.js';

export const buildCarousel = () => Carousel;

// CardComponent defaults to LiveCard — session-broadcast passes SessionCard instead for its
// Upcoming section. Both accept the same session/onCardClick shape.
export function Carousel({
  sessions, title, formatTime, formatTimezone, variant = 'live', onCardClick, onWatchSamePage,
  CardComponent = LiveCard, timeDisplay, showDurationBadge, showDescription, forceLive,
}) {
  // Hooks run before the empty-list bail-out, to keep hook order stable across renders.
  const [offset, setOffset] = useState(0);
  // Desktop pages the strip with a transform; narrower viewports scroll natively.
  const [paged, setPaged] = useState(false);
  const [edges, setEdges] = useState({ atStart: true, atEnd: false });
  const stripRef = useRef(null);
  const cardWidthRef = useRef(0);
  const visibleCountRef = useRef(1);
  // Kept current every render so the mount-time resize handler below reads the latest value.
  const sessionsRef = useRef(sessions);
  sessionsRef.current = sessions;

  const clampOffset = () => {
    const maxOffset = Math.max(0, (sessionsRef.current?.length || 0) - visibleCountRef.current);
    setOffset((o) => Math.min(o, maxOffset));
  };

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
    clampOffset();
    const onResize = () => { measure(); refreshEdges(); clampOffset(); };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const sessionCount = sessions?.length || 0;
  const maxOffset = Math.max(0, sessionCount - visibleCountRef.current);

  // Re-measures when the list goes from empty to populated: sessions load asynchronously, so
  // the mount effect above often fires while there's no strip yet (measure() no-ops) and
  // visibleCountRef.current is stuck at its useRef(1) default once real cards do render. Also
  // re-clamps offset when the list shrinks under an already-paged-forward carousel (e.g. several
  // live sessions ending in the same tick), so translateX can't overshoot content.
  useEffect(() => {
    measure();
    refreshEdges();
    clampOffset();
  }, [sessionCount]);

  if (!sessions || !sessionCount) return null;

  const clampedOffset = Math.min(offset, maxOffset);
  const translateX = paged ? clampedOffset * (cardWidthRef.current || 576) : 0;
  const atStart = paged ? clampedOffset <= 0 : edges.atStart;
  const atEnd = paged ? clampedOffset >= maxOffset : edges.atEnd;

  const goPrev = () => {
    if (paged) { setOffset((o) => Math.max(0, o - 1)); return; }
    stripRef.current?.scrollBy({ left: -(cardWidthRef.current || 300), behavior: scrollBehavior() });
  };
  const goNext = () => {
    if (paged) { setOffset((o) => Math.min(maxOffset, o + 1)); return; }
    stripRef.current?.scrollBy({ left: cardWidthRef.current || 300, behavior: scrollBehavior() });
  };

  const focused = sessions[Math.min(clampedOffset, sessionCount - 1)];
  const timeLabel = formatTime ? formatTime(focused) : '';
  const tzLabel = formatTimezone ? formatTimezone(focused) : '';

  return html`
    <div class="sg-carousel">
      <div class="sg-carousel__header">
        <h3 class="sg-section-title">
          ${title}
          ${timeLabel && html`<span class="sg-section-time">${timeLabel}${tzLabel ? ` ${tzLabel}` : ''}</span>`}
        </h3>
      </div>
      <div class="sg-carousel__body">
        ${timeLabel && html`
          <div class="sg-carousel__time">
            <span class="sg-carousel__time-value">${timeLabel}</span>
            ${tzLabel && html`<span class="sg-carousel__time-tz">${tzLabel}</span>`}
          </div>
        `}
        <div class="sg-carousel__track">
          <div class="sg-carousel__cards" ref=${stripRef} onscroll=${refreshEdges} style=${'transform:translateX(-' + translateX + 'px)'}>
            ${sessions.map((s, i) => html`<div
              class="sg-carousel__card-wrap"
              key=${s.id}
              inert=${paged && (i < clampedOffset || i >= clampedOffset + visibleCountRef.current) ? true : undefined}
            ><${CardComponent} session=${s} variant=${variant} onCardClick=${onCardClick} onWatchSamePage=${onWatchSamePage} timeDisplay=${timeDisplay} showDurationBadge=${showDurationBadge} showDescription=${showDescription} forceLive=${forceLive} /></div>`)}
          </div>
        </div>
        ${sessions.length > 1 && html`
          <div class="sg-carousel__nav">
            <button
              class="sg-carousel__arrow sg-carousel__arrow--prev"
              onclick=${goPrev}
              aria-label=${`Previous session, ${title}`}
              disabled=${atStart}
              type="button"
            >
              <svg width="12" height="12" viewBox="0 0 13.3333 13.3333" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false" style="transform: scaleX(-1)">
                <path d="M12.34 5.9933L8.33984 1.99311C7.96782 1.6211 7.36513 1.6211 6.99311 1.99311C6.6211 2.36513 6.6211 2.96782 6.99311 3.33984L9.36755 5.71428H1.66667C1.14026 5.71428 0.714286 6.14025 0.714286 6.66666C0.714286 7.19307 1.14026 7.61904 1.66667 7.61904H9.36756L6.99312 9.99348C6.6211 10.3655 6.6211 10.9682 6.99312 11.3402C7.17913 11.5262 7.42281 11.6192 7.66649 11.6192C7.91016 11.6192 8.15384 11.5262 8.33985 11.3402L12.34 7.34001C12.7121 6.96799 12.712 6.36532 12.34 5.9933Z" fill="currentColor"/>
              </svg>
            </button>
            <button
              class="sg-carousel__arrow sg-carousel__arrow--next"
              onclick=${goNext}
              aria-label=${`Next session, ${title}`}
              disabled=${atEnd}
              type="button"
            >
              <svg width="12" height="12" viewBox="0 0 13.3333 13.3333" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
                <path d="M12.34 5.9933L8.33984 1.99311C7.96782 1.6211 7.36513 1.6211 6.99311 1.99311C6.6211 2.36513 6.6211 2.96782 6.99311 3.33984L9.36755 5.71428H1.66667C1.14026 5.71428 0.714286 6.14025 0.714286 6.66666C0.714286 7.19307 1.14026 7.61904 1.66667 7.61904H9.36756L6.99312 9.99348C6.6211 10.3655 6.6211 10.9682 6.99312 11.3402C7.17913 11.5262 7.42281 11.6192 7.66649 11.6192C7.91016 11.6192 8.15384 11.5262 8.33985 11.3402L12.34 7.34001C12.7121 6.96799 12.712 6.36532 12.34 5.9933Z" fill="currentColor"/>
              </svg>
            </button>
          </div>
        `}
      </div>
    </div>
  `;
}
