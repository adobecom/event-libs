# Sonar-style Code Quality Report

Generated via `npm run lint:sonar` (eslint-plugin-sonarjs) on 2026-09-30.

- Files scanned: 223
- Files with issues: 32
- Total issues: 101

## Issues by severity

| Severity | Count |
|---|---|
| CRITICAL | 32 |
| MAJOR | 62 |
| MINOR | 6 |
| INFO | 1 |

## Issues by rule

| Rule | Sonar Key | Severity | Count |
|---|---|---|---|
| `sonarjs/cognitive-complexity` | S3776 | CRITICAL | 30 |
| `sonarjs/no-same-line-conditional` | S3972 | CRITICAL | 1 |
| `sonarjs/void-use` | S3735 | CRITICAL | 1 |
| `sonarjs/no-nested-conditional` | S3358 | MAJOR | 28 |
| `sonarjs/super-linear-regex` | S8786 | MAJOR | 9 |
| `sonarjs/no-nested-template-literals` | S4624 | MAJOR | 9 |
| `sonarjs/pseudo-random` | S2245 | MAJOR | 6 |
| `sonarjs/no-gratuitous-expressions` | S2589 | MAJOR | 3 |
| `sonarjs/fixme-tag` | S1134 | MAJOR | 3 |
| `sonarjs/duplicates-in-character-class` | S5869 | MAJOR | 1 |
| `sonarjs/no-duplicated-branches` | S1871 | MAJOR | 1 |
| `sonarjs/regex-complexity` | S5843 | MAJOR | 1 |
| `sonarjs/no-dead-store` | S1854 | MAJOR | 1 |
| `sonarjs/no-ignored-exceptions` | S2486 | MINOR | 5 |
| `sonarjs/no-redundant-jump` | S3626 | MINOR | 1 |
| `sonarjs/todo-tag` | S1135 | INFO | 1 |

## Issues by file

### `event-libs/schedule-maker/scripts/da-controller.js`

- L239:16 `sonarjs/cognitive-complexity` (S3776, CRITICAL) — Refactor this function to reduce its Cognitive Complexity from 19 to the 15 allowed.
- L203:26 `sonarjs/super-linear-regex` (S8786, MAJOR) — Simplify this regular expression to reduce its runtime, as it has super-linear performance due to backtracking.
- L203:60 `sonarjs/duplicates-in-character-class` (S5869, MAJOR) — Remove duplicates in this character class.

### `event-libs/session-guide-configurator/components/FiltersEditor.js`

- L136:30 `sonarjs/no-gratuitous-expressions` (S2589, MAJOR) — This always evaluates to truthy. Consider refactoring this code.

### `event-libs/session-guide-configurator/components/RecommendedSessionsEditor.js`

- L186:30 `sonarjs/no-gratuitous-expressions` (S2589, MAJOR) — This always evaluates to truthy. Consider refactoring this code.

### `event-libs/session-guide-configurator/components/SwimlaneOrderEditor.js`

- L137:30 `sonarjs/no-gratuitous-expressions` (S2589, MAJOR) — This always evaluates to truthy. Consider refactoring this code.

### `event-libs/tier-1-event-configurator/pages/ConfigEditor.js`

- L22:25 `sonarjs/cognitive-complexity` (S3776, CRITICAL) — Refactor this function to reduce its Cognitive Complexity from 27 to the 15 allowed.

### `event-libs/v1/blocks/event-agenda/event-agenda.js`

- L35:17 `sonarjs/cognitive-complexity` (S3776, CRITICAL) — Refactor this function to reduce its Cognitive Complexity from 16 to the 15 allowed.
- L73:37 `sonarjs/super-linear-regex` (S8786, MAJOR) — Simplify this regular expression to reduce its runtime, as it has super-linear performance due to backtracking.

### `event-libs/v1/blocks/event-partners/event-partners.js`

