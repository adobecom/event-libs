import {
  html, useState, useEffect, useRef,
} from '../../../../deps/htm-preact.js';
import { useSessionGuide } from '../store/index.js';
import { auth } from '../../../../utils/session-store.js';
import { isOutsideClick } from '../utils/outside-click.js';
import { useIsPostEvent } from '../utils/use-post-event.js';
import { DateTabs } from './DateTabs.js';
import { ViewDropdown } from './ViewDropdown.js';
import { DownloadButton } from './DownloadButton.js';
import { FilterPanel } from './FilterPanel.js';

// Single-brace {firstName} token (also accepts {{firstName}}), matched case-insensitively.
const NAME_WORDS = '(?:first[\\s_-]?name|user[\\s_-]?name|name)';
const NAME_TOKEN = `(?:\\{\\{\\s*${NAME_WORDS}\\s*\\}\\}|\\{\\s*${NAME_WORDS}\\s*\\})`;

export function interpolateHeading(heading, userFirstName) {
  if (!heading) return heading;
  if (userFirstName) return heading.replace(new RegExp(NAME_TOKEN, 'gi'), userFirstName);
  const stripped = heading.replace(new RegExp(`${NAME_TOKEN}[,:]?\\s*`, 'gi'), '').trim();
  if (!new RegExp(`^${NAME_TOKEN}`, 'i').test(heading.trim())) return stripped;
  return stripped.charAt(0).toUpperCase() + stripped.slice(1);
}

// headings has 4 variants keyed by auth state x event lifecycle; blank falls back to default.
export function resolveDrawerTitle(headings, { isLoggedIn, userFirstName, isPost }) {
  const loggedIn = !!(isLoggedIn && userFirstName);
  const key = `${loggedIn ? 'loggedIn' : 'loggedOut'}${isPost ? 'PostEvent' : ''}`;
  const defaultTitle = loggedIn ? `${userFirstName}, see what's happening` : "See what's happening at MAX";
  return interpolateHeading((headings || {})[key], userFirstName) || defaultTitle;
}

// Below 768px the filter button is icon-only, so this label is the only place the count shows.
export function filterButtonLabel(activeFilterCount) {
  return activeFilterCount > 0 ? `Filter sessions, ${activeFilterCount} active` : 'Filter sessions';
}

function isDesktopSearchLayout() {
  return window.matchMedia('(min-width: 1280px)').matches;
}

