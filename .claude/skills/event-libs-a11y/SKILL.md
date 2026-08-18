---
name: event-libs-a11y
description: >
  Audit, fix, and instrument event-libs components (vanilla JS/DOM, commonly built with the
  shared `createTag` helper) to meet WCAG 2.1 AA accessibility standards. Use when the user asks
  to audit accessibility, fix ARIA issues, add keyboard navigation, make a component
  screen-reader friendly, improve focus management, check color contrast, address WCAG
  compliance, or add accessibility to a non-Preact event-libs block, feature, or utility. For
  components using `htm-preact.js`, use the `event-libs-preact-a11y` skill instead.
metadata:
  version: 1.1.0
  domain: Build and Code
  kind: skill
  tags: [accessibility, a11y, wcag, aria, event-libs, keyboard, screen-reader]
compatibility:
  agents: [claude-code, codex, cursor]
  requirements:
    - Component file(s) under event-libs/v1/ in scope
#disable-model-invocation: true
---

# Web Accessibility — `event-libs-a11y`

Workflow for auditing, fixing, and instrumenting **event-libs** components against WCAG 2.1 AA.
Event-libs is vanilla JS/HTML/CSS (no React/Vue/Angular and no bundler). Blocks and features use
native DOM APIs and commonly use the shared `createTag(tag, attrs, content, options)` helper from
`event-libs/v1/utils/utils.js`. Audits and fixes apply to the full local component; Milo-provided
behavior must be traced to its source before being treated as event-libs-owned code.

For components that import `event-libs/v1/deps/htm-preact.js` (including the sessions guide), use
the sibling [event-libs-preact-a11y](../event-libs-preact-a11y/SKILL.md) skill instead.

## Keywords

audit accessibility, fix a11y, add ARIA, keyboard navigation, screen reader, focus management,
color contrast, WCAG compliance, aria-label, aria-describedby, role, tabindex, accessible component

## Purpose

- Audit event-libs blocks, features, and utilities and report ranked issues
- Fix existing accessibility violations
- Add WCAG 2.1 AA compliance to a new or bare component
- Flag issues that live outside the given file(s) rather than silently editing files that were not
  in scope

## Intake (required)

Before proposing a plan, confirm:

- which component file(s) under `event-libs/v1/` are in scope
- what the user wants: **audit** (report only), **fix** (apply changes), or **add** (instrument from scratch)
- whether there is a known issue list or the skill should discover issues first

If invoked via a handoff from an orchestrator with fields such as
`ticket`/`scope`/`known_issue`/`figma_refs`/`sibling_files`, treat those fields as already answered.
Do not re-ask for scope or re-derive the known-issue context from the ticket. The **mode** question
is never assumed from that contract, so still ask it unless the handoff explicitly states one.

**Orchestrator handoffs run ticket-scoped, not component-scoped.** When a `known_issue` is supplied,
that string is the entire scope of the run, not a starting point for a broader sweep. Do not run the
full Step 3 checklist or surface unrelated WCAG findings. The one exception is `sibling_files`
entries already supplied by the orchestrator: those may be echoed back, but not auto-fixed. A
standalone invocation still runs the full checklist.

Ask one blocking question at a time when the above is unclear.

## Workflow

### Step 1 — Map the component

Read the file(s) in scope. Identify every interactive or structural element created through
authored markup, `createTag`, or native DOM methods. Note where event listeners are attached.
Construction and event wiring can be split across a block, a sibling component module, or a shared
feature, so trace that wiring before concluding an element is or is not keyboard-operable.

Check imports to distinguish local behavior from Milo behavior. Event-libs imports shared helpers
through its utilities and the runtime `LIBS` configuration; never assume an inaccessible behavior
is locally owned until its implementation has been traced.

If the task scope is a single file but an issue's root cause is in a different file, say so rather
than expanding scope without asking.

Also check whether relevant markup is conditionally rendered behind authored content or metadata.
If found, state whether the real fix is code-level (make the feature unconditional with a fallback)
or authoring-level (add the missing content or metadata), because those have different owners.

---

### Step 2 — Identify mode

| User intent | Mode |
|---|---|
| "audit", "check", "review", "what's wrong" | **Audit** |
| "fix", "resolve", "address", "correct" | **Fix** |
| "add accessibility", "make accessible", "add ARIA" | **Add** |

