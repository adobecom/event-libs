---
name: event-a11y
description: >
  Audit, fix, and instrument event-libs blocks (vanilla JS/DOM, built with Milo's
  `createTag` helper) to meet WCAG 2.1 AA accessibility standards. Use when the user asks to
  audit accessibility, fix ARIA issues, add keyboard navigation, make a block
  screen-reader friendly, improve focus management, check color contrast, address WCAG
  compliance, or add accessibility to an event-libs block or feature.
metadata:
  version: 1.1.0
  domain: Build and Code
  kind: skill
  tags: [accessibility, a11y, wcag, aria, event-libs, keyboard, screen-reader]
  ported-from: adobecom/unity .claude/skills/unity-a11y (v1.1.0)
compatibility:
  agents: [claude-code, codex, cursor]
  requirements:
    - Block or feature file(s) under event-libs/v1/ in scope
#disable-model-invocation: true
---

# Web Accessibility — `event-a11y`

Workflow for auditing, fixing, and instrumenting **event-libs** blocks against WCAG 2.1 AA.
event-libs is vanilla JS/HTML/CSS ES modules (no React/Vue/Angular, no bundler) — blocks are
built by hand with the `createTag(tag, attrs, content)` helper imported from Milo via
`event-libs/v1/utils/utils.js`, and wired up with native `addEventListener`. Every element here
is local, custom code: there is no SDK-managed component boundary to scope around, so
audits/fixes apply to the full block.

**Related, not duplicated:** `build-block-from-figma` has an
[axe-core runtime audit agent](../build-block-from-figma/agents/accessibility-check.md) that
scans a *rendered* page via Playwright. That catches computed-contrast and real-DOM violations;
this skill does static code review and WCAG reasoning on the source. They complement each other
— an axe report is good input to this skill's Fix mode, and running axe afterwards is a good way
to confirm a fix.

## Repo layout — this skill covers the whole repo, C1 and C2

Two block families live here and they do **not** share styling conventions. Establish which one
you're in before proposing any CSS-level fix:

| | C1 — `event-libs/v1/blocks/` | C2 — `event-libs/v1/c2/blocks/` |
|---|---|---|
| Share of repo | 19 blocks — the larger family | ~9 and growing (new work lands here) |
| Design tokens | Milo/Consonant (`--color-accent`, …). **No `--s2a-*`** | Spectrum-2 `--s2a-*` throughout |
| Focus ring in use | `outline: 2px solid var(--color-accent, #1473e6)` | `outline: 2px solid var(--s2a-color-gray-1000, #000)` |
| Covered by `npm run lint:css` | yes | **no** — lint directly (see Step 5) |

Also in scope: `event-libs/v1/features/` (shared widgets — toast, carousel, icons) and
`event-libs/v1/utils/` (page-level decoration).

Known C1 hotspot: three C1 block stylesheets contain `outline: none`. Verify a replacement
focus style exists whenever you audit one (WCAG 2.4.7).

**The examples throughout this skill are illustrative, not scoping.** Many use session-page names
(`.session-action`, `speakers-toggle`, "Add to schedule") because that block family exercises most
of the patterns — expandable lists, toggle buttons, timer-driven state, live regions. Read them as
shapes to apply to whatever block you're in, not as a restriction on which blocks this skill fits.

## Keywords

audit accessibility, fix a11y, add ARIA, keyboard navigation, screen reader, focus management,
color contrast, WCAG compliance, aria-label, aria-describedby, role, tabindex, accessible block

## Purpose

- Audit event-libs blocks and report ranked issues
- Fix existing accessibility violations
- Add WCAG 2.1 AA compliance to a new or bare block/feature
- Flag issues that live outside the given file(s) — e.g. a block's markup here vs. a sub-feature
  module or `utils/decorate.js` that actually creates the element — rather than silently editing
  files that weren't in scope

## Intake (required)

Before proposing a plan, confirm:

- which file(s) under `event-libs/v1/` are in scope (a block dir, a sub-feature module, a
  `features/` module, or a `utils/` helper)
