---
name: release-prod
description: >
  Open the event-libs production release PR (stage → main) for a release train such as T3-26.42:
  collect every PR and Jira ticket on stage that isn't in main, write the release PR body, open
  the PR, wait for CI, generate the Akamai purge URL list for www.adobe.com and
  business.adobe.com, then list the manual steps (approval, merge, CCP purge, verification, EMC
  prod deploy). Use when the user asks for a prod release, to promote stage to main, or to "cut
  prod".
metadata:
  domain: Release
  kind: skill
  tags: [release, deployment, production, akamai, purge, event-libs]
---

# Prod release: `stage` → `main`

Opens the release PR and prepares the purge list. **Never merge it**: merging to `main` is the
production deploy and needs human approval. All manual steps are listed at the end for the user.

Shared scripts live in `.claude/skills/release-tools/` (see its README). Run them with `node`;
they need `git` and an authenticated `gh`.

## 1. Inputs
- **Release train** (e.g. `T3-26.42`). If missing, check the last prod releases and ask:
  ```bash
  gh pr list --state merged --base main --limit 3 --json number,title,mergedAt
  ```
- Note the **previous prod release PR** number; the body references it.

## 2. Pre-flight
```bash
git fetch origin stage main
git rev-list --count origin/main..origin/stage            # 0 → nothing to release, stop
gh pr list --state open --base main --head stage --json number,url   # already open? update it instead
```

## 3. Collect what's being released
```bash
node .claude/skills/release-tools/collect-release.mjs main stage
```
- `features`: the individual PRs (with Jira) to list.
- `promotions`: the `dev` → `stage` PRs covered (e.g. #516, #519); name them in the summary.
- `noJira`: list those PRs anyway, marked "no Jira cited".

## 4. Write the PR
- **Title:** `<train> Prod Release` (e.g. `T3-26.42 Prod Release`).
- **Body** (format reference: event-libs #525), keeping the repo template's `Resolves:` and
  `Test URLs:` sections:
  1. `Production release <train>: promotes stage → main with all changes since the last prod
     release (#<previous>). Covers the stage promotions (#a, #b, …).`
  2. Changes grouped by area, one bullet per PR: `- <short description> (#<pr>, MWPW-<id>)`.
  3. **Release notes**: reverts, temporary flags, anything shipping in another repo.
  4. `Resolves:` with every Jira ticket linked.
  5. `Test URLs:`
     - Before: `https://main--event-libs--adobecom.aem.live/?martech=off`
     - After: `https://stage--event-libs--adobecom.aem.live/?martech=off`

```bash
gh pr create --base main --head stage --title "<train> Prod Release" --body-file <file>
```

## 5. CI and purge list
1. Wait for checks: `gh pr checks <pr> --watch --interval 30`. `Running tests` must pass.
   `aem-psi-check` fails on every PR and isn't a blocker.
2. The **"List changed code files"** workflow posts a *"Changed files for cache purging"* comment
   on the PR. Build the full purge list from it:
   ```bash
   node .claude/skills/release-tools/purge-urls.mjs main stage --pr <pr> > "${TMPDIR:-/tmp}/event-libs-purge-<train>.txt"
   ```
   The first line reports `<files> x 2 hosts = <urls>` and the source (bot comment, or the local
   diff fallback if the comment isn't there yet). Show the user the count and the file path.

## 6. Output: finish with this "Manual steps" section
Always end the response with these steps, filled in with the PR number/URL, the purge file path
and the URL count:

1. **Get approval** on `<PR URL>`.
2. **Merge with "Create a merge commit". Don't squash.**
3. **After merge, check the automation ran:**
   ```bash
   gh run list --workflow release.yml --branch main --limit 1        # clears the prod Akamai CP code 1897648
   gh run list --workflow sync-branches.yml --branch main --limit 1  # main → main02
   ```
4. **Purge the Akamai cache (manual, required).** The CP-code clear doesn't cover the files as
   served from `www.adobe.com` / `business.adobe.com`.
   1. If the PR changed after step 5, regenerate the list with the `purge-urls.mjs` command above.
   2. Open the team's **Akamai CCP purge tool** (internal; the link is in the team's deployment notes).
   3. Paste the URLs from `<purge file>`: `<N>` URLs, covering both `https://www.adobe.com/...` and
      `https://business.adobe.com/...`. Purge each file **individually**; wildcards aren't
      supported. If the tool limits batch size, split the list.
   4. Submit and wait for the purge to finish.
5. **Verify the purge** (exits 2 and lists stale URLs if any remain; purge those again):
   ```bash
   node .claude/skills/release-tools/purge-urls.mjs main stage --pr <pr> --verify
   ```
6. **Smoke test prod**: `https://www.adobe.com/max-new.html`, the Session Guide, Broadcast and a
   session page, plus the specific fixes in the release.
7. **Jira:** set fix version `<train>` on the listed tickets and move them along.
8. **Other repos in the same release:**
   - **da-events:** release PR `stage` → `main`, merge. (Whether it needs a CCP purge too is
     unconfirmed; ask the team.)
   - **EMC (App Builder):** prod is **not** automatic. After its `stage` → `main` PR merges:
     ```bash
     cd EMC && git checkout main && git pull && npm ci && npm run deploy:prod   # ENVIRONMENT=prod aio app deploy
     ```
     It needs:
     - the EMC `.env` in the repo root: ask the EMC owner in the team channel; it's shared through a secure secret-sharing tool.
       Without it the Google (Places) API breaks. Never commit it.
     - the `aio` CLI set up: `npm i -g @adobe/aio-cli`, `aio login`, then `aio app use` and pick
       the EMC project's **Production** workspace.
