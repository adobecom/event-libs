import {
  useState, useRef, useEffect, useLayoutEffect,
} from '../../../../deps/htm-preact.js';
import { useSessionGuide } from '../store/index.js';

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

    setMeasure({
      tx: newTx,
      showNext: effectiveTotal - newTx > viewport.offsetWidth + 1,
      lastVisible: last,
    });
  }, [offset, cardStateKey, isDesktopCarousel]);

  return {
    dismissingIds,
    allDismissing,
    offset,
    setOffset,
    tx,
    showNext,
    lastVisible,
    stripRef,
    viewportRef,
    rowRef,
  };
}
