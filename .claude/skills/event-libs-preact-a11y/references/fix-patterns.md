# Preact Accessibility Fix Patterns (event-libs)

Use these examples as shapes, not blind replacements. Match the scoped component's state ownership,
CSS tokens, and established shared primitives.

## Icon-only action

```js
// Before: the icon does not give the button an accessible name.
return html`<button type="button" onclick=${handleShare}>
  <${Icon} name="share" />
</button>`;
```

```js
// After: name the action; keep the icon decorative.
return html`<${IconButton}
  label="Share this session"
  onclick=${handleShare}
  variant="outlined"
>
  <${Icon} name="share" />
</${IconButton}>`;
```

## Toggle state from one source of truth

```js
// Before: class and label change, but assistive state does not.
const selected = favorited.value.has(session.id);
return html`<button
  class=${selected ? 'is-selected' : ''}
  onclick=${toggleFavorite}
>${selected ? 'Favorited' : 'Favorite'}</button>`;
```

```js
// After: visual, label, and pressed state derive from the same Signal read.
const selected = favorited.value.has(session.id);
return html`<button
  class=${selected ? 'is-selected' : ''}
  onclick=${toggleFavorite}
  aria-pressed=${String(selected)}
  type="button"
>${selected ? 'Remove from favorites' : 'Add to favorites'}</button>`;
```

## Conditionally applicable ARIA

```js
// Use undefined to omit aria-pressed for a non-toggle action.
return html`<button
  aria-pressed=${isToggle ? String(pressed) : undefined}
  disabled=${disabled || undefined}
  type="button"
>${label}</button>`;
```

Do not render `aria-pressed="false"` on an ordinary button; false still declares toggle semantics.

## Label and description relationship

```js
const inputId = 'session-search';
const helpId = 'session-search-help';

return html`
  <label for=${inputId}>Search sessions</label>
  <input
    id=${inputId}
    type="search"
    value=${query}
    oninput=${(event) => dispatch({ type: 'SET_SEARCH', query: event.currentTarget.value })}
    aria-describedby=${helpId}
  />
  <p id=${helpId}>Search by title, speaker, or product.</p>
`;
```

Ids must remain stable across rerenders and be unique when multiple component instances can exist.
Use `useId` or a stable instance prefix when a hardcoded id is not safe.

## Modal focus lifecycle

```js
export function FilterPanel({ onClose }) {
  const panelRef = useRef(null);

  useEffect(() => trapFocus(panelRef.current, onClose), [onClose]);

  return html`
    <div
      ref=${panelRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="filter-panel-title"
    >
      <h2 id="filter-panel-title">Filter sessions</h2>
      <button type="button" onclick=${onClose} aria-label="Close filter panel">×</button>
    </div>
  `;
}
```

The returned `trapFocus` cleanup removes listeners and restores prior focus. Verify the callback's
identity/dependencies so the effect does not recreate the trap unexpectedly. For nested dialogs,
confirm cleanup restores focus to a control inside the parent modal.

## Effect listener and subscription cleanup

```js
useEffect(() => {
  function handleKeydown(event) {
    if (event.key === 'Escape') onClose();
  }

  window.addEventListener('keydown', handleKeydown);
  const unsubscribe = sessions.subscribe(updateResults);

  return () => {
    window.removeEventListener('keydown', handleKeydown);
    unsubscribe();
  };
}, [onClose]);
```

Do not rely on the unit-test Preact mock to run this effect; test the extracted behavior or use a
real Preact/browser layer.

## Loading and async updates

```js
// Before: conditional insertion may be missed, and the updated region has no busy state.
return loading.value && html`<div>Loading sessions…</div>`;
```

```js
// After: keep the status region present and bind busy state to the results region.
return html`
  <div class="session-results" aria-busy=${String(loading.value)}>
    <div class="session-status" role="status" aria-live="polite" aria-atomic="true">
      ${loading.value ? 'Loading sessions…' : ''}
    </div>
    ${!loading.value && html`<${SessionResults} />`}
  </div>
`;
```

Avoid announcing routine background polling when the displayed content has not meaningfully changed.

## Complete tab relationship

```js
const tabs = [
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'on-demand', label: 'On demand' },
];

return html`
  <div role="tablist" aria-label="Session timing">
    ${tabs.map((tab) => {
    const selected = activeTab === tab.id;
    return html`<button
      id=${`session-tab-${tab.id}`}
      key=${tab.id}
      role="tab"
      aria-selected=${String(selected)}
      aria-controls=${`session-panel-${tab.id}`}
      tabindex=${selected ? '0' : '-1'}
      onclick=${() => setActiveTab(tab.id)}
      type="button"
    >${tab.label}</button>`;
  })}
  </div>
  <div
    id=${`session-panel-${activeTab}`}
    role="tabpanel"
    aria-labelledby=${`session-tab-${activeTab}`}
  >
    <${ActiveSessionView} />
  </div>
`;
```

Add the correct arrow/Home/End key handler for the tablist. If content is only being filtered and
there is no tabpanel relationship, use a different selection pattern.

## Stable list identity

```js
// Before: index keys can move component/focus identity when sessions reorder.
${sessions.value.map((session, index) => html`
  <${SessionCard} key=${index} session=${session} />
`)}
```

```js
${sessions.value.map((session) => html`
  <${SessionCard} key=${session.id} session=${session} />
`)}
```

## Reduced motion

```js
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
```

Prefer a shared motion utility if one exists. Pair script behavior with CSS that disables
non-essential transitions under `@media (prefers-reduced-motion: reduce)`.

## Test the right claim

```js
// Valid string-mock assertion: static initial semantics.
const out = SessionCard({ session });
expect(out).to.include('aria-pressed=false');
expect(out).to.include('Add to favorites');
```

Do not interpret that test as evidence that clicking changes the Signal or rerenders
`aria-pressed=true`; the mock omits handlers and does not rerender. Verify transitions with real
Preact/browser rendering or test the underlying state/action function separately and document the gap.
