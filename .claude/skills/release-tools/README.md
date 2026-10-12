# release-tools

Shared helpers for the `release-stage` and `release-prod` skills. This isn't a skill itself (no
`SKILL.md`).

| Script | Purpose |
|---|---|
| `collect-release.mjs <base> <head>` | Lists the feature PRs and Jira tickets in `origin/<base>..origin/<head>` as JSON |
| `purge-urls.mjs <base> <head> [--pr <n>]` | Builds the Akamai purge URL list for `www.adobe.com` and `business.adobe.com` |

Both need `git` with `origin` fetched; `collect-release.mjs` and `--pr` also need an authenticated
`gh` CLI.
