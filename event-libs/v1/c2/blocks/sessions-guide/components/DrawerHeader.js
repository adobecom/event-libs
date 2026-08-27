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

// Authors write a {firstName} placeholder into the logged-in headings to greet the viewer by
// name — single brace to match the repo's other authored templates (dictionary-manager.js,
// date-time-helper.js). Double braces and alternate spellings are accepted too, since authors
// type the token by hand in the Session Guide Configurator.
const NAME_WORDS = '(?:first[\\s_-]?name|user[\\s_-]?name|name)';
const NAME_TOKEN = `(?:\\{\\{\\s*${NAME_WORDS}\\s*\\}\\}|\\{\\s*${NAME_WORDS}\\s*\\})`;

// With no name to substitute (the token authored into a logged-out heading), the token is
// dropped along with any trailing comma so the copy still reads as a sentence.
export function interpolateHeading(heading, userFirstName) {
  if (!heading) return heading;
  if (userFirstName) return heading.replace(new RegExp(NAME_TOKEN, 'gi'), userFirstName);
  const stripped = heading.replace(new RegExp(`${NAME_TOKEN}[,:]?\\s*`, 'gi'), '').trim();
  // A token stripped off the front leaves the following word starting the sentence lowercase.
  if (!new RegExp(`^${NAME_TOKEN}`, 'i').test(heading.trim())) return stripped;
  return stripped.charAt(0).toUpperCase() + stripped.slice(1);
}

// Authored headings are 4 strings keyed by auth state x event lifecycle. A blank/unauthored
// string for the relevant key falls back to the hardcoded default.
export function resolveDrawerTitle(headings, { isLoggedIn, userFirstName, isPost }) {
  const loggedIn = !!(isLoggedIn && userFirstName);
  const key = `${loggedIn ? 'loggedIn' : 'loggedOut'}${isPost ? 'PostEvent' : ''}`;
  const defaultTitle = loggedIn ? `${userFirstName}, see what's happening` : "See what's happening at MAX";
  return interpolateHeading((headings || {})[key], userFirstName) || defaultTitle;
}

// The count badge is hidden below 768px, where the button is a 40px icon-only circle that
// signals an active filter set with a solid fill instead (sessions-guide-overlays.css). That
// makes this label the only place the number is exposed at mobile widths — keep it counted.
export function filterButtonLabel(activeFilterCount) {
  return activeFilterCount > 0 ? `Filter sessions, ${activeFilterCount} active` : 'Filter sessions';
}

// True once the desktop breakpoint's inline search (not the mobile/tablet below-row one) is
// the visible instance — checked at interaction time rather than watched continuously, since
// only clicks/focus/blur on the search controls need to know which layout is live.
function isDesktopSearchLayout() {
  return window.matchMedia('(min-width: 1280px)').matches;
}

export function DrawerHeader({
  onClose, onFilterToggle, onFilterClose, filterOpen, hideClose, hideControls,
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

  // Desktop popover dismissal: close when a click lands outside the filter wrap (button +
  // panel). Mirrors ViewDropdown. On mobile the panel is a full takeover, so the only way
  // this fires is the drill-down re-rendering the tapped category row away mid-dispatch —
  // which isOutsideClick() deliberately does not treat as a click-away.
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
    // The desktop icon button only exists in the DOM once searchOpen flips back to false
    // (it's swapped for the field on open) — wait for that render before trying to focus it.
    // The mobile/tablet toggle stays mounted throughout, but rAF keeps both paths identical.
    const toggleRef = isDesktopSearchLayout() ? desktopSearchToggleRef : mobileSearchToggleRef;
    requestAnimationFrame(() => toggleRef.current?.focus());
  }

  // Attached directly to the search inputs (not a document-level listener) and stopped from
  // propagating: DrawerShell wraps the whole widget in trapFocus(), whose own keydown handler
  // lives on .sg-drawer — an ancestor of these inputs — and unconditionally closes the entire
  // drawer on Escape. A document-level listener here would never even see the event, since the
  // trap's ancestor handler intercepts and stops it first on the way up.
  function onSearchEscape(e) {
    if (e.key !== 'Escape') return;
    e.stopPropagation();
    // First Escape clears the text but leaves the field open — an Escape on an already-empty
    // field is what collapses it. Matches the two-stage convention several other expanding-
    // search implementations use (e.g. GitHub's header search).
    if (state.searchQuery) {
      dispatch({ type: 'SET_SEARCH', query: '' });
      return;
    }
    closeSearch();
  }

  // Desktop's inline field only auto-collapses once it's both unfocused and empty — a click
  // on the explicit clear button (which calls closeSearch itself) dismisses a non-empty one.
  // Not applied to the mobile/tablet row: it's a deliberate full takeover there, so leaving
  // it open until an explicit close keeps a stray tap from discarding someone's typing.
  function onDesktopSearchBlur(e) {
    if (state.searchQuery) return;
    if (desktopSearchWrapRef.current?.contains(e.relatedTarget)) return;
    setSearchOpen(false);
  }

  function onSearchInput(e) {
    dispatch({ type: 'SET_SEARCH', query: e.target.value });
  }

  // Two separate search markups below, CSS-toggled by breakpoint rather than JS: sg-search-btn
  // + sg-mobile-search-row is the plain icon-opens-a-full-width-row-below treatment (mobile/
  // tablet); sg-search-inline is the desktop-only icon-morphs-into-the-field treatment. Both
  // share searchOpen/state.searchQuery, so resizing across the 1280px breakpoint mid-search
  // doesn't lose anything — only which one is visible (and focused) changes.
  return html`
    <header class="sg-header">
      ${!hideClose && html`
        <button class="sg-close-btn" onclick=${onClose} aria-label="Close sessions" daa-ll="Session-Guide-Close" type="button"></button>
      `}

      <div class="sg-header-title-row">
        <h2 class="sg-header-title">${title}</h2>
      </div>

      ${!hideControls && html`
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
      `}
    </header>
  `;
}
