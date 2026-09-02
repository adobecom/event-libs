# Block Pattern Guide (event-libs)

Common ARIA/interaction patterns for event-libs blocks: vanilla JS/DOM ES modules, built with
Milo's `createTag` helper and native `addEventListener`. Prefer native HTML and established
platform behavior before building any custom widget logic. When a sibling block already
implements the pattern, match it rather than inventing a new convention.

Applies to **both** block families — C1 (`event-libs/v1/blocks/`) and C2
(`event-libs/v1/c2/blocks/`) — plus `features/`. Only the CSS token family differs; see SKILL.md →
Repo layout. Section-to-block map, to find the relevant pattern fast:

| Pattern section | Blocks in this repo that use it |
|---|---|
| Expandable content | session detail lists/clamps, agenda-style blocks, any "Show more" |
| Toggle buttons | favorite / add-to-schedule / save controls (`event-marquee`, session blocks) |
| Forms | `event-subscription-form`, RSVP forms |
| Combobox / filter groups | `sessions-guide` filters, search/typeahead |
| Dialogs and overlays | `sessions-guide` session-detail overlay, drawers, modals |
| Status / toasts | `features/toast/toast.js`, loading states |
| Time/state-driven content | session state controllers, `chrono-box`, `upcoming-sessions` |
| Carousels | `features/carousel/`, `event-carousel` |
| Video players | `mobile-rider`, embedded streams |
| Cards / people lists | `event-card`, `profile-cards`, speaker lists |

## Buttons and links

- Use `<button>` for in-place actions; `<a href>` for real navigation.
- If an authored `<a>` must be reused for an in-page action (no real destination), add
  `role="button"` and make sure both `click` (with `preventDefault`) and `keydown` for Enter/Space
  are wired. In this codebase, markup and event wiring are sometimes split across files (a block's
  `init` assembles slots while a sibling sub-feature module builds the control and attaches
  handlers) — check both before concluding a handler is missing.
- Icon-only controls must have an accessible name (`aria-label` or visually hidden text), and
  their inline SVG must be `aria-hidden="true"`.
- Never use a clickable `<div>` or `<span>` unless all button behavior (keyboard, role, focus) is
  fully implemented.

## Expandable content (show-more, clamps, accordions)

- Standard pattern: a real `<button>` with `aria-expanded` reflecting open/closed, updated on
  every toggle, plus `aria-controls` pointing at the region it expands when that region has an id.
  Drive the chevron rotation from `[aria-expanded="true"]` in CSS rather than a second class, so
  the visual state can't drift from the announced state.
- Update the button's label text too when it changes ("Show more" → "Show less").
- Overflow items hidden by a clamp must not remain focusable while visually hidden; conversely,
  revealed items must be reachable.
- This is the most common interactive pattern in event-libs (truncated speaker/product/resource
  lists, clamped descriptions) — check an existing one before writing a new one.

## Toggle buttons (favorite, save, add-to-schedule)

- Standard pattern: `<button>` with `aria-pressed` reflecting on/off. Initialize it at
  `createTag` time (`'aria-pressed': 'false'`) so the control is never announced state-less.
- Critical event-libs caveat: this state usually arrives **asynchronously** — from a
  `BlockMediator` subscription (`imsProfile`, `rsvpData`) or a RainFocus/catalog signal after
  first paint. Route both the click and the async update through the same function so
  `aria-pressed` can't drift from the visual class.
- Don't use `aria-pressed` for navigation or for a control that opens something — that's
  `aria-expanded` (disclosure) or a plain button.

## Forms, text inputs, and search/filter fields

- Every field must have a programmatically associated label — a visible `<label for>`, or
  `aria-label` when no visible label fits (common for compact search/filter inputs).
- Connect helper text and error messages to the field via `aria-describedby`.
- Mark `aria-invalid="true"` only when validation has actually failed.
- Placeholder text is never a substitute for a label.
- RSVP/subscription forms are the highest-stakes forms here — verify label association, error
  announcement, and required-field marking explicitly.

## Combobox, listbox, and filter groups

- Standard pattern: `role="combobox"` on the input/trigger, `role="listbox"` on the options
  container, `role="option"` on each item, `aria-expanded` reflecting open/closed state, and
  either `aria-activedescendant` or per-option `aria-selected` to track the active choice. Wire
  ArrowDown/ArrowUp to move selection, Enter to commit, Escape to close.
- For a set of filter checkboxes, prefer native `<input type="checkbox">` in a `<fieldset>` with a
  `<legend>` over a custom `role="listbox"` — simplest correct pattern wins.
