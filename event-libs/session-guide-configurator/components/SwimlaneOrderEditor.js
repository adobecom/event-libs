import {
  useState, useMemo, useCallback, useRef, useLayoutEffect, useEffect, html,
} from '../../v1/deps/htm-preact.js';

// Reorder + enable/disable + rename — no removing a track from the catalog itself.
// Channel names/icons/colors used elsewhere on the page are still managed globally
// via the Tier 1 Event Configurator, outside this tool (PLAN.md §4.6) — `displayName`
// here only affects this session guide's own swimlane header. `tracks` is always
// already seeded/valid by ConfigsContext.js's seedSwimlaneOrder before this renders,
// so there's no add/remove-from-catalog concern here, unlike Tier 1's
// FeaturedSessionsEditor.js (whose core pointer-drag + keyboard-reorder mechanics this
// mirrors) — same reorder + rename mechanics as FiltersEditor.js. The original track
// value is always shown alongside the editable name so authors know what they're
// overriding. A disabled track is dropped entirely from the rendered guide by the
// consuming side (MWPW-194336-CONSUMPTION-HANDOFF.md item 3), not just hidden from
// ordering.
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

  const rows = tracks || [];
  // Memoized so the FLIP effect's prevOrder !== order check reflects a real order
  // change, not a fresh array recreated every render (same reasoning as Tier 1's
  // FeaturedSessionsEditor.js's featuredIds memo / FiltersEditor.js's rowIds memo).
  // Depends on the tracks prop itself, not the locally-rebound `rows`, since `rows`
  // is a fresh [] literal on every render whenever tracks is falsy.
  const order = useMemo(() => rows.map((r) => r.track), [tracks]);

  const getTitleFor = useCallback(
    (track) => rows.find((r) => r.track === track)?.displayName || track,
    [rows],
  );

  const updateRow = useCallback((track, updates) => {
    onChange(rows.map((r) => (r.track === track ? { ...r, ...updates } : r)));
  }, [rows, onChange]);

  const reorder = useCallback((nextOrder) => {
    const byTrack = new Map(rows.map((r) => [r.track, r]));
    onChange(nextOrder.map((track) => byTrack.get(track)));
  }, [rows, onChange]);

  const handleMove = useCallback((index, direction) => {
    const target = index + direction;
    if (target < 0 || target >= order.length) return;
    const next = [...order];
    [next[index], next[target]] = [next[target], next[index]];
    reorder(next);
    setAnnouncement(`Moved "${getTitleFor(next[target])}" to position ${target + 1} of ${next.length}`);
  }, [order, reorder, getTitleFor]);

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
      reorder(next);
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
      setAnnouncement(`Moved "${getTitleFor(info.track)}" to position ${finalIndex + 1} of ${orderRef.current.length}`);
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

  if (rows.length === 0) {
    return html`<p class="sgc-swimlane-editor__empty">No tracks found in this event's session catalog yet.</p>`;
  }

  return html`
    <div aria-live="polite" class="sgc-sr-only">${announcement}</div>
    <ul class="sgc-swimlane-editor__list" ref=${listRef}>
      ${rows.map((row, index) => html`
        <li \
          class="sgc-swimlane-editor__row ${row.track === draggedTrack ? 'is-dragging' : ''} ${!row.enabled ? 'is-disabled' : ''}" \
          key=${row.track} \
          ref=${(node) => setItemRef(row.track, node)} \
        >
          <button \
            type="button" \
            class="sgc-swimlane-editor__handle" \
            aria-label="Reorder ${getTitleFor(row.track)}. Position ${index + 1} of ${rows.length}. Drag, or press arrow up/down." \
            onPointerDown=${(e) => handlePointerDown(e, row.track)} \
            onKeyDown=${(e) => handleKeyDown(e, index)} \
          >
            <${DragHandleIcon} />
          </button>
          <label class="sgc-swimlane-editor__enable">
            <input
              type="checkbox"
              checked=${row.enabled}
              aria-label="Show ${row.track} in the session guide"
              onChange=${(e) => updateRow(row.track, { enabled: e.target.checked })}
            />
          </label>
          <span class="sgc-swimlane-editor__original" title="Original track name">${row.track}</span>
          <input
            type="text"
            class="sgc-field sgc-swimlane-editor__name-input"
            value=${row.displayName}
            onInput=${(e) => updateRow(row.track, { displayName: e.target.value })}
          />
        </li>
      `)}
    </ul>
  `;
}