If intent is ambiguous, ask: "Do you want me to (1) audit and report issues, (2) fix existing
issues, or (3) add accessibility to a new component?"

---

### Step 3 — Run the checklist

**Standalone invocation** (no orchestrator handoff): walk every element through the checklist.
Cover semantics, accessible names, state and relationships, keyboard and focus, forms, visual
checks, dynamic updates, and WCAG criteria.

**Orchestrator handoff** (a `known_issue` was supplied): skip the full sweep. Use the checklist
only to confirm the correct pattern or fix for the named issue.

For widget-like components (dialogs, drawers, tabs, carousels, combobox/listbox suggestions,
progress/status, and similar patterns), look up the correct ARIA pattern before proposing a fix.

→ Checklist + WCAG criteria: [references/checklist.md](references/checklist.md)
→ Widget patterns: [references/pattern-guide.md](references/pattern-guide.md)

---

### Step 4 — Execute mode

**Audit** — Report findings ranked by severity (Critical → Serious → Moderate → Minor). Do not edit
code. On an orchestrator handoff, the report has exactly one row: the `known_issue`.
→ Output template: [assets/templates/audit-report.template.md](assets/templates/audit-report.template.md)

**Fix** — Apply targeted changes to the file(s) in scope. Do not touch layout, styling, or logic
unrelated to accessibility, and do not reach into other files unless asked.

Only apply, without asking first, what the ticket or task directly names. Anything beyond that — a
sibling file that appears to share the bug, a design-value mismatch found while verifying fidelity,
or another issue noticed along the way — gets **surfaced, not applied**.

If the fix originates from a design reference such as Figma, complete this gate before reporting
the fix as done:

1. List every visual property being added or changed.
2. For each property, retrieve the actual value from the relevant Figma leaf node and record its id.
3. Compare each value with the CSS being touched. Existing CSS is not evidence of a match.
4. Inspect similarly named sibling components independently, state what was found, and ask before
   fixing any file outside the named scope.

If a design value requires a broader token or shared-rule change, flag it instead of hardcoding it.

→ Fix patterns: [references/fix-patterns.md](references/fix-patterns.md)
→ Output template: [assets/templates/fix-report.template.md](assets/templates/fix-report.template.md)

**Add** — Instrument the component from scratch: semantic HTML first, then ARIA roles/states,
keyboard handling, focus management, and live regions.
→ Add-mode steps + patterns: [references/fix-patterns.md](references/fix-patterns.md)

---

### Step 5 — Verify and output

Run targeted checks for touched source files:

- JavaScript: `npx eslint <touched-js-files>`
- CSS: `npx stylelint <touched-css-files>`
- Tests: run the closest unit test(s), following the mirrored paths under `test/unit/`

Report any pre-existing failures separately. Do not fix unrelated lint or test failures.

Fill the structured output card for every run and attach the relevant mode template. Do not end
with a prose-only recap in place of these templates.

→ [assets/templates/output-card.template.yaml](assets/templates/output-card.template.yaml)

## Output (structured-first)

- Every mode: fill [assets/templates/output-card.template.yaml](assets/templates/output-card.template.yaml).
- Audit mode: also fill [assets/templates/audit-report.template.md](assets/templates/audit-report.template.md).
- Fix mode: also fill [assets/templates/fix-report.template.md](assets/templates/fix-report.template.md).

## Rules

- On an orchestrator handoff, stay strictly ticket-scoped: no bonus findings or widened audit.
- Never change visual layout, styling, or logic unrelated to accessibility.
- Prefer native semantic HTML over ARIA; use ARIA only where semantics are insufficient.
- Use `createTag` from `event-libs/v1/utils/utils.js` where the surrounding component does.
- Never hardcode Milo URLs or reimplement behavior already supplied by Milo.
- Never use positive `tabindex` values.
- Never remove `outline` or `focus-visible` styles without a replacement. Reuse an existing focus
  token or custom property where available.
- If a fix requires a new design token or shared color change, flag it rather than hardcoding it.
- When a design reference drives a fix, verify every touched visual property against the actual
  Figma leaf node before considering the fix complete.
- Never apply a fix beyond what the ticket or task directly names without asking first.
- Keep inline accessibility comments to non-obvious ARIA choices only.
- Run targeted JS/CSS lint and relevant tests after fixing; distinguish new failures from baseline debt.
