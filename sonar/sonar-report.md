# Sonar-style Code Quality Report

Generated via `npm run lint:sonar` (eslint-plugin-sonarjs) on 2026-09-30.

- Files scanned: 223
- Files with issues: 34
- Total issues: 103

## Issues by rule

| Rule | Count |
|---|---|
| `sonarjs/cognitive-complexity` | 30 |
| `sonarjs/no-nested-conditional` | 28 |
| `sonarjs/no-nested-template-literals` | 10 |
| `sonarjs/super-linear-regex` | 9 |
| `sonarjs/pseudo-random` | 6 |
| `sonarjs/no-ignored-exceptions` | 5 |
| `sonarjs/no-gratuitous-expressions` | 4 |
| `sonarjs/fixme-tag` | 3 |
| `sonarjs/duplicates-in-character-class` | 1 |
| `sonarjs/no-same-line-conditional` | 1 |
| `sonarjs/no-duplicated-branches` | 1 |
| `sonarjs/todo-tag` | 1 |
| `sonarjs/no-redundant-jump` | 1 |
| `sonarjs/regex-complexity` | 1 |
| `sonarjs/void-use` | 1 |
| `sonarjs/no-dead-store` | 1 |

## Issues by file

### `event-libs/schedule-maker/scripts/da-controller.js`

- L203:26 `sonarjs/super-linear-regex` — Simplify this regular expression to reduce its runtime, as it has super-linear performance due to backtracking.
- L203:60 `sonarjs/duplicates-in-character-class` — Remove duplicates in this character class.
- L239:16 `sonarjs/cognitive-complexity` — Refactor this function to reduce its Cognitive Complexity from 19 to the 15 allowed.

### `event-libs/session-guide-configurator/components/FiltersEditor.js`

- L136:30 `sonarjs/no-gratuitous-expressions` — This always evaluates to truthy. Consider refactoring this code.

### `event-libs/session-guide-configurator/components/RecommendedSessionsEditor.js`

- L186:30 `sonarjs/no-gratuitous-expressions` — This always evaluates to truthy. Consider refactoring this code.

### `event-libs/session-guide-configurator/components/SwimlaneOrderEditor.js`

- L137:30 `sonarjs/no-gratuitous-expressions` — This always evaluates to truthy. Consider refactoring this code.

### `event-libs/tier-1-event-configurator/components/FeaturedSessionsEditor.js`

- L235:30 `sonarjs/no-gratuitous-expressions` — This always evaluates to truthy. Consider refactoring this code.

### `event-libs/tier-1-event-configurator/pages/ConfigEditor.js`

- L22:25 `sonarjs/cognitive-complexity` — Refactor this function to reduce its Cognitive Complexity from 27 to the 15 allowed.

### `event-libs/v1/blocks/event-agenda/event-agenda.js`

- L35:17 `sonarjs/cognitive-complexity` — Refactor this function to reduce its Cognitive Complexity from 16 to the 15 allowed.
- L73:37 `sonarjs/super-linear-regex` — Simplify this regular expression to reduce its runtime, as it has super-linear performance due to backtracking.

### `event-libs/v1/blocks/event-partners/event-partners.js`

- L28:8 `sonarjs/fixme-tag` — Take the required action to fix the issue indicated by this comment.

### `event-libs/v1/blocks/event-subscription-form/event-subscription-form.js`

- L73:5 `sonarjs/no-same-line-conditional` — Move this "if" to a new line or add the missing "else".
- L226:6 `sonarjs/fixme-tag` — Take the required action to fix the issue indicated by this comment.

### `event-libs/v1/blocks/events-form/events-form.js`

- L372:114 `sonarjs/no-duplicated-branches` — This branch's code block is the same as the block for the branch on line 357.
- L484:52 `sonarjs/cognitive-complexity` — Refactor this function to reduce its Cognitive Complexity from 21 to the 15 allowed.
- L723:10 `sonarjs/fixme-tag` — Take the required action to fix the issue indicated by this comment.
- L812:49 `sonarjs/cognitive-complexity` — Refactor this function to reduce its Cognitive Complexity from 16 to the 15 allowed.
- L1276:10 `sonarjs/todo-tag` — Complete the task associated to this "TODO" comment.

