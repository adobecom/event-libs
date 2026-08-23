## Accessibility Fixes Applied — `{BLOCK_NAME}`

**Scope:** {Full | Partial — root cause outside requested file(s): [{FILES}]}

| # | WCAG | Change |
|---|---|---|
| 1 | 1.1.1 | Added `alt="{DESCRIPTION}"` to `<img>` |
| 2 | 4.1.2 | Replaced `<div role="button">` with `<button>` |
| 3 | 2.1.1 | Added `keydown` listener with Enter/Space support |

**Verification (required — see SKILL.md Step 5):**

| Check | Command | Result |
|---|---|---|
| Lint | `npm run lint` | {pass / fail — output} |
| Lint (C2 CSS — not covered by `lint:css`) | `npx stylelint {PATH}` | {pass / fail / n-a} |
| Unit tests | `npx wtr {TEST_PATH} --node-resolve --port=2000` | {N passed, N failed} |

Tests updated because they asserted the old markup: {list, or none}

**Design fidelity check (required if a design reference was used):**

| Property | Figma leaf node | Design value | CSS applied | Match? |
|---|---|---|---|---|
| color | `{NODE_ID}` | `{VALUE}` | `{VALUE}` | {yes / no — fixed / no — flagged below} |
| font-size | `{NODE_ID}` | `{VALUE}` | `{VALUE}` | {yes / no — fixed / no — flagged below} |

**Sibling files checked (same block family / similar id-class pattern):**
- `{FILE}` — {has the same bug, surfaced and awaiting approval | different pattern, not affected: {why}}

**Flagged, not fixed (out of scope):**
- Contrast issue on `.{CLASS}` requires an `--s2a-*` token change — flag to design system team.
- {Authoring-side issue: empty authored value in the DA doc — owner is the author, not the block.}
