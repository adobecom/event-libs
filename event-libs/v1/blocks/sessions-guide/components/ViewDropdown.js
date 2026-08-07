import { html, useState, useEffect, useRef } from '../../../deps/htm-preact.js';
import { useSessionGuide } from '../store/index.js';
import { checkViewAccess } from '../../../services/sessions/action-feedback.js';

const VIEWS = [
  { value: 'live-upcoming', label: 'Live & upcoming' },
  { value: 'my-sessions', label: 'My sessions' },
  { value: 'my-favorites', label: 'My favorites' },
  { value: 'on-demand', label: 'On demand' },
];

export const buildViewDropdown = () => ViewDropdown;

// Pure decision logic for a view selection, kept separate from the click handler below so
// it's directly unit-testable without simulating a dropdown click through the render
// harness (same reasoning as DrawerShell.js's resolveSessionGuideRequest). checkViewAccess()
// still has the side effect of showing a toast when blocked — this just decides where to
// land: the requested view when allowed, or the returned fallback when not.
export function resolveViewSelection(value, { eventConfig }) {
  return checkViewAccess(value, { eventConfig }) || value;
}

export function ViewDropdown() {
  const { state, dispatch } = useSessionGuide();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  const activeLabel = VIEWS.find((v) => v.value === state.activeView)?.label || 'Live & upcoming';

  useEffect(() => {
    if (!open) return undefined;
    function onClickOutside(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('click', onClickOutside);
    return () => document.removeEventListener('click', onClickOutside);
  }, [open]);

  function selectView(value) {
    dispatch({ type: 'SET_VIEW', view: resolveViewSelection(value, { eventConfig: state.guideConfig }) });
    setOpen(false);
  }

  return html`
    <div class="sg-view-dropdown-wrap" ref=${wrapRef}>
      <button
        class=${`sg-view-btn${open ? ' sg-view-btn--open' : ''}`}
        onclick=${() => setOpen(!open)}
        aria-haspopup="listbox"
        aria-expanded=${open}
        type="button"
      >
        ${activeLabel}
        <span class="sg-view-chevron" aria-hidden="true"></span>
      </button>
      ${open && html`
        <ul class="sg-view-menu" role="listbox">
          ${VIEWS.map((v) => html`
            <li
              class=${`sg-view-menu-item${state.activeView === v.value ? ' sg-view-menu-item--selected' : ''}`}
              onclick=${() => selectView(v.value)}
              role="option"
              aria-selected=${state.activeView === v.value}
            >${v.label}</li>
          `)}
        </ul>
      `}
    </div>
  `;
}
