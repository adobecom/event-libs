import { html, useState, useRef, useEffect } from '../../../../deps/htm-preact.js';
import { LiveCard } from './LiveCard.js';
import {
  handOffArrowFocus, lastFullyVisible, maxPageOffset, measureCards, previousPageStart,
  scrollEdges, scrollToAdjacent, watchScrollEdges,
} from '../utils/carousel-nav.js';

export const buildCarousel = () => Carousel;

// CardComponent defaults to LiveCard — session-broadcast passes SessionCard instead for its
// Upcoming section. Both accept the same session/onCardClick shape.
export function Carousel({
  sessions, title, formatTime, formatTimezone, variant = 'live', onCardClick, onWatchSamePage,
  CardComponent = LiveCard, timeDisplay, showDurationBadge, showDescription, forceLive,
  pageByGroup = false, resetKey,
}) {
  // Hooks run before the empty-list bail-out, to keep hook order stable across renders.
  const [offset, setOffset] = useState(0);
  // Desktop pages the strip with a transform; narrower viewports scroll natively.
  const [paged, setPaged] = useState(false);
  const [edges, setEdges] = useState({ atStart: true, atEnd: false });
  const stripRef = useRef(null);
  // Resting card geometry + track width from the last full measure(); drives desktop paging.
  const layoutRef = useRef({ starts: [], ends: [], trackWidth: 0 });
  const [, setPageSize] = useState('');
  const resetKeyRef = useRef(resetKey);
  // Polite live-region text naming the card each arrow press brings into view.
  const [announcement, setAnnouncement] = useState('');
  const pendingRef = useRef(null);
  const pressedRef = useRef(null);

  const clampOffset = () => {
    const max = maxPageOffset(layoutRef.current, layoutRef.current.trackWidth);
    setOffset((o) => Math.min(o, max));
  };

  const applyEdges = ({ atStart, atEnd }) => setEdges((prev) => (
    prev.atStart === atStart && prev.atEnd === atEnd ? prev : { atStart, atEnd }));

  const refreshEdges = () => {
    if (stripRef.current) applyEdges(scrollEdges(stripRef.current));
  };

  const measure = () => {
    const strip = stripRef.current;
    if (!strip) return;
    const cards = [...strip.querySelectorAll('.sg-carousel__card-wrap')];
    if (!cards.length) return;
    const styles = getComputedStyle(strip);
    setPaged(styles.overflowX === 'visible');
    // Cards widen on hover/focus (and some rest wider when scheduled/favorited), so re-measuring
    // mid-hover could shrink the page size and inert a visible card; keep the last size until it
    // settles — unless the track itself resized, which hover never causes (a real layout change).
    const trackWidth = strip.parentElement.offsetWidth;
    const prev = layoutRef.current;
    if (prev.starts.length === cards.length && trackWidth === prev.trackWidth
      && cards.some((c) => c.matches(':hover, :focus-within'))) return;
    layoutRef.current = { ...measureCards(cards), trackWidth };
    // The ref drives translate/inert, so re-render when it changes (a same-value set is a no-op).
    const { starts, ends } = layoutRef.current;
    setPageSize(`${trackWidth}|${starts.join(',')}|${ends.join(',')}`);
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
  const layout = layoutRef.current;
  const measured = layout.starts.length === sessionCount;
  const maxOffset = measured ? maxPageOffset(layout, layout.trackWidth) : 0;

  // Re-measures for async-loaded sessions; the mount effect above can fire before the strip exists.
  useEffect(() => {
    measure();
    refreshEdges();
    clampOffset();
  }, [sessionCount]);

  // Catches strip/card size changes the window resize listener misses (e.g. drawer opening).
  useEffect(() => (paged ? undefined : watchScrollEdges(stripRef.current, applyEdges)), [paged, sessionCount]);

  // Broadcast can mount this before sessions-guide.css applies, when an unstyled strip reads as
  // overflow:visible (paged) and cards as full-width. Re-measure when the strip or a card resizes
  // (cards too: Broadcast's own CSS can pin the strip's size while only the cards change).
  useEffect(() => {
    const strip = stripRef.current;
    if (!strip || typeof ResizeObserver !== 'function') return undefined;
    const ro = new ResizeObserver(() => { measure(); refreshEdges(); clampOffset(); });
    [strip, ...strip.children].forEach((el) => ro.observe(el));
    return () => ro.disconnect();
  }, [sessionCount]);

  // resetKey (e.g. activeDay) changing means the carousel now shows an unrelated session set —
  // snap back to the start instead of retaining the previous day's scroll position (MWPW-209092).
  useEffect(() => {
    if (resetKey === undefined || resetKey === resetKeyRef.current) return;
    resetKeyRef.current = resetKey;
    setOffset(0);
    if (stripRef.current) stripRef.current.scrollLeft = 0;
  }, [resetKey]);

  // Cheap no-op unless an arrow press just disabled that arrow while it had focus.
  useEffect(() => { handOffArrowFocus(pressedRef); });

  if (!sessions || !sessionCount) return null;

  const clampedOffset = Math.min(offset, maxOffset);
  const translateX = paged && measured ? layout.starts[clampedOffset] : 0;
  const lastVisible = paged && measured
    ? lastFullyVisible(layout, clampedOffset, layout.trackWidth) : sessionCount - 1;
  const atStart = paged ? clampedOffset <= 0 : edges.atStart;
  const atEnd = paged ? clampedOffset >= maxOffset : edges.atEnd;

  const announce = (index) => {
    const title = sessions[index]?.title;
    if (title) setAnnouncement(title);
  };
  const go = (direction, button) => {
    pressedRef.current = { button, at: performance.now() };
    if (paged) {
      let next = clampedOffset + direction;
      if (pageByGroup) {
        next = direction > 0 ? lastVisible + 1
          : previousPageStart(layout, clampedOffset, layout.trackWidth);
      }
      next = Math.min(maxOffset, Math.max(0, next));
      setOffset(next);
      announce(next);
      return;
    }
    const target = scrollToAdjacent(stripRef.current, direction, pendingRef);
    if (target) announce(target.index);
  };
  const goPrev = (e) => go(-1, e?.currentTarget);
  const goNext = (e) => go(1, e?.currentTarget);

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
          <div class="sg-carousel__cards" ref=${stripRef} style=${'transform:translateX(-' + translateX + 'px)'}>
            ${sessions.map((s, i) => html`<div
              class="sg-carousel__card-wrap"
              key=${s.id}
              inert=${paged && (i < clampedOffset || i > lastVisible) ? true : undefined}
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
      <span class="sg-sr-only" aria-live="polite">${announcement}</span>
    </div>
  `;
}
