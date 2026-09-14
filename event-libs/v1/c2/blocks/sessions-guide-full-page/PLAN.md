# Session Guide — Full Page — Implementation Plan

**Ticket:** MWPW-206102 · **Epic:** MWPW-192677

> **Status: filter/URL work implemented (§2, §3); one open question remains**
> (where the new URL helpers should live, see "Still reviewing" below). Items
> are marked ✅ Implemented individually — treat this as the source of truth
> for "why" a decision was made, and the ticket's ACs (kept in sync as
> decisions land) as the source of truth for "what" is required.

---

## ⚠️ Scope boundary — this work must not bleed into the widget

The full-page surface (`sessions-guide-full-page.js` / `FullPageShell.js`)
shares its component tree, store, and utils with the widget
(`sessions-guide.js` / `DrawerShell.js`) — see `../sessions-guide/PLAN.md`
"File Structure" for the shared layout. That sharing is intentional and
established, but it means every decision below needs to be checked against one
question: **does this change reach into shared code, and if so, does it change
the widget's behavior?**

Rule of thumb for everything in this doc:

- **URL-sync behavior** (`?view=`, `?filter=`, `?search=` and how they're read
  from / written to the address bar) is **full-page-only**. It belongs in
  `FullPageShell.js` (or a full-page-specific addition alongside it), never in
  `DrawerShell.js` or any code both surfaces call into. The widget's own URL
  behavior (`?sessions`, `?session=<slug>`) is unrelated and untouched by any of
  this.
- **Filter *identity*** (switching from display label to RainFocus's slug `value`
  as what `activeFilters`/`FilterPanel` actually key and compare on — see
  below) **is necessarily a shared change**, since `FilterPanel.js` and the
  session-data mapping in `sessions-api.js` are shared. When this lands, it
  needs a regression pass against the **widget's** filter panel specifically —
  same visible labels, same filtering results, only the internal key changes.
  If a change can't be made without altering what the widget shows or how it
  behaves, stop and re-scope it rather than let it bleed through.

---

## Decisions

### 1. URL params are full-page-only, three of them
`?view=`, `?filter=`, `?search=`. All three are absent when at the default
state (default view, no filters, empty search) — the base `sessions.html` URL
is the "nothing active" state. This matches the ticket's ACs (see MWPW-206102,
"URL Parameters" sections) and was not changed by anything below.

### 2. Filter category key: our own slug, not the raw `attributeId` ✅ Implemented
`filterCategories[].attributeId` is a RainFocus UUID — correct to key internal
logic on, but unusable in a shareable URL. RainFocus doesn't give categories a
slug (only `attributeId` + `label`/`displayName`), so we generate one.

What shipped:
- **`parse-config.js`**: `mapAuthoredFilterCategories()` now returns
  `{ id, label, slug }` per category (was `{ id, label }`). `slug` is
  `slugifyCategoryLabel(label)` — lowercase, spaces/underscores to hyphens,
  everything else stripped. Computed once per `guideConfig` parse, not per
  interaction.
- **Collision** — two enabled categories reducing to the same slug: resolved
  with a `-2`/`-3`/... suffix in authoring order (a `Map` tracking counts as
  categories are walked in their authored array order, which is already
  stable/deterministic). Falls back to the raw `attributeId` in the
  (currently unseen) case a label slugifies to an empty string.
- **Staleness** — a URL's category slug not matching any category in the
  *current* config (a renamed category, an old shared link): `FullPageShell.js`'s
  new `categoryIdForSlug()`/`categorySlugForId()` return `null` on a miss, and
  both the parse and serialize effects drop that pair rather than erroring or
  leaking a raw `attributeId` into the URL. Same graceful-degradation posture
  as everything else in this payload.
- `FilterPanel.js` needed **no changes** — it only ever dealt in `id`
  (attributeId), never the URL string. The slug is purely a translation layer
  at the `FullPageShell.js` URL boundary, exactly as scoped.

