export function buildViewDropdown(preact, store) {
  const { html, useState, useEffect, useRef } = preact;
  const { useSessionGuide } = store;

  const VIEWS = [
    { value: 'live-upcoming', label: 'Live & Upcoming' },
    { value: 'my-sessions', label: 'My Sessions' },
    { value: 'my-favorites', label: 'My Favorites' },
    { value: 'on-demand', label: 'On Demand' },
  ];

  return function ViewDropdown() {
    const { state, dispatch } = useSessionGuide();
    const [open, setOpen] = useState(false);
    const wrapRef = useRef(null);

    const activeLabel = VIEWS.find((v) => v.value === state.activeView)?.label || 'Live & Upcoming';

    useEffect(() => {
      if (!open) return undefined;
      function onClickOutside(e) {
        if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
      }
      document.addEventListener('click', onClickOutside);
      return () => document.removeEventListener('click', onClickOutside);
    }, [open]);

    function selectView(value) {
      dispatch({ type: 'SET_VIEW', view: value });
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
  };
}