- L28:8 `sonarjs/fixme-tag` (S1134, MAJOR) — Take the required action to fix the issue indicated by this comment.

### `event-libs/v1/blocks/event-subscription-form/event-subscription-form.js`

- L73:5 `sonarjs/no-same-line-conditional` (S3972, CRITICAL) — Move this "if" to a new line or add the missing "else".
- L226:6 `sonarjs/fixme-tag` (S1134, MAJOR) — Take the required action to fix the issue indicated by this comment.

### `event-libs/v1/blocks/events-form/events-form.js`

- L484:52 `sonarjs/cognitive-complexity` (S3776, CRITICAL) — Refactor this function to reduce its Cognitive Complexity from 21 to the 15 allowed.
- L812:49 `sonarjs/cognitive-complexity` (S3776, CRITICAL) — Refactor this function to reduce its Cognitive Complexity from 16 to the 15 allowed.
- L372:114 `sonarjs/no-duplicated-branches` (S1871, MAJOR) — This branch's code block is the same as the block for the branch on line 357.
- L723:10 `sonarjs/fixme-tag` (S1134, MAJOR) — Take the required action to fix the issue indicated by this comment.
- L1276:10 `sonarjs/todo-tag` (S1135, INFO) — Complete the task associated to this "TODO" comment.

### `event-libs/v1/blocks/mobile-rider/mobile-rider.js`

- L76:10 `sonarjs/no-nested-conditional` (S3358, MAJOR) — Extract this nested ternary operation into an independent statement.
- L390:10 `sonarjs/no-nested-conditional` (S3358, MAJOR) — Extract this nested ternary operation into an independent statement.
- L424:5 `sonarjs/no-ignored-exceptions` (S2486, MINOR) — Handle this exception, don't catch it at all, or explain in a comment why it is ignored.

### `event-libs/v1/blocks/profile-cards/profile-cards.js`

- L690:25 `sonarjs/cognitive-complexity` (S3776, CRITICAL) — Refactor this function to reduce its Cognitive Complexity from 19 to the 15 allowed.
- L390:23 `sonarjs/super-linear-regex` (S8786, MAJOR) — Simplify this regular expression to reduce its runtime, as it has super-linear performance due to backtracking.
- L132:7 `sonarjs/no-ignored-exceptions` (S2486, MINOR) — Handle this exception, don't catch it at all, or explain in a comment why it is ignored.

### `event-libs/v1/blocks/sessions-hub/sessions-hub.js`

- L1419:16 `sonarjs/cognitive-complexity` (S3776, CRITICAL) — Refactor this function to reduce its Cognitive Complexity from 34 to the 15 allowed.
- L1555:46 `sonarjs/cognitive-complexity` (S3776, CRITICAL) — Refactor this function to reduce its Cognitive Complexity from 24 to the 15 allowed.
- L1644:49 `sonarjs/cognitive-complexity` (S3776, CRITICAL) — Refactor this function to reduce its Cognitive Complexity from 16 to the 15 allowed.
- L1761:16 `sonarjs/cognitive-complexity` (S3776, CRITICAL) — Refactor this function to reduce its Cognitive Complexity from 19 to the 15 allowed.
- L1731:8 `sonarjs/no-nested-conditional` (S3358, MAJOR) — Extract this nested ternary operation into an independent statement.
- L1628:7 `sonarjs/no-redundant-jump` (S3626, MINOR) — Remove this redundant jump.

### `event-libs/v1/c2/blocks/mobile-rider/mobile-rider.js`

- L528:5 `sonarjs/no-ignored-exceptions` (S2486, MINOR) — Handle this exception, don't catch it at all, or explain in a comment why it is ignored.

### `event-libs/v1/c2/blocks/session-broadcast/components/BroadcastApp.js`

- L133:60 `sonarjs/pseudo-random` (S2245, MAJOR) — Make sure that using this pseudorandom number generator is safe here.

### `event-libs/v1/c2/blocks/session-video-player/session-video-player.js`

