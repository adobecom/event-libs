import { html, useState, useEffect, useRef } from '../../../deps/htm-preact.js';
import { useSessionGuide } from '../store/index.js';
import { DateTabs } from './DateTabs.js';
import { ViewDropdown } from './ViewDropdown.js';
import { DownloadButton } from './DownloadButton.js';

export function DrawerHeader({ onClose, onFilterToggle, filterOpen, hideClose }) {
  const { state, dispatch } = useSessionGuide();
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const mobileSearchRef = useRef(null);
  const { activeFilters, activeView } = state;
  const title = state.eventConfig.title || "See what's happening at MAX";

  const activeFilterCount = Object.values(activeFilters).reduce(
    (sum, set) => sum + (set instanceof Set ? set.size : 0),
    0,
  );

  useEffect(() => {
    if (!mobileSearchOpen) return undefined;
    function onKeyDown(e) {
      if (e.key === 'Escape') {
        setMobileSearchOpen(false);
        dispatch({ type: 'SET_SEARCH', query: '' });
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [mobileSearchOpen]);

  function openMobileSearch() {
    setMobileSearchOpen(true);
    requestAnimationFrame(() => mobileSearchRef.current?.focus());
  }

  function closeMobileSearch() {
    setMobileSearchOpen(false);
    dispatch({ type: 'SET_SEARCH', query: '' });
  }

  function onSearchInput(e) {
    dispatch({ type: 'SET_SEARCH', query: e.target.value });
  }

  return html`
    <header class="sg-header">
      ${!hideClose && html`
        <button class="sg-close-btn" onclick=${onClose} aria-label="Close sessions" type="button"></button>
      `}

      <div class="sg-header-title-row">
        <h2 class="sg-header-title">${title}</h2>
      </div>

      <div class=${`sg-header-controls${mobileSearchOpen ? ' sg-header-controls--search-active' : ''}`}>
        <${DateTabs} />
        <div class="sg-right-controls">
          ${activeView === 'my-sessions' && html`<${DownloadButton} />`}
          <${ViewDropdown} />
          <div class="sg-filter-wrap">
            <button
              class=${'sg-filter-btn' + (filterOpen ? ' sg-filter-btn--open' : '') + (activeFilterCount > 0 ? ' sg-filter-btn--active' : '')}
              onclick=${onFilterToggle}
              aria-label="Filter sessions"
              aria-haspopup="true"
              aria-expanded=${String(!!filterOpen)}
              type="button"
            >
              <span class="sg-filter-icon" aria-hidden="true"></span>
              <span class="sg-filter-btn-label">Filter</span>
              ${activeFilterCount > 0 && html`<span class="sg-filter-count-badge" aria-label="${activeFilterCount} active filters">${activeFilterCount}</span>`}
            </button>
            <button
              class=${`sg-search-btn${mobileSearchOpen ? ' active' : ''}`}
              onclick=${openMobileSearch}
              aria-label="Search sessions"
              type="button"
            >
              <span class="sg-search-icon" aria-hidden="true"></span>
            </button>
          </div>
        </div>
      </div>

      <div class=${`sg-mobile-search-row${mobileSearchOpen ? ' sg-mobile-search-row--open' : ''}`}>
        <div class="sg-mobile-search-wrap">
          <span class="sg-search-field-icon" aria-hidden="true"></span>
          <input
            class="sg-mobile-search-input"
            ref=${mobileSearchRef}
            type="search"
            placeholder="Search sessions..."
            autocomplete="off"
            spellcheck="false"
            value=${state.searchQuery}
            oninput=${onSearchInput}
          />
          <button
            class="sg-search-clear-btn"
            onclick=${closeMobileSearch}
            aria-label="Clear search"
            type="button"
          >✕</button>
        </div>
      </div>
    </header>
  `;
}
