import { useState, useRef, useLayoutEffect } from '../../../../deps/htm-preact.js';
import { useSessionGuide } from '../store/index.js';

// Shared by TrackRow.js and TimeSlotRow.js: both render a horizontally-paged strip of
// SessionCards with prev/next arrows, a "reserve room for the last card's hover-expanded
// width" measurement pass, and a collapse-to-zero-height animation when every card in
// the row is being dismissed (e.g. unscheduled from "My sessions"). `cardStateKey`
// differs per caller (which session states widen a card varies by view), so it's passed
// in rather than computed here.
export function useCarouselRow(sessions, cardStateKey) {
  const { state } = useSessionGuide();
  const dismissingIds = state.dismissingIds || new Set();
  const allDismissing = sessions?.every((s) => dismissingIds.has(s.id)) || false;

  const [offset, setOffset] = useState(0);
  // lastVisible is the index of the last card fully inside the viewport. Cards outside
  // [offset, lastVisible] are translated out of a clipped viewport, so the rows mark them
  // `inert` — otherwise Tab moves focus onto cards the user cannot see.
  const [{ tx, showNext, lastVisible }, setMeasure] = useState({ tx: 0, showNext: false, lastVisible: Infinity });
  const stripRef = useRef(null);
  const viewportRef = useRef(null);
  const rowRef = useRef(null);
  const rowHeightRef = useRef(0);
  const collapsingRef = useRef(false);

  // Runs after every render. When the row is not collapsing, keep rowHeightRef
  // current so we always have the real height ready when a collapse starts.
  // When collapsing begins, pin max-height to that captured value then animate
  // to 0 — this makes the transition start from the actual height instead of
  // the 600px CSS baseline, so the vertical slide syncs with the card collapse.
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
    // Reserve room for the last card's hover-expanded width (427px per .sg-card:hover)
    // so its action buttons stay reachable when the viewport is tight.
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
  }, [offset, cardStateKey]);

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
