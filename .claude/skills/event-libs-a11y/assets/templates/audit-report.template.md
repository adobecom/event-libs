## Accessibility Audit — `{COMPONENT_NAME}`

**Scope:** {Full | Partial — root cause outside requested file(s): [{FILES}]}

### Issues

| # | Severity | WCAG | Element | Issue | Recommendation |
|---|---|---|---|---|---|
| 1 | Critical | 1.1.1 | `<img>` | Missing alt text | Add descriptive `alt` attribute |
| 2 | Serious | 4.1.2 | `<div role="button">` | Missing accessible name | Add `aria-label` or visible label |
| 3 | Moderate | 2.1.1 | `<div>` with click listener only | Not keyboard accessible | Replace with `<button>` or add a `keydown` listener |
| 4 | Minor | 1.4.3 | `.subtitle` | Contrast 3.2:1 (needs ≥ 4.5:1) | Flag for a token/design update |

### Summary

Critical: {N}  Serious: {N}  Moderate: {N}  Minor: {N}
Estimated effort: {Low | Medium | High}
