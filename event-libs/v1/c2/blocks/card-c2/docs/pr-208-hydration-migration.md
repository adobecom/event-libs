# Migration plan: PR #208 (block hydration rewrite) → card-c2 / Featured Sessions

PR: https://github.com/adobecom/event-libs/pull/208 (merged, migration below completed)

## What PR #208 changes

- `hydrateBlocks()` becomes fully **synchronous** — no more
  `getHydrationPromise`/`setHydrationPromise`. `decorateEvent` now just calls
  `hydrateBlocks(parent)` directly, with no promise for any block to await.
  Both are **removed** as exports.
- The old `STATIC_HYDRATORS` map is replaced by `HYDRATORS` in
  `hydrate.js` — **event-libs-owned blocks only**. Consumer (non-event-libs)
  blocks register via the new `registerHydrator(name, fn)`.
- A new shared helper, `repeatTemplate(block, { selectItems })`, is the
  intended pattern for most hydrators: author writes **one** template row
  with unindexed `[[collection.field]]` placeholders (including images,
  bound via `alt="[[collection.photo]]"`); the hydrator only filters/sorts
  via `selectItems(items, block)`; `repeatTemplate` clones that single row
  once per selected item and removes the original.
- Already-hydrated elements are marked `data-hydrated="true"` and skipped on
  re-runs.

## Blocker: our card-c2 hydrator will break as-is

`card-c2.js`'s `init()` currently does:

```js
if (el.classList.contains('hydrate')) {
  const { getHydrationPromise } = await import('../../../hydrate/hydrate.js');
  const hydrationPromise = getHydrationPromise();
  if (hydrationPromise) await hydrationPromise;
}
```

`getHydrationPromise` no longer exists after #208 merges — this import will
throw. **Must remove this block** once #208 lands. This isn't a downgrade:
hydration is now guaranteed synchronous and complete before any block's
`init()` runs at all, so there's nothing to await anymore.

`hydrate/card-c2.js` currently lives under `STATIC_HYDRATORS` in
`hydrate.js` — needs to move to the new `HYDRATORS` map (same map, new
name, still event-libs-owned).

## Why `repeatTemplate` does *not* fit Featured Sessions

`repeatTemplate`'s whole model is: **one authored template row, cloned N
times**, with every field (including the image) pulled from metadata via
placeholder tokens. That's a hard requirement — it's how the clone gets its
image at all.

Featured Sessions' actual authoring requirement is the opposite: **card-c2
is authored multiple times**, once per card, because **the author hand-picks
a different image per card** (not something derivable from session
metadata — sessions don't carry a promotional image field). Each card-c2
instance is its own independently-authored block with its own image,
title/CTA copy, and a session-code class (e.g. `s6210`) that our hydrator
uses to look up *that one* session's data and rewrite *that card's own*
already-authored tokens to point at it.

There is no single template row to repeat — there are N authored rows, each
needing a different, non-metadata-derived image. `repeatTemplate` cannot
produce that; adopting it would mean giving up per-card manual images,
which is the whole point of this block. **Do not migrate card-c2 to
`repeatTemplate`.**

This isn't a novel exception — PR #208 itself keeps `image-links` on its
own bespoke (non-`repeatTemplate`) hydrator for the same class of reason
("predates the template model... left as-is").

## Migration steps once #208 merges

1. Rebase/merge `dev` into this branch (pulls in the new `hydrate.js`,
   `HYDRATORS`, `log.js`, `repeat-template.js`).
2. In `event-libs/v1/hydrate/hydrate.js`, move the `card-c2` entry from the
   old `STATIC_HYDRATORS` map into the new `HYDRATORS` map. No change to
   `hydrateCardC2` itself needed — it keeps its current per-card,
   session-code-lookup logic; it just isn't a `repeatTemplate` consumer.
3. In `card-c2.js`'s `init()`, delete the `getHydrationPromise` block
   entirely (dead code — see Blocker above). No replacement needed.
4. Optionally have `hydrateCardC2` return `false` when it bails out early
   (missing `metadataKey`/`sessionCode`/no match) instead of implicitly
   returning `undefined` — the new `hydrateBlocks` treats `hydrate(block)
   !== false` as success and sets `data-hydrated`; returning `false`
   correctly leaves it eligible for a future rerun and matches the new
   convention other hydrators follow.
5. Run `npm test` — no card-c2/hydrate test assertions depend on
   `getHydrationPromise`/`STATIC_HYDRATORS` directly, but re-verify
   `test/unit/hydrate/card-c2.test.js` and `test/unit/blocks/card-c2/
   card-c2.test.js` pass against the new `hydrate.js`.
6. No CSS/markup changes required — this is purely a hydration-pipeline
   wiring change, not a visual or content-model change.
