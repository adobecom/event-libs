# Session Guide — Full Page — Implementation Plan

**Ticket:** MWPW-206102 · **Epic:** MWPW-192677

> **Status: still under review.** This document tracks design decisions made so
> far for the full-page surface, ahead of implementation. Nothing here has been
> coded yet unless explicitly marked done. Treat this as the source of truth for
> "why" a decision was made — the ticket's ACs (kept in sync as decisions land)
> are the source of truth for "what" is required.

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

### 2. Filter category key: our own slug, not the raw `attributeId`
`filterCategories[].attributeId` is a RainFocus UUID — correct to key internal
logic on, but unusable in a shareable URL. RainFocus doesn't give categories a
slug (only `attributeId` + `label`/`displayName`), so we generate one:
`slugify(category.label)`.

Since this is authored, event-specific, human-edited text, two things need
handling wherever this slug gets generated (once per `guideConfig` load, not
per interaction):
- **Collision** — two enabled categories reducing to the same slug. Rare with
  today's ~7 categories, but cheap to guard: detect it and deterministically
  disambiguate (exact mechanism TBD — still reviewing).
- **Staleness** — a URL's category slug not matching any category in the
  *current* config (a renamed category, an old shared link). Resolution: the
  unrecognized `filter=` pair is silently ignored, not an error. Same
  graceful-degradation posture as everything else in this payload.

### 3. Filter value: RainFocus's own `value`, not `label`
Verified against a real `session-catalog` capture
(`not-tracked/session-catalog-response.md` §3.2/§3.4): every `single-select`/
`multi-select` custom attribute value carries both a kebab-case `value` slug
and a human `label`, RainFocus-curated with **zero observed collisions** across
the full payload. `AI Focus` was the one exception (`value === label`,
un-slugified) until a backend fix — confirmed slugified as of the 2026-09-10
capture. There is no longer any attribute where `value` is unsafe to use.

This means:
- **No home-grown slugify for values.** Use `value` as-is.
- **This is where the real implementation cost lives, and it's shared code:**
  `sessions-api.js`'s `buildCustomAttributeValueMap()` currently builds
  `session.customAttributeValues` from `v.label ?? v.value` (label-first) — that
  map is what `FilterPanel.js`'s `categoryOptions` and `filterSessions()`
  compare against today. Making `value` the filter identity means adding a
  slug-keyed variant used specifically for filter Set-membership/comparison,
  while every other consumer of `customAttributeValues` (session cards,
  `CategoryBadge`, detail modal) keeps using the label-keyed map, unchanged.
  `FilterPanel.js` needs to carry `{value, label}` pairs instead of one bare
  string, selecting on `value`, rendering `label`.
- See the scope-boundary note above — this specific change is shared with the
  widget and needs a widget regression check.

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

- Exact category-slug collision tie-break algorithm (§2).
- Test coverage plan for the `value`-based filter identity change and its
  widget regression check (§3).
- Whether `utils/url.js` (currently widget-only: `setSessionsParam` /
  `clearSessionParams`) is the right home for the new full-page-only
  `?view=`/`?filter=`/`?search=` helpers, or whether they stay inline in
  `FullPageShell.js` as they are today.

## Ticket sync

MWPW-206102's "URL Parameters — Filters" AC and the "URL Parameter
Combinations" example have been updated to match §4 (real `category:value`
pairs, slug values, note about slugs vs. display text). Re-sync this section
if any decision above changes before implementation.
