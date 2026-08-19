# `event-a11y` — ported from `unity-a11y`

WCAG 2.1 AA audit / fix / add workflow for event-libs blocks. Ported from
[`adobecom/unity` `.claude/skills/unity-a11y`](https://github.com/adobecom/unity/tree/stage/.claude/skills/unity-a11y)
(v1.1.0) at the team's request.

## Why the port was cheap

The accessibility logic needed no rewriting. Unity and event-libs share the same stack
assumptions:

| | Unity | event-libs |
|---|---|---|
| Stack | vanilla JS/HTML/CSS, no framework | same (ES modules, no bundler) |
| DOM helper | `createTag(tag, attrs, content)` | **same helper**, imported from Milo |
| Events | native `addEventListener` | same |
| Lint | `npm run lint:js` / `lint:css` | same script names |

So the checklist, the WCAG success-criteria mapping, the ARIA widget patterns, and the
audit/fix/add workflow carried over essentially unchanged. That's the bulk of the value.

## What was changed for this repo

**Scope and paths**
- `unitylibs/` → `event-libs/v1/` (`blocks/`, `c2/blocks/`, `features/`, `utils/`).
- `createTag` sourced from Milo via `event-libs/v1/utils/utils.js` rather than Unity's
  `scripts/utils.js`.

**Architecture notes rewritten** (Step 1 "Map the block"). Unity's "widget file vs sibling
binder/workflow file" split was replaced with the four ways event-libs actually separates DOM from
behavior:
- block `init(el)` assembling slots while sibling sub-feature modules build the controls,
- page-level `decorateArea`/`decorateEvent` in `utils/decorate.js`,
- ARIA state arriving asynchronously via `BlockMediator.subscribe`,
- content swapping on a **timer** (live/on-demand session state).

**Authored-content ownership.** Unity's "feature hidden behind an `.icon-*` authoring flag"
anti-pattern maps directly onto event-libs' DA-authored documents: `alt` text, link copy, and
metadata come from the doc, so a missing accessible name may be a **code**, **authoring**, or
**config** (Tier 1 Event Configurator) fix. Both report templates now carry an Owner column.

**Widget patterns re-aimed at this product.** Unity's drop-zone/file-upload patterns were replaced
with the ones that actually appear here: show-more/clamp toggles (`aria-expanded`), toggle buttons
(`aria-pressed`, including the async-update trap), dialogs/overlays, carousels, video players,
time-driven live regions, and status-not-by-color-alone. Dialogs, comboboxes, forms, live regions,
and the `role="presentation"`-invalid-on-`<video>` note were kept as-is — all still relevant.

**Repo-specific additions**
- A **verification step** (Step 5): lint + the affected block's unit tests. a11y fixes change DOM
  structure, which routinely breaks WTR assertions, so this is not optional here.
- The **`lint:css` gap**: `npm run lint:css` only globs `event-libs/v1/blocks/**/*.css` and
  `event-libs/v1/styles/*.css` — it does **not** cover `event-libs/v1/c2/blocks/`. C2 CSS must be
  linted directly with `npx stylelint <path>`.
- Lint baseline is **clean** in this repo, so any new error is yours. (Unity's skill said to diff
  against pre-existing lint debt.)
- A **Repo layout** section covering both block families, because they don't share styling
  conventions: C1 (`v1/blocks/`, 19 blocks, Milo/Consonant tokens, **zero** `--s2a-*`) vs C2
  (`v1/c2/blocks/`, 13 blocks, Spectrum-2 `--s2a-*`). Focus-ring guidance is given per family
  (`--color-accent` for C1, `--s2a-color-gray-1000` for C2) — a single "repo convention" here
  would be wrong for the majority of blocks. Also flags the three C1 stylesheets shipping
  `outline: none` as a live 2.4.7 hotspot.
- Repo conventions folded into the Rules: `window.lana?.log()` over `console.error`, reuse
  `features/` (e.g. `features/toast/toast.js` is already a `role="status"` live region) instead of
  reimplementing, and no vertical-spacing changes (MWPW-201396).
- Layout/reading-order section added: DOM order drives focus and reading order, so CSS `order`
  can't be used to reorder content between breakpoints (WCAG 2.4.3 / 1.3.2).

**Orchestrator handoff generalized.** Unity's `/unity-jira` command doesn't exist here, so the
handoff contract is described generically ("a ticket handoff supplying `known_issue`"). The
valuable discipline — ticket-scoped runs report only the named issue, and extra findings are
surfaced rather than fixed — was kept verbatim.

**Cross-reference, not duplication.** This repo already has an axe-core *runtime* audit agent
inside `build-block-from-figma`
([agents/accessibility-check.md](../build-block-from-figma/agents/accessibility-check.md), WCAG 2.2
AA via Playwright). `event-a11y` is static source review; the two now point at each other. Use axe
for computed contrast and focus visibility, this skill for code-level WCAG reasoning.

## Files

```
event-a11y/
├── SKILL.md                                  # workflow: intake → map → mode → checklist → execute → verify → output
├── references/
│   ├── checklist.md                          # per-element checklist + WCAG 2.1 AA criteria table
│   ├── fix-patterns.md                       # before/after fixes in createTag idiom
│   └── pattern-guide.md                      # correct ARIA pattern per widget type
└── assets/templates/
    ├── audit-report.template.md              # severity-ranked findings + Owner column
    ├── fix-report.template.md                # changes + verification + design-fidelity tables
    └── output-card.template.yaml             # structured run summary
```

## Usage

```
/event-a11y
```

Then state the file(s) in scope and the mode (audit / fix / add). Example asks:

- "audit accessibility of the event-session-details block"
- "fix the missing aria-pressed on the favorite button"
- "add accessibility to the new event-speakers block"

## Keeping it in sync

Upstream is `adobecom/unity` on `stage`. If it gains new patterns worth having, re-diff against
this port — the divergence is concentrated in SKILL.md Step 1, Step 5, and the Rules list; the
checklist and WCAG table are close to verbatim.
