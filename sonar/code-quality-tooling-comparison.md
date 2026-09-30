# Code Quality Tooling Comparison — event-libs

How our current setup (CodeQL + local `eslint-plugin-sonarjs`) compares to running
a full SonarQube Server.

| Capability | CodeQL (in use) | Local sonarjs (in use) | SonarQube Server |
|---|---|---|---|
| **Security** | | | |
| Cross-file taint/dataflow analysis | ✅ Yes (core strength) | ❌ No | ✅ Yes |
| Security vulnerability detection (injection, XSS, SSRF, etc.) | ✅ Yes, semantic queries | ❌ No | ✅ Yes |
| Native GitHub PR/Security-tab integration | ✅ Yes | ⚠️ Custom workflow only | Needs separate setup |
| **Maintainability** | | | |
| Code smells (cognitive complexity, nested ternaries/templates, dead code) | ❌ Not its focus | ✅ Yes | ✅ Yes |
| Regex risk detection (super-linear/backtracking, complexity) | ❌ No | ✅ Yes | ✅ Yes |
| Duplicate code block detection (cross-file) | ❌ No | ❌ No | ✅ Yes |
| **Governance / Reporting** | | | |
| Reliability / Maintainability / Security ratings (A–E) | ❌ No | ❌ No | ✅ Yes |
| Quality Gate (pass/fail policy, e.g. 0 new bugs, debt ratio) | ❌ No | ⚠️ Hand-rolled (exit code only) | ✅ Built-in, configurable |
| New-code-period focus (flag only regressions since last release) | ❌ No | ❌ No — always full scan | ✅ Yes |
| Coverage-linked quality gate | ❌ No | ❌ No | ✅ Yes |
| Historical trend / technical debt dashboard | ⚠️ Partial (alert history) | ❌ No (static report file) | ✅ Yes |
| Issue lifecycle (false-positive/won't-fix tracking over time) | ⚠️ Partial (alert dismissal) | ❌ No | ✅ Yes |
| **Setup / Ops** | | | |
| Requires server/hosting | ❌ No (GitHub-native) | ❌ No | ✅ Yes (self-host or SonarCloud) |
| Requires project onboarding/tokens | ❌ No | ❌ No | ✅ Yes |
| Cost to adopt | Already enabled | Zero (npm only) | Infra + licensing (Community edition is free but self-hosted) |

## Takeaway

- **Security is already covered** by CodeQL — a SonarQube server would be
  largely redundant here for vulnerability detection.
- **Maintainability rules** (complexity, nesting, regex risk, etc.) are
  covered locally via `eslint-plugin-sonarjs` (`npm run lint:sonar`),
  enforced as a blocking PR check into `dev`.
- **The real gap** a SonarQube server would close: duplicate-code detection,
  A–E ratings, configurable Quality Gates, new-code-only gating, and a
  persistent trend/debt dashboard across releases.
