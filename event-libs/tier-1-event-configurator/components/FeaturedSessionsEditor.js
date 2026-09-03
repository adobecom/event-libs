import {
  useState, useMemo, useCallback, useRef, useLayoutEffect, useEffect, html,
} from '../../v1/deps/htm-preact.js';
import { getSessionPrimaryTrack, formatSessionTime } from '../utils.js';
import { WATCH_DESTINATION_OPTIONS } from '../constants.js';
import SearchInput from './SearchInput.js';
import ImagePickerModal from './ImagePickerModal.js';

function ReplaceIcon() {
  return html`
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
      <path d="M2 8a6 6 0 0 1 10.24-4.24M14 8a6 6 0 0 1-10.24 4.24" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" />
      <path d="M12 1.5v3h-3M4 14.5v-3h3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  `;
}

function CloseIcon() {
  return html`
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
      <path d="M3 3l10 10M13 3 3 13" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" />
    </svg>
  `;
}

function TrashIcon() {
  return html`
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
      <path d="M2.5 4h11M6 4V2.5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1V4M6.5 7.5v4M9.5 7.5v4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" />
      <path d="M3.5 4l.6 9a1 1 0 0 0 1 .9h5.8a1 1 0 0 0 1-.9l.6-9" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  `;
}

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

// Pointer-based drag reorder. Each handle also responds to ArrowUp/ArrowDown
// when focused, since native drag isn't keyboard-operable.
//
// Tracks pointermove/up on window, not via setPointerCapture on the handle —
// capture doesn't survive the handle's DOM node moving mid-drag (which
// happens every reorder swap), so it was ending drags after one swap.
//
// Assumes every row is the same height: the dragged row's target slot is
// arithmetic on the pointer delta, and other rows FLIP-animate into place.
// Every possible per-session override field this editor knows how to render —
// callers pick a subset via `metaFields` (below) to match what their own
// consuming block actually reads, rather than always showing both.
const META_FIELD_DEFS = {
  mrStreamId: { label: 'Mobile Rider stream ID', placeholder: 'Mobile Rider stream ID (optional)' },
  // type: 'image' additionally gets a thumbnail + "Upload…" button (see the meta-fields
  // render below) — the text input still works standalone for pasting an already-uploaded
  // or externally hosted URL directly, no upload required.
  imageUrl: { label: 'Image', placeholder: 'Image URL (optional)', type: 'image' },
  watchDestination: { label: 'Watch destination', type: 'radio', options: WATCH_DESTINATION_OPTIONS },
  homepageAnchorId: { label: 'Homepage anchor ID', placeholder: 'e.g. live-marquee' },
};

