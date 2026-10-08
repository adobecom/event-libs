import {
  useState, useRef, useEffect, useLayoutEffect,
} from '../../../../deps/htm-preact.js';
import { useSessionGuide } from '../store/index.js';
import { handOffArrowFocus, scrollToAdjacent, watchScrollEdges, widthTransitionRunning } from './carousel-nav.js';

// Must match the breakpoint sessions-guide.css uses to switch into the desktop transform-carousel.
const DESKTOP_CAROUSEL_QUERY = '(min-width: 1280px)';
const matchesDesktopCarousel = () => !!window.matchMedia?.(DESKTOP_CAROUSEL_QUERY).matches;

function useIsDesktopCarousel() {
  const [isDesktop, setIsDesktop] = useState(matchesDesktopCarousel);
  useEffect(() => {
    const mq = window.matchMedia?.(DESKTOP_CAROUSEL_QUERY);
    if (!mq) return undefined;
    const onChange = (e) => setIsDesktop(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return isDesktop;
}

// Shared by TrackRow.js and TimeSlotRow.js. `cardStateKey` is passed in since it varies per caller.
export function useCarouselRow(sessions, cardStateKey) {
  const { state } = useSessionGuide();
  const dismissingIds = state.dismissingIds || new Set();
  const allDismissing = sessions?.every((s) => dismissingIds.has(s.id)) || false;
  const isDesktopCarousel = useIsDesktopCarousel();

  const [offset, setOffset] = useState(0);
  // Cards outside [offset, lastVisible] are marked `inert` so Tab can't focus cards the user can't see.
  const [{ tx, showNext, lastVisible }, setMeasure] = useState({ tx: 0, showNext: false, lastVisible: Infinity });
  const stripRef = useRef(null);
  const viewportRef = useRef(null);
  const rowRef = useRef(null);
  const rowHeightRef = useRef(0);
  const collapsingRef = useRef(false);
  const [resizeTick, setResizeTick] = useState(0);
  const measuredViewportRef = useRef(0);

  // Pins max-height to the real captured height before animating to 0, so the collapse doesn't start from the 600px CSS baseline.
  useLayoutEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    if (!allDismissing) {
      rowHeightRef.current = row.offsetHeight;
      collapsingRef.current = false;
      row.style.maxHeight = '';
    } else if (!collapsingRef.current) {
      collapsingRef.current = true;
      const h = rowHeightRef.current || row.scrollHeight;
      row.style.maxHeight = `${h}px`;
      // eslint-disable-next-line no-unused-expressions
      row.offsetHeight; // force reflow so transition starts from h, not 600px
      row.style.maxHeight = '0px';
    }
  });

  useLayoutEffect(() => {
    const strip = stripRef.current;
    const viewport = viewportRef.current;
    if (!strip || !viewport) return;
    // Below 1280px the row scrolls natively; gating lastVisible there would strand cards as unreachable `inert`.
    if (!isDesktopCarousel) {
      setMeasure({ tx: 0, showNext: false, lastVisible: Infinity });
      return;
    }
    const cards = [...strip.children];
    if (!cards.length) return;
    measuredViewportRef.current = viewport.offsetWidth;
    const gap = parseFloat(getComputedStyle(strip).columnGap) || 0;
    let newTx = 0;
    let totalWidth = 0;
    cards.forEach((card, i) => {
      const w = card.offsetWidth;
      if (i < offset) newTx += w + gap;
      totalWidth += w + (i < cards.length - 1 ? gap : 0);
    });
    // Reserves room for the last card's hover-expanded width so its action buttons stay reachable.
    const HOVER_CARD_WIDTH = 427;
    const effectiveTotal = totalWidth - cards[cards.length - 1].offsetWidth + HOVER_CARD_WIDTH;

    let used = 0;
    let last = offset;
    for (let i = offset; i < cards.length; i += 1) {
      used += cards[i].offsetWidth + (i > offset ? gap : 0);
      if (used > viewport.offsetWidth + 1) break;
      last = i;
    }

    const next = {
      tx: newTx,
      showNext: effectiveTotal - newTx > viewport.offsetWidth + 1,
      lastVisible: last,
    };
    setMeasure((prev) => (prev.tx === next.tx && prev.showNext === next.showNext
      && prev.lastVisible === next.lastVisible ? prev : next));
  }, [offset, cardStateKey, isDesktopCarousel, resizeTick]);

  // Below 1280px the arrows' disabled state follows the native scroll position.
  const [edges, setEdges] = useState({ atStart: true, atEnd: true });
  const sessionCount = sessions?.length || 0;

  // Re-measure on viewport/card resize (e.g. cards animating in after crossing into desktop),
  // skipping hover expansion and running width transitions unless the viewport itself changed.
  useEffect(() => {
    const strip = stripRef.current;
    const viewport = viewportRef.current;
    if (!isDesktopCarousel || !strip || !viewport || typeof ResizeObserver !== 'function') return undefined;
    const settling = () => viewport.offsetWidth === measuredViewportRef.current
      && ([...strip.children].some((c) => c.matches(':hover, :focus-within'))
        || widthTransitionRunning(strip));
    const ro = new ResizeObserver(() => {
      if (!settling()) setResizeTick((n) => n + 1);
    });
    const onTransitionEnd = (e) => {
      if (e.propertyName === 'width' && !settling()) setResizeTick((n) => n + 1);
    };
    [viewport, ...strip.children].forEach((el) => ro.observe(el));
    strip.addEventListener('transitionend', onTransitionEnd);
    return () => {
      ro.disconnect();
      strip.removeEventListener('transitionend', onTransitionEnd);
    };
  }, [isDesktopCarousel, sessionCount]);
  useEffect(() => {
    if (isDesktopCarousel) return undefined;
    return watchScrollEdges(stripRef.current, (next) => setEdges((prev) => (
      prev.atStart === next.atStart && prev.atEnd === next.atEnd ? prev : next)));
  }, [isDesktopCarousel, sessionCount]);

  const [announcement, setAnnouncement] = useState('');
  const pendingRef = useRef(null);
  const pressedRef = useRef(null);
  const announce = (index) => {
    const title = sessions?.[index]?.title;
    if (title) setAnnouncement(title);
  };

  const step = (direction, button) => {
    pressedRef.current = { button, at: performance.now() };
    if (isDesktopCarousel) {
      const next = Math.min(Math.max(0, offset + direction), sessionCount - 1);
      setOffset(next);
      announce(next);
      return;
    }
    const target = scrollToAdjacent(stripRef.current, direction, pendingRef);
    if (target) announce(target.index);
  };

  const prevDisabled = isDesktopCarousel ? offset <= 0 : edges.atStart;
  const nextDisabled = isDesktopCarousel ? !showNext : edges.atEnd;

  useEffect(() => { handOffArrowFocus(pressedRef); }, [prevDisabled, nextDisabled]);

  return {
    dismissingIds,
    allDismissing,
    offset,
    tx,
    lastVisible,
    stripRef,
    viewportRef,
    rowRef,
    goPrev: (e) => step(-1, e?.currentTarget),
    goNext: (e) => step(1, e?.currentTarget),
    prevDisabled,
    nextDisabled,
    announcement,
  };
}