### `event-libs/v1/blocks/mobile-rider/mobile-rider.js`

- L76:10 `sonarjs/no-nested-conditional` — Extract this nested ternary operation into an independent statement.
- L390:10 `sonarjs/no-nested-conditional` — Extract this nested ternary operation into an independent statement.
- L424:5 `sonarjs/no-ignored-exceptions` — Handle this exception, don't catch it at all, or explain in a comment why it is ignored.

### `event-libs/v1/blocks/profile-cards/profile-cards.js`

- L132:7 `sonarjs/no-ignored-exceptions` — Handle this exception, don't catch it at all, or explain in a comment why it is ignored.
- L390:23 `sonarjs/super-linear-regex` — Simplify this regular expression to reduce its runtime, as it has super-linear performance due to backtracking.
- L690:25 `sonarjs/cognitive-complexity` — Refactor this function to reduce its Cognitive Complexity from 19 to the 15 allowed.

### `event-libs/v1/blocks/sessions-hub/sessions-hub.js`

- L1419:16 `sonarjs/cognitive-complexity` — Refactor this function to reduce its Cognitive Complexity from 34 to the 15 allowed.
- L1555:46 `sonarjs/cognitive-complexity` — Refactor this function to reduce its Cognitive Complexity from 24 to the 15 allowed.
- L1628:7 `sonarjs/no-redundant-jump` — Remove this redundant jump.
- L1644:49 `sonarjs/cognitive-complexity` — Refactor this function to reduce its Cognitive Complexity from 16 to the 15 allowed.
- L1731:8 `sonarjs/no-nested-conditional` — Extract this nested ternary operation into an independent statement.
- L1761:16 `sonarjs/cognitive-complexity` — Refactor this function to reduce its Cognitive Complexity from 19 to the 15 allowed.

### `event-libs/v1/c2/blocks/featured-sessions/featured-sessions.js`

- L81:61 `sonarjs/no-nested-template-literals` — Refactor this code to not use nested template literals.

### `event-libs/v1/c2/blocks/mobile-rider/mobile-rider.js`

- L528:5 `sonarjs/no-ignored-exceptions` — Handle this exception, don't catch it at all, or explain in a comment why it is ignored.

### `event-libs/v1/c2/blocks/session-broadcast/components/BroadcastApp.js`

- L133:60 `sonarjs/pseudo-random` — Make sure that using this pseudorandom number generator is safe here.

### `event-libs/v1/c2/blocks/session-video-player/session-video-player.js`

- L142:27 `sonarjs/regex-complexity` — Simplify this regular expression to reduce its complexity from 25 to the 20 allowed.
- L524:27 `sonarjs/cognitive-complexity` — Refactor this function to reduce its Cognitive Complexity from 18 to the 15 allowed.

### `event-libs/v1/c2/blocks/sessions-guide/components/Carousel.js`

- L111:85 `sonarjs/no-nested-template-literals` — Refactor this code to not use nested template literals.

### `event-libs/v1/c2/blocks/sessions-guide/components/DrawerHeader.js`

- L42:17 `sonarjs/cognitive-complexity` — Refactor this function to reduce its Cognitive Complexity from 16 to the 15 allowed.

### `event-libs/v1/c2/blocks/sessions-guide/components/DrawerShell.js`

- L48:17 `sonarjs/cognitive-complexity` — Refactor this function to reduce its Cognitive Complexity from 16 to the 15 allowed.

### `event-libs/v1/c2/blocks/sessions-guide/components/LiveCard.js`

- L45:17 `sonarjs/cognitive-complexity` — Refactor this function to reduce its Cognitive Complexity from 67 to the 15 allowed.
- L83:34 `sonarjs/no-nested-template-literals` — Refactor this code to not use nested template literals.
- L83:83 `sonarjs/no-nested-template-literals` — Refactor this code to not use nested template literals.
- L141:47 `sonarjs/no-nested-conditional` — Extract this nested ternary operation into an independent statement.
- L142:46 `sonarjs/no-nested-conditional` — Extract this nested ternary operation into an independent statement.
- L178:8 `sonarjs/no-nested-conditional` — Extract this nested ternary operation into an independent statement.
- L228:30 `sonarjs/no-nested-template-literals` — Refactor this code to not use nested template literals.
- L253:11 `sonarjs/no-nested-template-literals` — Refactor this code to not use nested template literals.