export default function FeaturedSessionsEditor({
  sessions, sessionTimes, tracks, featuredSessions, onChange,
  heading = 'Featured (display order)', emptyHint = 'No sessions featured yet — add some from the list on the right.',
  // Optional per-session overrides — neither field has a source in the ESP
  // session catalog (see MOBILE-RIDER-STREAM-ID-GAP.md), so when a caller
  // needs one in its output JSON, it's authored here by hand instead.
  // `metaFields` (e.g. ['mrStreamId']) picks which of META_FIELD_DEFS to
  // show — only the ones the caller's own block actually reads. Omitted
  // entirely (along with onMetaChange) for callers that don't need any.
  meta, onMetaChange, metaFields = [],
}) {
  const [search, setSearch] = useState('');
  const [trackFilter, setTrackFilter] = useState('');
  const [draggedId, setDraggedId] = useState(null);
  const [announcement, setAnnouncement] = useState('');
  // Which row's image-upload modal is open — one shared modal instance rather than one per
  // row, since at most one can be open at a time.
  const [imagePickerFor, setImagePickerFor] = useState(null);

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
    const track = getSessionPrimaryTrack(session) || '—';
    const time = formatSessionTime(earliestTimeBySessionId.get(session.sessionId));
    return time ? `${track} · ${time}` : track;
  }, [earliestTimeBySessionId]);

  const getTitleFor = useCallback(
    (sessionId) => sessionsById.get(sessionId)?.enTitle || sessionId,
    [sessionsById],
  );

  // Memoized so the FLIP effect's prevOrder !== featuredIds check reflects a
  // real order change, not a fresh [] recreated whenever featuredSessions is falsy.
  const featuredIds = useMemo(() => featuredSessions || [], [featuredSessions]);
  const featuredSet = useMemo(() => new Set(featuredIds), [featuredIds]);

  // Full client-side filter over the already-fetched catalog — no second
  // /session-facets call, no pagination.
  const availableSessions = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (sessions || []).filter((session) => {
      if (featuredSet.has(session.sessionId)) return false;
      if (trackFilter && getSessionPrimaryTrack(session) !== trackFilter) return false;
      if (!term) return true;
      const title = (session.enTitle || '').toLowerCase();
      return title.includes(term) || (session.sessionId || '').toLowerCase().includes(term);
    });
  }, [sessions, search, trackFilter, featuredSet]);

  const handleAdd = useCallback((sessionId) => {
    onChange([...featuredIds, sessionId]);
  }, [featuredIds, onChange]);

  const handleRemove = useCallback((sessionId) => {
    onChange(featuredIds.filter((id) => id !== sessionId));
  }, [featuredIds, onChange]);

  const handleMove = useCallback((index, direction) => {
    const target = index + direction;
    if (target < 0 || target >= featuredIds.length) return;
    const next = [...featuredIds];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
    setAnnouncement(`Moved "${getTitleFor(next[target])}" to position ${target + 1} of ${next.length}`);
  }, [featuredIds, onChange, getTitleFor]);

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
  const orderRef = useRef(featuredIds);
  orderRef.current = featuredIds;

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

  // Latest-ref pattern: stableMove/stableEnd never change identity, so a
  // listener added at drag-start stays removable later even if the handlers do.
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
      // Layout already covers whole-slot shifts from the reorder above; this
      // only supplies the remaining sub-slot distance.
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

  // FLIP-lite: when the order changes, animate every row except the one
  // being dragged (already positioned above) from its old slot to its new one.
  const prevOrderRef = useRef(featuredIds);
  useLayoutEffect(() => {
    const prevOrder = prevOrderRef.current;
    if (prevOrder !== featuredIds) {
      const rowHeight = measureRowHeight();
      if (rowHeight) {
        // Two passes (write all "from", one reflow, write all "to") to avoid
        // layout thrashing from interleaving reads/writes per row.
        const movedNodes = [];
        prevOrder.forEach((sessionId) => {
          if (sessionId === dragInfo.current?.sessionId) return;
          const oldIndex = prevOrder.indexOf(sessionId);
          const newIndex = featuredIds.indexOf(sessionId);
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
    prevOrderRef.current = featuredIds;
  }, [featuredIds, measureRowHeight]);

  const renderMetaField = (field, sessionId, title) => {
    const value = meta?.[sessionId]?.[field] || '';
    const isImage = META_FIELD_DEFS[field].type === 'image';
    const isRadio = META_FIELD_DEFS[field].type === 'radio';

    if (isRadio) {
      return html`
        <fieldset key=${field} class="tec-featured-editor__meta-field tec-featured-editor__meta-field--radio">
          <legend class="tec-sr-only">${META_FIELD_DEFS[field].label} for ${title}</legend>
          ${META_FIELD_DEFS[field].options.map((opt) => html`
            <label key=${opt.value}>
              <input \
                type="radio" \
                name="tec-${field}-${sessionId}" \
                value=${opt.value} \
                checked=${value === opt.value} \
                onChange=${() => onMetaChange(sessionId, { [field]: opt.value })} \
              />
              ${opt.label}
            </label>
          `)}
        </fieldset>
      `;
    }

    return html`
      <div key=${field} class="tec-featured-editor__meta-field">
        ${isImage && value && html`<img class="tec-featured-editor__thumb" src=${value} alt="" />`}
        <input \
          type="text" \
          class="tec-field tec-field--s" \
          placeholder=${META_FIELD_DEFS[field].placeholder} \
          aria-label="${META_FIELD_DEFS[field].label} for ${title}" \
          value=${value} \
          onInput=${(e) => onMetaChange(sessionId, { [field]: e.target.value })} \
        />
        ${isImage && !value && html`
          <button \
            type="button" \
            class="tec-btn tec-btn--outline tec-btn--s" \
            onClick=${() => setImagePickerFor(sessionId)} \
          >Add image…</button>
        `}
        ${isImage && value && html`
          <button \
            type="button" \
            class="tec-btn tec-btn--icon tec-btn--icon-s" \
            aria-label="Replace ${META_FIELD_DEFS[field].label} for ${title}" \
            onClick=${() => setImagePickerFor(sessionId)} \
          ><${ReplaceIcon} /></button>
          <button \
            type="button" \
            class="tec-btn tec-btn--icon tec-btn--icon-s tec-btn--danger" \
            aria-label="Remove ${META_FIELD_DEFS[field].label} for ${title}" \
            onClick=${() => onMetaChange(sessionId, { [field]: '' })} \
          ><${TrashIcon} /></button>
        `}
      </div>
    `;
  };

  return html`
    <div class="tec-featured-editor">
      <div class="tec-featured-editor__column">
        <h3>${heading}</h3>
        ${featuredIds.length === 0 && html`<p class="tec-featured-editor__empty">${emptyHint}</p>`}
        <div aria-live="polite" class="tec-sr-only">${announcement}</div>
        <ul class="tec-featured-editor__list" ref=${listRef}>
          ${featuredIds.map((sessionId, index) => {
            const session = sessionsById.get(sessionId);
            const title = session?.enTitle || sessionId;
            return html`
              <li \
                class="tec-featured-editor__row tec-featured-editor__row--selected ${sessionId === draggedId ? 'is-dragging' : ''}" \
                key=${sessionId} \
                ref=${(node) => setItemRef(sessionId, node)} \
              >
                <button \
                  type="button" \
                  class="tec-featured-editor__handle" \
                  aria-label="Reorder ${title}. Position ${index + 1} of ${featuredIds.length}. Drag, or press arrow up/down." \
                  onPointerDown=${(e) => handlePointerDown(e, sessionId)} \
                  onKeyDown=${(e) => handleKeyDown(e, index)} \
                >
                  <${DragHandleIcon} />
                </button>
                <div class="tec-featured-editor__info">
                  <span class="tec-featured-editor__title">${title}</span>
                  <span class="tec-featured-editor__track">${session ? getSessionMeta(session) : 'Not found in current session catalog'}</span>
                  ${onMetaChange && metaFields.length > 0 && html`
                    <div class="tec-featured-editor__meta-fields">
                      ${metaFields
                        .filter((field) => META_FIELD_DEFS[field].type !== 'image')
                        .filter((field) => field !== 'homepageAnchorId'
                          || meta?.[sessionId]?.watchDestination === 'homepage')
                        .map((field) => renderMetaField(field, sessionId, title))}
                    </div>
                    ${metaFields.some((field) => META_FIELD_DEFS[field].type === 'image') && html`
                      <div class="tec-featured-editor__meta-fields">
                        ${metaFields.filter((field) => META_FIELD_DEFS[field].type === 'image').map(
                          (field) => renderMetaField(field, sessionId, title),
                        )}
                      </div>
                    `}
                  `}
                </div>
                <button \
                  type="button" \
                  class="tec-btn tec-btn--icon tec-btn--icon-s tec-btn--danger tec-featured-editor__remove" \
                  aria-label="Remove ${title}" \
                  onClick=${() => handleRemove(sessionId)} \
                ><${CloseIcon} /></button>
              </li>
            `;
          })}
        </ul>
      </div>

      <div class="tec-featured-editor__column">
        <h3>Available sessions</h3>
        <div class="tec-featured-editor__controls">
          <${SearchInput} \
            id="tec-featured-search" \
            placeholder="Search by title" \
            value=${search} \
            onInput=${(e) => setSearch(e.target.value)} \
            className="tec-featured-editor__search" \
          />
          <select
            class="tec-field tec-featured-editor__track-filter"
            value=${trackFilter}
            onChange=${(e) => setTrackFilter(e.target.value)}
          >
            <option value="">All tracks</option>
            ${(tracks || []).map((t) => html`<option value=${t} key=${t}>${t}</option>`)}
          </select>
        </div>
        <ul class="tec-featured-editor__list">
          ${availableSessions.map((session) => html`
            <li class="tec-featured-editor__row" key=${session.sessionId}>
              <div class="tec-featured-editor__info">
                <span class="tec-featured-editor__title">${session.enTitle || session.sessionId}</span>
                <span class="tec-featured-editor__track">${getSessionMeta(session)}</span>
              </div>
              <button type="button" class="tec-btn tec-btn--quiet tec-btn--s" onClick=${() => handleAdd(session.sessionId)}>Add</button>
            </li>
          `)}
          ${availableSessions.length === 0 && html`<li class="tec-featured-editor__empty">No sessions match.</li>`}
        </ul>
      </div>

      <${ImagePickerModal} \
        isOpen=${!!imagePickerFor} \
        onClose=${() => setImagePickerFor(null)} \
        onUploaded=${(url) => { onMetaChange(imagePickerFor, { imageUrl: url }); setImagePickerFor(null); }} \
      />
    </div>
  `;
}
