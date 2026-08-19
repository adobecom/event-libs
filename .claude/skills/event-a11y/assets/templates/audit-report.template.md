## Accessibility Audit — `{BLOCK_NAME}`

**Scope:** {Full | Partial — root cause outside requested file(s): [{FILES}]}

### Issues

| # | Severity | WCAG | Element | Issue | Owner | Recommendation |
|---|---|---|---|---|---|---|
| 1 | Critical | 1.1.1 | `<img>` | Missing alt text | Code / Authoring | Add descriptive `alt`; add a code-level fallback when the authored alt is empty |
| 2 | Serious  | 4.1.2 | `<div role="button">` | Missing accessible name | Code | Add `aria-label` or visible label |
| 3 | Serious  | 4.1.2 | `.favorite-btn` | `aria-pressed` never updated on the async path | Code | Route click + `BlockMediator` update through one state function |
| 4 | Moderate | 2.1.1 | `<div>` with click listener only | Not keyboard accessible | Code | Replace with `<button>` or add a `keydown` listener |
| 5 | Minor    | 1.4.3 | `.subtitle` | Contrast 3.2:1 (needs ≥ 4.5:1) | Design | Flag to design for `--s2a-*` token update |

**Owner** is one of **Code** (block JS/CSS), **Authoring** (empty/incorrect value in the DA doc),
**Config** (Tier 1 Event Configurator / event config), or **Design** (token/contrast change) — see
SKILL.md Step 1.

### Summary

Critical: {N}  Serious: {N}  Moderate: {N}  Minor: {N}
Estimated effort: {Low | Medium | High}

### Not verified statically

- {e.g. computed contrast / focus visibility — recommend the axe-core runtime agent in `build-block-from-figma`}
