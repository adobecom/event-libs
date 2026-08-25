# event-card — known issues carried over from code review

Extracted from a broader `max2026-homepage` vs `dev` review (2026-08-03). The other
findings from that review were block-specific and already fixed or closed as
not-applicable; these three are still open and span shared infrastructure that
`event-card` (and `upcoming-sessions`) depend on.

## 1. Duplicate MobileRider controller file — resolved, and a real env bug found in the process

**Was:** `event-libs/v1/services/sessions/mobile-rider-controller.js` and
`event-libs/v1/features/timing-framework/plugins/mobile-rider/mobile-rider-controller.js`
were byte-identical, and the former hardcoded a single host
(`overlay-admin-integration.mobilerider.com`) with no environment awareness at
all — unlike `services/sessions/mobile-rider.js`'s `fetchLiveStatus(ids, env)`,
which correctly switches between `overlay-admin.mobilerider.com` (prod) and
`overlay-admin-dev.mobilerider.com` (dev/stage) based on `session-store.js`'s
`getApiConfig().mrEnv`. This meant `upcoming-sessions.js`/`session-routing.js`
polled the same MR host regardless of dev/stage/prod, while `sessions-guide`
(via `poller.js` → `mobile-rider.js`) correctly split by environment.

**Fix:** `mobile-rider-poller.js` now imports `fetchLiveStatus` from
`mobile-rider.js` instead of instantiating `MobileRiderController`, passing
`getApiConfig()?.mrEnv` on each tick (converting its Set results back to
arrays to keep `upcoming-sessions.js`/`session-routing.js`'s existing
`.filter()`/array-based consumers unchanged). `services/sessions/
mobile-rider-controller.js` is deleted as unused. TF's own copy at
`features/timing-framework/plugins/mobile-rider/mobile-rider-controller.js`
is untouched — it's a separate, still-duplicated concern (TF's schedule-skip
decision, not live-status polling for session cards) worth a follow-up but
out of scope here.

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
