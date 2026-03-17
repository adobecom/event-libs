Check whether the current branch is ready to open a PR against `dev`.

Run these checks in order and stop at the first hard failure:

## 1. Lint

```bash
npm run lint
```

If it fails, run `npm run lint:fix`, show what changed, then re-run `npm run lint` to confirm clean.

## 2. Tests

```bash
npm test
```

Report the pass/fail count. If any test fails, read the relevant test and source files, identify the cause, and ask the user whether to fix it.

## 3. Changed files review

Run `git diff dev...HEAD --name-only` to list changed files. For each changed block or utility:
- Confirm a corresponding test file exists (if not, flag it)
- Check that new exports are wired into `event-libs/v1/libs.js` if they belong in the public API

## 4. Commit message quality

Run `git log dev...HEAD --oneline`. Flag any commits with vague messages like "fix", "wip", "update", "changes".

## 5. Summary

Output a short checklist:
- [ ] Lint clean
- [ ] All tests pass
- [ ] Test coverage exists for changed code
- [ ] libs.js updated if needed
- [ ] Commit messages are descriptive

If everything is green, say so and suggest running `/commit` if there are uncommitted changes, or `gh pr create --base dev` to open the PR.
