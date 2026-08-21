---
name: event-libs-preact-a11y
description: >
  Audit, fix, and add WCAG 2.1 AA accessibility in event-libs Preact components that use
  `htm-preact.js`, HTM tagged templates, hooks, Context, and Signals. Use for the sessions guide
  or any other Preact block, feature, overlay, drawer, filter, tabset, carousel, live region, or
  component in event-libs when the user asks for an accessibility audit, ARIA fixes, keyboard
  behavior, focus management, screen-reader support, contrast review, or accessible tests.
metadata:
  version: 1.0.0
  domain: Build and Code
  kind: skill
  tags: [accessibility, a11y, wcag, aria, event-libs, preact, htm, signals, keyboard, screen-reader]
compatibility:
  agents: [claude-code, codex, cursor]
  requirements:
    - Preact component file(s) under event-libs/v1/ in scope
#disable-model-invocation: true
---

# Preact Web Accessibility — `event-libs-preact-a11y`

Workflow for auditing, fixing, and instrumenting event-libs Preact components against WCAG 2.1 AA.
The primary reference implementation is `event-libs/v1/c2/blocks/sessions-guide/`, which uses:

- `html` tagged templates and `h()` from `event-libs/v1/deps/htm-preact.js`
- Preact hooks and Context for component-local UI state
- `@preact/signals` for shared session/auth/action state
- native DOM event behavior through lowercase HTM properties such as `onclick`
- portals, drawers, nested dialogs, tabs, filters, carousels, and dynamic status content

Use the vanilla [event-libs-a11y](../event-libs-a11y/SKILL.md) skill instead when the scoped code
does not render through Preact.

## Keywords

Preact accessibility, HTM accessibility, sessions guide a11y, audit accessibility, fix ARIA,
keyboard navigation, focus trap, screen reader, reactive ARIA, Signals, WCAG compliance

## Purpose

- Audit Preact components and rank accessibility issues
- Fix existing violations without breaking Preact ownership or reactive state
- Add accessible semantics, keyboard behavior, focus management, and announcements
- Add meaningful tests while distinguishing string-mock coverage from real browser behavior
- Keep standalone audits comprehensive and orchestrator handoffs strictly ticket-scoped

## Intake (required)

Before proposing a plan, confirm:

- which Preact component, entry point, CSS, and tests under `event-libs/v1/` are in scope
- whether the user wants **audit**, **fix**, or **add** mode
- whether a known issue exists or the skill should discover issues

If an orchestrator handoff supplies `ticket`, `scope`, `known_issue`, `figma_refs`, or
`sibling_files`, treat those fields as answered. When `known_issue` is present, that issue is the
entire run scope. Do not broaden the audit or auto-fix sibling files.

Ask one blocking question at a time only when the required information cannot be inferred.

## Workflow

### Step 1 — Map the Preact render boundary

Trace from the block entry point to the rendered component tree before judging the scoped file:

1. Identify how Preact is loaded. Most code statically imports the local
   `event-libs/v1/deps/htm-preact.js`; an entry point may dynamically load `${miloLibs}/deps/htm-preact.js`.
2. Find the `render(h(...), root)` call and determine whether the root is the block element or a
   portal appended elsewhere, such as `.sg-portal` under `document.body`.
3. Trace component props, Context, reducer state, Signals, and imperative utilities that affect
   the element. Accessibility state may be owned outside the JSX-like HTM template.
4. Trace related CSS, especially focus, visually hidden content, responsive reorder, modal
   positioning, disabled states, and reduced-motion behavior.
5. Read the nearest tests and determine whether they use the real DOM or the string-rendering
   `test/unit/mocks/deps/htm-preact.js` replacement.

If the root cause is outside the requested file, report the ownership boundary and ask before
expanding the edit scope.

### Step 2 — Identify mode

| User intent | Mode |
|---|---|
| "audit", "check", "review", "what's wrong" | **Audit** |
| "fix", "resolve", "address", "correct" | **Fix** |
| "add accessibility", "make accessible", "add ARIA" | **Add** |

If the intent remains ambiguous, ask whether the user wants an audit, a targeted fix, or new
accessibility instrumentation.

### Step 3 — Run the Preact checklist

For a standalone invocation, inspect every rendered interactive and structural element plus its
reactive states. For an orchestrator handoff, use the checklist only to validate the named issue.

→ [references/checklist.md](references/checklist.md)
→ [references/pattern-guide.md](references/pattern-guide.md)

Pay particular attention to:

- semantic elements expressed directly in HTM rather than ARIA-patched `<div>` elements
- accessible names for reusable components such as `IconButton`
- ARIA values derived from the same state or Signal as the visible UI
- stable ids and relationships across conditional renders
- keyboard behavior, focus entry/restoration, and effect cleanup for dialogs and drawers
- portals whose DOM location differs from their source block
- async and Signal-driven updates that need persistent live regions

### Step 4 — Execute mode

**Audit** — Report Critical → Serious → Moderate → Minor findings without editing code. A
ticket-scoped handoff produces exactly one issue row.
→ [assets/templates/audit-report.template.md](assets/templates/audit-report.template.md)

