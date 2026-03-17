Audit the block "$ARGUMENTS" against this project's coding standards. Read the file at `event-libs/v1/blocks/$ARGUMENTS/$ARGUMENTS.js` and check every item below. Report PASS/FAIL for each, quoting the offending line(s) for any failure.

## Checklist

**Imports**
- [ ] All imports use `.js` extensions
- [ ] Milo utilities are imported from `../../utils/utils.js` (never hardcoded Milo URLs)
- [ ] Dynamic Milo imports use `getEventConfig()?.miloConfig?.miloLibs ?? LIBS`, not a hardcoded URL

**DOM**
- [ ] Uses `createTag()` for element creation — no bare `document.createElement`
- [ ] Modifies `el` in place — does not return a new element or replace `el` itself

**Async**
- [ ] Uses `async/await` — no `.then()` chains

**Error handling**
- [ ] Errors logged via `window.lana?.log()` — no `console.error` or `console.warn` in production paths

**Style**
- [ ] 2-space indentation
- [ ] Single quotes
- [ ] Semicolons present
- [ ] Top-level exports use `function` keyword; inner callbacks use arrow functions

**State**
- [ ] Cross-block state accessed via `BlockMediator` (not a module-level mutable variable shared across calls)

## After the audit

If any failures are found, ask the user whether to fix them before proceeding.
