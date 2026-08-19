import { html, useState, useEffect, useRef } from '../../../../deps/htm-preact.js';
import { useSessionGuide } from '../store/index.js';
import { checkViewAccess } from '../../../../services/sessions/action-feedback.js';
import { IconCheckmark } from './icons.js';

const VIEWS = [
  { value: 'live-upcoming', label: 'Live & upcoming' },
  { value: 'my-sessions', label: 'My sessions' },
  { value: 'my-favorites', label: 'My favorites' },
  { value: 'on-demand', label: 'On demand' },
];

export const buildViewDropdown = () => ViewDropdown;

// Pure decision logic, kept separate from the click handler so it's unit-testable without
// simulating a click (same reasoning as DrawerShell.js's resolveSessionGuideRequest).
export function resolveViewSelection(value, { eventConfig }) {
  return checkViewAccess(value, { eventConfig }) || value;
}

export function ViewDropdown() {
  const { state, dispatch } = useSessionGuide();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const menuRef = useRef(null);
  const triggerRef = useRef(null);

  const activeLabel = VIEWS.find((v) => v.value === state.activeView)?.label || 'Live & upcoming';
  const selectedIndex = Math.max(0, VIEWS.findIndex((v) => v.value === state.activeView));

  useEffect(() => {
    if (!open) return undefined;
    function onClickOutside(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('click', onClickOutside);
    return () => document.removeEventListener('click', onClickOutside);
  }, [open]);

  // Lands keyboard focus on the selected option as soon as the menu opens, matching
  // the native <select>/listbox convention.
  useEffect(() => {
    if (!open) return;
    menuRef.current?.children[selectedIndex]?.focus();
  }, [open]);

  function selectView(value) {
    dispatch({ type: 'SET_VIEW', view: resolveViewSelection(value, { eventConfig: state.guideConfig }) });
    setOpen(false);
    triggerRef.current?.focus();
  }

  function closeAndRefocus() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  // Each option is its own tab stop (Tab cycles through them like a real list); arrow
  // keys additionally jump directly between options, matching listbox conventions.
  function handleOptionKeydown(e, idx) {
    const focusOption = (i) => menuRef.current?.children[i]?.focus();
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      selectView(VIEWS[idx].value);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeAndRefocus();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      focusOption((idx + 1) % VIEWS.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      focusOption((idx - 1 + VIEWS.length) % VIEWS.length);
    } else if (e.key === 'Home') {
      e.preventDefault();
      focusOption(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      focusOption(VIEWS.length - 1);
    }
  }

  return html`
    <div class="sg-view-dropdown-wrap" ref=${wrapRef}>
      <button
        ref=${triggerRef}
        class=${`sg-view-btn${open ? ' sg-view-btn--open' : ''}`}
        onclick=${() => setOpen(!open)}
        aria-haspopup="listbox"
        aria-expanded=${String(open)}
        aria-controls=${open ? 'sg-view-menu' : undefined}
        type="button"
      >
        ${activeLabel}
        <span class="sg-view-chevron" aria-hidden="true"></span>
      </button>
      ${open && html`
        <ul class="sg-view-menu" id="sg-view-menu" role="listbox" aria-label="Session view" ref=${menuRef}>
          ${VIEWS.map((v, idx) => html`
            <li
              class=${`sg-view-menu-item${state.activeView === v.value ? ' sg-view-menu-item--selected' : ''}`}
              onclick=${() => selectView(v.value)}
              onkeydown=${(e) => handleOptionKeydown(e, idx)}
              role="option"
              key=${v.value}
              tabindex="0"
              aria-selected=${String(state.activeView === v.value)}
              daa-ll="View-Toggle-${v.value}"
            >
              <span class="sg-view-menu-item__check" aria-hidden="true">
                ${state.activeView === v.value && html`<${IconCheckmark} />`}
              </span>
              <span class="sg-view-menu-item__label">${v.label}</span>
            </li>
          `)}
        </ul>
      `}
    </div>
  `;
}
