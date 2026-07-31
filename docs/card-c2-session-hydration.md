# Design Doc: `card-c2` session hydration

## 1. Summary

`card-c2` cards used for Featured Sessions are authored **one card per session**,
each with its own hand-picked image already in place. The text content (title,
track, CTA link) should instead come from a `featured-sessions` collection
authored once in **page-level metadata** (DA's Metadata block, which becomes a
real `<meta name="featured-sessions">` tag), keyed to each card by a
session-code class (e.g. `s6210`).

This doc defines a hydrator for that pattern, built on the token-rewrite model
introduced in [PR #208](https://github.com/adobecom/event-libs/pull/208)
(`docs/block-hydration.md`), but adapted for cards that already exist 1:1 with
their data — no row cloning, no image binding.

## 2. Why this isn't the `repeatTemplate` case

PR #208's `repeatTemplate` model (used by `event-speakers`) assumes **one
authored template row, cloned once per metadata item**. That fits blocks where
the author writes the shape once and the data drives repetition.

Our case is the opposite: the author already authors **N separate `card-c2`
divs**, one per session, each with a real `<picture>` already placed by hand.
There is nothing to clone — every card's row already exists. Forcing this
through `repeatTemplate` would mean either:

- Cloning from one template and losing the author's per-card image control, or
- Authoring the metadata's `photo` field with an image path that doesn't exist
  yet (the image is only ever added directly in DA, not sourced from data).

So this hydrator does not clone rows and does not touch images at all.

## 3. Content still lives in authoring, not in code

Per PR #208's hydration rule ("never produce content"), the hydrator must not
write visible strings itself. Instead, each card's own content area is authored
with **indexless placeholder tokens**, exactly like a `repeatTemplate` template
row would be — just without the cloning step:

```html
<div class="card-c2 hydrate featured-sessions s6210">
  <div><div><picture>...</picture></div></div>  <!-- authored image, untouched -->
  <div><div>
    <p>[[featured-sessions.enTitle]]</p>
    <p>[[featured-sessions.track]]</p>
    <p><a href="[[featured-sessions.url]]">Learn more</a></p>
  </div></div>
</div>
```

The hydrator's only job is to find which `featured-sessions` item this specific
card corresponds to (by session-code class), and rewrite the indexless tokens
in that card's content to point at that item's index —
`[[featured-sessions.enTitle]]` → `[[featured-sessions:3.enTitle]]` — using the
same `setTokenIndex` rewrite used by `repeat-template.js`. `decorateEvent`'s
existing `processTemplateInAllNodes` pass resolves the indexed tokens
afterward, same as everywhere else on the page. The hydrator never reads
`enTitle`/`track`/`url` values and never builds `<p>`/`<a>` elements.

## 4. Matching a card to its session

Per the authored markup:

```html
<div class="card-c2 hydrate featured-sessions s6210">
```

- `card-c2` — block name (used by `hydrateBlocks` to route to this hydrator)
- `hydrate` — opt-in marker
- `featured-sessions` — the page metadata key to read (an array of session
  records)
- `s6210` — this card's session code, matched case-insensitively against
  `sessionCode` in the metadata array

Matching logic:

1. Read `getMetadata('featured-sessions')` — **page-level**, via
   `event-libs/v1/utils/utils.js`'s `getMetadata`, same mechanism
   `image-links.js` already uses for its `sponsors` collection — and
   `JSON.parse` it.
2. Find the array index whose `sessionCode` (lowercased) equals the card's
   `sXXXX` class.
3. If no match, leave the card's authored tokens alone — no index rewrite
   happens, so `processTemplateInAllNodes` will fail to resolve them and the
   existing "unresolved placeholder" fallback in `decorate.js` handles cleanup
   (matching how the rest of the page already treats unresolved tokens).
4. If matched, rewrite every indexless `[[featured-sessions.*]]` token inside
   the card to `[[featured-sessions:<index>.*]]`.

### 4.1 Why not `section-metadata`

An earlier iteration of this hydrator read the collection out of an inline
`.section-metadata` block instead (parsing its rows directly, bypassing
`getMetadata` entirely). That data was invisible to the existing
token-resolution engine: `parseMetadataPath`/`parseRegularPath` (used by both
`processTemplateInAllNodes` for text and `processDATemplateLinks` for hrefs)
only ever reads `document.head`-level `<meta>` tags. Tokens rewritten to
`[[featured-sessions:0.enTitle]]` resolved successfully — to an empty string,
since `getMetadata('featured-sessions')` found nothing — which rendered as a
blank card body rather than either literal tokens or real text. Moving the
collection to page metadata fixes this with no resolver-side changes at all,
at the cost of the collection being page-scoped rather than section-scoped
(one flat `featured-sessions` key per page, not per section — acceptable for
now; revisit if a page ever needs two distinct session collections in two
different sections).

### 4.2 `href` tokens are percent-encoded

DA percent-encodes `[[`/`]]` inside authored attribute values on save, so a
CTA like `<a href="[[featured-sessions.url]]">` is serialized as
`href="%5B%5Bfeatured-sessions.url%5D%5D"`. A plain
`block.innerHTML.replace(META_REG, ...)` never sees literal `[[` in that
string, so it would silently fail to rewrite the CTA's token. The hydrator
handles `href` attributes separately: for every `a[href]` in the card, decode
with `decodeURIComponent` first (matching `decorate.js`'s own
`processDATemplateLinks` convention), rewrite the decoded string, and write it
back with `setAttribute('href', ...)`. Plain-text tokens (title, description)
don't need this — they round-trip through `innerHTML` unencoded.

## 5. Session-routing data-attributes

Separate from the visible content, this hydrator still needs to hand off
routing data for the click-behavior discussed earlier (not-live → in-page
guide, live → broadcast, on-demand → session page). Since that data
(`sessionId`, `mrStreamId`, times, `watchUrl`) is never rendered as visible
text, it doesn't go through the token/placeholder system — it's set directly
as `data-*` attributes on the card element itself, which `card-c2.js` never
touches (it only clears/rebuilds `el`'s children, not `el`'s own attributes):

| Attribute | Source field |
|---|---|
| `data-session-id` | `sessionId` |
| `data-mr-stream-id` | `mrStreamId` (only if present — signals broadcast capability) |
| `data-session-url` | `url` (on-demand/detail page) |
| `data-watch-url` | `watchUrl` (broadcast page) |
| `data-start-time-utc` | `sessionTime.startTimeMillis` → ISO string |
| `data-end-time-utc` | `sessionTime.endTimeMillis` → ISO string |

This is the one place the hydrator still reads field values directly rather
than going through a placeholder token — justified because these are never
author-editable *content*, only machine-readable routing data with no visible
representation to hand back to authoring.

## 6. Registration

Following PR #208's convention:

- Add to `event-libs/v1/hydrate/hydrate.js`'s static `HYDRATORS` map:
  `'card-c2': hydrateCardC2`
- Hydrator lives at `event-libs/v1/hydrate/card-c2.js`, statically imported
  (no dynamic `import()`, no `async`) — same constraint as every other
  hydrator, since Milo invokes fragment/personalization decoration
  synchronously and discards the return value.

## 7. Changes required to existing implementation

- **`event-libs/v1/hydrate/card-c2.js`** — rewrite to drop `buildContentWrapper`
  (hand-built `<p>`/`<a>` nodes) entirely. Replace with: locate the matching
  session's index, then rewrite indexless `[[featured-sessions.*]]` tokens
  in-place to indexed ones. Keep the `data-*` attribute assignment as-is (§5).
- **`event-libs/v1/c2/blocks/card-c2/card-c2.js`** — remove the
  `await getHydrationPromise()` guard added earlier. Under PR #208, hydration
  is synchronous and complete before any block's `init()` runs — same change
  already made to `image-links.js` in that PR (replaced with a comment noting
  nothing to await).
- **Test fixtures** (`test/unit/hydrate/card-c2.test.js`) — update to author
  `[[featured-sessions.field]]` tokens in the card's content area rather than
  plain text, and assert the tokens are rewritten to the correct index rather
  than asserting rendered text (token resolution itself is
  `processTemplateInAllNodes`'s responsibility, already covered by its own
  tests).

## 8. Open questions

1. Should unmatched cards (no `sessionCode` match) be removed entirely, or
   left with unresolved tokens for `decorate.js`'s existing fallback to clean
   up? This doc assumes the latter (§4.3) to avoid duplicating removal logic
   that already exists elsewhere in the decoration pipeline — needs
   confirmation once we can observe the actual fallback behavior on a real
   unresolved-token card.
2. Does `card-c2` belong in event-libs' static `HYDRATORS` map, or should it be
   registered via `registerHydrator` from da-events' own bootstrap (mirroring
   how `event-speakers` — a da-bacom-owned block — is registered)? Since
   `card-c2` is owned by event-libs itself, `HYDRATORS` seems right, but worth
   confirming against PR #208's stated guidance ("prefer `registerHydrator`
   for anything consumer-specific").