**Fix** — Make the smallest targeted change within the named files. Express DOM attributes and
handlers declaratively in the HTM template; do not imperatively mutate Preact-owned DOM unless the
behavior is inherently imperative, such as focus movement. Effects must clean up listeners,
subscriptions, timers, observers, and temporary document state.

Do not fix related issues or sibling files without approval. If Figma drives a visible change,
verify every touched visual value against the specific leaf node and flag token gaps.

→ [references/fix-patterns.md](references/fix-patterns.md)
→ [assets/templates/fix-report.template.md](assets/templates/fix-report.template.md)

**Add** — Build semantics first, then state/relationships, keyboard interaction, focus management,
and announcements. Keep source-of-truth state unified so visible and accessible states cannot drift.
→ [references/fix-patterns.md](references/fix-patterns.md)

### Step 5 — Test at the correct layer

The Web Test Runner middleware replaces the production Preact bundle with
`test/unit/mocks/deps/htm-preact.js`. That mock serializes templates to strings, does not attach
event handlers, and stubs `useEffect`/`useLayoutEffect` as no-ops. It quotes interpolated
attribute values the way real htm does, so an `aria-label=${label}` survives into the rendered
output; assert the quoted form (`aria-label="…"`).

Therefore:

- String tests may prove static roles, names, and initial ARIA attributes.
- They do **not** prove keyboard events, focus movement/restoration, effect cleanup, reactive
  rerenders, or ARIA state transitions.
- Test imperative utilities such as `focus-trap.js` against real DOM elements.
- For component behavior requiring real Preact rendering, use an appropriate browser/integration
  page or add a test seam that exercises the behavior without claiming the string mock rendered it.
- Never weaken production behavior to accommodate the test mock. Extend the shared mock only when
  a newly imported public primitive is missing, and preserve its documented limitations.

Run:

- `npx eslint <touched-js-files>`
- `npx stylelint <touched-css-files>`
- `npx wtr <nearest-test-files> --node-resolve --port=2000`

Report pre-existing failures separately and do not fix unrelated debt.

#### Automated axe checks

The string mock serializes templates into real DOM, so axe can read roles, names, and initial
ARIA — but never state transitions, focus movement, or anything an effect would have produced.
Scope each layer to what it can actually prove:

- **Unit.** `expectAccessible(el)` from `test/unit/helpers/a11y.js` runs axe-core scoped to
  WCAG 2.1 A/AA tags. See `test/unit/c2/blocks/sessions-guide/components/a11y.test.js` for the
  working pattern, and add a case there when a fix touches roles, names, or initial ARIA.
- **Live page.** The `a11y` MCP server runs axe in a real browser — the only layer that
  reaches effect-driven ARIA, focus order, and computed contrast. Point `test_accessibility`
  at a `localhost:3868` page for overlays, drawers, and filter panels.

Two traps make a unit scan pass while proving nothing:

- **Empty signals.** A component rendered with empty `sessions`/`scheduled` signals yields an
  empty state, not a card. Seed from `mocks/session-fixtures.js` (`SESSION_VARIANTS`, `CATALOG`)
  — `mocks/sessions.json` is a stale sample response, not a current-schema fixture.
- **Effect-gated state.** Anything a `useEffect` would set never happens, so app-level views
  render empty regardless of seeding — `activeDay` is the canonical example. Mount the leaf
  component with props (or set `SessionGuideContext._current` directly, as
  `SessionDetailOverlay.test.js` does) instead of scanning through `App`.

Never report a passing unit axe scan as evidence that keyboard or focus behavior works.

### Step 6 — Output

Every run must fill the structured output card. Audit and fix runs must also fill their mode report.

→ [assets/templates/output-card.template.yaml](assets/templates/output-card.template.yaml)

## Rules

- Prefer native HTML in HTM: `<button>`, `<a href>`, `<input>`, headings, lists, and landmarks.
- Follow this repo's HTM syntax (`class`, lowercase `onclick`, component tags such as `<${Icon}>`).
- Put native boolean properties such as `disabled` on the native element. Serialize ARIA state
  deliberately (`String(value)` or an equivalent stable string) and omit inapplicable ARIA with
  `undefined`, not misleading false state.
- Derive the visible state and its ARIA attribute from the same reducer/Signal value.
- Use stable `key` values for reordered lists; never use an array index when identity can change.
- Do not add positive `tabindex` values.
- Do not use `role="button"` on an element that can be a native `<button>`.
- Do not add redundant ARIA to native semantics.
- Reuse accessible primitives such as `IconButton` and `Icon`; verify required labels at every call site.
- Effects that subscribe or attach listeners must return cleanup functions.
- Modal effects must move focus in, constrain it, support allowed dismissal, restore the trigger,
  and prevent background interaction. Nested modal surfaces require separate focus ownership.
- Portal content must be audited where it is rendered in the DOM, not only at the source block.
- Do not remove focus indicators without an approved replacement token.
- Do not claim interaction accessibility based only on the HTM string mock.
- Never broaden a ticket-scoped fix without user approval.
