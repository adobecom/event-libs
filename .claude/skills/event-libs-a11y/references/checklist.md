# Component Accessibility Checklist

Run this checklist during every standalone audit, fix, and add-a11y task. Event-libs has no local
component-library boundary around its custom blocks and features, so check all locally authored
markup and behavior. Trace imported Milo behavior before assigning ownership.

---

## Ownership and scope

- [ ] Confirmed whether event wiring lives in the file being edited, a sibling component, a shared
      feature, or Milo-provided code
- [ ] Flagged, rather than silently fixed, any issue outside the requested file scope
- [ ] Checked whether authored content or metadata gates the accessible feature

---

## Semantics

- [ ] Element choice is correct for the interaction (button vs. link vs. input vs. div)
- [ ] Native HTML is preferred before adding ARIA
- [ ] Heading levels are meaningful and not skipped
- [ ] Landmark elements (`main`, `nav`, `aside`, etc.) are used where appropriate

---

## Accessible name

- [ ] Every interactive control has an accessible name
- [ ] Icon-only controls have `aria-label` or visually hidden text
- [ ] Controls reference visible text with `aria-labelledby` where appropriate
- [ ] Accessible names describe the action or destination rather than saying "click here"

---

## State and relationships

- [ ] `aria-describedby` ids are valid and referenced elements exist in the DOM
- [ ] Error messages are connected to invalid fields through `aria-describedby`
- [ ] `aria-invalid="true"` is set only when validation has failed
- [ ] `aria-expanded`, `aria-selected`, `aria-pressed`, `aria-current`, and `aria-busy` reflect real state
- [ ] Decorative icons have `aria-hidden="true"`

---

## Keyboard and focus

- [ ] All interactions can be completed with keyboard only
- [ ] Focus indicators are visible and have sufficient contrast
- [ ] Tab order follows logical reading order
- [ ] There are no positive `tabindex` values
- [ ] Dialogs, drawers, menus, and popovers move focus correctly on open
- [ ] Focus returns to the trigger after temporary UI is dismissed
- [ ] There is no focus trap except inside an intentional modal dialog

---

## Forms

- [ ] Every field has a programmatically associated label
- [ ] Required fields use `required` or `aria-required="true"`
- [ ] Errors are specific, visible, and connected to their field
- [ ] Related controls use `<fieldset>` and `<legend>` where needed
- [ ] Placeholder text is not the only label

---

## Visual checks

- [ ] Normal text contrast is at least 4.5:1; large text is at least 3:1
- [ ] UI component boundaries have at least 3:1 contrast
- [ ] Focus indicators have at least 3:1 contrast against adjacent colors
- [ ] Information is not conveyed by color alone
- [ ] UI remains functional at 200% browser zoom
- [ ] Motion respects `prefers-reduced-motion` where applicable

---

## Dynamic updates

- [ ] Async updates use `aria-live="polite"` or `role="status"`
- [ ] Error interruptions use `aria-live="assertive"` or `role="alert"` sparingly
- [ ] Loading states expose `aria-busy` where appropriate
- [ ] Live-region containers remain in the DOM while their text is updated

---

## Pattern conformance

- [ ] Widget matches a known pattern in [pattern-guide.md](pattern-guide.md)
- [ ] The simplest correct pattern was chosen; use native elements where possible
- [ ] Anti-patterns are absent: click-only divs, placeholder-only labels, removed outlines without
      replacements, and ARIA used to compensate for the wrong native element

---

## WCAG 2.1 AA — component-level criteria

Ordered by frequency of violation.

| Criterion | Rule | Common violation |
|---|---|---|
| **4.1.2** | UI components expose name, role, and value | `<div>` used as a button or checkbox with no ARIA |
| **1.1.1** | Non-text content has a text alternative | `<img>` missing `alt`; icon button missing a label |
| **2.1.1** | All functionality is keyboard-operable | Click-only handlers; no key handling |
| **2.4.7** | Focus is always visible | `outline: none` with no replacement style |
| **1.4.3** | Text contrast ≥ 4.5:1 (normal), ≥ 3:1 (large) | Low-contrast secondary text or placeholder |
| **1.4.11** | UI component contrast ≥ 3:1 | Input, checkbox, or button boundary disappears |
| **3.3.1** | Errors are identified in text, not color alone | Red border only; no error text |
| **3.3.2** | Inputs have labels or instructions | Input has no `<label>` or `aria-label` |
| **1.3.1** | Information and relationships use structure | Skipped headings; data table has no `<th>` |
| **2.4.3** | Focus order is logical | `tabindex` breaks natural DOM order |
| **4.1.3** | Status messages are programmatically determined | Toast injected with no `role="status"` |
| **2.4.4** | Link/button purpose is clear from its label | "Read more" has no context; icon-only button |
| **1.4.1** | Color is not the only visual means | Required-field indicator uses color alone |
| **1.3.5** | Input purpose is identifiable | Personal-data input is missing `autocomplete` |

Full specification: [WCAG 2.1](https://www.w3.org/TR/WCAG21/)
