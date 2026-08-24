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

// Mobile is a two-screen drill-down (Figma 11519-32674 / 11519-32675): a list of categories,
// then the chosen category's options. Tablet and desktop show both columns at once, so a
// category is always selected there. Tracked reactively rather than read once, so resizing
// across the breakpoint lands on a coherent screen.
const MOBILE_QUERY = '(max-width: 767px)';
const matchesMobile = () => !!window.matchMedia?.(MOBILE_QUERY).matches;

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(matchesMobile);
  useEffect(() => {
    const mq = window.matchMedia?.(MOBILE_QUERY);
    if (!mq) return undefined;
    const onChange = (e) => setIsMobile(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return isMobile;
}

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

  const firstCategoryId = filterCategories?.length ? filterCategories[0].id : null;
  const isMobile = useIsMobile();
  const [activeCategory, setActiveCategory] = useState(
    () => (matchesMobile() ? null : firstCategoryId),
  );

  // Crossing up out of mobile with nothing selected would strand the options column empty —
  // the wider layouts always render both columns.
  useEffect(() => {
    if (!isMobile && activeCategory === null) setActiveCategory(firstCategoryId);
  }, [isMobile]);

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

  // The product category's id is the Product attribute's own id, event-wide — so the first
  // session carrying it answers for the whole catalog.
  const productCategoryId = useComputed(
    () => sessions.value.find((s) => s.productAttributeId)?.productAttributeId || null,
  ).value;

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

  // On mobile the options are their own screen, reached by drilling into a category.
  const drilledIn = isMobile && activeCategory !== null;

  // Product icons belong to the product category alone: `Illustrator` is both a product and an
  // Audience job role, so matching against the products map isn't enough on its own.
  const showProductIcons = activeCategory !== null && activeCategory === productCategoryId;

  const optionsList = html`
    <div class="sg-filter-panel__options" id="sg-filter-panel-options" role="group" aria-label=${activeLabel}>
      ${currentOptions.map((opt) => {
    // An unmapped product stays text-only — same graceful fallback as getTrackIcon().
    const isSelected = currentSet.has(opt);
    const productIcon = showProductIcons ? getProduct(opt)?.icon : null;
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
  `;

  // data-lenis-prevent: the panel's option list scrolls itself, and on the full-page surface
  // it sits outside the drawer that otherwise fends Lenis off (see DrawerShell.js).
  // ── Mobile screen 2: one category's options, with a back affordance and Save ──
  if (drilledIn) {
    return html`
      <div
        class="sg-filter-panel sg-filter-panel--drilled"
        ref=${panelRef}
        data-lenis-prevent
        role="dialog"
        aria-modal=${isTakeover() ? 'true' : undefined}
        aria-labelledby="sg-filter-panel-title"
      >
        <div class="sg-filter-panel__drill-header">
          <button
            class="sg-filter-panel__back"
            onclick=${() => setActiveCategory(null)}
            type="button"
            aria-label="Back to filter categories"
          ><span class="sg-filter-panel__back-icon" aria-hidden="true"></span></button>
          <h3 class="sg-filter-panel__drill-title" id="sg-filter-panel-title">${activeLabel}</h3>
        </div>
        ${optionsList}
        <div class="sg-filter-panel__actions sg-filter-panel__actions--drill">
          <button
            class="sg-filter-panel__reset sg-filter-panel__save"
            onclick=${() => setActiveCategory(null)}
            daa-ll="Filter-Save-Category"
            type="button"
          >Save</button>
        </div>
      </div>
    `;
  }

  // ── Mobile screen 1 (category list) and the tablet/desktop two-column layout ──
  return html`
    <div
      class="sg-filter-panel"
      ref=${panelRef}
      data-lenis-prevent
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
                    aria-controls=${isMobile ? undefined : 'sg-filter-panel-options'}
                    aria-expanded=${isMobile ? 'false' : undefined}
                    type="button"
                  >
                    <span class="sg-filter-panel__cat-label">
                      ${label}
                      ${catCount > 0 && html`<span class="sg-filter-panel__cat-badge">${catCount}</span><span class="sg-sr-only"> ${catCount} selected</span>`}
                    </span>
                    <span class="sg-filter-panel__cat-chevron" aria-hidden="true"></span>
                  </button>
                </li>
              `;
  })}
          </ul>
        </div>
        ${!isMobile && optionsList}
        <div class="sg-filter-panel__actions">
          <button class="sg-filter-panel__apply" onclick=${apply} daa-ll="Filter-Apply" type="button">Apply</button>
          <button class="sg-filter-panel__reset" onclick=${reset} daa-ll="Filter-Reset-All" type="button">Reset all</button>
        </div>
      </div>
    </div>
  `;
}
