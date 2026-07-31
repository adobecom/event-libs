# Block Hydration

Hydration repeats an authored template row once per item in an event-data collection,
before the block initializes.

**No content originates in code.** The author writes one row containing
`[[collection.field]]` placeholders plus any static text the block needs; the hydrator
only clones that row per item and rewrites each clone's placeholders to point at a
specific item. `decorateEvent`'s existing placeholder resolution then fills in the values,
exactly as it does for the rest of the page. A hydrator never reads a field value, and
never invents a label.

This works for blocks event-libs owns *and* for consumer blocks it doesn't, such as
da-bacom's `event-speakers`.

**Ownership boundary:** event-libs owns the data and the mechanism; each consumer owns its
own blocks' DOM. A hydrator for a consumer-owned block therefore lives in that consumer's
repo, next to its block, and is registered via `registerHydrator`. event-libs' `HYDRATORS`
map is for event-libs' own blocks only — do not add consumer blocks to it.

## Table of Contents

1. [Authoring](#authoring)
2. [How it works](#how-it-works)
3. [Why hydration is synchronous](#why-hydration-is-synchronous)
4. [Registering a hydrator](#registering-a-hydrator)
5. [Writing a hydrator](#writing-a-hydrator)
6. [Available hydrators](#available-hydrators)

---

## Authoring

Add the `hydrate` variant to the block, plus any variant that selects which data to
pull. For `event-speakers`, the second variant filters by speaker type:

```
event-speakers (hydrate, speaker)
```

which produces `class="event-speakers hydrate speaker"`. Supported type variants are
`speaker`, `judge`, `host`, and `keynote`; omit the type variant to render every
speaker in the metadata.

Then author **exactly one template row** — the shape of a single item, with
`[[collection.field]]` placeholders where the data goes:

| event-speakers (hydrate, speaker) | | | |
| --- | --- | --- | --- |
| *(image with alt* `[[speakers.photo]]`*)* | `[[speakers.firstName]] [[speakers.lastName]]`<br>`[[speakers.title]]`<br>`[[speakers.company]]` | `[[speakers.bio]]` | Read more |

Notes on authoring the template:

- **Write the placeholder without an index.** `[[speakers.firstName]]`, not
  `[[speakers:0.firstName]]`. The hydrator adds the index per clone.
- **The collection name comes from the placeholders.** `speakers` in the example above
  maps to `<meta name="speakers">`. No config row is needed.
- **Images bind through the `alt` attribute**, as elsewhere in event decoration: drop a
  placeholder image into the cell and set its alt text to `[[speakers.photo]]`.
- **Static text stays static.** The "Read more" label above is authored, so changing it to
  "Open me" just works. Anything not in `[[...]]` is copied verbatim to every row.
- **The block must not be empty.** With no template row there is nothing to repeat, and
  the hydrator leaves the block alone.

## How it works

`decorateEvent` calls `hydrateBlocks(area)`, which finds every `.hydrate` element,
takes the block name from the first class, looks up a hydrator, and calls it.

Lookup order:

1. The runtime registry (`registerHydrator`) — consumer-supplied hydrators
2. `HYDRATORS` in `hydrate.js` — hydrators that ship with event-libs

A block with no hydrator is left untouched and logged. A hydrator that throws is logged
separately, and the remaining blocks still hydrate.

The shared `repeatTemplate` helper does the structural work:

1. Find the row containing `[[...]]` placeholders — the template.
2. Derive the collection name from the first placeholder, and parse that metadata.
3. Let the hydrator filter and sort the items (its only job).
4. Clone the template per item, rewriting `[[speakers.x]]` to `[[speakers:i.x]]` where
   `i` is the item's index in the original metadata array.
5. Remove the template row.

Ordering matters and is load-bearing: `hydrateBlocks` runs at the top of `decorateEvent`,
and `processTemplateInAllNodes` — which resolves `[[...]]` — runs later in the same
function. So the placeholders the hydrator writes are resolved in the same pass, before
any block `init()`.

If the collection is missing, unparseable, or selects no items, the hydrator removes the
template row rather than leaving it: an unresolved row would render literal `[[tokens]]`
to the user, and for `event-speakers` a leftover single-cell row makes the block throw on
`name.parentNode`. A block with no rows at all initializes cleanly.

Consumers need no special call: hydration runs to completion inside `decorateEvent`,
which projects already invoke before `loadArea()`.

A successfully hydrated block is marked `data-hydrated="true"` and skipped by later
passes. This matters because `decorateEvent` runs again for nested areas — fragments,
personalization, and `events-form` — and a second pass over an already-initialized block
would destroy the DOM its `init()` built. A hydrator that throws is left unmarked, so a
later pass retries it.

## Why hydration is synchronous

Hydration must complete before any block's `init()` runs, and there is no point at which
a caller could await it. Milo invokes the configured `decorateArea` synchronously for
fragments (`blocks/fragment/fragment.js`) and personalization
(`features/personalization/personalization.js`), discarding the return value — so a
hydration promise returned from `decorateEvent` would be dropped on those paths and race
the block init.

Consequences to respect when touching this code:

- **No dynamic `import()` in the hydration path.** `import()` returns a promise even for
  a cached module, so lazily loading a hydrator reintroduces the race. Hydrators are
  statically imported at the top of `hydrate.js`.
- **Hydrators must be synchronous.** No `async`, no `fetch`. Read from metadata already
  present in the page. `hydrateBlocks` does not await the hydrator, so an async one would
  return an unobserved promise and hydrate too late. `registerHydrator` rejects async
  functions outright for this reason.
- A regression test in `test/unit/hydrate/hydrate.test.js` asserts the DOM is hydrated on
  the statement immediately after `hydrateBlocks` returns.

This also matters because target blocks may not be re-runnable. `event-speakers` moves
its cells into an injected `<section>` during init, so a second init throws — hydration
has one chance, before init.

## Registering a hydrator

**This is the pattern for every consumer-owned block.** Keep the hydrator beside its block
in your own repo, and register it at page startup:

```
da-bacom/
├── scripts/scripts.js                          ← registers the hydrator
└── blocks/event-speakers/
    ├── event-speakers.js                       ← the block
    └── event-speakers.hydrator.js              ← its hydrator
```

```js
if (eventMD) {
  eventUtils = await import(`${EVENT_LIBS}/libs.js`);

  const { default: hydrateEventSpeakers } = await import('../blocks/event-speakers/event-speakers.hydrator.js');
  eventUtils.registerHydrator('event-speakers', hydrateEventSpeakers);
}
// ...
if (eventMD && eventUtils?.decorateEvent) eventUtils.decorateEvent(document);
```

The `await import` is fine here — page startup is outside `decorateEvent`, where awaiting
is safe. Register a **function**, not a module path: resolving a path would need a dynamic
import inside the hydration path, which is what the sync constraint rules out.
`registerHydrator` returns `true` on success, `false` if it rejected the hydrator.

Register **before `decorateEvent` runs**, or the block keeps its unresolved template row.

**One registration covers every hydration pass.** The registry is module state on the
event-libs instance, so it outlives the initial page load and still applies when Milo
re-invokes `decorateArea` for [fragments](https://github.com/adobecom/milo/blob/main/libs/blocks/fragment/fragment.js)
and [personalization](https://github.com/adobecom/milo/blob/main/libs/features/personalization/personalization.js).
Note the fragment path passes a detached `DOMParser` document; that works because
`getMetadata` reads the main document by default, so a hydrator sees page metadata
regardless of which area it is handed.

A registered hydrator takes precedence over a built-in one, so a consumer can also
override event-libs' behaviour for an event-libs block.

## Writing a hydrator

Delegate the structure to `repeatTemplate` and supply only the selection rule — which
items appear, in what order. That is usually the whole hydrator:

`repeatTemplate` is exported from `libs.js` as public API for exactly this:

```js
// In your own repo, next to your block
import { repeatTemplate } from `${EVENT_LIBS}/libs.js`;

function selectItems(items, block) {
  // Filter by a variant class, sort however the block needs, and return items
  // from the original array so their indexes can be recovered.
  return items.filter((item) => block.classList.contains(item.kind));
}

export default function hydrateMyBlock(block) {
  repeatTemplate(block, { selectItems });
}
```

Guidelines:

- **Never produce content.** No labels, no field values, no generated markup. If you find
  yourself writing a user-visible string, it belongs in the authored template instead.
- `selectItems` must return items **from the original array** — `repeatTemplate` recovers
  each item's index with `indexOf` to build its placeholder. Returning copies breaks that.
- Stay synchronous. No `async`, `await`, `fetch`, or dynamic `import()`. See
  [Why hydration is synchronous](#why-hydration-is-synchronous).
- Tolerate field-name variants in event data: `speakerType`/`type`, and `title`/`bio` at
  the top level or nested under `localizations['en-US']`.
- Don't remove the block. The hydrator doesn't own its lifecycle.
- Leave the block in a state its `init()` tolerates on the bail-out paths too —
  `repeatTemplate` handles this by removing the unresolved template row.

If a block genuinely needs structure the template model can't express, a hydrator may
still mutate the block directly — but then the content question applies with full force,
and the values must come from placeholders the decoration pass resolves.

## Available hydrators

| Block | Metadata | Variants | Owner | Where the hydrator lives |
| --- | --- | --- | --- | --- |
| `image-links` | `sponsors` | `sponsors` + tier (`platinum`, `diamond`, `gold`, `silver`, `bronze`, `engagement`) | event-libs | `v1/hydrate/image-links.js` (in `HYDRATORS`) |
| `event-speakers` | `speakers` | `speaker`, `judge`, `host`, `keynote` | da-bacom | `da-bacom/blocks/event-speakers/event-speakers.hydrator.js` (registered) |

`image-links` predates the template model and still builds its rows in code; it is the
one exception, kept as-is to avoid changing authored sponsor pages.

### `event-speakers` (da-bacom)

Lives in da-bacom, since da-bacom owns that block's DOM. It repeats the authored template
row once per speaker, sorted by `ordinal` — speakers with no ordinal go last. Its selection
rule is the entire hydrator; the four-cell shape, the heading level, and the "Read more"
label all come from the template.

The block reads cells positionally, so the authored template must keep this order:

| Cell | Contents |
| --- | --- |
| 1 | image, with `[[speakers.photo]]` as its alt text |
| 2 | name, and optionally title/company — the block styles the first heading here |
| 3 | bio |
| 4 | the expand label (removed by the block, reused as its button text) |

Cell 2 must not be empty: the block throws on `name.parentNode` for a row with fewer than
two cells. Bio placeholders resolve to the full text — the block truncates to a
75-character preview itself and keeps the rest for its "Read more" expansion.