## 9. Phased implementation (PR #208 is not yet merged)

PR #208 lives on its own unmerged branch. `carousel-cards` currently still has
the **old** `hydrate.js`: `hydrateBlocks()` is async and resolves each
hydrator via a dynamic `await import(`./${blockName}.js`)`, and
`getHydrationPromise()`/`setHydrationPromise()` still exist and are still
required (`card-c2.js`'s `init()` still awaits hydration before reading its
children). None of `HYDRATORS`, `repeatTemplate`, `registerHydrator`, or
`logHydration` exist yet on this branch. Building directly against those APIs
now would break immediately.

The token-index-rewrite *logic* in §3–5 has no dependency on any of PR #208's
new exports — it only needs `META_REG` from `event-libs/v1/utils/constances.js`,
which already exists on this branch (it predates #208; it's the same regex
`decorate.js` already uses for its own placeholder resolution). So the design
splits into two phases:

**Phase 1 — now, against the current (pre-#208) API:**

- The hydrator itself matches the target model from §3: no hand-built
  `<p>`/`<a>` content, no image handling. It matches the card to its session
  by `sessionCode`, then rewrites that card's own authored, indexless
  `[[featured-sessions.field]]` tokens to `[[featured-sessions:<index>.field]]`
  in place, using a small local `rewriteTokensToIndex` helper (the same idea
  as #208's `setTokenIndex`, reimplemented locally since `repeat-template.js`
  isn't importable yet).
- `applySessionData` (the routing `data-*` attributes from §5) is unchanged.
- `card-c2.js`'s `await getHydrationPromise()` guard is left **as-is** — the
  current `hydrateBlocks()` is still async, so the race it protects against
  is still real on this branch. Removing it now would reintroduce the bug we
  just fixed.

### 9.1 `hydrate.js` needed a small patch too, not just a new file

Originally this hydrator was resolved the same way `image-links` is today —
`hydrateBlocks()`'s per-block dynamic `import('./card-c2.js')`. That doesn't
work for a token-based hydrator specifically, because of a real race in the
current (pre-#208) `decorateEvent()`:

```js
export function decorateEvent(parent) {
  setHydrationPromise(hydrateBlocks(parent));  // async, not awaited
  // ...
  processTemplateInAllNodes(parent, { ...photosData, ...massagedMetadata });
}
```

`hydrateBlocks()` is `async` and resolves each hydrator via
`await import(...)` — which takes at least one microtask tick, even cached.
`decorateEvent()` doesn't await it before continuing synchronously to
`processTemplateInAllNodes` a few lines later. So `processTemplateInAllNodes`
runs *first*, over the still-indexless `[[featured-sessions.enTitle]]` token;
`parseRegularPath` resolves `featured-sessions` to the metadata **array**,
then does `array['enTitle']` (arrays are `typeof 'object'` in JS) → `undefined`
→ resolves to `''`. Only a tick later does our hydrator actually run and
rewrite the token to `:0` — too late, the text node is already empty, and
`card-c2.js`'s `buildTextNodes` skips creating a paragraph for empty text
entirely. Net effect: a completely empty `card-body`, not literal tokens.

`image-links` never hits this, because it doesn't depend on a later
resolution pass at all — it builds real DOM nodes synchronously, in one step,
inside its own hydrator.

**Fix:** `event-libs/v1/hydrate/hydrate.js` statically imports
`hydrateCardC2` and runs it in a synchronous pass *before* the per-block
dynamic-import loop, so it always completes within `hydrateBlocks()`'s
synchronous prefix — before `decorateEvent()` ever reaches
`processTemplateInAllNodes`:

```js
import hydrateCardC2 from './card-c2.js';

const STATIC_HYDRATORS = { 'card-c2': hydrateCardC2 };

export async function hydrateBlocks(area = document) {
  const blocks = [...area.querySelectorAll('.hydrate')];
  const dynamicBlocks = [];

  blocks.forEach((block) => {
    const staticHydrate = STATIC_HYDRATORS[block.classList[0]];
    if (!staticHydrate) { dynamicBlocks.push(block); return; }
    staticHydrate(block); // no `await` anywhere in this branch
  });

  for (const block of dynamicBlocks) {
    // unchanged dynamic-import path, still used by image-links
  }
}
```

This is a small, targeted patch to the *shared* `hydrate.js` — not the full
`HYDRATORS`/`registerHydrator` surface from #208 — scoped to fixing this one
real race ahead of that PR landing. Notably, this is the same conclusion
#208 reaches for the whole hydration pipeline (make it synchronous); we're
just applying it narrowly, to the one hydrator that actually needs it before
#208 merges.

**Phase 2 — once #208 merges to `dev` and is merged/rebased into this branch:**

- Remove the now-obsolete `await getHydrationPromise()` guard from
  `card-c2.js` (mirrors the equivalent change #208 already made to
  `image-links.js`).
- Drop the Phase 1 `STATIC_HYDRATORS`/`dynamicBlocks` split from `hydrate.js`
  entirely — #208's `HYDRATORS` map makes *every* hydrator synchronous, so the
  distinction this patch introduces (static vs. dynamic-import) no longer
  needs to exist. Just move `'card-c2': hydrateCardC2` into that map (or
  register it via `registerHydrator`, per open question 2 above).
- Optionally replace the local `rewriteTokensToIndex` helper with
  `repeat-template.js`'s `setTokenIndex`, if/once it's exported for reuse
  (currently private to that module).

Phase 1 ships a working hydrator today under the current API; Phase 2 is a
small, mechanical follow-up once the dependency lands, not a rewrite.