- L524:27 `sonarjs/cognitive-complexity` (S3776, CRITICAL) — Refactor this function to reduce its Cognitive Complexity from 18 to the 15 allowed.
- L142:27 `sonarjs/regex-complexity` (S5843, MAJOR) — Simplify this regular expression to reduce its complexity from 25 to the 20 allowed.

### `event-libs/v1/c2/blocks/sessions-guide/components/Carousel.js`

- L111:85 `sonarjs/no-nested-template-literals` (S4624, MAJOR) — Refactor this code to not use nested template literals.

### `event-libs/v1/c2/blocks/sessions-guide/components/DrawerHeader.js`

- L42:17 `sonarjs/cognitive-complexity` (S3776, CRITICAL) — Refactor this function to reduce its Cognitive Complexity from 16 to the 15 allowed.

### `event-libs/v1/c2/blocks/sessions-guide/components/DrawerShell.js`

- L48:17 `sonarjs/cognitive-complexity` (S3776, CRITICAL) — Refactor this function to reduce its Cognitive Complexity from 16 to the 15 allowed.

### `event-libs/v1/c2/blocks/sessions-guide/components/LiveCard.js`

- L45:17 `sonarjs/cognitive-complexity` (S3776, CRITICAL) — Refactor this function to reduce its Cognitive Complexity from 67 to the 15 allowed.
- L83:34 `sonarjs/no-nested-template-literals` (S4624, MAJOR) — Refactor this code to not use nested template literals.
- L83:83 `sonarjs/no-nested-template-literals` (S4624, MAJOR) — Refactor this code to not use nested template literals.
- L141:47 `sonarjs/no-nested-conditional` (S3358, MAJOR) — Extract this nested ternary operation into an independent statement.
- L142:46 `sonarjs/no-nested-conditional` (S3358, MAJOR) — Extract this nested ternary operation into an independent statement.
- L178:8 `sonarjs/no-nested-conditional` (S3358, MAJOR) — Extract this nested ternary operation into an independent statement.
- L228:30 `sonarjs/no-nested-template-literals` (S4624, MAJOR) — Refactor this code to not use nested template literals.
- L253:11 `sonarjs/no-nested-template-literals` (S4624, MAJOR) — Refactor this code to not use nested template literals.

### `event-libs/v1/c2/blocks/sessions-guide/components/MyFavoritesView.js`

- L23:17 `sonarjs/cognitive-complexity` (S3776, CRITICAL) — Refactor this function to reduce its Cognitive Complexity from 22 to the 15 allowed.
- L106:9 `sonarjs/no-nested-conditional` (S3358, MAJOR) — Extract this nested ternary operation into an independent statement.
- L115:18 `sonarjs/no-nested-conditional` (S3358, MAJOR) — Extract this nested ternary operation into an independent statement.
- L121:45 `sonarjs/no-nested-conditional` (S3358, MAJOR) — Extract this nested ternary operation into an independent statement.
- L127:45 `sonarjs/no-nested-conditional` (S3358, MAJOR) — Extract this nested ternary operation into an independent statement.

### `event-libs/v1/c2/blocks/sessions-guide/components/MySessionsView.js`

- L23:17 `sonarjs/cognitive-complexity` (S3776, CRITICAL) — Refactor this function to reduce its Cognitive Complexity from 22 to the 15 allowed.
- L106:9 `sonarjs/no-nested-conditional` (S3358, MAJOR) — Extract this nested ternary operation into an independent statement.
- L115:18 `sonarjs/no-nested-conditional` (S3358, MAJOR) — Extract this nested ternary operation into an independent statement.
- L121:45 `sonarjs/no-nested-conditional` (S3358, MAJOR) — Extract this nested ternary operation into an independent statement.
- L127:45 `sonarjs/no-nested-conditional` (S3358, MAJOR) — Extract this nested ternary operation into an independent statement.

