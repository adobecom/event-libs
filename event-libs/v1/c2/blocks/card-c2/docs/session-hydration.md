# `card-c2` session hydration

## 1. Summary

`card-c2` cards used for Featured Sessions are authored **one card per session**,
each with its own hand-picked image already in place. The text content (title,
track, CTA link) instead comes from a `featured-sessions` collection authored once
in **page-level metadata** (DA's Metadata block, which becomes a real
`<meta name="featured-sessions">` tag), keyed to each card by a session-code class
(e.g. `s6210`).

This hydrator is built on the token-rewrite model from PR #208
(`docs/block-hydration.md`), but adapted for cards that already exist 1:1 with
their data — no row cloning, no image binding.

## 2. Why this isn't the `repeatTemplate` case

PR #208's `repeatTemplate` model (used by `event-speakers`) assumes **one
authored template row, cloned once per metadata item**. That fits blocks where
the author writes the shape once and the data drives repetition.

`card-c2`'s case is the opposite: the author already authors **N separate
`card-c2` divs**, one per session, each with a real `<picture>` already placed by
hand. There is nothing to clone — every card's row already exists. Forcing this
through `repeatTemplate` would mean either cloning from one template and losing
the author's per-card image control, or authoring the metadata's `photo` field
with an image path that doesn't exist yet (the image is only ever added directly
in DA, not sourced from data).

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
card corresponds to (by session-code class), and rewrite the indexless tokens in
that card's content to point at that item's index —
`[[featured-sessions.enTitle]]` → `[[featured-sessions:3.enTitle]]` — via the
local `rewriteTokensToIndex` helper in `event-libs/v1/hydrate/card-c2.js`
(mirrors `repeat-template.js`'s `setTokenIndex`). `decorateEvent`'s existing
`processTemplateInAllNodes` pass resolves the indexed tokens afterward, same as
everywhere else on the page. The hydrator never reads `enTitle`/`track`/`url`
values and never builds `<p>`/`<a>` elements.

### 3.1 Bare-token shorthand

Since the card already authors its own metadata key as a class (`featured-sessions`
above), repeating that key in every token is redundant. `rewriteToken()` also
accepts a bare, prefix-less token — `[[enTitle]]` rewrites to the same
`[[featured-sessions:3.enTitle]]` as `[[featured-sessions.enTitle]]` would. Both
forms can be mixed freely on the same card. A token containing a `.` that
doesn't start with this card's own metadata key (e.g. `[[some-other-key.title]]`)
is left untouched — it's assumed to reference an unrelated metadata collection,
not a typo.

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
collection to page metadata fixes this with no resolver-side changes at all, at
the cost of the collection being page-scoped rather than section-scoped (one
flat `featured-sessions` key per page, not per section — acceptable for now;
revisit if a page ever needs two distinct session collections in two different
sections).

### 4.2 `href` tokens are percent-encoded

DA percent-encodes `[[`/`]]` inside authored attribute values on save, so a CTA
like `<a href="[[featured-sessions.url]]">` is serialized as
`href="%5B%5Bfeatured-sessions.url%5D%5D"`. A plain
`block.innerHTML.replace(META_REG, ...)` never sees literal `[[` in that string,
so it would silently fail to rewrite the CTA's token. The hydrator handles
`href` attributes separately: for every `a[href]` in the card, decode with
`decodeURIComponent` first (matching `decorate.js`'s own
`processDATemplateLinks` convention), rewrite the decoded string, and write it
back with `setAttribute('href', ...)`. Plain-text tokens (title, description)
don't need this — they round-trip through `innerHTML` unencoded.

## 5. Session-routing data-attributes

Separate from the visible content, this hydrator hands off routing data for the
card's click behavior (see `card-c2/docs/README.md` — `session-routing.js`).
Since that data (`sessionId`, `mrStreamId`, times, `watchUrl`) is never rendered
as visible text, it doesn't go through the token/placeholder system — it's set
directly as `data-*` attributes on the card element itself, which `card-c2.js`
never touches (it only clears/rebuilds `el`'s children, not `el`'s own
attributes):

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

Following PR #208's convention, `card-c2` is registered in
`event-libs/v1/hydrate/hydrate.js`'s static `HYDRATORS` map:
`'card-c2': hydrateCardC2`. The hydrator itself lives at
`event-libs/v1/hydrate/card-c2.js`.

## 7. Open questions

1. Should unmatched cards (no `sessionCode` match) be removed entirely, or left
   with unresolved tokens for `decorate.js`'s existing fallback to clean up?
   Current behavior assumes the latter (§4, step 3) to avoid duplicating
   removal logic that already exists elsewhere in the decoration pipeline.
2. `hydrate.js` still statically/eagerly imports `hydrateCardC2` (not lazy
   `import()`), so every page pays the parse/eval cost of this hydrator's
   module even on pages with zero `card-c2` blocks. See
   `card-c2/docs/known-issues.md` for the tracked follow-up.