- what the user wants: **audit** (report only), **fix** (apply changes), or **add** (instrument from scratch)
- whether there is a known issue list (a Jira ticket, an axe-core report) or the skill should
  discover issues first

If invoked via a handoff from an orchestrator or a ticket (fields like
`ticket`/`scope`/`known_issue`/`figma_refs`/`sibling_files`), treat those fields as already
answered — don't re-ask for scope or re-derive the known-issue context from the ticket yourself.
The **mode** question (audit/fix/add) is never part of that contract, so still ask it unless the
handoff explicitly states one.

**Ticket handoffs run ticket-scoped, not block-scoped.** When a `known_issue` is
supplied, that string *is* the entire scope of the run — not a starting point for a broader
sweep. Do not run the full Step 3 checklist against the file, and do not surface additional WCAG
findings (other criteria, other elements, other files) that the checklist would otherwise catch,
even if they're sitting right next to the code you're already reading. Report and/or fix only the
named issue. The one exception: `sibling_files` entries the handoff already surfaced — those
may be echoed back (still not auto-fixed), since they're part of what was handed off, not a
new discovery. A standalone invocation (no handoff, a user hands you a file directly) still runs
the full checklist per Step 3 — this restriction is specific to ticket-handoff runs.

One blocking question at a time when the above is unclear.

## Workflow

### Step 1 — Map the block

Read the file(s) in scope. Identify every interactive or structural element created via
`createTag`, and note where its event listeners are actually attached. In event-libs, DOM
construction and event wiring are often split across files in ways you must trace before
concluding an element is or isn't keyboard-operable:

- **Block entry vs. sub-feature modules.** A block's `init(el)` frequently only assembles slots,
  with the real elements built by sibling modules in the same block dir (a block dir may split
  into `favorite.js`, `share.js`, `schedule.js`, `track-tags.js`, `description-clamp.js`, and a
  state-view module). The `<button>` you're auditing may be created two files away from the `init`
  that appends it — always `ls` the block dir before assuming one file is the whole block.
- **Page-level decoration.** `event-libs/v1/utils/decorate.js` (`decorateArea` → `decorateEvent`)
  rewrites authored markup before blocks run — icons, RSVP links, and metadata-driven content.
  An attribute you expect to be missing may be added there.
- **Async state via BlockMediator.** Cross-block state (`imsProfile`, `rsvpData`, `eventData`,
  `espData`) arrives through `BlockMediator.subscribe`. ARIA state that reflects it
  (`aria-pressed` on a favorite, `aria-disabled` on an RSVP button) is therefore set *after*
  first paint — check the subscribe callback, not just the initial `createTag`.
- **Time-driven state.** Some blocks re-render on a timer rather than an event (e.g. the
  Pre-Live → Live → On-Demand controller in
  `event-session-details/session-state-view.js`). Swapped content needs a live region, not just
  correct static markup.

If the task scope is a single file but a real issue's root cause is in a different file, say so
explicitly rather than expanding scope without asking.

**Check whether the issue is authored, not coded.** event-libs blocks are hydrated from
DA-authored documents: table cells, link text, image `alt`, and `<head>` metadata all come from
the doc, and helpers like `getMetadata`/`getJsonMetadata` read them. So a missing accessible name
can have three different owners:

