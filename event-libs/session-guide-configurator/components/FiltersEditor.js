import {
  useState, useMemo, useCallback, useRef, useLayoutEffect, useEffect, html,
} from '../../v1/deps/htm-preact.js';

// Select/unselect + rename + reorder over deriveFacetableAttributes(sessions)'s output
// (ConfigsContext.js's seedFilterCategories seeds `categories`, enabled by default —
// the "starting point" requirement). No per-value CRUD — filter *options* are always
// live-derived from ESP, never authored (PLAN.md §7). Same reorder mechanics as
// SwimlaneOrderEditor.js/Tier 1's FeaturedSessionsEditor.js, plus a per-row enable
// checkbox and editable display-name input.
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

export default function FiltersEditor({ categories, onChange }) {
  const [draggedId, setDraggedId] = useState(null);
  const [announcement, setAnnouncement] = useState('');

  const rows = categories || [];
  // Memoized so the FLIP effect's prevOrder !== rowIds check reflects a real order
  // change, not a fresh array recreated every render (same reasoning as Tier 1's
  // FeaturedSessionsEditor.js's featuredIds memo). Depends on the categories prop
  // itself, not the locally-rebound `rows`, since `rows` is a fresh [] literal on
  // every render whenever categories is falsy.
  const rowIds = useMemo(() => rows.map((r) => r.attributeId), [categories]);

  const getTitleFor = useCallback(
    (attributeId) => rows.find((r) => r.attributeId === attributeId)?.displayName || attributeId,
    [rows],
  );

  const updateRow = useCallback((attributeId, updates) => {
    onChange(rows.map((r) => (r.attributeId === attributeId ? { ...r, ...updates } : r)));
  }, [rows, onChange]);

  const reorder = useCallback((nextIds) => {
    const byId = new Map(rows.map((r) => [r.attributeId, r]));
    onChange(nextIds.map((id) => byId.get(id)));
  }, [rows, onChange]);

  const handleMove = useCallback((index, direction) => {
    const target = index + direction;
    if (target < 0 || target >= rowIds.length) return;
    const next = [...rowIds];
    [next[index], next[target]] = [next[target], next[index]];
    reorder(next);
    setAnnouncement(`Moved "${getTitleFor(next[target])}" to position ${target + 1} of ${next.length}`);
  }, [rowIds, reorder, getTitleFor]);

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
  const dragInfo = useRef(null); // { attributeId, startClientY, startIndex, rowHeight }
  const orderRef = useRef(rowIds);
  orderRef.current = rowIds;

  const setItemRef = useCallback((attributeId, node) => {
    if (node) itemRefs.current.set(attributeId, node);
    else itemRefs.current.delete(attributeId);
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

  const handlePointerDown = useCallback((e, attributeId) => {
    if (e.button !== undefined && e.button !== 0) return;
    const rowHeight = measureRowHeight();
    const startIndex = orderRef.current.indexOf(attributeId);
    if (!rowHeight || startIndex === -1) return;
    dragInfo.current = {
      attributeId, startClientY: e.clientY, startIndex, rowHeight,
    };
    setDraggedId(attributeId);
    window.addEventListener('pointermove', stableMove);
    window.addEventListener('pointerup', stableEnd);
    window.addEventListener('pointercancel', stableEnd);
  }, [measureRowHeight, stableMove, stableEnd]);

  handlePointerMoveRef.current = (e) => {
    const info = dragInfo.current;
    if (!info) return;
    const deltaY = e.clientY - info.startClientY;
    const current = orderRef.current;
    const currentIndex = current.indexOf(info.attributeId);
    if (currentIndex === -1) return;
    const rawTarget = info.startIndex + Math.round(deltaY / info.rowHeight);
    const targetIndex = Math.min(Math.max(rawTarget, 0), current.length - 1);

    if (targetIndex !== currentIndex) {
      const next = [...current];
      next.splice(currentIndex, 1);
      next.splice(targetIndex, 0, info.attributeId);
      orderRef.current = next;
      reorder(next);
    }

    const draggedNode = itemRefs.current.get(info.attributeId);
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
    const node = itemRefs.current.get(info.attributeId);
    if (node) {
      node.style.transition = 'transform 0.15s ease';
      node.style.transform = '';
      setTimeout(() => { if (node) node.style.transition = ''; }, 160);
    }
    const finalIndex = orderRef.current.indexOf(info.attributeId);
    if (finalIndex !== info.startIndex) {
      setAnnouncement(`Moved "${getTitleFor(info.attributeId)}" to position ${finalIndex + 1} of ${orderRef.current.length}`);
    }
    dragInfo.current = null;
    setDraggedId(null);
  };

  useEffect(() => () => {
    window.removeEventListener('pointermove', stableMove);
    window.removeEventListener('pointerup', stableEnd);
    window.removeEventListener('pointercancel', stableEnd);
  }, [stableMove, stableEnd]);

  const prevOrderRef = useRef(rowIds);
  useLayoutEffect(() => {
    const prevOrder = prevOrderRef.current;
    if (prevOrder !== rowIds) {
      const rowHeight = measureRowHeight();
      if (rowHeight) {
        const movedNodes = [];
        prevOrder.forEach((attributeId) => {
          if (attributeId === dragInfo.current?.attributeId) return;
          const oldIndex = prevOrder.indexOf(attributeId);
          const newIndex = rowIds.indexOf(attributeId);
          if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return;
          const node = itemRefs.current.get(attributeId);
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
    prevOrderRef.current = rowIds;
  }, [rowIds, measureRowHeight]);

  if (rows.length === 0) {
    return html`<p class="sgc-filters-editor__empty">No facetable custom attributes found in this event's session catalog yet.</p>`;
  }

  return html`
    <div aria-live="polite" class="sgc-sr-only">${announcement}</div>
    <ul class="sgc-filters-editor__list" ref=${listRef}>
      ${rows.map((row, index) => html`
        <li \
          class="sgc-filters-editor__row ${row.attributeId === draggedId ? 'is-dragging' : ''}" \
          key=${row.attributeId} \
          ref=${(node) => setItemRef(row.attributeId, node)} \
        >
          <button \
            type="button" \
            class="sgc-filters-editor__handle" \
            aria-label="Reorder ${row.displayName}. Position ${index + 1} of ${rows.length}. Drag, or press arrow up/down." \
            onPointerDown=${(e) => handlePointerDown(e, row.attributeId)} \
            onKeyDown=${(e) => handleKeyDown(e, index)} \
          >
            <${DragHandleIcon} />
          </button>
          <label class="sgc-filters-editor__enable">
            <input
              type="checkbox"
              checked=${row.enabled}
              onChange=${(e) => updateRow(row.attributeId, { enabled: e.target.checked })}
            />
          </label>
          <input
            type="text"
            class="sgc-field sgc-filters-editor__name-input"
            value=${row.displayName}
            onInput=${(e) => updateRow(row.attributeId, { displayName: e.target.value })}
          />
        </li>
      `)}
    </ul>
  `;
}
