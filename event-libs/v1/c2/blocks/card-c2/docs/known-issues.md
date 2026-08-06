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

## 2. Two independent MobileRider poll loops instead of the shared poller

**Files:** `card-c2/session-routing.js` and `upcoming-sessions/upcoming-sessions.js`
each still run their own `setInterval`-based MR poll loop and `?timing=` clock
override, instead of reusing `event-libs/v1/services/sessions/poller.js` (already
consumed by `session-store.js`).

**Impact:** every block showing an MR-backed card adds another independent 30s
poller hitting the MobileRider endpoint — redundant network calls, and a risk of
the per-block `liveStreamActiveIds`-equivalent sets drifting out of sync with each
other and with `session-store.js`.

**Fix:** consolidate on the shared poller / `session-store.js`'s live-signal
instead of each block polling independently. Note this is a deliberate,
documented divergence in `upcoming-sessions` (its own poll is scoped to
sessions that have an authored `mrStreamId` and only starts once each session's
own scheduled start time arrives — see `upcoming-sessions/docs/README.md`), so
consolidating needs to preserve that per-session gating, not just merge the two
loops naively.

## 3. `card-c2` hydrator eagerly imported on every page

**File:** `event-libs/v1/hydrate/hydrate.js:3` —
`import hydrateCardC2 from './card-c2.js';` is a static, eager import, and
`hydrate.js` is itself unconditionally imported by `decorate.js`.

**Impact:** every page pays the parse/eval cost of `card-c2`'s hydrator module
(plus its dependencies) even on pages with zero `card-c2` blocks.

**Fix:** switch to a lazy `import()` resolved only when a matching `.hydrate`
element exists, unless there's a specific ordering requirement that justifies
the eager load (see `card-c2/docs/session-hydration.md` §3 for why this
hydrator originally needed to run synchronously and ahead of token
resolution — confirm whether that constraint still requires a static import
now that `hydrate.js`'s `HYDRATORS` map/`registerHydrator` makes every
hydrator synchronous, or whether a lazy `import()` awaited before
`processTemplateInAllNodes` would satisfy the same ordering).