### `event-libs/v1/c2/blocks/sessions-guide/components/MyFavoritesView.js`

- L23:17 `sonarjs/cognitive-complexity` — Refactor this function to reduce its Cognitive Complexity from 22 to the 15 allowed.
- L106:9 `sonarjs/no-nested-conditional` — Extract this nested ternary operation into an independent statement.
- L115:18 `sonarjs/no-nested-conditional` — Extract this nested ternary operation into an independent statement.
- L121:45 `sonarjs/no-nested-conditional` — Extract this nested ternary operation into an independent statement.
- L127:45 `sonarjs/no-nested-conditional` — Extract this nested ternary operation into an independent statement.

### `event-libs/v1/c2/blocks/sessions-guide/components/MySessionsView.js`

- L23:17 `sonarjs/cognitive-complexity` — Refactor this function to reduce its Cognitive Complexity from 22 to the 15 allowed.
- L106:9 `sonarjs/no-nested-conditional` — Extract this nested ternary operation into an independent statement.
- L115:18 `sonarjs/no-nested-conditional` — Extract this nested ternary operation into an independent statement.
- L121:45 `sonarjs/no-nested-conditional` — Extract this nested ternary operation into an independent statement.
- L127:45 `sonarjs/no-nested-conditional` — Extract this nested ternary operation into an independent statement.

### `event-libs/v1/c2/blocks/sessions-guide/components/SessionCard.js`

- L18:17 `sonarjs/cognitive-complexity` — Refactor this function to reduce its Cognitive Complexity from 34 to the 15 allowed.
- L51:33 `sonarjs/no-nested-conditional` — Extract this nested ternary operation into an independent statement.
- L159:8 `sonarjs/no-nested-conditional` — Extract this nested ternary operation into an independent statement.
- L160:8 `sonarjs/no-nested-conditional` — Extract this nested ternary operation into an independent statement.

### `event-libs/v1/c2/blocks/sessions-guide/components/SessionDetailOverlay.js`

- L48:17 `sonarjs/cognitive-complexity` — Refactor this function to reduce its Cognitive Complexity from 51 to the 15 allowed.
- L206:101 `sonarjs/no-nested-conditional` — Extract this nested ternary operation into an independent statement.
- L209:43 `sonarjs/no-nested-conditional` — Extract this nested ternary operation into an independent statement.
- L210:36 `sonarjs/no-nested-conditional` — Extract this nested ternary operation into an independent statement.
- L213:29 `sonarjs/no-nested-conditional` — Extract this nested ternary operation into an independent statement.
- L218:104 `sonarjs/no-nested-conditional` — Extract this nested ternary operation into an independent statement.
- L218:140 `sonarjs/no-nested-conditional` — Extract this nested ternary operation into an independent statement.
- L222:36 `sonarjs/no-nested-conditional` — Extract this nested ternary operation into an independent statement.
- L225:29 `sonarjs/no-nested-conditional` — Extract this nested ternary operation into an independent statement.
- L226:29 `sonarjs/no-nested-conditional` — Extract this nested ternary operation into an independent statement.

### `event-libs/v1/c2/blocks/sessions-guide/utils/use-post-event.js`

- L11:5 `sonarjs/void-use` — Remove this use of the "void" operator.

### `event-libs/v1/features/timing-framework/worker-traditional.js`

- L186:9 `sonarjs/cognitive-complexity` — Refactor this function to reduce its Cognitive Complexity from 17 to the 15 allowed.
- L213:20 `sonarjs/pseudo-random` — Make sure that using this pseudorandom number generator is safe here.
- L316:23 `sonarjs/pseudo-random` — Make sure that using this pseudorandom number generator is safe here.
- L368:9 `sonarjs/cognitive-complexity` — Refactor this function to reduce its Cognitive Complexity from 23 to the 15 allowed.

