# Release PR body template

Used by `release-stage` (`dev` → `stage`) and `release-prod` (`stage` → `main`). Fill it in from
`collect-release.mjs` output. Format reference: event-libs #496, plus an **Area** column.

```markdown
<Promote `dev` to `stage` | Production release: promote `stage` to `main`> for **<train>**. <One sentence naming the main areas touched.>

Includes **<features> merged PRs**, **<commits> commits** and **<changedFiles> changed files** since the current <stage|prod> release. `<base>` has <baseOnlyCommits> commits not on `<head>` (earlier promotion merge commits); this PR promotes `<head>` as-is without rewriting either branch's history.

Resolves: the following **<N> unique tickets** and **<M> PRs without a ticket**.

| Area | Ticket | Resolution | PRs |
|---|---|---|---|
| Session Guide | [MWPW-x](https://jira.corp.adobe.com/browse/MWPW-x) | <what changed, plain English> | #123 |
| CI / Tests / Tooling | No Jira cited | <what changed> | #124 |

Release accounting:
- Reverts and their pairs (e.g. "#476 was reverted by #477; #478 is the final implementation").
- PRs without a Jira ticket, and why (tooling, follow-up to #n, …).
- Tickets closed by a PR here but not cited in it, and tickets only mentioned as context.
- Anything shipping in another repo, temporary flags, behavior changes worth calling out.

Test URLs:
- Before: https://<base>--event-libs--adobecom.aem.live/?martech=off
- After: https://<head>--event-libs--adobecom.aem.live/?martech=off

Validation on `<head>` commit `<headSha>`:
- `npm run lint`: <result>
- CI `Running tests` on this PR: <passed/failed> (<run link>)
- <Any other check actually run, with its exact result. Say plainly what was not run, e.g. manual preview.>

<CI notes: known failures unrelated to this PR, with a link and one line on why (e.g. sync-dev02: `dev02` doesn't exist; aem-psi-check fails on every PR).>
```

Rules:
- **One row per ticket**: a ticket fixed by several PRs gets one row listing them all. PRs without
  a ticket get their own row with `No Jira cited` in the Ticket column, so every PR appears.
- **Areas**, in this order: Session Guide · Broadcast / Video / Sessions · Homepage / Upcoming
  Sessions / Banner · RSVP / Notifications / Calendar / Agenda · CI / Tests / Tooling. Sort
  rows by area, then ticket.
- **Resolution**: what changed for the user, in plain English, not the PR title verbatim.
- Only report validation that was actually run, with its real result.
