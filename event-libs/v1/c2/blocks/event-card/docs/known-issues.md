# event-card — known issues carried over from code review

Extracted from a broader `max2026-homepage` vs `dev` review (2026-08-03). The other
findings from that review were block-specific and already fixed or closed as
not-applicable; these three are still open and span shared infrastructure that
`event-card` (and `upcoming-sessions`) depend on.

## 1. Byte-identical duplicate MobileRider controller file

**Files:** `event-libs/v1/services/sessions/mobile-rider-controller.js` and
`event-libs/v1/features/timing-framework/plugins/mobile-rider/mobile-rider-controller.js`
— still byte-identical as of this writing.

**Impact:** a future fix or endpoint change (auth header, base URL, error-shape
handling) applied to one copy silently fails to apply to the other.
`isMediaActive`/`getMediaStatusMap` are duplicated in the older file but never
called by `utils/session-routing.js`/`upcoming-sessions.js` — only `getMediaStatus` is
used.

**Fix:** delete the newer duplicate and import the existing controller from
`features/timing-framework/plugins/mobile-rider/`.

## 2. Two independent MobileRider poll loops — fixed

**Was:** `utils/session-routing.js` and `upcoming-sessions/upcoming-sessions.js`
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
- `utils/session-routing.js` still registers its full `.event-card[data-mr-
  stream-id]` snapshot once and never unregisters — it still needs ongoing
  live→on-demand tracking for its own cards, unchanged.

Covered by `test/unit/services/sessions/mobile-rider-poller.test.js`
(batching, refcounted registration, subscribe/unsubscribe).

## 3. `event-card` hydrator eagerly imported on every page — resolved by removal

**Was:** `event-libs/v1/hydrate/hydrate.js` statically imported
`hydrate/event-card.js`, which was confirmed on the LCP-critical path (every page
paid to fetch/parse/evaluate that module before Milo's `loadLCPImage()` ran, via
`libs.js` → `decorate.js` → `hydrate.js`'s eager import chain), regardless of
whether the page authored any `event-card` block.

**Resolved:** the whole `hydrate`/`featured-sessions`-classname/session-code
mechanism (`hydrate/event-card.js`) was deleted — Featured Sessions is now built
by `event-libs/v1/c2/blocks/featured-sessions/`, generating cards directly from
the Homepage configurator's link payload with no hydration pass at all. There is
nothing left in `hydrate.js`'s eager import chain for this concern to apply to.
