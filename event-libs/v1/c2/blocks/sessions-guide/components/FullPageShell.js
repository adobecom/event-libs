import { html, useEffect, useState } from '../../../../deps/htm-preact.js';
import { useSessionGuide } from '../store/index.js';
import { sessionsStatus } from '../../../../utils/session-store.js';
import { DrawerHeader } from './DrawerHeader.js';
import { ViewRouter } from './ViewRouter.js';
import { LoadingState, sessionsStatusMessage } from './LoadingState.js';

// filterCategories: [{ id, label, slug }] (see parse-config.js). `id` (attributeId) is what
// activeFilters/session data key on; `slug` is the readable ?filter= key. A slug/id with no
// match (a stale or renamed category) is dropped rather than erroring or leaking a raw
// attributeId into the URL.
export function categoryIdForSlug(filterCategories, slug) {
  return filterCategories?.find((c) => c.slug === slug)?.id || null;
}

export function categorySlugForId(filterCategories, id) {
  return filterCategories?.find((c) => c.id === id)?.slug || null;
}

export function FullPageShell() {
  const { state, dispatch } = useSessionGuide();
  const { activeView, activeFilters, searchQuery, guideConfig } = state;
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
        const slug = pair.slice(0, colonIdx);
        const val = pair.slice(colonIdx + 1);
        const cat = categoryIdForSlug(guideConfig.filterCategories, slug);
        if (cat && val) {
          if (!filters[cat]) filters[cat] = new Set();
          filters[cat].add(val);
        }
      });
      dispatch({ type: 'SET_FILTERS', filters });
    }
  }, []);

  // Sync state → URL (replaceState — no new history entry per interaction).
  // Start from the current search string so unrelated params (milolibs, eccEnv, etc.)
  // are preserved; only manage the three params this component owns.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    if (activeView && activeView !== 'live-upcoming') {
      params.set('view', activeView);
    } else {
      params.delete('view');
    }

    if (searchQuery) {
      params.set('search', searchQuery);
    } else {
      params.delete('search');
    }

    const filterPairs = [];
    Object.entries(activeFilters).forEach(([cat, valSet]) => {
      if (!(valSet instanceof Set)) return;
      const slug = categorySlugForId(guideConfig.filterCategories, cat);
      if (!slug) return;
      valSet.forEach((v) => filterPairs.push(`${slug}:${v}`));
    });
    if (filterPairs.length > 0) {
      params.set('filter', filterPairs.join(','));
    } else {
      params.delete('filter');
    }

    const qs = params.toString();
    const url = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
    history.replaceState({}, '', url);
  }, [activeView, activeFilters, searchQuery]);

  function noop() {}

  return html`
    <div class="sg-full-page">
      <div class="sg-full-page__header-wrap">
        <${DrawerHeader}
          onClose=${noop}
          onFilterToggle=${() => setFilterOpen((o) => !o)}
          onFilterClose=${() => setFilterOpen(false)}
          filterOpen=${filterOpen}
          hideClose=${true}
        />
      </div>
      <div class="sg-full-page__body" aria-busy=${String(sessionsStatus.value === 'loading')}>
        <div class="sg-sr-only" role="status" aria-live="polite">${sessionsStatusMessage(sessionsStatus.value)}</div>
        ${sessionsStatus.value === 'loading' && html`<${LoadingState} />`}
        ${sessionsStatus.value === 'error' && html`<div class="sg-error" role="alert">Failed to load sessions.</div>`}
        ${sessionsStatus.value === 'ready' && html`<${ViewRouter} />`}
      </div>
    </div>
  `;
}