- High-risk pattern — verify accessible name, expanded state, and keyboard movement explicitly;
  don't assume it's correct just because the roles are present.

## Dialogs and overlays (session detail overlays, modals, drawers)

- Standard pattern: `role="dialog"`, `aria-modal="true"`, `tabindex="-1"` on the dialog container,
  with a labelled heading (`aria-labelledby` pointing at it).
- Move focus into the dialog on open (to the dialog itself or its first focusable element).
- Restore focus to the invoking control on close — store the trigger element on open.
- Constrain keyboard focus while modal behavior is active (no tabbing to content behind the
  dialog), and wire Escape to dismiss.
- If the implementation also locks body scroll, make sure that's reversed on close; a stuck
  scroll-lock is an accessibility failure for everyone.

## Status, progress, alerts, and toasts

- Reuse `event-libs/v1/features/toast/toast.js` — it already renders a `role="status"` /
  `aria-live="polite"` container. Don't hand-roll a second toast.
- Progress/loading indicators: expose progress via `role="progressbar"` with
  `aria-valuenow`/`aria-valuemin`/`aria-valuemax`, or via a `role="status"` / `aria-live="polite"`
  container for simpler loading text — either way, the live region must actually be reachable by
  assistive tech; don't wrap it (or a parent) in `aria-hidden="true"` while it's visible.
- Error toasts/alerts need `role="alert"` / `aria-live="assertive"` — reserve this for genuine
  errors only, since it interrupts immediately.
- Announcements should be concise and action-oriented; don't fire repeated/noisy live-region
  updates.
- Live regions must always be present in the DOM — update their text content, not their
  container's visibility/existence.

## Time- and state-driven content (live/on-demand session state)

- Content that swaps on a **timer** (session start/end boundaries) or after an async data update
  changes under the user without any action from them. Put the swapped content in a persistent
  live region (`role="status"`, `aria-live="polite"`) created once, and update its contents.
- Status must not be conveyed by color alone — a colored "live" dot needs accompanying text, with
  the dot marked `aria-hidden="true"`.
- If a state change swaps the primary CTA (e.g. "Add to schedule" → "Watch now"), make sure the
  new control has its own accessible name and is keyboard reachable; don't leave focus on a
  removed node.

## Carousels

- Provide accessible previous/next controls with real labels, expose the current slide
  (`aria-live` region for slide changes or `aria-current` on pagination), and never trap keyboard
  focus inside an off-screen slide.
- Check `event-libs/v1/features/carousel/` before writing new carousel behavior — it already has
  an `aria-live` container.

## Images, icons, and SVG sprites

- Decorative visuals: `alt=""` (images) or `aria-hidden="true"` (inline SVG icons — the dominant
  icon style in this repo).
- Meaningful visuals: descriptive `alt` text, or `aria-label` on the containing control if the
  visual itself isn't independently interactive.
- Authored images come through the DA doc (often via Milo's `createOptimizedPicture`) — a missing
  `alt` may be an authoring fix, not a code fix. Still ensure the code never emits an `<img>` with
  no `alt` attribute at all.
- `role="presentation"` / `role="none"` is only valid on elements the ARIA-in-HTML spec allows it
  for (e.g. `<img>`). It is **not** valid on `<video>`, `<audio>`, or most other embedded/replaced
  elements — use `aria-hidden="true"` there instead. Check the permitted-roles table for an
  element type before reusing a decorative technique on it.

## Video players (mobile-rider, embedded streams)

- A real player is not decorative: it needs an accessible name, keyboard-operable controls, and
  captions where available. Don't `aria-hidden` a player to silence AT warnings.
- Closed-caption availability that's exposed in the UI should be announced as text, not implied by
  an icon alone.
- Autoplaying media must be pausable (WCAG 1.4.2 for audio, 2.2.2 for motion).

## Layout and reading order

- DOM order drives both keyboard focus order and screen-reader reading order. CSS `order`, flex
  `row-reverse`, and grid placement change only the visual order — using them to reorder content
  between breakpoints breaks WCAG 2.4.3 (Focus Order) and 1.3.2 (Meaningful Sequence).
- If a responsive design needs a different order at another breakpoint, the DOM order must change
  (or the design must accept one order). Duplicating a block and hiding one copy is also an
  accessibility/SEO problem — don't do it.
- Heading levels must fit the authored page, not just the block in isolation: the page `<h1>` is
  normally the event/session title, so blocks start at `<h2>`.
