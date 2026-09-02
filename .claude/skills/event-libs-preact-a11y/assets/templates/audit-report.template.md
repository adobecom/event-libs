## Preact Accessibility Audit — `{COMPONENT_NAME}`

**Scope:** {Full | Partial — root cause outside requested file(s): [{FILES}]}
**Render boundary:** {entry point → provider/store → component → DOM root/portal}
**Test layer:** {HTM string mock | real DOM utility | browser/integration}

### Issues

| # | Severity | WCAG | Component/state | Issue | Recommendation | Verification layer |
|---|---|---|---|---|---|---|
| 1 | Critical | 2.1.2 | `<FilterPanel>` open | Focus escapes the modal | Trap focus and restore its trigger on cleanup | Browser/integration |
| 2 | Serious | 4.1.2 | `<IconButton>` | Missing `label` produces an unnamed button | Supply a contextual label at the call site | String + browser |
| 3 | Moderate | 4.1.3 | loading Signal | Visible update is not announced | Keep a persistent `role="status"` region | Browser/integration |
| 4 | Minor | 1.4.3 | `.subtitle` | Contrast 3.2:1 | Flag for an approved token update | Visual/contrast tool |

### Summary

Critical: {N}  Serious: {N}  Moderate: {N}  Minor: {N}
Estimated effort: {Low | Medium | High}
