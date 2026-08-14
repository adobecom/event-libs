import {
  html, useState, useEffect, useRef, useComputed,
} from '../../../deps/htm-preact.js';
import { useSessionGuide } from '../store/index.js';
import {
  auth, sessions, liveStreamActiveIds, sessionStateVersion, getApiConfig,
} from '../../../utils/session-store.js';
import { isPostEvent, getNowMs } from '../../../utils/session-state.js';
import { DateTabs } from './DateTabs.js';
import { ViewDropdown } from './ViewDropdown.js';
import { DownloadButton } from './DownloadButton.js';

// Authored headings are 4 literal strings keyed by auth state x event lifecycle — no
// placeholder interpolation, unlike the hardcoded default's first-name greeting. A blank/
// unauthored string for the relevant key falls back to that hardcoded default.
export function resolveDrawerTitle(headings, { isLoggedIn, userFirstName, isPost }) {
  const loggedIn = !!(isLoggedIn && userFirstName);
  const key = `${loggedIn ? 'loggedIn' : 'loggedOut'}${isPost ? 'PostEvent' : ''}`;
  const defaultTitle = loggedIn ? `${userFirstName}, see what's happening` : "See what's happening at MAX";
  return (headings || {})[key] || defaultTitle;
}

export function DrawerHeader({ onClose, onFilterToggle, filterOpen, hideClose, hideControls }) {
  const { state, dispatch } = useSessionGuide();
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const mobileSearchRef = useRef(null);
  const { activeFilters, activeView } = state;

  // sessionStateVersion has no value of its own, only read so this recomputes on a pure
  // time-driven transition too (see store/index.js's auto-transition effect for why).
  const isPost = useComputed(() => {
    void sessionStateVersion.value;
    const eventEndMs = getApiConfig()?.eventEndMs;
    return isPostEvent(sessions.value, liveStreamActiveIds.value, getNowMs(), eventEndMs);
  }).value;

  const title = resolveDrawerTitle(state.guideConfig.headings, {
    isLoggedIn: auth.value.isLoggedIn,
    userFirstName: auth.value.userFirstName,
    isPost,
  });

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
        <button class="sg-close-btn" onclick=${onClose} aria-label="Close sessions" daa-ll="Session-Guide-Close" type="button"></button>
      `}

      <div class="sg-header-title-row">
        <h2 class="sg-header-title">${title}</h2>
      </div>

      ${!hideControls && html`
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
                daa-ll="Filter-Open"
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
                aria-expanded=${String(mobileSearchOpen)}
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
      `}
    </header>
  `;
}
