# EDS Block Patterns — event-libs

Load this reference at the start of Phase 2 (Read existing patterns).
Consult the **Fluffyjaws MCP** for authoritative EDS conventions when in doubt.

---

## Block anatomy

Each event-libs block lives at:

```
event-libs/v1/blocks/<name>/
  <name>.js     ← required, default export is init(el)
  <name>.css    ← required, scoped under .<name>
```

The block is auto-loaded by the Milo/EDS framework when the block name
appears in `EVENT_BLOCKS` in `event-libs/v1/libs.js`.

### init(el) contract

```javascript
export default async function init(el) {
  // el is the root block element (.block-name)
  // Modify el in place — do not replace it
  // No return value needed
}
```

The framework sets `data-block-status="loaded"` on `el` after `init` resolves.

---

## Shared utilities (event-libs)

Import from `../../utils/utils.js`:

```javascript
import {
  createTag,           // DOM creation — always use this, not document.createElement
  getEventConfig,      // Returns the current event configuration object
  LIBS,                // Base URL for Milo libraries (e.g. '/libs')
  getMetadata,         // Read page metadata by key
  getImageSource,      // Resolve image src for a given picture element
  getEventServiceEnv,  // Returns: 'dev' | 'stage' | 'prod' | 'local' etc.
} from '../../utils/utils.js';
```

---

## Milo utilities (dynamic import)

Milo utilities must be imported dynamically via the `LIBS` constant:

```javascript
const eventConfig = getEventConfig();
const miloLibs = eventConfig?.miloConfig?.miloLibs ?? LIBS;

const { decorateButtons } = await import(`${miloLibs}/utils/decorate.js`);
const { createOptimizedPicture } = await import(`${miloLibs}/utils/utils.js`);
```

Common Milo utilities:
- `decorateButtons(el)` — converts plain links to styled CTA buttons
- `createOptimizedPicture(src, alt, eager, breakpoints)` — builds a
  `<picture>` with WebP sources and responsive widths

---

## BlockMediator

Cross-block state is managed via `BlockMediator`, vendored at
`event-libs/v1/deps/block-mediator.min.js`.

```javascript
import BlockMediator from '../../deps/block-mediator.min.js';

// Read state
const profile = BlockMediator.get('imsProfile');

// Write state
BlockMediator.set('rsvpData', data);

// Subscribe
BlockMediator.subscribe('eventData', ({ newValue }) => {
  // update UI with newValue
});
```

Common mediator keys:
| Key | Type | Description |
|-----|------|-------------|
| `imsProfile` | object | Signed-in user IMS profile |
| `rsvpData` | object | RSVP / registration state |
| `eventData` | object | Full event payload from ESP/ESL |
| `espData` | object | Raw ESP event data |

Only use BlockMediator if the block genuinely needs cross-block state.
Prefer reading data directly from the authored DOM or page metadata for
static content.

---

## Authored DOM structure

The EDS authoring model produces a predictable DOM structure.  A block
authored as a two-column table becomes:

```html
<div class="block-name" data-block-name="block-name" data-block-status="initialized">
  <div>            ← row 1
    <div>col 1</div>
    <div>col 2</div>
  </div>
  <div>            ← row 2
    <div>col 1</div>
    <div>col 2</div>
  </div>
</div>
```

- Select rows: `el.querySelectorAll(':scope > div')`
- Select cells in a row: `row.querySelectorAll(':scope > div')`
- Images come as `<picture>` elements wrapping `<img>`, not bare `<img>`
- Headings are `<h1>`–`<h6>`, paragraphs are `<p>`

---

## CTA / button patterns

Call `decorateButtons(el)` (Milo) early in `init()` to convert plain
anchor tags into styled buttons.  Milo adds `.con-button` and `.button`
classes.

For event-specific CTAs, check the block's authored content for links
that should be RSVP or registration actions — these may need to be
wired to the `espData` state from BlockMediator.

---

## Error logging

Never use `console.error` in production code.  Use:

```javascript
window.lana?.log(`<block-name>: descriptive error message`);
```

Use `console.warn` only during development.

---

## CSS scoping

All CSS selectors must be scoped under the block's root class:

```css
/* correct */
.my-block { ... }
.my-block .my-block-card { ... }

/* wrong — unscoped tag selector */
p { ... }
img { ... }
```

Use `@media screen and (min-width: Npx)` for breakpoints (event-libs
convention — not the modern `(width >= Npx)` syntax used in C2).

---

## Fluffyjaws MCP

When in doubt about any EDS convention — block loading, page lifecycle,
content transformation, metadata handling — query the **Fluffyjaws MCP**.
It has authoritative documentation for the EDS platform.

Fluffyjaws requires Adobe VPN.  If unavailable, fall back to reading
existing event-libs blocks and the milo source.

Examples of good Fluffyjaws queries:
- "How does EDS deliver the markup to the page?"
- "What is the block decoration lifecycle in a Milo project?"
- "How does metadata get applied on the page?"
- "How does EDS handle responsive images?"
- "How does the ?eventlibs= query parameter resolve block paths?"
