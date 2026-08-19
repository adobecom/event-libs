# Fix Patterns (event-libs)

Before/after patterns for the most frequent WCAG violations, written in this repo's actual
conventions: `createTag(tag, attrs, content)` imported from Milo via
`event-libs/v1/utils/utils.js`, and native `addEventListener`.

Set ARIA in the `createTag` attrs object wherever possible, so an element is never appended in an
un-named state.

**Examples are illustrative, not scoping.** The variable and class names below lean on the session
page (`.session-action`, `speakers-toggle`, "Add to schedule") because that family exercises most
of these patterns — apply the same shapes in any C1 or C2 block. Where CSS tokens appear, swap the
family to match the block you're in: C2 uses `--s2a-*`, C1 uses Milo/Consonant tokens
(`--color-accent`). See SKILL.md → Repo layout.

## Add Mode Steps

1. Read the block and check whether its event listeners are attached in the same file, in a
   sibling sub-feature module in the same block dir, or in `utils/decorate.js` — trace before
   concluding a handler is missing.
2. Identify the block's interaction model: static display, interactive widget, form,
   dialog/overlay, expandable list, media player, or live-updating region.
3. Apply additions in this order:
   - Semantic HTML first (replace `<div>`/`<span>` with the correct native element)
   - ARIA roles, labels, states — only where semantic HTML is insufficient
   - Keyboard interaction (focus management, key handlers)
   - Focus-visible indicator (never leave `outline: none` without a replacement)
   - Live regions for dynamic content
4. Add an inline comment only for non-obvious ARIA choices.
5. Verify with lint + the block's unit tests (see SKILL.md Step 5).

---

## Missing image alt text (WCAG 1.1.1)

```js
// before (broken) — no alt, screen readers announce the filename or nothing useful
createTag('img', { src: speakerSrc });
```

```js
// after (fixed)
// informative
createTag('img', { src: speakerSrc, alt: `Photo of ${speaker.name}` });

// decorative
createTag('img', { src: dividerSrc, alt: '' });
```

If the image comes from authored content, prefer Milo's `createOptimizedPicture` and pass the
authored alt through. When the authored alt is empty, decide deliberately: treat it as decorative
(`alt=""`) or derive a name from adjacent authored text — don't leave the attribute off entirely,
and don't hardcode marketing copy that belongs in the DA doc.

---

## Icon-only button missing label (WCAG 1.1.1, 4.1.2)

```js
// before (broken) — button has no accessible name, announced as just "button"
const btn = createTag('button', { type: 'button', class: 'session-action' });
btn.innerHTML = SHARE_ICON;
```

```js
// after (fixed)
const btn = createTag('button', {
  type: 'button', class: 'session-action', 'aria-label': 'Share this session',
});
btn.innerHTML = SHARE_ICON; // inline SVG constants must carry aria-hidden="true"
```

Inline-SVG icon constants are the norm in this repo — make sure the SVG markup itself includes
`aria-hidden="true"` so it isn't announced alongside the button's label. Check for an existing
shared icon helper before hand-rolling new markup.

---

## `<div>`/`<span>` used as interactive element (WCAG 4.1.2, 2.1.1)

```js
// before (broken) — no role, no keyboard support; invisible to keyboard/screen-reader users
const btn = createTag('div', { class: 'cta' }, 'Add to schedule');
btn.addEventListener('click', handleClick);
```

Prefer a native `<button>`:

```js
// after (fixed)
const btn = createTag('button', { type: 'button', class: 'cta' }, 'Add to schedule');
btn.addEventListener('click', handleClick);
```

If a native `<button>` is blocked because the element is an authored link being repurposed for an
in-page action, add `role="button"` and cover both activation paths:

```js
// after (fixed) — authored anchor reused as a button
const el = createTag('a', {
  href: '#', role: 'button', tabindex: '0', class: 'cta',
}, 'Add to schedule');
el.addEventListener('click', (e) => { e.preventDefault(); handleClick(e); });
el.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleClick(e); }
});
```

---

## Show-more / expand toggle missing state (WCAG 4.1.2)

The established event-libs pattern for a truncated list or clamped text: a real `<button>` whose
`aria-expanded` is updated on every toggle, with the chevron rotated from that attribute in CSS.

```js
// before (broken) — a styled span; no role, no state, no keyboard support
const toggle = createTag('span', { class: 'speakers-toggle' }, 'Show more');
toggle.addEventListener('click', () => el.classList.toggle('is-expanded'));
```

