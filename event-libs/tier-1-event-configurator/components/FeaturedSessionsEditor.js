import { useState, useMemo, useCallback } from '../../v1/deps/htm-preact.js';
import { html } from '../htm-wrapper.js';
import { getSessionTrack } from '../utils.js';
import SearchInput from './SearchInput.js';

// Simple up/down reordering rather than drag-and-drop (PLAN.md Phase 3) —
// this is an internal authoring tool with small featured lists, and native
// DnD adds real implementation/testing surface for a benefit authors get
// just as well from two buttons. Revisit only if authors actually complain.
export default function FeaturedSessionsEditor({
  sessions, tracks, featuredSessions, onChange,
}) {
  const [search, setSearch] = useState('');
  const [trackFilter, setTrackFilter] = useState('');

  const sessionsById = useMemo(() => {
    const map = new Map();
    (sessions || []).forEach((s) => map.set(s.sessionId, s));
    return map;
  }, [sessions]);

  const featuredIds = featuredSessions || [];
  const featuredSet = useMemo(() => new Set(featuredIds), [featuredIds]);

  // Full client-side filter over the already-fetched catalog — no second
  // /session-facets call and no pagination/virtualization, matching the
  // event size this picker actually needs to handle (see
  // ESP-SESSION-ENDPOINTS.md's open questions, resolved here).
  const availableSessions = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (sessions || []).filter((session) => {
      if (featuredSet.has(session.sessionId)) return false;
      if (trackFilter && getSessionTrack(session) !== trackFilter) return false;
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
  }, [featuredIds, onChange]);

  return html`
    <div class="tec-featured-editor">
      <div class="tec-featured-editor__column">
        <h3>Featured (display order)</h3>
        ${featuredIds.length === 0 && html`<p class="tec-featured-editor__empty">No sessions featured yet — add some from the list on the right.</p>`}
        <ul class="tec-featured-editor__list">
          ${featuredIds.map((sessionId, index) => {
            const session = sessionsById.get(sessionId);
            const track = session && getSessionTrack(session);
            return html`
              <li class="tec-featured-editor__row" key=${sessionId}>
                <div class="tec-featured-editor__reorder">
                  <button \
                    type="button" \
                    onClick=${() => handleMove(index, -1)} \
                    disabled=${index === 0 || undefined} \
                    aria-label="Move up" \
                  >↑</button>
                  <button \
                    type="button" \
                    onClick=${() => handleMove(index, 1)} \
                    disabled=${index === featuredIds.length - 1 || undefined} \
                    aria-label="Move down" \
                  >↓</button>
                </div>
                <div class="tec-featured-editor__info">
                  <span class="tec-featured-editor__title">${session?.enTitle || sessionId}</span>
                  <span class="tec-featured-editor__track">${track || (session ? '—' : 'Not found in current session catalog')}</span>
                </div>
                <sp-action-button quiet size="s" onClick=${() => handleRemove(sessionId)}>Remove</sp-action-button>
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
            class="tec-featured-editor__track-filter"
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
                <span class="tec-featured-editor__track">${getSessionTrack(session) || '—'}</span>
              </div>
              <sp-action-button quiet size="s" onClick=${() => handleAdd(session.sessionId)}>Add</sp-action-button>
            </li>
          `)}
          ${availableSessions.length === 0 && html`<li class="tec-featured-editor__empty">No sessions match.</li>`}
        </ul>
      </div>
    </div>
  `;
}
