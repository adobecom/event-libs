## Accessibility Fixes Applied — `{COMPONENT_NAME}`

**Scope:** {Full | Partial — root cause outside requested file(s): [{FILES}]}

| # | WCAG | Change |
|---|---|---|
| 1 | 1.1.1 | Added `alt="{DESCRIPTION}"` to `<img>` |
| 2 | 4.1.2 | Replaced `<div role="button">` with `<button>` |
| 3 | 2.1.1 | Added `keydown` listener with Enter/Space support |

**Design fidelity check (required if a design reference was used):**

| Property | Figma leaf node | Design value | CSS applied | Match? |
|---|---|---|---|---|
| color | `{NODE_ID}` | `{VALUE}` | `{VALUE}` | {yes / no — fixed / no — flagged below} |
| font-size | `{NODE_ID}` | `{VALUE}` | `{VALUE}` | {yes / no — fixed / no — flagged below} |

**Sibling files checked (same component family or similar id/class pattern):**

- `{FILE}` — {has the same bug, fixed with approval | different pattern, not affected: {why}}

**Flagged for design/tokens (out of scope):**

- Contrast issue on `.{CLASS}` requires a color-token change — flag for the design-system owner.