export function DrawerHeader({
  onClose, onFilterToggle, onFilterClose, filterOpen, hideClose, controlsInert,
}) {
  const { state, dispatch } = useSessionGuide();
  const [searchOpen, setSearchOpen] = useState(false);
  const mobileSearchRef = useRef(null);
  const mobileSearchToggleRef = useRef(null);
  const desktopSearchRef = useRef(null);
  const desktopSearchWrapRef = useRef(null);
  const desktopSearchToggleRef = useRef(null);
  const filterWrapRef = useRef(null);
  const { activeFilters, activeView } = state;
  const closeFilter = onFilterClose || (() => {});

  // Closes the filter popover on an outside click; mirrors ViewDropdown.
  useEffect(() => {
    if (!filterOpen) return undefined;
    function onClickOutside(e) {
      if (isOutsideClick(filterWrapRef.current, e.target)) closeFilter();
    }
    document.addEventListener('click', onClickOutside);
    return () => document.removeEventListener('click', onClickOutside);
  }, [filterOpen]);

  const isPost = useIsPostEvent();

  const title = resolveDrawerTitle(state.guideConfig.headings, {
    isLoggedIn: auth.value.isLoggedIn,
    userFirstName: auth.value.userFirstName,
    isPost,
  });

  const activeFilterCount = Object.values(activeFilters).reduce(
    (sum, set) => sum + (set instanceof Set ? set.size : 0),
    0,
  );

  function focusVisibleSearchInput() {
    (isDesktopSearchLayout() ? desktopSearchRef : mobileSearchRef).current?.focus();
  }

  function openSearch() {
    setSearchOpen(true);
    requestAnimationFrame(focusVisibleSearchInput);
  }

  function closeSearch() {
    setSearchOpen(false);
    dispatch({ type: 'SET_SEARCH', query: '' });
    // rAF: the desktop toggle button remounts only after searchOpen flips back to false.
    const toggleRef = isDesktopSearchLayout() ? desktopSearchToggleRef : mobileSearchToggleRef;
    requestAnimationFrame(() => toggleRef.current?.focus());
  }

  // Stops propagation: DrawerShell's trapFocus() closes the whole drawer on Escape otherwise.
  function onSearchEscape(e) {
    if (e.key !== 'Escape') return;
    e.stopPropagation();
    if (state.searchQuery) {
      dispatch({ type: 'SET_SEARCH', query: '' });
      return;
    }
    closeSearch();
  }

  // Desktop only: mobile/tablet is a full takeover, so a stray blur shouldn't discard typing.
  function onDesktopSearchBlur(e) {
    if (state.searchQuery) return;
    if (desktopSearchWrapRef.current?.contains(e.relatedTarget)) return;
    setSearchOpen(false);
  }

  function onSearchInput(e) {
    dispatch({ type: 'SET_SEARCH', query: e.target.value });
  }

  return html`
    <header class="sg-header">
      ${!hideClose && html`
        <button class="sg-close-btn" onclick=${onClose} aria-label="Close sessions" daa-ll="Session-Guide-Close" type="button"></button>
      `}

      <div class="sg-header-title-row">
        <h2 class="sg-header-title">${title}</h2>
      </div>

      <div class="sg-header-controls-collapse" inert=${controlsInert ? true : undefined}>
        <div class="sg-header-controls-collapse-inner">
          <div class=${`sg-header-controls${searchOpen ? ' sg-header-controls--search-active' : ''}`}>
            <${DateTabs} />
            <div class="sg-right-controls">
              ${activeView === 'my-sessions' && html`<${DownloadButton} />`}
              <${ViewDropdown} />
              <div class="sg-filter-wrap" ref=${filterWrapRef}>
                <button
                  class=${'sg-filter-btn' + (filterOpen ? ' sg-filter-btn--open' : '') + (activeFilterCount > 0 ? ' sg-filter-btn--active' : '')}
                  onclick=${onFilterToggle}
                  aria-label=${filterButtonLabel(activeFilterCount)}
                  aria-haspopup="dialog"
                  aria-expanded=${String(!!filterOpen)}
                  aria-controls=${filterOpen ? 'sg-filter-panel-options' : undefined}
                  daa-ll="Filter-Open"
                  type="button"
                >
                  <span class="sg-filter-icon" aria-hidden="true"></span>
                  <span class="sg-filter-btn-label">Filter</span>
                  ${activeFilterCount > 0 && html`<span class="sg-filter-count-badge" aria-hidden="true">${activeFilterCount}</span>`}
                </button>

                <button
                  ref=${mobileSearchToggleRef}
                  class=${`sg-search-btn${searchOpen ? ' active' : ''}`}
                  onclick=${openSearch}
                  aria-label="Search sessions"
                  aria-expanded=${String(searchOpen)}
                  type="button"
                >
                  <span class="sg-search-icon" aria-hidden="true"></span>
                </button>

                <div
                  class=${`sg-search-inline${searchOpen ? ' sg-search-inline--open' : ''}`}
                  ref=${desktopSearchWrapRef}
                  onclick=${() => { if (searchOpen) desktopSearchRef.current?.focus(); }}
                >
                  ${searchOpen
    ? html`<span class="sg-search-inline__icon" aria-hidden="true"><span class="sg-search-icon" aria-hidden="true"></span></span>`
    : html`<button
                      ref=${desktopSearchToggleRef}
                      class="sg-search-inline__icon-btn"
                      onclick=${openSearch}
                      aria-label="Search sessions"
                      aria-expanded="false"
                      aria-controls="sg-search-inline-input"
                      type="button"
                    ><span class="sg-search-icon" aria-hidden="true"></span></button>`}
                  <input
                    id="sg-search-inline-input"
                    class="sg-search-inline__input"
                    ref=${desktopSearchRef}
                    type="search"
                    aria-label="Search sessions"
                    aria-hidden=${searchOpen ? undefined : 'true'}
                    placeholder="Search sessions..."
                    autocomplete="off"
                    spellcheck="false"
                    tabindex=${searchOpen ? undefined : '-1'}
                    value=${state.searchQuery}
                    oninput=${onSearchInput}
                    onkeydown=${onSearchEscape}
                    onblur=${onDesktopSearchBlur}
                  />
                  ${searchOpen && html`<button
                    class="sg-search-inline__clear"
                    onclick=${closeSearch}
                    aria-label="Clear search"
                    type="button"
                  >✕</button>`}
                </div>

                ${filterOpen && html`<${FilterPanel} onClose=${closeFilter} />`}
              </div>
            </div>
          </div>

          <div class=${`sg-mobile-search-row${searchOpen ? ' sg-mobile-search-row--open' : ''}`}>
            <div class="sg-mobile-search-wrap">
              <span class="sg-search-field-icon" aria-hidden="true"></span>
              <input
                class="sg-mobile-search-input"
                ref=${mobileSearchRef}
                type="search"
                aria-label="Search sessions"
                placeholder="Search sessions..."
                autocomplete="off"
                spellcheck="false"
                value=${state.searchQuery}
                oninput=${onSearchInput}
                onkeydown=${onSearchEscape}
              />
              <button
                class="sg-search-clear-btn"
                onclick=${closeSearch}
                aria-label="Clear search"
                type="button"
              >✕</button>
            </div>
          </div>
        </div>
      </div>
    </header>
  `;
}
