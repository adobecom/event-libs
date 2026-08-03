import {
  useState, useCallback, useRef, useLayoutEffect, useEffect, html,
} from '../../v1/deps/htm-preact.js';

// Reorder only — no rename/remove. Channel names/icons/colors are managed globally
// via the Tier 1 Event Configurator, outside this tool (PLAN.md §4.6). `tracks` is
// always already seeded/valid by ConfigsContext.js's seedSwimlaneOrder before this
// renders, so there's no add/remove-from-catalog concern here, unlike Tier 1's
// FeaturedSessionsEditor.js (whose core pointer-drag + keyboard-reorder mechanics this
// mirrors, simplified to a single column of plain track-name strings).
function DragHandleIcon() {
  return html`
    <svg width="10" height="16" viewBox="0 0 10 16" aria-hidden="true" focusable="false">
      <circle cx="2" cy="2" r="1.5" fill="currentColor" />
      <circle cx="8" cy="2" r="1.5" fill="currentColor" />
      <circle cx="2" cy="8" r="1.5" fill="currentColor" />
      <circle cx="8" cy="8" r="1.5" fill="currentColor" />
      <circle cx="2" cy="14" r="1.5" fill="currentColor" />
      <circle cx="8" cy="14" r="1.5" fill="currentColor" />
    </svg>
  `;
}

export default function SwimlaneOrderEditor({ tracks, onChange }) {
  const [draggedTrack, setDraggedTrack] = useState(null);
  const [announcement, setAnnouncement] = useState('');

  const order = tracks || [];

  const handleMove = useCallback((index, direction) => {
    const target = index + direction;
    if (target < 0 || target >= order.length) return;
    const next = [...order];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
    setAnnouncement(`Moved "${next[target]}" to position ${target + 1} of ${next.length}`);
  }, [order, onChange]);

  const handleKeyDown = useCallback((e, index) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      handleMove(index, -1);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      handleMove(index, 1);
    }
  }, [handleMove]);

  const listRef = useRef(null);
  const itemRefs = useRef(new Map());
  const dragInfo = useRef(null); // { track, startClientY, startIndex, rowHeight }
  const orderRef = useRef(order);
  orderRef.current = order;

  const setItemRef = useCallback((track, node) => {
    if (node) itemRefs.current.set(track, node);
    else itemRefs.current.delete(track);
  }, []);

  const measureRowHeight = useCallback(() => {
    const [firstNode] = itemRefs.current.values();
    if (!firstNode || !listRef.current) return 0;
    const rect = firstNode.getBoundingClientRect();
    const styles = window.getComputedStyle(listRef.current);
    const gap = parseFloat(styles.rowGap || styles.gap || '0') || 0;
    return rect.height + gap;
  }, []);

  const handlePointerMoveRef = useRef(() => {});
  const endDragRef = useRef(() => {});
  const stableMove = useRef((e) => handlePointerMoveRef.current(e)).current;
  const stableEnd = useRef((e) => endDragRef.current(e)).current;

  const handlePointerDown = useCallback((e, track) => {
    if (e.button !== undefined && e.button !== 0) return;
    const rowHeight = measureRowHeight();
    const startIndex = orderRef.current.indexOf(track);
    if (!rowHeight || startIndex === -1) return;
    dragInfo.current = {
      track, startClientY: e.clientY, startIndex, rowHeight,
    };
    setDraggedTrack(track);
    window.addEventListener('pointermove', stableMove);
    window.addEventListener('pointerup', stableEnd);
    window.addEventListener('pointercancel', stableEnd);
  }, [measureRowHeight, stableMove, stableEnd]);

  handlePointerMoveRef.current = (e) => {
    const info = dragInfo.current;
    if (!info) return;
    const deltaY = e.clientY - info.startClientY;
    const current = orderRef.current;
    const currentIndex = current.indexOf(info.track);
    if (currentIndex === -1) return;
    const rawTarget = info.startIndex + Math.round(deltaY / info.rowHeight);
    const targetIndex = Math.min(Math.max(rawTarget, 0), current.length - 1);

    if (targetIndex !== currentIndex) {
      const next = [...current];
      next.splice(currentIndex, 1);
      next.splice(targetIndex, 0, info.track);
      orderRef.current = next;
      onChange(next);
    }

    const draggedNode = itemRefs.current.get(info.track);
    if (draggedNode) {
      const visualOffset = deltaY - (targetIndex - info.startIndex) * info.rowHeight;
      draggedNode.style.transform = `translateY(${visualOffset}px)`;
    }
  };

  endDragRef.current = () => {
    const info = dragInfo.current;
    if (!info) return;
    window.removeEventListener('pointermove', stableMove);
    window.removeEventListener('pointerup', stableEnd);
    window.removeEventListener('pointercancel', stableEnd);
    const node = itemRefs.current.get(info.track);
    if (node) {
      node.style.transition = 'transform 0.15s ease';
      node.style.transform = '';
      setTimeout(() => { if (node) node.style.transition = ''; }, 160);
    }
    const finalIndex = orderRef.current.indexOf(info.track);
    if (finalIndex !== info.startIndex) {
      setAnnouncement(`Moved "${info.track}" to position ${finalIndex + 1} of ${orderRef.current.length}`);
    }
    dragInfo.current = null;
    setDraggedTrack(null);
  };

  useEffect(() => () => {
    window.removeEventListener('pointermove', stableMove);
    window.removeEventListener('pointerup', stableEnd);
    window.removeEventListener('pointercancel', stableEnd);
  }, [stableMove, stableEnd]);

  const prevOrderRef = useRef(order);
  useLayoutEffect(() => {
    const prevOrder = prevOrderRef.current;
    if (prevOrder !== order) {
      const rowHeight = measureRowHeight();
      if (rowHeight) {
        const movedNodes = [];
        prevOrder.forEach((track) => {
          if (track === dragInfo.current?.track) return;
          const oldIndex = prevOrder.indexOf(track);
          const newIndex = order.indexOf(track);
          if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return;
          const node = itemRefs.current.get(track);
          if (!node) return;
          node.style.transition = 'none';
          node.style.transform = `translateY(${(oldIndex - newIndex) * rowHeight}px)`;
          movedNodes.push(node);
        });

        if (movedNodes.length > 0) {
          // eslint-disable-next-line no-unused-expressions
          document.body.offsetHeight; // one shared reflow for the whole batch
          movedNodes.forEach((node) => {
            node.style.transition = 'transform 0.2s ease';
            node.style.transform = '';
          });
        }
      }
    }
    prevOrderRef.current = order;
  }, [order, measureRowHeight]);

  if (order.length === 0) {
    return html`<p class="sgc-swimlane-editor__empty">No tracks found in this event's session catalog yet.</p>`;
  }

  return html`
    <div aria-live="polite" class="sgc-sr-only">${announcement}</div>
    <ul class="sgc-swimlane-editor__list" ref=${listRef}>
      ${order.map((track, index) => html`
        <li \
          class="sgc-swimlane-editor__row ${track === draggedTrack ? 'is-dragging' : ''}" \
          key=${track} \
          ref=${(node) => setItemRef(track, node)} \
        >
          <button \
            type="button" \
            class="sgc-swimlane-editor__handle" \
            aria-label="Reorder ${track}. Position ${index + 1} of ${order.length}. Drag, or press arrow up/down." \
            onPointerDown=${(e) => handlePointerDown(e, track)} \
            onKeyDown=${(e) => handleKeyDown(e, index)} \
          >
            <${DragHandleIcon} />
          </button>
          <span class="sgc-swimlane-editor__title">${track}</span>
        </li>
      `)}
    </ul>
  `;
}
