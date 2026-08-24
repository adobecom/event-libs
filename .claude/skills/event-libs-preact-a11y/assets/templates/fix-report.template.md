## Preact Accessibility Fixes Applied — `{COMPONENT_NAME}`

**Scope:** {Full | Partial — root cause outside requested file(s): [{FILES}]}
**Render boundary:** {entry point → provider/store → component → DOM root/portal}

| # | WCAG | Change | State source | Verification |
|---|---|---|---|---|
| 1 | 4.1.2 | Added a contextual `label` to `<IconButton>` | Component props | HTM string test |
| 2 | 2.4.3 | Restored focus from the dialog cleanup | `useEffect` lifecycle | Real DOM/browser test |
| 3 | 4.1.3 | Bound `aria-busy` to loading state | Signal/reducer state | Browser/integration |

**Design fidelity check (required when a design reference was used):**

| Property | Figma leaf node | Design value | CSS applied | Match? |
|---|---|---|---|---|
| color | `{NODE_ID}` | `{VALUE}` | `{VALUE}` | {yes / no — fixed / no — flagged below} |

**Test limitation:**

- {What the HTM mock proves and what still requires real Preact/browser verification}

**Sibling files checked:**

- `{FILE}` — {same issue, awaiting approval | different pattern, not affected: {why}}

**Flagged for design/tokens or broader ownership:**

- {Item or none}