### `event-libs/v1/c2/blocks/sessions-guide/components/SessionCard.js`

- L18:17 `sonarjs/cognitive-complexity` (S3776, CRITICAL) — Refactor this function to reduce its Cognitive Complexity from 34 to the 15 allowed.
- L51:33 `sonarjs/no-nested-conditional` (S3358, MAJOR) — Extract this nested ternary operation into an independent statement.
- L159:8 `sonarjs/no-nested-conditional` (S3358, MAJOR) — Extract this nested ternary operation into an independent statement.
- L160:8 `sonarjs/no-nested-conditional` (S3358, MAJOR) — Extract this nested ternary operation into an independent statement.

### `event-libs/v1/c2/blocks/sessions-guide/components/SessionDetailOverlay.js`

- L48:17 `sonarjs/cognitive-complexity` (S3776, CRITICAL) — Refactor this function to reduce its Cognitive Complexity from 51 to the 15 allowed.
- L206:101 `sonarjs/no-nested-conditional` (S3358, MAJOR) — Extract this nested ternary operation into an independent statement.
- L209:43 `sonarjs/no-nested-conditional` (S3358, MAJOR) — Extract this nested ternary operation into an independent statement.
- L210:36 `sonarjs/no-nested-conditional` (S3358, MAJOR) — Extract this nested ternary operation into an independent statement.
- L213:29 `sonarjs/no-nested-conditional` (S3358, MAJOR) — Extract this nested ternary operation into an independent statement.
- L218:104 `sonarjs/no-nested-conditional` (S3358, MAJOR) — Extract this nested ternary operation into an independent statement.
- L218:140 `sonarjs/no-nested-conditional` (S3358, MAJOR) — Extract this nested ternary operation into an independent statement.
- L222:36 `sonarjs/no-nested-conditional` (S3358, MAJOR) — Extract this nested ternary operation into an independent statement.
- L225:29 `sonarjs/no-nested-conditional` (S3358, MAJOR) — Extract this nested ternary operation into an independent statement.
- L226:29 `sonarjs/no-nested-conditional` (S3358, MAJOR) — Extract this nested ternary operation into an independent statement.

### `event-libs/v1/c2/blocks/sessions-guide/utils/use-post-event.js`

- L11:5 `sonarjs/void-use` (S3735, CRITICAL) — Remove this use of the "void" operator.

### `event-libs/v1/features/timing-framework/worker-traditional.js`

- L186:9 `sonarjs/cognitive-complexity` (S3776, CRITICAL) — Refactor this function to reduce its Cognitive Complexity from 17 to the 15 allowed.
- L368:9 `sonarjs/cognitive-complexity` (S3776, CRITICAL) — Refactor this function to reduce its Cognitive Complexity from 23 to the 15 allowed.
- L213:20 `sonarjs/pseudo-random` (S2245, MAJOR) — Make sure that using this pseudorandom number generator is safe here.
- L316:23 `sonarjs/pseudo-random` (S2245, MAJOR) — Make sure that using this pseudorandom number generator is safe here.

### `event-libs/v1/features/timing-framework/worker.js`

- L144:9 `sonarjs/cognitive-complexity` (S3776, CRITICAL) — Refactor this function to reduce its Cognitive Complexity from 17 to the 15 allowed.
- L360:9 `sonarjs/cognitive-complexity` (S3776, CRITICAL) — Refactor this function to reduce its Cognitive Complexity from 23 to the 15 allowed.
- L178:20 `sonarjs/pseudo-random` (S2245, MAJOR) — Make sure that using this pseudorandom number generator is safe here.
- L303:23 `sonarjs/pseudo-random` (S2245, MAJOR) — Make sure that using this pseudorandom number generator is safe here.

### `event-libs/v1/services/sessions/sessions-api.js`

- L309:91 `sonarjs/no-nested-template-literals` (S4624, MAJOR) — Refactor this code to not use nested template literals.

### `event-libs/v1/utils/constances.js`

