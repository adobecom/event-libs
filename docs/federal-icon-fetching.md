# Fetching Federal Icons

How to resolve an icon name to an SVG element, from either a vanilla block or a
Preact block, and which function to use for which icon.

## Two namespaces

Federal hosts two separate, non-overlapping sets of SVGs:

| Namespace | Path | Used for | Manifest |
|---|---|---|---|
| Generic | `/federal/assets/icons/svgs/{name}.svg` | Track/override icons, general UI icons | `icons.json` |
| Product | `/federal/assets/svgs/{name}.svg` | Product logos (brand-colored) | none |

They're never merged into one fallback chain — a track icon and a product icon
never share a name, and checking both for every lookup would just double the
404s for names that only live in one namespace.

## Track/override icons (generic namespace)

Use the shared resolver: federal (generic) → Milo's local sprite → nothing else.

**Vanilla block:**
```js
import { resolveIcon } from '../../features/icons/icon-resolver.js';

const svg = await resolveIcon('chevron-right');
if (svg) el.append(svg);
```

**Preact block:**
```js
import { Icon } from '../../features/icons/Icon.js';

html`<${Icon} name="chevron-right" size=${20} />`
```
`Icon` uses `resolveIcon` by default — no extra wiring needed.

## Product icons (product namespace)

Use `fetchFederalProductIcon` directly — it only checks the product namespace,
with no Milo fallback (Milo doesn't have product logos).

**Vanilla block:**
```js
import { fetchFederalProductIcon } from '../../features/icons/federal-icons.js';

const svg = await fetchFederalProductIcon('photoshop-64');
if (svg) el.append(svg);
```

**Preact block:**
```js
import { Icon } from '../../features/icons/Icon.js';
import { fetchFederalProductIcon } from '../../features/icons/federal-icons.js';

html`<${Icon} name="photoshop-64" size=${20} resolve=${fetchFederalProductIcon} />`
```
`Icon` accepts a `resolve` prop to swap in a different resolver — pass
`fetchFederalProductIcon` instead of relying on the default.

## Notes

- Both fetchers cache hits *and* misses (`Map<name, SVGElement|null>`) — federal
  has no manifest for products, so a miss would otherwise re-fetch on every render.
- `fetchFederalIconList()` (generic namespace only, via `icons.json`) is for
  populating a searchable icon picker, not for rendering — products have no
  manifest, so there's nothing equivalent for them; use a plain text input for
  the slug instead.
