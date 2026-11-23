# Development commands and validation

Run commands from the Git repository root unless stated otherwise.

```sh
npm run event-libs    # AEM development server, port 3868
npm run da-apps       # Serve the inner event-libs directory, port 3000
npm test             # Web Test Runner, all unit tests with coverage, port 2000
npm run test:watch
npm run lint         # JavaScript and classic block/style CSS
npm run lint:fix
```

For a focused change, select existing tests with WTR:

```sh
npx wtr test/unit/features/timing-framework/worker.test.js test/unit/schedule-maker/utils.test.js --node-resolve --port=2000
```

`npm run lint:css` does **not** include C2 CSS. Check changed C2 styles explicitly:

```sh
npx stylelint event-libs/v1/c2/blocks/<name>/<name>.css
```

## Test harness constraints

Tests use Chai, Sinon, and HTML fixtures under `test/unit/`. Reset both body and
head between DOM tests. `web-test-runner.config.js` installs event/IMS mocks,
maps `events/scripts/` to `v1/utils/`, and flags external requests/scripts.
Mock network and SDK interactions rather than contacting real services.
The harness substitutes a mock `htm-preact.js` by default; inspect its limitations
before treating passing component tests as proof of real hook/render behavior.

## Existing test entry points

All paths below are relative to the Git repository root.

| Change area | Existing tests |
| --- | --- |
| Auto-block mapping and event decoration | `test/unit/scripts/decorate.test.js` |
| Chrono-box fragment/theme/cleanup | `test/unit/blocks/chrono-box/chrono-box.test.js` |
| Worker scheduling | `test/unit/features/timing-framework/worker.test.js` (imports `worker.js`, not the deployed traditional worker) |
| MR timing plugin | `test/unit/features/timing-framework/plugins/mobile-rider/plugin.test.js` |
| Schedule serialization/Sync | `test/unit/schedule-maker/utils.test.js`, `test/unit/schedule-maker/da-controller.test.js` |
| Configurator output and libraries | `test/unit/session-guide-configurator/utils.test.js`, `test/unit/tier-1-event-configurator/utils.test.js`, `test/unit/tier-1-event-configurator/da-controller.test.js`, `test/unit/utils/da-sheet-controller.test.js` |
| MR/YouTube presentation | `test/unit/blocks/mobile-rider/`, `test/unit/blocks/youtube-chat/`, `test/unit/blocks/event-youtube/` |
| C2 players, broadcast, and guide | `test/unit/c2/blocks/session-video-player/`, `test/unit/c2/blocks/session-video-playlist/`, `test/unit/c2/blocks/session-broadcast/`, `test/unit/c2/blocks/sessions-guide/` |
| Shared catalog/state/playback | `test/unit/services/sessions/`, `test/unit/utils/`, `test/unit/c2/utils/` |

## Verification scope

Use targeted tests and relevant lint for code changes. Player SDK behavior,
actual worker loading/CSP, real Preact lifecycle, DA-link authoring, and fragment
swaps also need browser verification on a configured preview page; unit mocks
alone do not validate them.

Documentation-only changes do not require the browser suite. Check relative
links, preserved contracts, and whitespace instead. Keep task-specific test
results in the PR rather than presenting them as durable architecture facts.
