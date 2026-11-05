# Working in event-libs

Browser ES modules for Adobe event pages built with AEM/Helix, DA, and Milo.
There is no bundler or build step. Source lives in the inner `event-libs/`
directory; commands and source paths below are relative to the Git root.

## Read only the context needed for the task

This file is the entry point, not the full manual. Select the relevant documents
below; do not load the entire architecture folder for every task. Follow further
links only when the change crosses that boundary. Implementation is the source
of truth; the overviews call out known stale feature README descriptions.

| Task | Read |
| --- | --- |
| Understand initialization, C1/C2 selection, Milo loading, auto-blocking, or hydration | [Architecture and loading](docs/architecture/overview.md) |
| Find a block, its purpose, authoring input, or foundation | [Block catalog](docs/architecture/blocks.md) |
| Change chrono-box, schedule transitions, clock handling, plugins, or timing QA flags | [Timing Framework](docs/architecture/timing-framework.md) |
| Change MR/YouTube/MPC embedding, stream-end handling, DVR, broadcast, or playlist playback | [Video players](docs/architecture/video-players.md); also [timing](docs/architecture/timing-framework.md) for chrono-box integration |
| Change catalog data, signals, authentication, attendee favorites/scheduling, or cross-block state | [Shared session state](docs/architecture/session-state.md) |
| Change Tier 1/Session Guide authoring, library storage, metadata, or config-link exports | [Configurators](docs/architecture/configurators.md) |
| Change Schedule Maker, schedule links, imports, or Sync | [Schedule Maker](docs/architecture/schedule-maker.md); also [timing](docs/architecture/timing-framework.md) for execution |
| Choose test files, mocks, lint commands, or browser verification | [Testing](docs/architecture/testing.md) |

Existing focused guides remain under `docs/`; architecture documents link to
them where relevant. Keep detailed contracts in their owning document instead
of duplicating them here or creating a second manual.

## Essential conventions

- Use ES modules, `.js` import extensions, two spaces, single quotes, and
  semicolons. Prefer async/await for new asynchronous code.
- Reuse shared utilities and Milo helpers. Resolve Milo through `LIBS` or
  configured `miloLibs`, never hard-coded Milo URLs. Use `createTag()` for new
  vanilla DOM components.
- Use `event-libs/v1/utils/lana-log.js` for errors/warnings. Do not introduce
  silent or success-shaped failures. Parse authored JSON with explicit error
  handling and preserve existing user-facing error patterns.
- C1/default blocks live in `event-libs/v1/blocks/`; C2 blocks live in
  `event-libs/v1/c2/blocks/`. Page metadata `foundation: c2` selects C2, not
  Preact usage. Register names in the matching array in `event-libs/v1/libs.js`.
- Blocks mutate their element in place through a default initializer; use
  `export default async function init(el)` when asynchronous. Add focused
  tests/fixtures and keep directly dependent call sites consistent.
- C1 commonly uses BlockMediator; catalog-backed C2 surfaces share signals from
  `session-store.js`. Preact reads `.value`; vanilla code subscribes. Replace
  Sets when mutating signals; reuse session-action helpers for attendee changes.
- Keep author-owned top/bottom spacing flexible. Document essential
  engineering-owned offsets rather than hard-coding unexplained vertical spacing.
- Preserve accessible names, keyboard behavior, reactive ARIA, and focus
  restoration. Clean up listeners, timers, subscriptions, observers, and
  out-of-host DOM when fragment content is replaced.

## Critical integration pitfalls

- `avoidStreamEndFlag=true` is supported by the Timing Framework **and** MR
  players. Preserve it when changing C1/C2 playback or timing integration.
  `timing` and `serverTime` have different polling behavior; remove QA parameters
  from production links.
- Timing changes must keep both chrono-box implementations, `worker.js`,
  deployed `worker-traditional.js`, and the testing manager aligned. Check
  time-only, MR overrun/underrun, and late-arrival paths.
- Schedule Maker controls fragment swaps. Catalog-backed playback and
  RainFocus attendee schedules are separate systems with different data shapes.
  MR media IDs are not Events/RainFocus session IDs.
- Saving a configurator library row does not update published pages. Global
  Tier 1 JSON goes in metadata; Homepage/Session Guide links carry snapshots
  that must be replaced and published. Check the full producer/consumer path.
- C1 and C2 copies are not interchangeable fallbacks. `session-broadcast`
  currently supports YouTube/MPC adapters, not MR playback. Read the relevant
  architecture document before assuming support from a field or block name.
- `decorateArea()` is not `decorateEvent()`. Auto-block processing must be
  wired before the relevant Milo scan; importing `libs.js` does not bootstrap
  every feature.

## Quick commands

```sh
npm run event-libs    # AEM dev server, port 3868
npm run da-apps       # DA apps static server, port 3000
npm run lint         # JS + classic block/style CSS
npm test             # All unit tests with coverage, port 2000
```

For code changes, start with the smallest relevant test selection:

```sh
npx wtr test/unit/features/timing-framework/worker.test.js --node-resolve --port=2000
```

`npm run lint:css` excludes C2 CSS; lint changed C2 styles explicitly with
`npx stylelint event-libs/v1/c2/blocks/<name>/<name>.css`.
Mock external services/SDKs in unit tests. Do not equate mocked Preact or player
tests with browser verification. See [testing](docs/architecture/testing.md).
Documentation-only changes need link/content checks, not the browser suite.
