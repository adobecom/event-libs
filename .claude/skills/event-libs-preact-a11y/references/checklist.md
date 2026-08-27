# Preact Component Accessibility Checklist

Run every section for standalone work. For an orchestrator handoff with a `known_issue`, use only
the sections needed to validate that issue.

## Ownership and render boundary

- [ ] Located the entry point and `render(h(...), root)` call
- [ ] Identified whether content renders in the block element or a `document.body` portal
- [ ] Traced props, Context/reducer state, Signals, hooks, and imperative utilities affecting it
- [ ] Distinguished locally bundled Preact from dynamically loaded Milo Preact
- [ ] Read related CSS and tests
- [ ] Flagged root causes outside the requested files rather than silently fixing them

## HTM and native semantics

- [ ] Native element matches the interaction: `<button>` for actions, `<a href>` for navigation
- [ ] Headings, lists, definition lists, forms, and landmarks communicate structure
- [ ] HTM uses repo conventions: `class`, lowercase `onclick`, and explicit `type="button"`
- [ ] Native boolean properties (`disabled`, `required`, `checked`) are expressed on native elements
- [ ] No redundant or conflicting roles override native semantics
- [ ] Conditional rendering does not remove essential context, labels, or live-region containers

## Accessible names and descriptions

- [ ] Every interactive element has a contextual accessible name
- [ ] Every `IconButton` call provides a meaningful `label`
- [ ] Decorative icons use `aria-hidden="true"`; shared `Icon` output is not given duplicate semantics
- [ ] Inputs have visible `<label for>` elements or an intentional `aria-label`
- [ ] `aria-labelledby`/`aria-describedby` ids are stable, unique, and present in the same render
- [ ] Labels update when actions change, such as Add/Remove or Expand/Collapse

## Reactive state

- [ ] Visible state and ARIA state derive from the same prop, hook, reducer field, or Signal
- [ ] `aria-expanded`, `aria-pressed`, `aria-selected`, `aria-current`, `aria-disabled`, `aria-busy`,
      and `aria-invalid` reflect the current render
- [ ] Inapplicable ARIA is omitted with `undefined`, not left with a misleading value
- [ ] Signal writes and Context/reducer dispatches cause the expected component to rerender
- [ ] Conditional branches keep control/owned-element relationships valid
- [ ] Reordered lists use stable domain keys rather than array indexes

## Keyboard and focus

- [ ] All pointer interactions have native or explicit keyboard equivalents
- [ ] Tab order follows DOM reading order, including responsive layouts
- [ ] There are no positive `tabindex` values
- [ ] Custom composite widgets implement their expected arrow, Home/End, Enter/Space, and Escape keys
- [ ] Focus indicators are visible and use approved tokens
- [ ] Focus is not lost when conditional content rerenders or an item is removed

## Effects, dialogs, drawers, and portals

- [ ] `useEffect`/`useLayoutEffect` listeners, subscriptions, timers, and observers return cleanup
- [ ] Dialog/drawer receives focus on open and restores the invoking control on close
- [ ] Modal focus is constrained and Escape behavior matches product requirements
- [ ] Background content cannot be operated while a modal is active
- [ ] Nested modal surfaces (for example a filter dialog inside a drawer) own focus independently
- [ ] Body scroll/temporary document state is restored on every close and unmount path
- [ ] Portal DOM is audited at its actual document location

## Forms, filters, tabs, and selection

- [ ] Form controls have programmatic labels and useful autocomplete where applicable
- [ ] Error/help text is associated with its field and errors are not conveyed by color alone
- [ ] Filter choices use native checkboxes or toggle-button semantics consistently
- [ ] Tabsets connect tabs and panels with stable ids, `aria-controls`, and `aria-labelledby`
- [ ] Tab keyboard behavior and roving `tabindex` match the selected activation model
- [ ] Counts and badges do not become the only accessible indication of selection

## Dynamic updates

- [ ] Persistent loading/status containers use `role="status"` or `aria-live="polite"`
- [ ] Errors use `role="alert"` only when interruption is warranted
- [ ] Pending actions expose both native `disabled` behavior and useful status where needed
- [ ] Toast messages are concise and do not duplicate announcements
- [ ] Signal-driven updates are announced only when user-relevant, not on every data poll

## Visual and motion checks

- [ ] Normal text contrast ≥ 4.5:1 and large text ≥ 3:1
- [ ] UI boundaries and focus indicators have ≥ 3:1 contrast
- [ ] Information is not conveyed by color, opacity, or animation alone
- [ ] UI works at 200% zoom and narrow/reflowed layouts
- [ ] Motion and smooth scrolling respect `prefers-reduced-motion`
- [ ] Hidden/offscreen overlays are not focusable or exposed to assistive technology

## Verification quality

- [ ] Static markup assertions cover expected roles, names, and initial ARIA values
- [ ] No claim about events, effects, focus, cleanup, or rerenders relies only on the HTM string mock
- [ ] Imperative utilities have real-DOM unit tests
- [ ] Reactive component behavior has browser/integration verification or is explicitly left unverified
- [ ] The shared Preact mock was extended only if a newly imported primitive required it

## Frequently applicable WCAG 2.1 AA criteria

| Criterion | Rule | Common Preact failure |
|---|---|---|
| **4.1.2** | Components expose name, role, and value | Prop omitted from reusable control; stale ARIA state |
| **2.1.1** | Functionality is keyboard-operable | Pointer handler without native keyboard semantics |
| **2.1.2** | No keyboard trap | Drawer/dialog focus cannot escape after close |
| **2.4.3** | Focus order is logical | Conditional render or portal loses focus |
| **2.4.7** | Focus is visible | CSS removes focus outline |
| **1.1.1** | Non-text content has alternatives | Icon control lacks a label |
| **1.3.1** | Structure conveys relationships | Visual tabs/filters have no programmatic relationship |
| **1.4.3** | Text contrast meets minimum | Disabled/secondary text uses low contrast |
| **1.4.11** | UI component contrast ≥ 3:1 | Pill, input, or focus boundary disappears |
| **3.3.1** | Errors are identified in text | State changes only class/color |
| **3.3.2** | Inputs have labels/instructions | Placeholder-only search input |
| **4.1.3** | Status messages are programmatic | Signal-driven loading/toast update is silent |

Specification: [WCAG 2.1](https://www.w3.org/TR/WCAG21/)