1. **Code** — the block never wires up the authored value (or has no fallback when it's absent).
2. **Authoring** — the value is simply empty in the DA doc (missing `alt`, `Read more` link text,
   an unlabelled icon row).
3. **Config** — the value comes from the Tier 1 Event Configurator / event config JSON.

Say which one it is explicitly: they have different owners and different fixes. A code-level fix
for authored content usually means "add a sensible fallback and don't render an empty accessible
name", not "hardcode the copy".

---

### Step 2 — Identify mode

Decide which branch to follow based on the user's intent:

| User intent | Mode |
|---|---|
| "audit", "check", "review", "what's wrong" | **Audit** |
| "fix", "resolve", "address", "correct" | **Fix** |
| "add accessibility", "make accessible", "add ARIA" | **Add** |

If intent is ambiguous, ask: "Do you want me to (1) audit and report issues, (2) fix existing issues, or (3) add accessibility to a new block?"

---

### Step 3 — Run the checklist

**Standalone invocation** (no handoff): walk every element through the checklist.
Cover: semantics, accessible name, state and relationships, keyboard and focus, forms, visual
checks, dynamic updates, and WCAG criteria.

**Ticket handoff** (a `known_issue` was supplied): skip the full sweep. Use the checklist
only to confirm the correct pattern/fix for the *named* issue — don't walk unrelated elements or
categories looking for more.

For widget-like blocks (dialogs/overlays, show-more toggles, toggle buttons, carousels,
filter/combobox lists, video players, status/live regions — the patterns actually used across
event-libs), look up the correct ARIA pattern before proposing a fix.

→ Checklist + WCAG criteria: [references/checklist.md](references/checklist.md)
→ Widget patterns: [references/pattern-guide.md](references/pattern-guide.md)

---

### Step 4 — Execute mode

**Audit** — Report findings ranked by severity (Critical → Serious → Moderate → Minor). Do not edit code.
On a ticket handoff, the report has exactly one row: the `known_issue`. Don't add rows for
other issues noticed while reading the file — that's the full-checklist behavior reserved for a
standalone audit.
→ Output template: [assets/templates/audit-report.template.md](assets/templates/audit-report.template.md)

**Fix** — Apply targeted changes to the file(s) in scope. Do not touch layout, styling, or logic unrelated to accessibility, and don't reach into other files unless asked.

Only apply, without asking first, what the ticket/task directly names. Anything beyond that —
a sibling file that appears to share the same bug, a design-value mismatch found while
verifying fidelity, a related issue noticed along the way — gets **surfaced, not applied**:
name the file/property, say what you found, and ask whether to include it before touching it.
Discovering an extra issue is not authorization to fix it.

If the fix originates from a design reference (a Figma link, e.g. passed in from a ticket), the following is a hard gate — not optional, not skippable when short on time — before the fix can be reported as done:

1. List every visual property you are adding or changing (color, font-size, font-weight, line-height, spacing, etc.). An accessibility fix that adds visible content (a label, focus ring, error text, etc.) always has visual properties, even if the ticket's wording only mentions structure/behavior.
2. For each property, pull the actual value from the relevant Figma **leaf node** (Figma MCP targeted at that specific leaf id — not a parent frame, and not a guess from eyeballing a screenshot) and note the source node id.
3. Compare each pulled value against the CSS you're touching or adding. Do not assume existing CSS is already correct just because a rule with a plausibly-matching class name already exists — "a rule exists" and "the rule's values match the design" are different claims; verify the second one explicitly. If a value is out of scope for the named fix (e.g. it belongs to an element the ticket didn't ask about), surface it and ask rather than fixing it inline.
4. If the same bug pattern appears to exist in a sibling/similar file (same block family, similar id/class naming), don't assume parity from naming similarity alone and don't silently skip it either — open the sibling's actual CSS/JS and check its structure independently. State explicitly what you found, then ask before fixing it: this is a new file outside the named scope, so silence is not consent.

If a pulled design value can't be matched without a broader design-token or shared-rule change (e.g. it would also recolor unrelated elements), don't hardcode it silently — flag it per the Rules below instead. In C2 blocks, prefer the existing `--s2a-*` Spectrum-2 custom properties with a literal fallback, matching the surrounding CSS.

→ Before/after patterns (using `createTag` + native `addEventListener`, matching this repo's actual style): [references/fix-patterns.md](references/fix-patterns.md)
→ Output template: [assets/templates/fix-report.template.md](assets/templates/fix-report.template.md) — fill this for every fix-mode run before ending the turn, including the design-fidelity table when a design reference was used; a prose-only summary does not satisfy this step.

**Add** — Instrument the block from scratch: semantic HTML first, then ARIA roles/states, keyboard handling, focus management, live regions.
→ Add mode steps + patterns: [references/fix-patterns.md](references/fix-patterns.md)

---

### Step 5 — Verify (fix and add modes)

Accessibility fixes in this repo change DOM structure and attributes, which routinely breaks
unit-test assertions. Verify before reporting done:

1. **Lint** — `npm run lint`. The baseline is currently clean, so **any** error is yours.
   ⚠️ `npm run lint:css` only globs `event-libs/v1/blocks/**/*.css` and
   `event-libs/v1/styles/*.css` — it does **not** cover `event-libs/v1/c2/blocks/`. When you
   touch a C2 block's CSS, lint it directly: `npx stylelint <path-to-css>`.
2. **Tests** — run the affected block's tests:
   `npx wtr test/unit/<path>/<block>.test.js --node-resolve --port=2000`
   (or `npx wtr "test/unit/c2/**/*.test.js" --node-resolve --port=2000` for a C2 sweep).
   If a test asserted the old, inaccessible markup, update the assertion — don't revert the fix.
3. **Report actual output.** If lint or tests fail, say so with the output. Never claim a fix is
   verified without having run these.

Optionally confirm at runtime with the axe-core agent in
[`build-block-from-figma`](../build-block-from-figma/agents/accessibility-check.md) — useful for
computed contrast and focus-visibility, which static review can't fully settle.

---

### Step 6 — Output

Fill the structured output card for every run — this is a required step, not optional
documentation. Attach the relevant mode template. Do not end the turn with a prose-only recap in
place of these templates.

→ [assets/templates/output-card.template.yaml](assets/templates/output-card.template.yaml)

## Output (structured-first)

Fill [assets/templates/output-card.template.yaml](assets/templates/output-card.template.yaml) for every run — required, before the turn is considered done.

- Audit mode: also attach filled [assets/templates/audit-report.template.md](assets/templates/audit-report.template.md).
- Fix mode: also attach filled [assets/templates/fix-report.template.md](assets/templates/fix-report.template.md).

## Rules

- On a ticket handoff (a `known_issue` is supplied), stay strictly ticket-scoped: no full
  checklist, no bonus findings, no widened audit — even when the file being read makes other
  issues obvious. That breadth belongs only to a standalone (non-handoff) invocation.
- Never change visual layout, styling, or logic unrelated to accessibility.
- Prefer native semantic HTML over ARIA roles; add ARIA only where semantic HTML is insufficient.
- Never use positive `tabindex` values.
- Never remove `outline` / `focus-visible` styles without a replacement, and match the token
  family of the block you're in rather than inventing a color (see Repo layout below):
  C2 → `outline: 2px solid var(--s2a-color-gray-1000, #000); outline-offset: 2px;`,
  C1 → `outline: 2px solid var(--color-accent, #1473e6);`. Always keep the literal fallback.
- Use `createTag()` from Milo (via `event-libs/v1/utils/utils.js`) for DOM creation — never
  `document.createElement`. Set ARIA in the `createTag` attrs object where possible, so the
  element is never appended in an un-named state.
- Log errors via `window.lana?.log()` — never `console.error`.
- Don't reimplement what Milo or an existing event-libs feature already provides — check
  `event-libs/v1/features/` first (e.g. `features/toast/toast.js` already renders a
  `role="status"` live region; reuse it rather than hand-rolling one).
- If a fix requires a new design token or color change, flag it as out-of-scope and recommend a
  design-system update rather than hardcoding a value.
- Distinguish **code** vs **authoring** vs **config** ownership for missing accessible names
  (see Step 1) instead of hardcoding authored copy into the block.
- Do not add vertical spacing (top/bottom padding/margin) as part of an a11y fix — per
  MWPW-201396 that's an authoring/design concern in this repo.
- When a fix is driven by a design reference, verify every touched visual property against the
  actual Figma leaf node value before considering the fix complete — an existing CSS rule with a
  plausibly-matching class name is not evidence that its values are correct. Do this in the same
  pass as the fix, not only when asked.
- Never apply a fix for anything beyond what the ticket/task directly names — including sibling
  files with a similar bug, design-value mismatches found while verifying fidelity, or any other
  issue noticed along the way — without asking the user first. Report the finding and wait for a
  yes; don't fix-then-mention.
- Keep inline a11y comments to non-obvious ARIA choices only.
- Run lint and the affected tests per Step 5 and confirm they pass before reporting a fix as done.
