# Block Hydration

Hydration fills a block's authored rows with event data from page metadata before the
block initializes. The hydrator does not render final UI — it fabricates the same DOM an
author would have written by hand, then the block's own `init()` decorates it as usual.

This works for blocks event-libs owns *and* for consumer blocks it doesn't, such as
da-bacom's `event-speakers`.

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

Authored rows in a hydrated block are placeholders. `event-speakers` replaces them
entirely, so there is no need to author a row per speaker — an empty block is fine. It
also clears them when there is nothing to render, because the block throws on a row with
fewer than two cells but initializes cleanly with no rows at all.

## How it works

`decorateEvent` calls `hydrateBlocks(area)`, which finds every `.hydrate` element,
takes the block name from the first class, looks up a hydrator, and calls it.

Lookup order:

1. The runtime registry (`registerHydrator`) — consumer-supplied hydrators
2. `HYDRATORS` in `hydrate.js` — hydrators that ship with event-libs

A block with no hydrator is left untouched and logged. A hydrator that throws is logged
separately, and the remaining blocks still hydrate.

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

If the hydrator lives in your own project, import it and register the function before
calling `decorateEvent`:

```js
const eventUtils = await import(`${EVENT_LIBS}/libs.js`);
const { default: hydrateMyBlock } = await import('/blocks/my-block/hydrate.js');

eventUtils.registerHydrator('my-block', hydrateMyBlock);
```

Register a **function**, not a module path — resolving a path would require a dynamic
import inside the hydration path, which is what we're avoiding. Do your own import
up front, where awaiting is safe. `registerHydrator` returns `true` on success and
`false` if it rejected the hydrator.

Register **before `decorateEvent` runs**, or the block keeps its authored placeholder
rows. Both existing consumers have a window for this: they already `await import` of
`libs.js` well before their `decorateEvent` call.

A registered hydrator takes precedence over a built-in one, so a consumer can override
event-libs' behaviour for its own block. If the hydrator is generally useful, add it
under `v1/hydrate/consumers/` and map it in `HYDRATORS` instead — bearing in mind that
statically mapped hydrators ship in every event page's critical path, so prefer
`registerHydrator` for anything consumer-specific.

## Writing a hydrator

A hydrator is a module with a default export taking the block element and mutating it
in place. It must be synchronous — see
[Why hydration is synchronous](#why-hydration-is-synchronous).

```js
import { createTag, getMetadata, getImageSource } from '../../utils/utils.js';

export default function hydrateMyBlock(block) {
  const raw = getMetadata('speakers');
  if (!raw) return;

  let data;
  try {
    data = JSON.parse(raw);
  } catch (error) {
    window.lana?.log(`Hydrator: Failed to parse metadata "speakers": ${error.message}`);
    return;
  }
  // build rows and append to block
}
```

Guidelines:

- Stay synchronous. No `async`, `await`, `fetch`, or dynamic `import()`.
- Parse metadata in `try/catch` and log via `logHydration` from `hydrate/log.js` — not
  `window.lana?.log` directly, which drops the message because hydration runs before
  Milo's `loadLana`. Never throw for missing or malformed data.
- Leave the block in a state its `init()` tolerates, even on the bail-out paths. That may
  mean clearing authored placeholders rather than leaving them.
- Set plain values with `textContent`. `createTag`'s third argument is parsed as HTML.
- Resolve images through `getImageSource(photo)`. Photo values are objects, not URLs,
  and the SharePoint vs DA source differs by CMS.
- Match the target block's authored contract exactly, including cell count and order.
- Don't remove the block. The hydrator doesn't own its lifecycle.
- Tolerate both field-name variants in event data: `speakerType`/`type`, and
  `title`/`bio` at the top level or nested under `localizations['en-US']`.

## Available hydrators

| Block | Metadata | Variants | Owner |
| --- | --- | --- | --- |
| `image-links` | `sponsors` | `sponsors` + tier (`platinum`, `diamond`, `gold`, `silver`, `bronze`, `engagement`) | event-libs |
| `event-speakers` | `speakers` | `speaker`, `judge`, `host`, `keynote` | da-bacom |

### `event-speakers`

Builds one row per speaker in the four-cell shape the block expects:

```html
<div>
  <div><picture><img src="…" alt="…"></picture></div>
  <div><h3>First Last</h3><p>Title</p><p>Company</p></div>
  <div><p>Bio…</p></div>
  <div>Read more</div>
</div>
```

Speakers are sorted by `ordinal`. `company` is omitted when absent. Bios are passed
through at full length — the block truncates to a 75-character preview itself and
captures the full text for its "Read more" expansion.