- L1:25 `sonarjs/super-linear-regex` (S8786, MAJOR) — Simplify this regular expression to reduce its runtime, as it has super-linear performance due to backtracking.
- L3:32 `sonarjs/super-linear-regex` (S8786, MAJOR) — Simplify this regular expression to reduce its runtime, as it has super-linear performance due to backtracking.

### `event-libs/v1/utils/da-sheet-controller.js`

- L193:23 `sonarjs/cognitive-complexity` (S3776, CRITICAL) — Refactor this function to reduce its Cognitive Complexity from 16 to the 15 allowed.
- L111:8 `sonarjs/no-nested-conditional` (S3358, MAJOR) — Extract this nested ternary operation into an independent statement.
- L231:9 `sonarjs/no-dead-store` (S1854, MAJOR) — Remove this useless assignment to variable "decoded".

### `event-libs/v1/utils/decorate.js`

- L177:23 `sonarjs/cognitive-complexity` (S3776, CRITICAL) — Refactor this function to reduce its Cognitive Complexity from 24 to the 15 allowed.
- L1188:28 `sonarjs/cognitive-complexity` (S3776, CRITICAL) — Refactor this function to reduce its Cognitive Complexity from 16 to the 15 allowed.
- L44:45 `sonarjs/no-nested-template-literals` (S4624, MAJOR) — Refactor this code to not use nested template literals.
- L698:37 `sonarjs/super-linear-regex` (S8786, MAJOR) — Simplify this regular expression to reduce its runtime, as it has super-linear performance due to backtracking.
- L710:31 `sonarjs/super-linear-regex` (S8786, MAJOR) — Simplify this regular expression to reduce its runtime, as it has super-linear performance due to backtracking.
- L871:82 `sonarjs/no-nested-template-literals` (S4624, MAJOR) — Refactor this code to not use nested template literals.
- L1123:30 `sonarjs/super-linear-regex` (S8786, MAJOR) — Simplify this regular expression to reduce its runtime, as it has super-linear performance due to backtracking.
- L1170:15 `sonarjs/no-nested-conditional` (S3358, MAJOR) — Extract this nested ternary operation into an independent statement.

### `event-libs/v1/utils/esp-controller.js`

- L717:23 `sonarjs/cognitive-complexity` (S3776, CRITICAL) — Refactor this function to reduce its Cognitive Complexity from 19 to the 15 allowed.
- L67:56 `sonarjs/pseudo-random` (S2245, MAJOR) — Make sure that using this pseudorandom number generator is safe here.
- L171:81 `sonarjs/no-nested-template-literals` (S4624, MAJOR) — Refactor this code to not use nested template literals.
- L65:5 `sonarjs/no-ignored-exceptions` (S2486, MINOR) — Handle this exception, don't catch it at all, or explain in a comment why it is ignored.

### `event-libs/v1/utils/utils.js`

- L482:73 `sonarjs/cognitive-complexity` (S3776, CRITICAL) — Refactor this function to reduce its Cognitive Complexity from 18 to the 15 allowed.
- L612:10 `sonarjs/cognitive-complexity` (S3776, CRITICAL) — Refactor this function to reduce its Cognitive Complexity from 19 to the 15 allowed.
- L718:10 `sonarjs/cognitive-complexity` (S3776, CRITICAL) — Refactor this function to reduce its Cognitive Complexity from 16 to the 15 allowed.
- L830:17 `sonarjs/cognitive-complexity` (S3776, CRITICAL) — Refactor this function to reduce its Cognitive Complexity from 20 to the 15 allowed.
- L724:25 `sonarjs/super-linear-regex` (S8786, MAJOR) — Simplify this regular expression to reduce its runtime, as it has super-linear performance due to backtracking.
- L378:7 `sonarjs/no-ignored-exceptions` (S2486, MINOR) — Handle this exception, don't catch it at all, or explain in a comment why it is ignored.

