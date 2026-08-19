# Block Accessibility Checklist

Run through this checklist during every audit, fix, and add-a11y task. event-libs has no
component-library boundary to scope around — every `createTag`-built element is local code, so
check all of it.

---

## Ownership and scope

- [ ] Confirmed whether the element's event wiring lives in the file being edited or in a
      sibling sub-feature module in the same block dir — trace before concluding something is missing
- [ ] Checked whether `utils/decorate.js` (`decorateArea`/`decorateEvent`) already adds the
      attribute during page decoration
- [ ] Checked whether ARIA state is set asynchronously in a `BlockMediator.subscribe` callback
      rather than at `createTag` time
- [ ] Determined the owner of a missing accessible name: **code** (never wired / no fallback),
      **authoring** (empty in the DA doc), or **config** (Tier 1 Event Configurator / event config)
- [ ] Flagged (not silently fixed) any real issue whose root cause is outside the requested file scope

---

## Semantics

- [ ] Element choice is correct for the interaction (button vs link vs input vs div)
- [ ] Native HTML is preferred before adding ARIA
- [ ] Heading levels are meaningful and not skipped — note that a block renders inside an
      authored page, so its top heading must fit the page's existing hierarchy (usually the page
      `<h1>` is the event/session title; blocks start at `<h2>`)
- [ ] Landmark elements (`main`, `nav`, `aside`, etc.) are used where appropriate
- [ ] Lists of repeated items use real `<ul>`/`<li>` (the convention across event-libs blocks)

---

## Accessible name

- [ ] Every interactive control has an accessible name
- [ ] Icon-only controls have `aria-label` or visually hidden text
- [ ] Controls referencing visible text use `aria-labelledby` where appropriate
- [ ] Accessible name accurately describes the action or destination (not just "click here")
- [ ] An authored value that may be empty has a sensible code-level fallback, so the control is
      never appended with no accessible name at all

---

## State and relationships

- [ ] `aria-describedby` ids are valid and the referenced elements exist in the DOM
- [ ] Error messages are connected to invalid fields via `aria-describedby`
- [ ] `aria-invalid="true"` is set only when validation has actually failed
- [ ] `aria-expanded`, `aria-selected`, `aria-pressed`, `aria-current`, `aria-busy` are used only when the UI truly exposes those states
- [ ] Toggle state is updated on **every** state change, including the async/subscribed path
      (e.g. `aria-pressed` on a favorite must follow the RainFocus/profile signal, not just the click)
- [ ] Decorative icons have `aria-hidden="true"`

---

## Keyboard and focus

- [ ] All interactions can be completed with keyboard only
- [ ] Focus indicator is visible and has sufficient contrast
- [ ] Tab order follows logical reading order
- [ ] No positive `tabindex` values
- [ ] Dialogs, overlays, and popovers move focus correctly on open
- [ ] Focus is restored to the trigger after dismissing temporary UI
- [ ] No focus trap (except intentional modal dialogs)
- [ ] CSS `order`/flex/grid reordering does **not** diverge from DOM order — visual reordering
      breaks focus order and reading order (WCAG 2.4.3, 1.3.2). If a responsive design needs a
      different order, the DOM order must change, not just the visual order
- [ ] Content revealed by a show-more toggle is not left focusable while visually hidden
      (and conversely, revealed content is reachable)

---

## Forms

- [ ] Every field has a programmatically associated label
- [ ] Required fields are marked (`aria-required="true"` or `required`)
- [ ] Errors are specific, visible, and connected to the field
- [ ] Related controls are grouped with `<fieldset>` + `<legend>` when needed
- [ ] Placeholder text is not the only label

---

## Visual checks

- [ ] Normal text contrast ≥ 4.5:1; large text ≥ 3:1
- [ ] UI component boundaries (input border, checkbox, button outline) contrast ≥ 3:1
- [ ] Focus indicators contrast ≥ 3:1 against adjacent colors
- [ ] Information is not conveyed by color alone (e.g. a red "Live" dot needs the word "Live"
      too, not just the dot)
- [ ] UI is functional at 200% browser zoom
- [ ] Contrast holds in both C1 and C2 styling contexts if the block is used in both

---

## Dynamic updates

- [ ] Async updates use `aria-live="polite"` (or `role="status"`)
- [ ] Error interrupts use `aria-live="assertive"` (or `role="alert"`) sparingly
- [ ] Loading states expose `aria-busy` when appropriate
- [ ] Live regions are always present in the DOM — text content is updated, not the container visibility
- [ ] Content that swaps on a **timer** rather than a user action (e.g. a Pre-Live → Live →
      On-Demand state controller) announces the change instead of silently replacing itself
- [ ] Content that swaps after a `BlockMediator` update announces it if the user needs to know

---

## Pattern conformance

- [ ] Widget matches a known pattern in [pattern-guide.md](pattern-guide.md)
- [ ] Simplest correct pattern chosen (no over-engineering toward complex widget when a native element suffices)
- [ ] Matches the convention already used by sibling event-libs blocks rather than inventing a new one
- [ ] Anti-patterns avoided: clickable div without full keyboard impl, placeholder-as-label, outline removal without replacement, ARIA to fix wrong element choice

---

## WCAG 2.1 AA — Component-Level Criteria

Ordered by frequency of violation.

| Criterion | Rule | Common violation |
|---|---|---|
| **4.1.2** | UI components expose name, role, value | `<div>` used as button/checkbox with no ARIA |
| **1.1.1** | Non-text content has text alternative | `<img>` missing `alt`; icon button missing label |
| **2.1.1** | All functionality operable via keyboard | Click-only handlers; no `keydown`/`keyup` |
| **2.4.7** | Focus is always visible | `outline: none` with no replacement style |
| **1.4.3** | Text contrast ≥ 4.5:1 (normal), ≥ 3:1 (large) | Low-contrast secondary text or placeholder |
| **1.4.11** | UI component contrast ≥ 3:1 | Input border, checkbox border invisible on background |
| **3.3.1** | Errors identified in text, not color alone | Red border only; no error message text |
| **3.3.2** | Labels or instructions for inputs | Input with no `<label>` and no `aria-label` |
| **1.3.1** | Info and relationships via structure | Heading hierarchy skipped; table with no `<th>` |
| **2.4.3** | Focus order logical | `tabindex` or CSS `order` breaks natural DOM order |
| **1.3.2** | Meaningful sequence | Visual order (CSS `order`/grid placement) contradicts DOM order |
| **4.1.3** | Status messages programmatically determined | Toast/alert injected with no `role="status"` |
| **2.4.4** | Link/button purpose clear from label | "Read more" with no context; icon-only button |
| **1.4.1** | Color not the only visual means | Status shown only by a colored dot |
| **1.3.5** | Identify input purpose | Personal data inputs missing `autocomplete` |

Full spec: [WCAG 2.1](https://www.w3.org/TR/WCAG21/)
