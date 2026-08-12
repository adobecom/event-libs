# card-c2 — known issues carried over from code review

Extracted from a broader `max2026-homepage` vs `dev` review (2026-08-03). The other
findings from that review were block-specific and already fixed or closed as
not-applicable; these three are still open and span shared infrastructure that
`card-c2` (and `upcoming-sessions`) depend on.

## 1. Byte-identical duplicate MobileRider controller file

**Files:** `event-libs/v1/services/sessions/mobile-rider-controller.js` and
`event-libs/v1/features/timing-framework/plugins/mobile-rider/mobile-rider-controller.js`
— still byte-identical as of this writing.

**Impact:** a future fix or endpoint change (auth header, base URL, error-shape
handling) applied to one copy silently fails to apply to the other.
`isMediaActive`/`getMediaStatusMap` are duplicated in the older file but never
called by `session-routing.js`/`upcoming-sessions.js` — only `getMediaStatus` is
used.

**Fix:** delete the newer duplicate and import the existing controller from
`features/timing-framework/plugins/mobile-rider/`.

## 2. Two independent MobileRider poll loops — fixed

**Was:** `card-c2/session-routing.js` and `upcoming-sessions/upcoming-sessions.js`
each ran their own `setInterval`-based MR poll loop, hitting
`overlay-admin-integration.mobilerider.com` independently even when both blocks
were on the same page tracking overlapping `mrStreamId`s.

**Fix:** both now go through a shared registry,
`event-libs/v1/services/sessions/mobile-rider-poller.js`
(`registerStreamIds`/`unregisterStreamIds`/`subscribe`), which holds a single
`setInterval` and batches the *union* of every currently-registered id across
every caller into one `getMediaStatus()` call per tick, fanning the result out
to all subscribers. Each block's own per-session gating is unchanged — this
only replaces *where the actual fetch/interval lives*, not each block's
business logic for deciding which ids it cares about and when:

- `upcoming-sessions.js` still gates each session's registration on its own
  scheduled start time (per-session `setTimeout`, unchanged), and still
  unregisters an id the moment MR confirms it active (still doesn't care about
  "stop time" — registration is dropped, not kept around for an eventual
  on-demand transition, since this block never shows one).
- `card-c2/session-routing.js` still registers its full `.card-c2[data-mr-
  stream-id]` snapshot once and never unregisters — it still needs ongoing
  live→on-demand tracking for its own cards, unchanged.

Covered by `test/unit/services/sessions/mobile-rider-poller.test.js`
(batching, refcounted registration, subscribe/unsubscribe).

## 3. `card-c2` hydrator eagerly imported on every page — confirmed on the LCP path, fix is cross-repo

**File:** `event-libs/v1/hydrate/hydrate.js:3` —
`import hydrateCardC2 from './card-c2.js';` is a static, eager import, and
`hydrate.js` is itself unconditionally imported by `decorate.js`.

**Confirmed impact — this is genuinely on the LCP-critical path, not just
theoretically eager.** Traced the real call chain:

- `da-events/events/scripts/scripts.js:23-40` does a **top-level `await
  Promise.all([import(utils.js), import(libs.js)])`** — page script execution
  is paused here until both resolve.
- Only after that resolves does `decorateArea()` run (same file, line 42),
  whose *first* action is `loadLCPImage()` — removing `loading="lazy"` from the
  hero `<img>` so the browser starts fetching it.
- `libs.js` eagerly imports `decorate.js` → `hydrate.js` → `card-c2.js`'s
  hydrator. So every page pays for fetching, parsing, and evaluating that
  module **before** the hero image's `loading` attribute is even removed —
  directly delaying LCP, on every page, regardless of whether it authors any
  `card-c2` block.

**Marginal cost is small, though.** `card-c2.js`'s own imports
(`constances.js`, `utils.js`) are already unconditionally loaded elsewhere in
the same eager chain (needed by `image-links.js` and many other consumers), so
the *only* thing card-c2 specifically adds is its own one ~90-line file and one
extra HTTP request — likely single-digit milliseconds, not a dramatic
regression.

**Why the fix can't stay inside this repo.** `decorateEvent()` calls
`hydrateBlocks(parent)` synchronously, and it must finish before
`processTemplateInAllNodes()` runs a few lines later in the same function —
that's the exact bug `card-c2/docs/session-hydration.md` §9 already documents
fixing by making this hydrator static/synchronous. Two ways to make it lazy
without reopening that race:

1. **Parallelize the fetch, don't nest it.** Issue a *third*, conditional
   dynamic import for `hydrate/card-c2.js` from `da-events/events/scripts/
   scripts.js`'s existing `Promise.all([...])` (gated on a cheap synchronous
   check — e.g. `document.querySelector('.card-c2.hydrate')` or
   `foundation: c2` metadata), then synchronously `registerHydrator('card-c2',
   ...)` once that import resolves, before `decorateArea()`/`decorateEvent()`
   run. This keeps `decorateEvent()` itself fully synchronous — the ordering
   guarantee is preserved because the module is already loaded and registered
   by the time `hydrateBlocks()` looks it up. **This requires editing
   `da-events`' `scripts.js`, a separate repo from this branch/PR** — not
   something `event-libs` alone can land.
2. **Make `decorateEvent` async and thread `await` through every call
   site** (`da-events`' `decorateArea()`, plus `event-libs`'s own
   `events-form.js:1096`). Avoids touching `scripts.js`'s import list, but
   risks delaying everything else `decorateEvent` does (metadata processing,
   session-state bootstrap, template/link resolution) relative to Milo's
   `loadArea()`, for every block on every page — a much larger blast radius
   for a one-file saving.

**Recommendation:** given the modest payoff (one file, one request) versus the
coordination cost (a `da-events` change to this repo's consumer, or a
higher-risk async refactor touching every block's timing), leave this as a
tracked issue rather than fix it speculatively from `event-libs` alone. Revisit
if/when `da-events` is in scope in the same work session, so option 1 can be
implemented and tested end-to-end in one pass.