### 3. Filter value: RainFocus's own `value`, not `label` ✅ Implemented
Verified against a real `session-catalog` capture
(`not-tracked/session-catalog-response.md` §3.2/§3.4): every `single-select`/
`multi-select` custom attribute value carries both a kebab-case `value` slug
and a human `label`, RainFocus-curated with **zero observed collisions** across
the full payload. `AI Focus` was the one exception (`value === label`,
un-slugified) until a backend fix — confirmed slugified as of the 2026-09-10
capture. There is no longer any attribute where `value` is unsafe to use.

**Turned out to be simpler than expected:** `customAttributeValues` had exactly
one consumer — `session-filters.js` (`getFilterValue()`/`filterSessions()`) via
`FilterPanel.js`. Session cards, `CategoryBadge`, and the detail modal all read
their own separate flat fields (`primaryTrack`, `tracks`, `products`, etc.),
never `customAttributeValues` — so there was no second consumer requiring the
old label-first content to stick around under that name.

What shipped, in `sessions-api.js`:
- `buildCustomAttributeValueMap()` → `buildCustomAttributeMaps()`, building both
  maps in one pass over `session.customAttributes`: `values` (slug-first,
  `v.value ?? v.label`) and `labels` (label-first, the old behavior). Both are
  passed through `normalizeSessions()` as `customAttributeValues` and the new
  `customAttributeLabels`.
- `session-filters.js`: `getFilterValue()` is untouched (it just returns
  whatever's in the map, so flipping the map's content was enough) —
  `filterSessions()` needed no changes either. Added `getFilterLabel()` (same
  shape, reads `customAttributeLabels`) and `getFilterOptions()`, which zips
  the two into `[{ value, label }]` per session/category.
- `FilterPanel.js`: `categoryOptions` now holds `{value, label}` pairs
  (deduped by `value`, sorted by `label`) instead of bare strings.
  `toggleOption`/`currentSet` key on `value`; the pill renders `label`.
  `getProduct(opt.label)` — that lookup is keyed by the authored display name,
  not the slug, so it has to stay on `label` specifically.
- Scope-boundary check: this is shared code (`FilterPanel.js`/`sessions-api.js`
  are used by the widget too). Full suite run after the change: 2589 passed, 0
  failed — no widget regression.

### 4. `?filter=` format: the ticket's own shape, once fed safe values
Format: `?filter=category:value,category:value`, one pair per selected value —
the pair is repeated in full for every value, even multiple values within one
category (there's no compressed `category:val1,val2` form). Example, two Track
selections plus one Technical Level selection:

```
?filter=track:photography,track:branding,technical-level:beginner
```

Parsing: split the whole value on `,`, split each piece on the first `:`,
group by category. `FullPageShell.js` already implements exactly this
shape — the only thing that needed to change was what values get fed into it
(§3), not the delimiter logic itself.

Filtering semantics (unchanged, already the existing behavior): multiple
values within one category are OR'd; multiple categories are AND'd together.

### 5. Why not something fancier (bracket-namespacing, a `;`/`:`/`,` mini-DSL, etc.)
Considered and rejected — recorded here so it isn't re-litigated later without
reason. The only real justification for moving away from the ticket's flat
`?filter=category:value,category:value` shape would have been delimiter safety
(values containing commas). Once §3 confirmed values are RainFocus-provided
slugs, that justification disappeared, and the flat format turned out to
usually be *more* compact than a bracket-per-category alternative for typical
light filtering (a handful of selections spread across a few categories) — see
conversation history for the byte-count comparison. No open action here.

---

## Still reviewing / not yet decided

- Whether `utils/url.js` (currently widget-only: `setSessionsParam` /
  `clearSessionParams`) is the right home for the new full-page-only
  `?view=`/`?filter=`/`?search=` helpers (including the new
  `categoryIdForSlug`/`categorySlugForId` pair), or whether they stay inline in
  `FullPageShell.js` as they are today. Both §2 and §3 are now implemented
  inline; this is purely a "where should this code live" question, not a
  behavior one.

## Ticket sync

MWPW-206102's "URL Parameters — Filters" AC and the "URL Parameter
Combinations" example have been updated to match §4 (real `category:value`
pairs, slug values, note about slugs vs. display text) — still accurate now
that §2/§3 are implemented, no further ticket changes needed.