### `event-libs/v1/features/timing-framework/worker.js`

- L144:9 `sonarjs/cognitive-complexity` — Refactor this function to reduce its Cognitive Complexity from 17 to the 15 allowed.
- L178:20 `sonarjs/pseudo-random` — Make sure that using this pseudorandom number generator is safe here.
- L303:23 `sonarjs/pseudo-random` — Make sure that using this pseudorandom number generator is safe here.
- L360:9 `sonarjs/cognitive-complexity` — Refactor this function to reduce its Cognitive Complexity from 23 to the 15 allowed.

### `event-libs/v1/services/sessions/sessions-api.js`

- L309:91 `sonarjs/no-nested-template-literals` — Refactor this code to not use nested template literals.

### `event-libs/v1/utils/constances.js`

- L1:25 `sonarjs/super-linear-regex` — Simplify this regular expression to reduce its runtime, as it has super-linear performance due to backtracking.
- L3:32 `sonarjs/super-linear-regex` — Simplify this regular expression to reduce its runtime, as it has super-linear performance due to backtracking.

### `event-libs/v1/utils/da-sheet-controller.js`

- L111:8 `sonarjs/no-nested-conditional` — Extract this nested ternary operation into an independent statement.
- L193:23 `sonarjs/cognitive-complexity` — Refactor this function to reduce its Cognitive Complexity from 16 to the 15 allowed.
- L231:9 `sonarjs/no-dead-store` — Remove this useless assignment to variable "decoded".

### `event-libs/v1/utils/decorate.js`

- L44:45 `sonarjs/no-nested-template-literals` — Refactor this code to not use nested template literals.
- L177:23 `sonarjs/cognitive-complexity` — Refactor this function to reduce its Cognitive Complexity from 24 to the 15 allowed.
- L698:37 `sonarjs/super-linear-regex` — Simplify this regular expression to reduce its runtime, as it has super-linear performance due to backtracking.
- L710:31 `sonarjs/super-linear-regex` — Simplify this regular expression to reduce its runtime, as it has super-linear performance due to backtracking.
- L871:82 `sonarjs/no-nested-template-literals` — Refactor this code to not use nested template literals.
- L1123:30 `sonarjs/super-linear-regex` — Simplify this regular expression to reduce its runtime, as it has super-linear performance due to backtracking.
- L1170:15 `sonarjs/no-nested-conditional` — Extract this nested ternary operation into an independent statement.
- L1188:28 `sonarjs/cognitive-complexity` — Refactor this function to reduce its Cognitive Complexity from 16 to the 15 allowed.

### `event-libs/v1/utils/esp-controller.js`

- L65:5 `sonarjs/no-ignored-exceptions` — Handle this exception, don't catch it at all, or explain in a comment why it is ignored.
- L67:56 `sonarjs/pseudo-random` — Make sure that using this pseudorandom number generator is safe here.
- L171:81 `sonarjs/no-nested-template-literals` — Refactor this code to not use nested template literals.
- L717:23 `sonarjs/cognitive-complexity` — Refactor this function to reduce its Cognitive Complexity from 19 to the 15 allowed.

### `event-libs/v1/utils/utils.js`

- L378:7 `sonarjs/no-ignored-exceptions` — Handle this exception, don't catch it at all, or explain in a comment why it is ignored.
- L482:73 `sonarjs/cognitive-complexity` — Refactor this function to reduce its Cognitive Complexity from 18 to the 15 allowed.
- L612:10 `sonarjs/cognitive-complexity` — Refactor this function to reduce its Cognitive Complexity from 19 to the 15 allowed.
- L718:10 `sonarjs/cognitive-complexity` — Refactor this function to reduce its Cognitive Complexity from 16 to the 15 allowed.
- L724:25 `sonarjs/super-linear-regex` — Simplify this regular expression to reduce its runtime, as it has super-linear performance due to backtracking.
- L830:17 `sonarjs/cognitive-complexity` — Refactor this function to reduce its Cognitive Complexity from 20 to the 15 allowed.

