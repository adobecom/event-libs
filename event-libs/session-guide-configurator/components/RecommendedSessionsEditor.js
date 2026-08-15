import {
  useState, useMemo, useCallback, useRef, useLayoutEffect, useEffect, html,
} from '../../v1/deps/htm-preact.js';
import { getSessionTrack } from '../../v1/services/sessions/sessions-api.js';
import { formatSessionTime } from '../utils.js';
import SearchInput from './SearchInput.js';

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

// Pointer-based drag reorder — same as Tier 1's FeaturedSessionsEditor.js, minus
// meta-field overrides (Session Guide already has full session data itself). Tracks
// pointermove/up on window rather than pointer capture, which doesn't survive the
// handle's DOM node moving mid-drag.
export default function RecommendedSessionsEditor({
  sessions, sessionTimes, tracks, recommendedSessions, onChange,
}) {
  const [search, setSearch] = useState('');
  const [trackFilter, setTrackFilter] = useState('');
  const [draggedId, setDraggedId] = useState(null);
  const [announcement, setAnnouncement] = useState('');

  const sessionsById = useMemo(() => {
    const map = new Map();
    (sessions || []).forEach((s) => map.set(s.sessionId, s));
    return map;
  }, [sessions]);

  // A session can have more than one sessionTime (e.g. live + on-demand) — use the earliest.
  const earliestTimeBySessionId = useMemo(() => {
    const map = new Map();
    (sessionTimes || []).forEach((time) => {
      const existing = map.get(time.sessionId);
      if (!existing || time.startTimeMillis < existing.startTimeMillis) {
        map.set(time.sessionId, time);
      }
    });
    return map;
  }, [sessionTimes]);

  const getSessionMeta = useCallback((session) => {
    const track = getSessionTrack(session) || '—';
    const time = formatSessionTime(earliestTimeBySessionId.get(session.sessionId));
    return time ? `${track} · ${time}` : track;
  }, [earliestTimeBySessionId]);

  const getTitleFor = useCallback(
    (sessionId) => sessionsById.get(sessionId)?.enTitle || sessionId,
    [sessionsById],
  );

  // Memoized so the FLIP effect's prevOrder !== recommendedIds check reflects a real
  // order change, not a fresh [] recreated whenever recommendedSessions is falsy.
  const recommendedIds = useMemo(() => recommendedSessions || [], [recommendedSessions]);
  const recommendedSet = useMemo(() => new Set(recommendedIds), [recommendedIds]);

  // Full client-side filter over the already-fetched catalog — no second
  // /session-facets call, no pagination.
  const availableSessions = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (sessions || []).filter((session) => {
      if (recommendedSet.has(session.sessionId)) return false;
      if (trackFilter && getSessionTrack(session) !== trackFilter) return false;
      if (!term) return true;
      const title = (session.enTitle || '').toLowerCase();
      return title.includes(term) || (session.sessionId || '').toLowerCase().includes(term);
    });
  }, [sessions, search, trackFilter, recommendedSet]);

  const handleAdd = useCallback((sessionId) => {
    onChange([...recommendedIds, sessionId]);
  }, [recommendedIds, onChange]);

  const handleRemove = useCallback((sessionId) => {
    onChange(recommendedIds.filter((id) => id !== sessionId));
  }, [recommendedIds, onChange]);

  const handleMove = useCallback((index, direction) => {
    const target = index + direction;
    if (target < 0 || target >= recommendedIds.length) return;
    const next = [...recommendedIds];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
    setAnnouncement(`Moved "${getTitleFor(next[target])}" to position ${target + 1} of ${next.length}`);
  }, [recommendedIds, onChange, getTitleFor]);

  const handleKeyDown = useCallback((e, index) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      handleMove(index, -1);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      handleMove(index, 1);
    }
  }, [handleMove]);

  // Refs, not state — pointermove reads/writes these without re-rendering per pixel.
  const listRef = useRef(null);
  const itemRefs = useRef(new Map());
  const dragInfo = useRef(null); // { sessionId, startClientY, startIndex, rowHeight }
  const orderRef = useRef(recommendedIds);
  orderRef.current = recommendedIds;

  const setItemRef = useCallback((sessionId, node) => {
    if (node) itemRefs.current.set(sessionId, node);
    else itemRefs.current.delete(sessionId);
  }, []);

  const measureRowHeight = useCallback(() => {
    const [firstNode] = itemRefs.current.values();
    if (!firstNode || !listRef.current) return 0;
    const rect = firstNode.getBoundingClientRect();
    const styles = window.getComputedStyle(listRef.current);
    const gap = parseFloat(styles.rowGap || styles.gap || '0') || 0;
    return rect.height + gap;
  }, []);

  // Latest-ref pattern: stableMove/stableEnd never change identity, so a listener added
  // at drag-start stays removable later even if the handlers do.
  const handlePointerMoveRef = useRef(() => {});
  const endDragRef = useRef(() => {});
  const stableMove = useRef((e) => handlePointerMoveRef.current(e)).current;
  const stableEnd = useRef((e) => endDragRef.current(e)).current;

  const handlePointerDown = useCallback((e, sessionId) => {
    if (e.button !== undefined && e.button !== 0) return;
    const rowHeight = measureRowHeight();
    const startIndex = orderRef.current.indexOf(sessionId);
    if (!rowHeight || startIndex === -1) return;
    dragInfo.current = {
      sessionId, startClientY: e.clientY, startIndex, rowHeight,
    };
    setDraggedId(sessionId);
    window.addEventListener('pointermove', stableMove);
    window.addEventListener('pointerup', stableEnd);
    window.addEventListener('pointercancel', stableEnd);
  }, [measureRowHeight, stableMove, stableEnd]);

  handlePointerMoveRef.current = (e) => {
    const info = dragInfo.current;
    if (!info) return;
    const deltaY = e.clientY - info.startClientY;
    const order = orderRef.current;
    const currentIndex = order.indexOf(info.sessionId);
    if (currentIndex === -1) return;
    const rawTarget = info.startIndex + Math.round(deltaY / info.rowHeight);
    const targetIndex = Math.min(Math.max(rawTarget, 0), order.length - 1);

    if (targetIndex !== currentIndex) {
      const next = [...order];
      next.splice(currentIndex, 1);
      next.splice(targetIndex, 0, info.sessionId);
      orderRef.current = next;
      onChange(next);
    }

    const draggedNode = itemRefs.current.get(info.sessionId);
    if (draggedNode) {
      // Layout already covers whole-slot shifts from the reorder above; this only
      // supplies the remaining sub-slot distance.
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
    const node = itemRefs.current.get(info.sessionId);
    if (node) {
      node.style.transition = 'transform 0.15s ease';
      node.style.transform = '';
      setTimeout(() => { if (node) node.style.transition = ''; }, 160);
    }
    const finalIndex = orderRef.current.indexOf(info.sessionId);
    if (finalIndex !== info.startIndex) {
      setAnnouncement(`Moved "${getTitleFor(info.sessionId)}" to position ${finalIndex + 1} of ${orderRef.current.length}`);
    }
    dragInfo.current = null;
    setDraggedId(null);
  };

  // Safety net: don't leave window listeners registered if unmounted mid-drag.
  useEffect(() => () => {
    window.removeEventListener('pointermove', stableMove);
    window.removeEventListener('pointerup', stableEnd);
    window.removeEventListener('pointercancel', stableEnd);
  }, [stableMove, stableEnd]);

  // FLIP-lite: when the order changes, animate every row except the one being dragged
  // (already positioned above) from its old slot to its new one.
  const prevOrderRef = useRef(recommendedIds);
  useLayoutEffect(() => {
    const prevOrder = prevOrderRef.current;
    if (prevOrder !== recommendedIds) {
      const rowHeight = measureRowHeight();
      if (rowHeight) {
        // Two passes (write all "from", one reflow, write all "to") to avoid layout
        // thrashing from interleaving reads/writes per row.
        const movedNodes = [];
        prevOrder.forEach((sessionId) => {
          if (sessionId === dragInfo.current?.sessionId) return;
          const oldIndex = prevOrder.indexOf(sessionId);
          const newIndex = recommendedIds.indexOf(sessionId);
          if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return;
          const node = itemRefs.current.get(sessionId);
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
    prevOrderRef.current = recommendedIds;
  }, [recommendedIds, measureRowHeight]);

  return html`
    <div class="sgc-recommended-editor">
      <div class="sgc-recommended-editor__column">
        <h3>Recommended (display order)</h3>
        ${recommendedIds.length === 0 && html`<p class="sgc-recommended-editor__empty">No sessions added yet — add some from the list on the right.</p>`}
        <div aria-live="polite" class="sgc-sr-only">${announcement}</div>
        <ul class="sgc-recommended-editor__list" ref=${listRef}>
          ${recommendedIds.map((sessionId, index) => {
            const session = sessionsById.get(sessionId);
            const title = session?.enTitle || sessionId;
            return html`
              <li
                class="sgc-recommended-editor__row ${sessionId === draggedId ? 'is-dragging' : ''}"
                key=${sessionId}
                ref=${(node) => setItemRef(sessionId, node)}
              >
                <button
                  type="button"
                  class="sgc-recommended-editor__handle"
                  aria-label="Reorder ${title}. Position ${index + 1} of ${recommendedIds.length}. Drag, or press arrow up/down."
                  onPointerDown=${(e) => handlePointerDown(e, sessionId)}
                  onKeyDown=${(e) => handleKeyDown(e, index)}
                >
                  <${DragHandleIcon} />
                </button>
                <div class="sgc-recommended-editor__info">
                  <span class="sgc-recommended-editor__title">${title}</span>
                  <span class="sgc-recommended-editor__track">${session ? getSessionMeta(session) : 'Not found in current session catalog'}</span>
                </div>
                <button type="button" class="sgc-btn sgc-btn--quiet sgc-btn--s sgc-btn--danger" onClick=${() => handleRemove(sessionId)}>Remove</button>
              </li>
            `;
          })}
        </ul>
      </div>

      <div class="sgc-recommended-editor__column">
        <h3>Available sessions</h3>
        <div class="sgc-recommended-editor__controls">
          <${SearchInput}
            id="sgc-recommended-search"
            placeholder="Search by title"
            value=${search}
            onInput=${(e) => setSearch(e.target.value)}
            className="sgc-recommended-editor__search"
          />
          <select
            class="sgc-field sgc-recommended-editor__track-filter"
            value=${trackFilter}
            onChange=${(e) => setTrackFilter(e.target.value)}
          >
            <option value="">All tracks</option>
            ${(tracks || []).map((t) => html`<option value=${t} key=${t}>${t}</option>`)}
          </select>
        </div>
        <ul class="sgc-recommended-editor__list">
          ${availableSessions.map((session) => html`
            <li class="sgc-recommended-editor__row" key=${session.sessionId}>
              <div class="sgc-recommended-editor__info">
                <span class="sgc-recommended-editor__title">${session.enTitle || session.sessionId}</span>
                <span class="sgc-recommended-editor__track">${getSessionMeta(session)}</span>
              </div>
              <button type="button" class="sgc-btn sgc-btn--quiet sgc-btn--s" onClick=${() => handleAdd(session.sessionId)}>Add</button>
            </li>
          `)}
          ${availableSessions.length === 0 && html`<li class="sgc-recommended-editor__empty">No sessions match.</li>`}
        </ul>
      </div>
    </div>
  `;
}
