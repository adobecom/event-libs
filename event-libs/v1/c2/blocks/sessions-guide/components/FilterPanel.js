import { html, useState, useComputed, useEffect, useRef } from '../../../../deps/htm-preact.js';
import { useSessionGuide } from '../store/index.js';
import { sessions } from '../../../../utils/session-store.js';
import { trapFocus } from '../utils/focus-trap.js';
import { getFilterValue } from '../utils/session-filters.js';
import { getProduct } from '../../../../utils/tier-1-event-config.js';
import { Icon } from '../../../../features/icons/Icon.js';
import { fetchFederalProductIcon } from '../../../../features/icons/federal-icons.js';
import { IconCheckmark } from './icons.js';

// Only the mobile/tablet takeover is modal; at desktop the panel is a click-away popover
// anchored to the filter button, so claiming aria-modal there would wrongly tell assistive
// tech the rest of the drawer is unavailable. Kept in sync with the 1280px CSS breakpoint.
const isTakeover = () => !window.matchMedia?.('(min-width: 1280px)').matches;

export function FilterPanel({ onClose }) {
  const { state, dispatch } = useSessionGuide();
  const panelRef = useRef(null);

  useEffect(() => trapFocus(panelRef.current, onClose), []);
  const { activeFilters, guideConfig } = state;
  const { filterCategories } = guideConfig;

  const [localFilters, setLocalFilters] = useState(() => {
    const init = {};
    if (filterCategories) {
      filterCategories.forEach(({ id }) => {
        init[id] = activeFilters[id] instanceof Set ? new Set(activeFilters[id]) : new Set();
      });
    }
    return init;
  });

  const [activeCategory, setActiveCategory] = useState(
    filterCategories && filterCategories.length > 0 ? filterCategories[0].id : null,
  );

  // Derive unique option values from sessions for each category — auto-tracks
  // `sessions.value` and only recomputes when it actually changes.
  const categoryOptions = useComputed(() => {
    const opts = {};
    if (!filterCategories) return opts;
    filterCategories.forEach(({ id }) => {
      const values = new Set();
      sessions.value.forEach((s) => {
        const v = getFilterValue(s, id);
        if (Array.isArray(v)) v.forEach((x) => x && values.add(x));
        else if (v) values.add(v);
      });
      opts[id] = [...values].sort();
    });
    return opts;
  }).value;

  // Count of active filters across all categories
  const totalActiveCount = Object.values(activeFilters).reduce(
    (sum, set) => sum + (set instanceof Set ? set.size : 0),
    0,
  );

  function toggleOption(categoryId, option) {
    setLocalFilters((prev) => {
      const prevSet = prev[categoryId] instanceof Set ? new Set(prev[categoryId]) : new Set();
      if (prevSet.has(option)) prevSet.delete(option);
      else prevSet.add(option);
      return { ...prev, [categoryId]: prevSet };
    });
  }

  function apply() {
    dispatch({ type: 'SET_FILTERS', filters: localFilters });
    onClose();
  }

  function reset() {
    const cleared = {};
    if (filterCategories) filterCategories.forEach(({ id }) => { cleared[id] = new Set(); });
    setLocalFilters(cleared);
    dispatch({ type: 'SET_FILTERS', filters: cleared });
  }

  if (!filterCategories || filterCategories.length === 0) return null;

  const currentOptions = activeCategory ? categoryOptions[activeCategory] || [] : [];
  const currentSet = localFilters[activeCategory] instanceof Set ? localFilters[activeCategory] : new Set();
  const activeLabel = filterCategories.find(({ id }) => id === activeCategory)?.label || 'Filter options';

  return html`
    <div
      class="sg-filter-panel"
      ref=${panelRef}
      role="dialog"
      aria-modal=${isTakeover() ? 'true' : undefined}
      aria-labelledby="sg-filter-panel-title"
    >
      <button class="sg-filter-panel__close" onclick=${onClose} type="button" aria-label="Close filter panel">✕</button>
      <div class="sg-filter-panel__body">
        <div class="sg-filter-panel__sidebar">
          <h3 class="sg-filter-panel__title" id="sg-filter-panel-title">
            Filters${totalActiveCount > 0 ? html` <span class="sg-filter-panel__active-count">${totalActiveCount}</span><span class="sg-sr-only"> filters active</span>` : ''}
          </h3>
          <ul class="sg-filter-panel__cats" role="list">
            ${filterCategories.map(({ id, label }) => {
    const catCount = localFilters[id]?.size || 0;
    return html`
                <li>
                  <button
                    class=${'sg-filter-panel__cat' + (activeCategory === id ? ' sg-filter-panel__cat--active' : '')}
                    onclick=${() => setActiveCategory(id)}
                    aria-pressed=${String(activeCategory === id)}
                    aria-controls="sg-filter-panel-options"
                    type="button"
                  >
                    ${label}
                    ${catCount > 0 && html`<span class="sg-filter-panel__cat-badge">${catCount}</span><span class="sg-sr-only"> ${catCount} selected</span>`}
                  </button>
                </li>
              `;
  })}
          </ul>
        </div>
        <div class="sg-filter-panel__options" id="sg-filter-panel-options" role="group" aria-label=${activeLabel}>
          ${currentOptions.map((opt) => {
    // Any option value that happens to be a real configured product (regardless of
    // which category it's in) gets its product icon — no need to special-case "is
    // this the Product category", same graceful-fallback pattern as getTrackIcon().
    const isSelected = currentSet.has(opt);
    const productIcon = getProduct(opt)?.icon;
    return html`
              <button
                type="button"
                class=${'sg-filter-pill' + (isSelected ? ' sg-filter-pill--selected' : '')}
                onclick=${() => toggleOption(activeCategory, opt)}
                aria-pressed=${String(isSelected)}
              >
                <span class="sg-filter-pill__content">
                  ${productIcon && html`<${Icon} name=${productIcon} size=${24} resolve=${fetchFederalProductIcon} className="sg-filter-pill__icon" />`}
                  <span class="sg-filter-pill__label">${opt}</span>
                </span>
                ${isSelected && html`<${IconCheckmark} />`}
              </button>
            `;
  })}
          ${currentOptions.length === 0 && html`<p class="sg-filter-panel__empty">No options available.</p>`}
        </div>
        <div class="sg-filter-panel__actions">
          <button class="sg-filter-panel__apply" onclick=${apply} daa-ll="Filter-Apply" type="button">Apply</button>
          <button class="sg-filter-panel__reset" onclick=${reset} daa-ll="Filter-Reset-All" type="button">Reset all</button>
        </div>
      </div>
    </div>
  `;
}
