---
name: post-hotfix-branch-sync
description: >-
  Syncs dev and stage with main after a production hotfix landed only on main.
  Use when the user mentions hotfix, main ahead of stage/dev, back-merge,
  release branch sync, or post-hotfix git workflow (feature → dev → stage →
  main pipeline).
---

# Post-hotfix branch sync (main → stage → dev)

## Context

Normal flow: `feature/*` → `dev` → `stage` → `main`.

A **hotfix** is branched from `main` and merged straight to `main`, so `main` contains commit(s) that `stage` and `dev` never saw. Until you back-merge, lower environments drift and the next promotion PRs can be painful (false conflicts, missing fixes, or duplicate cherry-picks).

**Goal:** Bring the hotfix into `stage` and `dev` with ordinary merge commits so history stays understandable and the normal promotion path works again.

## Strategy (default)

Treat **`main` as source of truth** for what is already in production. Propagate that state downward with **merge commits** (not rebase on shared branches).

### Steps (direct push allowed)

1. **Fetch and update local refs**
   ```bash
   git fetch origin
   git checkout main && git pull origin main
   ```

2. **Back-merge `main` into `stage`**
   ```bash
   git checkout stage && git pull origin stage
   git merge origin/main -m "chore: sync stage with main after hotfix"
   git push origin stage
   ```

3. **Back-merge into `dev`**
   - **Preferred if `dev` is always ahead of or aligned with `stage`:** merge updated `stage` so `dev` tracks what was synced to staging.
     ```bash
     git checkout dev && git pull origin dev
     git merge origin/stage -m "chore: sync dev with stage after main hotfix"
     git push origin dev
     ```
   - **Use if `dev` has diverged from `stage` and you must guarantee the hotfix lands regardless:** merge `main` into `dev` (same pattern as step 2 with `dev` and `origin/main`). Resolves “hotfix missing on dev” even when `stage` is not yet merged into `dev` for other reasons.

4. **Verify**
   - `git log --oneline -5 origin/main origin/stage origin/dev` — hotfix commit(s) appear on all three tips’ ancestry.
   - Run CI / smoke on `stage` (and `dev` if your team gates there) after push.

### Steps (protected branches — PRs only)

1. From latest `main`, create **`sync/main-to-stage-<date>`** (or use GitHub “compare” `main` → `stage`).
2. Open PR **base: `stage` ← compare: `main`**. Title e.g. `chore: sync stage with main after hotfix`. Merge when green.
3. Open PR **base: `dev` ← compare: `stage`** (after step 2 merged), or **base: `dev` ← `main`** if your policy requires identical back-merge from production.

Do not squash the sync PR if you want a clear merge bubble in history; squash is optional per team convention.

## What not to do

- **Do not `git rebase main` on shared `dev` or `stage`** — rewrites published history and breaks collaborators.
- **Do not cherry-pick the hotfix again** onto `dev`/`stage` if the same change is already on `main` — you risk duplicate commits or divergent fixes unless you know exactly what you are doing.
- **Do not only update `stage`** and assume `dev` will pick it up later — explicitly sync `dev` unless your automation always merges `stage` → `dev`.

## Conflicts

If merge conflicts appear:

1. Prefer resolving by **keeping production behavior** from `main` for files touched by the hotfix, then re-applying any legitimate `dev`-only changes.
2. After resolving, run tests and complete the merge; document anything unusual in the merge commit message or PR.

## Quick checklist

- [ ] Hotfix is merged to `main` and tagged/released as your process requires.
- [ ] `stage` merged from `main` and pushed (or PR merged).
- [ ] `dev` merged from `stage` or `main` and pushed (or PR merged).
- [ ] CI / sanity check on updated branches.

## When the agent applies this skill

If the user asks to “sync after a hotfix,” “back-merge main,” or fix `main` being ahead of `dev`/`stage`, guide them through the steps above, adapt branch names if their repo differs, and prefer PR wording if they use protected branches.
