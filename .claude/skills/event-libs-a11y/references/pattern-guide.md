# Component Pattern Guide (event-libs)

Common ARIA and interaction patterns for event-libs components: vanilla JS/DOM, commonly built
with the shared `createTag` helper and native `addEventListener`. Prefer native HTML and established
platform behavior before building custom widget logic.

## Buttons and links

- Use `<button>` for in-place actions and `<a href>` for real navigation.
- If an `<a>` must act as a button, add `role="button"` and support click, Enter, and Space. Check
  sibling modules before concluding keyboard handling is absent.
- Icon-only controls need an accessible name through `aria-label` or visually hidden text.
- Do not use a clickable `<div>` or `<span>` unless full button behavior is implemented.

## Drawers, dialogs, and overlays

- Modal UI needs `role="dialog"`, `aria-modal="true"`, and an accessible name through
  `aria-labelledby` or `aria-label`.
- Move focus into the modal on open, constrain focus while it is open, and restore focus to the
  invoking control on close.
- Support Escape when dismissal is allowed, and keep the close control keyboard-reachable.
- Prevent background content from remaining interactive while modal behavior is active.

## Tabs and carousels

- Tabs use `role="tablist"`, `role="tab"`, and `role="tabpanel"`, with `aria-selected` and
  `aria-controls` kept in sync.
- Implement the expected arrow-key behavior and a roving `tabindex`; do not place every tab in the
  page tab sequence.
- Carousel next/previous controls need clear names. Announce slide changes without repeatedly
  interrupting users, and pause auto-rotation when focus or hover enters the carousel.

## Forms, search, and filter controls

- Every field needs a visible `<label for>` or an `aria-label` when a visible label does not fit.
- Connect helper and error text through `aria-describedby`.
- Set `aria-invalid="true"` only after validation fails.
- Placeholder text is never a substitute for a label.
- Filter drawers and panels must preserve logical reading and focus order as controls appear or hide.

## Combobox and listbox

- Use `role="combobox"` on the input or trigger, `role="listbox"` on the options container, and
  `role="option"` on each item. Keep `aria-expanded`, `aria-controls`, and active/selected state in sync.
- Support ArrowDown/ArrowUp, Enter, and Escape according to the chosen interaction model.
- Verify the accessible name, expanded state, and keyboard movement even when roles are present.

## Status, progress, alerts, and toasts

- Expose loading through `role="progressbar"` with values or a persistent `role="status"` /
  `aria-live="polite"` container.
- Errors may use `role="alert"` or `aria-live="assertive"`; reserve these for genuine errors.
- Keep announcements concise and avoid repeated updates.
- Keep live-region containers in the DOM and update their text content.

## Images, icons, and media

- Decorative images use `alt=""`; decorative inline SVGs use `aria-hidden="true"`.
- Meaningful images need descriptive alt text. If the visual belongs to a control, name the control.
- `role="presentation"` and `role="none"` are valid only where ARIA-in-HTML permits them. Do not
  reuse them on `<video>`, `<audio>`, or other embedded elements without checking permitted roles.
- Media needs appropriate captions, transcripts, and keyboard-operable controls based on its content.
