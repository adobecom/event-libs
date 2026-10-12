---
name: release-stage
description: >
  Open the event-libs stage release PR (dev → stage) for a release train such as T3-26.42: collect
  every PR and Jira ticket in dev that isn't on stage yet, write the release PR body, open the PR,
  wait for CI, then list the manual steps left (approval, merge commit, post-merge checks). Use
  when the user asks for a stage release, to promote dev to stage, or to "cut stage".
metadata:
  domain: Release
  kind: skill
  tags: [release, deployment, stage, event-libs]
---

# Stage release: `dev` → `stage`

Opens the release PR only. **Never merge it**: promotions need human approval, and merging is the
deploy. All manual steps are listed at the end for the user.

Shared scripts live in `.claude/skills/release-tools/` (see its README). Run them with `node`;
they need `git` and an authenticated `gh`.

## 1. Inputs
- **Release train** (e.g. `T3-26.42`). If the user didn't give one, look at the titles of the last
  `stage` and `main` release PRs and ask, suggesting the next number:
  ```bash
  gh pr list --state merged --base stage --limit 3 --json number,title,mergedAt
  gh pr list --state merged --base main  --limit 3 --json number,title,mergedAt
  ```

## 2. Pre-flight
```bash
git fetch origin dev stage
git rev-list --count origin/stage..origin/dev            # 0 → nothing to release, stop
gh pr list --state open --base stage --head dev --json number,url   # already open? update it instead
```
- If an open `dev` → `stage` PR exists, offer to refresh its title and body (`gh pr edit`) instead
  of creating a duplicate.

## 3. Collect what's being released
```bash
node .claude/skills/release-tools/collect-release.mjs stage dev
```
The JSON has `features` (PR number, title, author, Jira), `promotions`, `jira` (deduped) and
`noJira` (PRs without a ticket: list them anyway, marked "no Jira cited").
If `unresolved` isn't empty, look those PRs up manually.

## 4. Write the PR
- **Title:** `<train>: Promote dev to stage` (e.g. `T3-26.42: Promote dev to stage`).
- **Body:** keep the repo template (`.github/pull_request_template.md`) headings:
  1. One-line summary naming the train.
  2. Changes grouped by area, one bullet per PR: `- <short description> (#<pr>, MWPW-<id>)`.
     Typical groups: **Session Guide**, **Broadcast / Video / Sessions**, **Homepage / Upcoming
     Sessions / Banner**, **RSVP / Notifications / Calendar**, **CI / Tests / Tooling**.
     Mention reverts and their pairs in a short **Release notes** section.
  3. `Resolves:` followed by every Jira ticket as `[MWPW-x](https://jira.corp.adobe.com/browse/MWPW-x)`.
  4. `Test URLs:`
     - Before: `https://stage--event-libs--adobecom.aem.live/?martech=off`
     - After: `https://dev--event-libs--adobecom.aem.live/?martech=off`
- Format reference: event-libs #516.

```bash
gh pr create --base stage --head dev --title "<train>: Promote dev to stage" --body-file <file>
```

## 5. CI
Wait for the PR's checks and report the result:
```bash
gh pr checks <pr> --watch --interval 30
```
- `Running tests` must pass. If it fails, show the failing suites; don't fix them inside the
  release PR.
- `aem-psi-check` fails on every PR and isn't a blocker; say so.

## 6. Output: finish with this "Manual steps" section
Always end the response with these steps, filled in with the PR number and URL:

1. **Get approval** on `<PR URL>` (a code owner/lead).
2. **Merge with "Create a merge commit". Don't squash.** Squashing a promotion makes `stage`'s
   history diverge from `dev`, and the next release PR would re-list everything.
3. **After merge, check the automation ran:**
   ```bash
   gh run list --workflow release.yml --branch stage --limit 1        # clears the stage Akamai CP code 1892084
   gh run list --workflow sync-branches.yml --branch stage --limit 1  # stage → stage02
   ```
4. **Smoke test stage**, e.g. `https://www.stage.adobe.com/max-new.html`, the Session Guide and
   Broadcast, plus the specific fixes in the release.
5. **Jira:** move the listed tickets to QA/verification and set their fix version to `<train>`.
6. **Other repos** (if this release includes their work): da-events goes the same way
   (release PR `dev` → `stage`, merge). EMC deploys stage automatically when `stage` is pushed
   (`deploy_stage.yml`), so its stage release is just the PR and merge.
