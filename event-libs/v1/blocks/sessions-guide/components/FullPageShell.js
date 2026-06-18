import { html, useEffect, useState } from '../../../deps/htm-preact.js';
import { useSessionGuide } from '../store/index.js';
import { DrawerHeader } from './DrawerHeader.js';
import { ViewRouter } from './ViewRouter.js';
import { FilterPanel } from './FilterPanel.js';

export function FullPageShell() {
  const { state, dispatch } = useSessionGuide();
  const { sessionsStatus, activeView, activeFilters, searchQuery } = state;
  const [filterOpen, setFilterOpen] = useState(false);

  // On mount: read URL params and populate store
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const view = params.get('view');
    const search = params.get('search');
    const filterParam = params.get('filter');

    if (view) dispatch({ type: 'SET_VIEW', view });
    if (search) dispatch({ type: 'SET_SEARCH', query: search });
    if (filterParam) {
      const filters = {};
      filterParam.split(',').forEach((pair) => {
        const colonIdx = pair.indexOf(':');
        if (colonIdx < 0) return;
        const cat = pair.slice(0, colonIdx);
        const val = pair.slice(colonIdx + 1);
        if (cat && val) {
          if (!filters[cat]) filters[cat] = new Set();
          filters[cat].add(val);
        }
      });
      dispatch({ type: 'SET_FILTERS', filters });
    }
  }, []);

  // Sync state → URL (replaceState — no new history entry per interaction)
  useEffect(() => {
    const params = new URLSearchParams();
    if (activeView && activeView !== 'live-upcoming') params.set('view', activeView);
    if (searchQuery) params.set('search', searchQuery);

    const filterPairs = [];
    Object.entries(activeFilters).forEach(([cat, valSet]) => {
      if (valSet instanceof Set) valSet.forEach((v) => filterPairs.push(`${cat}:${v}`));
    });
    if (filterPairs.length > 0) params.set('filter', filterPairs.join(','));

    const qs = params.toString();
    const url = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
    history.replaceState({}, '', url);
  }, [activeView, activeFilters, searchQuery]);

  function noop() {}

  return html`
    <div class="sg-full-page">
      <div class="sg-full-page__header-wrap">
        <${DrawerHeader} onClose=${noop} onFilterToggle=${() => setFilterOpen((o) => !o)} filterOpen=${filterOpen} hideClose=${true} />
      </div>
      <div class="sg-full-page__body">
        ${sessionsStatus === 'loading' && html`<div class="sg-loading">Loading sessions…</div>`}
        ${sessionsStatus === 'error' && html`<div class="sg-error">Failed to load sessions.</div>`}
        ${sessionsStatus === 'ready' && html`<${ViewRouter} />`}
      </div>
      ${filterOpen && html`<${FilterPanel} onClose=${() => setFilterOpen(false)} />`}
    </div>
  `;
}
