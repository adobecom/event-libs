import { html, useState, useRef, useEffect, useMemo } from '../../v1/deps/htm-preact.js';
import { Icon } from '../../v1/features/icons/Icon.js';
import { fetchFederalIconList } from '../../v1/features/icons/federal-icons.js';

// Feeds IconPicker's `options` prop with federal's live icon inventory only — nothing
// else is offered, so a picked icon is always guaranteed to actually render.
export function useIconSlugOptions() {
  const [slugs, setSlugs] = useState([]);

  useEffect(() => {
    let cancelled = false;
    fetchFederalIconList().then((federalSlugs) => {
      if (!cancelled) setSlugs([...federalSlugs].sort());
    });
    return () => { cancelled = true; };
  }, []);

  return slugs;
}

// Custom combobox replacing a plain <select>, which can't render an icon + name per
// option. `color` is optional — omit it for icons that carry their own color (e.g.
// products) so the trigger doesn't tint them with currentColor.
export default function IconPicker({ value, color, options, onChange, ariaLabel }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlighted, setHighlighted] = useState(0);
  const rootRef = useRef(null);
  const searchRef = useRef(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter((slug) => slug.includes(q)) : options;
  }, [options, query]);

  // Reset search/highlight on every open, focus the search field, and close on an
  // outside click — a document-level listener registered only while open, torn down on
  // close/unmount.
  useEffect(() => {
    if (!open) return undefined;
    setQuery('');
    setHighlighted(0);
    searchRef.current?.focus();
    const handleDocClick = (e) => {
      if (!rootRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('click', handleDocClick);
    return () => document.removeEventListener('click', handleDocClick);
  }, [open]);

  function select(slug) {
    onChange(slug);
    setOpen(false);
  }

  function onSearchKeyDown(e) {
    if (e.key === 'Escape') {
      setOpen(false);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlighted((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlighted((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      select(filtered[highlighted] ?? '');
    }
  }

  return html`
    <div class="tec-icon-picker" ref=${rootRef}>
      <button
        type="button"
        class="tec-field tec-icon-picker__trigger"
        aria-haspopup="listbox"
        aria-expanded=${open}
        aria-label=${ariaLabel}
        onClick=${() => setOpen((prev) => !prev)}
      >
        ${value ? html`
          <span class="tec-icon-picker__trigger-icon" style=${color ? `color:${color}` : ''}>
            <${Icon} name=${value} size=${18} />
          </span>
          <span class="tec-icon-picker__trigger-label">${value}</span>
        ` : html`
          <span class="tec-icon-picker__trigger-label tec-icon-picker__trigger-label--empty">— no icon —</span>
        `}
      </button>
      ${open && html`
        <div class="tec-icon-picker__panel">
          <input
            ref=${searchRef}
            type="text"
            class="tec-field tec-icon-picker__search"
            placeholder="Search icons…"
            value=${query}
            onInput=${(e) => { setQuery(e.target.value); setHighlighted(0); }}
            onKeyDown=${onSearchKeyDown}
          />
          <ul class="tec-icon-picker__list" role="listbox">
            <li role="option" aria-selected=${!value}>
              <button type="button" class="tec-icon-picker__option" onClick=${() => select('')}>
                <span class="tec-icon-picker__option-label tec-icon-picker__option-label--empty">— no icon —</span>
              </button>
            </li>
            ${filtered.map((slug, i) => html`
              <li role="option" aria-selected=${slug === value} key=${slug}>
                <button
                  type="button"
                  class="tec-icon-picker__option ${i === highlighted ? 'is-highlighted' : ''} ${slug === value ? 'is-selected' : ''}"
                  onClick=${() => select(slug)}
                  onMouseEnter=${() => setHighlighted(i)}
                >
                  <${Icon} name=${slug} size=${18} />
                  <span class="tec-icon-picker__option-label">${slug}</span>
                </button>
              </li>
            `)}
            ${filtered.length === 0 && html`
              <li class="tec-icon-picker__empty">No icons match “${query}”</li>
            `}
          </ul>
        </div>
      `}
    </div>
  `;
}
