Create a pull request targeting the `dev` branch.

## 1. Pre-flight checks

Run lint and tests in parallel:

```bash
npm run lint
npm test
```

If lint fails, run `npm run lint:fix`, show what changed, then re-run to confirm clean.
If any test fails, identify the cause and ask the user whether to fix it before continuing.

## 2. Collect changes

```bash
git diff dev...HEAD --name-only
git log dev...HEAD --oneline
```

Flag any commits with vague messages ("fix", "wip", "update", "changes") and ask the user to amend them before opening the PR.

## 3. Push branch

```bash
git push -u origin HEAD
```

## 4. Create the PR

```bash
gh pr create --base dev
```

PR format:
- **Title**: imperative mood, under 70 chars (e.g. "Add guest token support to RSVP block")
- **Body**:
  - **What**: one-paragraph description of the change
  - **Why**: motivation or Jira/ticket reference
  - **Test plan**: manual steps or `npm test` confirmation

## 5. Output

Print the PR URL when created.