```js
// after (fixed)
const toggle = createTag('button', {
  class: 'speakers-toggle', type: 'button', 'aria-expanded': 'false',
});
toggle.innerHTML = `<span>Show more</span>${CHEVRON_ICON}`;
toggle.addEventListener('click', () => {
  const expanded = el.classList.toggle('is-expanded');
  toggle.setAttribute('aria-expanded', String(expanded));
  toggle.querySelector('span').textContent = expanded ? 'Show less' : 'Show more';
});
```

```css
/* rotate from state, not from a second class */
.speakers-toggle[aria-expanded="true"] svg { transform: rotate(180deg); }
```

If the toggle controls a specific region, add `aria-controls` pointing at its id.

---

## Toggle button state not exposed (WCAG 4.1.2)

For favorite/save/schedule buttons, expose on/off with `aria-pressed` — and update it on the
async path too, not just on click. In event-libs the state often arrives from a `BlockMediator`
subscription or a RainFocus signal after first paint.

```js
// before (broken) — visual-only state; AT never learns it's on
btn.classList.toggle('is-favorited', isFavorited);
```

```js
// after (fixed)
btn.classList.toggle('is-favorited', isFavorited);
btn.setAttribute('aria-pressed', String(isFavorited));
```

Set an initial `'aria-pressed': 'false'` at `createTag` time so the button is never announced
without a state, then let the same update function run for both the click and the subscribed
signal.

---

## Form input missing label (WCAG 3.3.2, 4.1.2)

```js
// before (broken) — placeholder is not a label; disappears once the user types
const input = createTag('input', { type: 'email', placeholder: 'Email address' });
```

```js
// after (fixed)
const label = createTag('label', { for: 'email-input' }, 'Email address');
const input = createTag('input', { id: 'email-input', type: 'email', autocomplete: 'email' });
```

If a sibling block already renders the same kind of field with a fallback default for unauthored
label copy, match its established fallback text and pattern rather than inventing new copy — grep
sibling blocks for the same field id/class first.

When a visible label isn't feasible (common for compact search/filter inputs):

```js
// after (fixed) — aria-label in place of a visible <label>
const input = createTag('input', {
  type: 'search', id: 'session-search', 'aria-label': 'Search sessions',
});
```

---

## Input error not announced (WCAG 3.3.1, 4.1.3)

```js
// before (broken) — only a visual cue; nothing ties the error to the field for AT
input.classList.add('input-error');
const error = createTag('span', { class: 'error-text' }, 'Please enter a valid email address.');
input.after(error);
```

```js
// after (fixed)
input.setAttribute('aria-invalid', 'true');
input.setAttribute('aria-describedby', 'email-error');
const error = createTag('span', { id: 'email-error', role: 'alert' }, 'Please enter a valid email address.');
input.after(error);
```

---

## Combobox/listbox not keyboard accessible (WCAG 2.1.1, 4.1.2)

```js
// before (broken) — no roles, no aria-expanded, no keyboard handling; mouse-only
const combo = createTag('div', { class: 'filter' }, selectedLabel);
combo.addEventListener('click', toggleOpen);
const list = createTag('ul', { class: 'options-list' });
options.forEach((opt) => list.append(createTag('li', {}, opt.label)));
```

If a similar filter/combobox already exists elsewhere in this codebase, match its established
roles and keyboard handling rather than inventing a new one:

```js
// after (fixed)
const combo = createTag('div', {
  role: 'combobox',
  'aria-expanded': String(isOpen),
  'aria-haspopup': 'listbox',
  'aria-controls': 'options-list',
  tabindex: '0',
}, selectedLabel);
combo.addEventListener('keydown', handleComboKeydown);

const list = createTag('ul', { id: 'options-list', role: 'listbox', 'aria-label': 'Options' });
options.forEach((opt) => {
  list.append(createTag('li', {
    id: opt.id, role: 'option', 'aria-selected': String(opt.id === selectedId),
  }, opt.label));
});
```

---

## Dialog / overlay focus management (WCAG 2.1.2, 2.4.3)

```js
// before (broken) — no role/aria-modal, no focus moved on open, no focus restored on close
const overlay = createTag('div', { class: 'session-overlay' });
overlay.append(createTag('h2', {}, title), closeBtn);

function open() { overlay.hidden = false; }
function close() { overlay.hidden = true; }
```

```js
// after (fixed)
const overlay = createTag('div', {
  role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'overlay-title', tabindex: '-1',
});
overlay.append(createTag('h2', { id: 'overlay-title' }, title), closeBtn);

let lastTrigger = null;
function open(triggerEl) {
  lastTrigger = triggerEl;
  overlay.hidden = false;
  overlay.focus();
}
function close() {
  overlay.hidden = true;
  lastTrigger?.focus(); // restore focus to whatever opened it
}
```

