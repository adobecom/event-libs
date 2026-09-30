# Local Sonar-style Quality Check — Synopsis

## What it is

An ESLint plugin (`eslint-plugin-sonarjs`) that ports a subset of
SonarSource's static-analysis rules onto the ESLint engine. Runs via
`npm run lint:sonar` — no server, no account, no project onboarding —
and is enforced as a **blocking PR check** into `dev`
(`.github/workflows/sonarjs-check.yml`).

## What it includes

- SonarSource's recommended JS rule set (~15 active rule categories),
  running as ESLint rules against every file under `event-libs/`
  (config: `eslint.sonar.config.js`)
- Auto-generated Markdown report (`sonar/sonar-report.md`) — full
  file:line:rule breakdown, regenerated on each run
  (`scripts/generate-sonar-report.js`)
- CI enforcement via `.github/workflows/sonarjs-check.yml`, which fails
  the check when any sonarjs issues are present

## What it catches

Confirmed on this codebase — 103 issues across 34 files at time of setup:

| Category | Examples found |
|---|---|
| Cognitive complexity | Functions with too many nested branches/loops (worst: complexity 67 in `LiveCard.js`) |
| Nested ternaries / nested template literals | Hard-to-read conditional/string logic |
| Regex risk | Super-linear (ReDoS-prone) and overly complex regexes |
| Ignored exceptions | `catch` blocks that silently swallow errors |
| Dead code | Unused assignments, redundant jumps, duplicate branches |
| Insecure randomness | `Math.random()` used in contexts that may need a secure RNG |
| Always-truthy expressions | Gratuitous/dead conditional logic |
| TODO/FIXME markers | Flags unresolved comments |

## What it does NOT catch

(see `code-quality-tooling-comparison.md` in this folder for the full breakdown)

- Security vulnerabilities / cross-file taint analysis — **already
  covered separately by CodeQL** in this repo
- Duplicate code across files, A–E quality ratings, Quality Gates,
  technical-debt-in-minutes, new-code-only diffing, historical trend
  dashboards — all require an actual SonarQube server
- Subjective/human metrics (e.g. "code understandability" survey) —
  out of scope for any static tool

## Report now includes Sonar Keys

Each issue in `sonar/sonar-report.md` is annotated with its SonarSource
RSPEC rule key (e.g. `S3776` for cognitive-complexity). This package
does not expose severity (Blocker/Critical/Major/Minor) directly —
only ESLint's own `error`/`warning` levels, which we've set uniformly
to `error`.

### Where to check severity for a given Sonar Key

⚠️ `rules.sonarsource.com` (SonarSource's old public rule catalog) was
**decommissioned in early 2026** — links to it no longer resolve.

Working alternative — SonarSource's public demo instance REST API
(no login required), querying by rule key (`<lang>:<sonarKey>`):

```
https://next.sonarqube.com/sonarqube/api/rules/show?key=javascript:S3776
```

Returns JSON including the legacy `severity` field (e.g. `CRITICAL`)
and the newer Clean Code `impacts` array (e.g.
`{"softwareQuality":"MAINTAINABILITY","severity":"HIGH"}`).

To browse the same thing visually in an actual browser (it's a JS
app, so a plain fetch won't render it, but a real browser will):

```
https://next.sonarqube.com/sonarqube/coding_rules?open=javascript:S3776
```

This same information is also visible directly inside your own
SonarQube/SonarCloud instance, if you have one, under the rule's
detail view in the Quality Profile — that's the canonical source
since severity can be overridden per project's Quality Profile.

## Why not the official SonarLint product?

- SonarLint is fundamentally an **IDE plugin**, not a headless CLI tool
  — there's no first-party standalone binary to point at a repo and
  get a CI-able report.
- The old "SonarLint for Command Line" product was **discontinued**
  by SonarSource years ago; the npm packages wrapping it are
  unmaintained and unreliable.
- SonarLint's full rule set (matching a tuned Quality Profile) only
  unlocks in **Connected Mode**, which requires binding to a
  SonarQube/SonarCloud server and onboarding a project — the exact
  overhead this setup was chosen to avoid.

`eslint-plugin-sonarjs` was the closest available substitute: actively
maintained, ports real Sonar rule logic, runs as a normal CLI/CI step,
and needs zero server or onboarding.

## Net effect

A maintainability/code-smell safety net that complements CodeQL's
security coverage, giving PR-time feedback on complexity and
readability debt — without any of the infrastructure or onboarding
overhead of a real SonarQube deployment.
