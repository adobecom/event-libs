# Fix Patterns (event-libs)

Before/after patterns for frequent WCAG violations, written for this repo's conventions:
`createTag(tag, attrs, content, options)` from `event-libs/v1/utils/utils.js` and native
`addEventListener`.

## Add-mode steps

1. Read the component and trace event listeners across sibling modules and shared features.
2. Identify the interaction model: static display, widget, form/filter, carousel, drawer/dialog,
   or live-updating region.
3. Apply additions in this order:
   - Semantic HTML first
   - ARIA roles, labels, and states only where semantics are insufficient
   - Keyboard interaction and focus management
   - A visible `focus-visible` indicator
   - Live regions for dynamic content
4. Add inline comments only for non-obvious ARIA choices.

---

## Missing image alt text (WCAG 1.1.1)

```js
// Before: screen readers may announce the filename.
createTag('img', { src: profileSrc });
```

```js
// Informative image.
createTag('img', { src: profileSrc, alt: `Profile photo of ${name}` });

// Decorative image.
createTag('img', { src: dividerSrc, alt: '' });
```

---

## Icon-only button missing a label (WCAG 1.1.1, 4.1.2)

```js
// Before: the button has no accessible name.
const btn = createTag('button', { type: 'button' });
btn.innerHTML = '<svg><use href="#icon-trash"></use></svg>';
```

```js
const btn = createTag('button', { type: 'button', 'aria-label': 'Delete item' });
btn.innerHTML = '<svg aria-hidden="true"><use href="#icon-trash"></use></svg>';
```

Reuse an established icon helper when one exists, and verify that decorative SVG markup is hidden
from assistive technology.

---

## `<div>` or `<span>` used as an interactive element (WCAG 4.1.2, 2.1.1)

```js
// Before: no role, focusability, or keyboard support.
const btn = createTag('div', { class: 'btn' }, 'Submit');
btn.addEventListener('click', handleClick);
```

Prefer a native button:

```js
const btn = createTag('button', { type: 'button', class: 'btn' }, 'Submit');
btn.addEventListener('click', handleClick);
```

If an anchor must be reused as a button, support both activation keys:

```js
const el = createTag('a', {
  href: '#', role: 'button', tabindex: '0', class: 'btn',
}, 'Submit');
el.addEventListener('click', (e) => {
  e.preventDefault();
  handleClick(e);
});
el.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    handleClick(e);
  }
});
```

---

## Form input missing a label (WCAG 3.3.2, 4.1.2)

```js
// Before: the placeholder disappears after input and is not a label.
const input = createTag('input', { type: 'email', placeholder: 'Email address' });
```

```js
const label = createTag('label', { for: 'email-input' }, 'Email address');
const input = createTag('input', {
  id: 'email-input', type: 'email', autocomplete: 'email',
});
```

When no visible label fits:

```js
const input = createTag('input', {
  id: 'session-search', type: 'search', 'aria-label': 'Search sessions',
});
```

Match established fallback copy and patterns in sibling components rather than inventing a new
default label.

---

## Input error not announced (WCAG 3.3.1, 4.1.3)

```js
// Before: the visual error is not associated with the input.
input.classList.add('input-error');
const error = createTag('span', { class: 'error-text' }, 'Enter a valid email address.');
input.after(error);
```

```js
input.setAttribute('aria-invalid', 'true');
input.setAttribute('aria-describedby', 'email-error');
const error = createTag('span', {
  id: 'email-error', role: 'alert',
}, 'Enter a valid email address.');
input.after(error);
```

---

## Combobox/listbox not keyboard-accessible (WCAG 2.1.1, 4.1.2)

```js
// Before: mouse-only, with no roles or expanded state.
const combo = createTag('div', { class: 'combo' }, selectedLabel);
combo.addEventListener('click', toggleOpen);
const list = createTag('ul', { class: 'options-list' });
options.forEach((option) => list.append(createTag('li', {}, option.label)));
```

Use an established repo pattern when one exists:

```js
const combo = createTag('div', {
  role: 'combobox',
  'aria-expanded': String(isOpen),
  'aria-haspopup': 'listbox',
  'aria-controls': 'options-list',
  tabindex: '0',
}, selectedLabel);
combo.addEventListener('keydown', handleComboKeydown);

const list = createTag('ul', {
  id: 'options-list', role: 'listbox', 'aria-label': 'Options',
});
options.forEach((option) => {
  list.append(createTag('li', {
    id: option.id,
    role: 'option',
    'aria-selected': String(option.id === selectedId),
  }, option.label));
});
```

---

## Dialog focus management (WCAG 2.1.2, 2.4.3)

```js
// Before: the dialog is unnamed and focus is unmanaged.
const dialog = createTag('div', { class: 'dialog' });
dialog.append(createTag('h2', {}, title), closeBtn);

function openDialog() { dialog.hidden = false; }
function closeDialog() { dialog.hidden = true; }
```

```js
const dialog = createTag('div', {
  role: 'dialog',
  'aria-modal': 'true',
  'aria-labelledby': 'dialog-title',
  tabindex: '-1',
});
dialog.append(createTag('h2', { id: 'dialog-title' }, title), closeBtn);

let dialogTrigger;

function openDialog(triggerEl) {
  dialogTrigger = triggerEl;
  dialog.hidden = false;
  dialog.focus();
}

function closeDialog() {
  dialog.hidden = true;
  dialogTrigger?.focus();
}
```

A complete modal must also constrain focus while open and handle Escape when dismissal is allowed.

---

## Dynamic content not announced (WCAG 4.1.3)

```js
// Before: visible status is hidden from assistive technology.
const status = createTag('div', {
  class: 'loading-content', 'aria-hidden': 'true',
});
```

```js
const status = createTag('div', {
  class: 'loading-content',
  role: 'status',
  'aria-live': 'polite',
  'aria-atomic': 'true',
});

const alertEl = createTag('div', {
  role: 'alert', 'aria-live': 'assertive', 'aria-atomic': 'true',
});
```

Do not wrap a visible live region or one of its ancestors in `aria-hidden="true"`.

---

## Focus indicator removed (WCAG 2.4.7)

```css
/* Before: keyboard focus becomes invisible. */
.button:focus {
  outline: none;
}
```

Reuse the component's existing focus token or custom property:

```css
.button:focus-visible {
  outline: 2px solid var(--focus-color, #005fcc);
  outline-offset: 2px;
}
```

If no approved token exists, flag the token gap rather than introducing an arbitrary color.

---

## Generic link text (WCAG 2.4.4)

```js
// Before: meaningless when listed out of context.
createTag('a', { href: sessionHref }, 'Learn more');
```

```js
createTag('a', {
  href: sessionHref, 'aria-label': `Learn more about ${sessionTitle}`,
}, 'Learn more');
```
