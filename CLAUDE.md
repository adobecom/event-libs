# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm test              # Run all tests with coverage (Web Test Runner on port 2000)
npm run test:watch    # Run tests in watch mode
npm run lint          # Run JS + CSS linting
npm run lint:fix      # Auto-fix linting issues
npm run event-libs    # Start AEM dev server (aem up, port 3868)
```

There is no build step — the library is delivered as ES modules directly.

To run a single test file, pass it as an argument to WTR or use watch mode and filter by file name.

## Architecture

This is `@adobecom/college` — an Adobe AEM/Helix event page component library. It runs entirely in the browser as ES modules with no bundler.

### Initialization Flow

```
event-libs/scripts/scripts.js
  → setConfig(CONFIG)        # Milo config with IMS, codeRoot, decorateArea
  → decorateArea()           # event-libs/v1/utils/decorate.js
      → decorateEvent(el)    # metadata, icons, RSVP links, block hydration
  → loadArea()               # Milo handles standard block loading
```

### Public API

`event-libs/v1/libs.js` is the barrel file. It exports core utilities and the `EVENT_BLOCKS` array (all block names). New blocks must be added here to be auto-loaded by Milo.

### Block System

Each block lives at `event-libs/v1/blocks/<name>/<name>.js` and must export:

```javascript
export default async function init(el) { /* modify el in place */ }
```

Blocks are lazy-loaded on demand by name. Use `createTag()` (from Milo via utils) for DOM creation — not `document.createElement`.

### State Management

`BlockMediator` (vendored at `v1/deps/block-mediator.min.js`) is the pub/sub store for cross-block state. Common keys: `imsProfile`, `rsvpData`, `eventData`, `espData`.

```javascript
BlockMediator.get('imsProfile');
BlockMediator.set('rsvpData', data);
BlockMediator.subscribe('eventData', ({ newValue }) => updateUI(newValue));
```

### Milo Integration

Milo (`@adobecom/milo`) provides `loadArea`, `setConfig`, `createTag`, `createOptimizedPicture`, `getConfig`, and more. Import them via the `LIBS` constant (resolved dynamically from hostname). Never hardcode Milo URLs. Never reimplement what Milo already provides.

Use `?milolibs=local` to point at a local Milo instance (localhost:6456).

### Environment Detection

Environments are resolved from hostname or `?eccEnv` query param: `dev`, `dev02`, `stage`, `stage02`, `prod`/`main`, `local`. The `getEventServiceEnv()` utility handles this.

## Coding Standards

- **ES modules only** — `import`/`export`, always with `.js` extensions
- **2-space indentation**, single quotes, semicolons, LF line endings
- Top-level exports use `function`; callbacks/closures use arrow functions
- `async/await` only — no `.then()` chains
- Log errors via `window.lana?.log()` — never `console.error` in production code
- Metadata keys are `kebab-case`; parse JSON values in `try/catch`
- Module-level singletons use the closure-based getter/setter pattern in `utils.js`

## Testing

Tests mirror the source tree under `test/unit/`. HTML fixtures live in `mocks/` subdirectories.

```javascript
import { expect } from '@esm-bundle/chai';
import { readFile } from '@web/test-runner-commands';
import init from '../../../../event-libs/v1/blocks/<name>/<name>.js';
```

- Reset DOM in `beforeEach`: set `document.body.innerHTML` and `document.head.innerHTML`
- No external network calls — fetch is restricted to localhost in the test harness
- Global mocks (`window.getConfig`, `window.lana`, `window.adobeIMS`, `BlockMediator`) are set up automatically via `test/unit/scripts/mocks/event-config.js`
- Use Chai `expect` style assertions

## Claude Code Workflow

### Running a single test file

The full test suite (`npm test`) runs all tests with coverage. For iteration on one block, run WTR directly with the specific file (flags match the `test` script in `package.json`):

```bash
npx wtr test/unit/blocks/<name>/<name>.test.js --node-resolve --port=2000
```

Add `--watch` for interactive development.

### When tests fail unexpectedly

Check `web-test-runner.config.js` — the import map aliases must resolve correctly:

- `events/` → `/event-libs/v1/`
- `events/blocks/` → `/event-libs/v1/blocks/`
- `events/scripts/` → `/event-libs/v1/utils/`
- `events/features/` → `/event-libs/v1/features/`

A missing or mismatched alias silently breaks module resolution after refactors.

### Adding a new block (checklist)

1. Create `event-libs/v1/blocks/<name>/<name>.js` with `export default async function init(el)`
2. Add `'<name>'` to `EVENT_BLOCKS` in `event-libs/v1/libs.js`
3. Create `test/unit/blocks/<name>/<name>.test.js` and `mocks/default.html` fixture
4. Reset DOM in `beforeEach`: set both `document.body.innerHTML` and `document.head.innerHTML`

### Agents

Use an **Explore agent** when:
- Searching for an existing utility across `event-libs/v1/utils/` before writing new code
- Tracing how a block uses `BlockMediator` or how `decorateEvent` calls through to `init`
- The answer requires reading more than 2–3 files

Single-file reads don't need an agent — use `Read` directly.

### Skills

- `/simplify` — run after completing a new block or utility to catch redundancy and reuse opportunities before committing
- `/commit` — generates a correctly formatted commit message; use instead of writing manually

### Linting

Run before every commit:

```bash
npm run lint:fix   # auto-fix JS (Airbnb) and CSS (Stylelint)
npm run lint       # verify clean — required before PR
```