Also wire Escape to close, and constrain Tab within the overlay while it's modal.

---

## Dynamic content not announced (WCAG 4.1.3)

```js
// before (broken) — visible to sighted users, but silent to screen readers:
// no role/aria-live, and wrapping it in aria-hidden hides it from AT entirely
const status = createTag('div', { class: 'loading', 'aria-hidden': 'true' });

const alertEl = createTag('div', { class: 'error-toast' });
```

```js
// after (fixed)
// Polite — status/progress updates. Don't wrap this container (or a parent) in
// aria-hidden="true" while it's visible — that silently hides it from screen readers
// even though sighted users can see it.
const status = createTag('div', {
  class: 'loading', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true',
});

// Assertive — errors only, since it interrupts immediately.
const alertEl = createTag('div', { role: 'alert', 'aria-live': 'assertive', 'aria-atomic': 'true' });
```

Before adding a new live region, check `event-libs/v1/features/` — `features/toast/toast.js`
already renders a `role="status"` / `aria-live="polite"` toast. Reuse it.

---

## Timer-driven state change not announced (WCAG 4.1.3)

event-libs has controllers that swap content on a timer rather than on user input (e.g. a session
moving Pre-Live → Live → On-Demand at its start/end boundary). A silent swap is invisible to AT.

```js
// before (broken) — content is replaced on a timer; nothing is announced
statusSlot.replaceChildren(renderStatus(state, times));
```

```js
// after (fixed) — the slot is a persistent live region whose text is updated
const statusSlot = createTag('span', {
  class: 'session-status-slot', role: 'status', 'aria-live': 'polite',
});
// ...later, on each boundary:
statusSlot.replaceChildren(renderStatus(state, times));
```

The live region must exist in the DOM from the start — create it once and update its contents;
don't create/destroy the container per state.

---

## Status conveyed by color alone (WCAG 1.4.1)

```js
// before (broken) — a red dot is the only signal that a session is live
el.append(createTag('span', { class: 'session-status-dot' }));
```

```js
// after (fixed) — dot is decorative; the word carries the meaning
el.append(createTag('span', { class: 'session-status-dot', 'aria-hidden': 'true' }));
el.append(createTag('span', {}, 'Live'));
```

---

## Focus indicator removed (WCAG 2.4.7)

```css
/* before (broken) — outline removed with no replacement; keyboard users lose all focus visibility */
.session-action:focus {
  outline: none;
}
```

Match the token family of the block you're in instead of inventing a color:

```css
/* after (fixed) — C2 block (event-libs/v1/c2/blocks/) */
.session-action:focus-visible {
  outline: 2px solid var(--s2a-color-gray-1000, #000);
  outline-offset: 2px;
}
```

```css
/* after (fixed) — C1 block (event-libs/v1/blocks/), which has no --s2a-* tokens */
.my-block-btn:focus-visible {
  outline: 2px solid var(--color-accent, #1473e6);
  outline-offset: 2px;
}
```

Always keep a literal fallback in `var()`. Three C1 stylesheets currently ship `outline: none` —
if you're auditing one of those, this is a live WCAG 2.4.7 finding, not a hypothetical.

---

## Generic link text (WCAG 2.4.4)

```js
// before (broken) — meaningless out of context when a screen reader lists all links on the page
createTag('a', { href: sessionHref }, 'Read more');
```

```js
// after (fixed)
createTag('a', { href: sessionHref, 'aria-label': `Read more about ${sessionTitle}` }, 'Read more');
```

If "Read more" is authored copy in the DA doc, note that the durable fix may be authoring-side
(better link text in the doc). A code-level `aria-label` built from adjacent authored data is an
acceptable fix; hardcoding new marketing copy is not.

---

## Decorative role on a non-permitted element (WCAG 1.1.1, 4.1.2)

```js
// before (broken) — role="presentation" is not valid on <video>
createTag('video', { role: 'presentation', src });
```

```js
// after (fixed)
createTag('video', { 'aria-hidden': 'true', src }); // if genuinely decorative
```

`role="presentation"` / `role="none"` is only valid on elements the ARIA-in-HTML spec allows it
for (e.g. `<img>`). It is **not** valid on `<video>`, `<audio>`, or most other embedded/replaced
elements — use `aria-hidden="true"` there instead. A real, user-facing player is not decorative:
give it a label and native controls rather than hiding it.
