# Code Review Findings — `max2026-homepage` vs `dev`

Tracking doc for issues found in `/code-review` of commits diverged from `dev`
(reviewed 2026-08-03). Check items off as they're fixed.

## 1. [x] Broken test suite — CI is currently failing

**File:** `test/unit/c2/blocks/upcoming-sessions/upcoming-sessions.test.js:171`

4 tests still assert a "Live Now" badge and `{type: 'watch', url}` click
routing that commit `0b1c70f` ("Remove live-session state — drop cards on
start instead") intentionally removed.

- `buildCard()` no longer renders `.sg-live-card__time` = "Live Now"
- `resolveClickAction` now always returns `{type: 'session-guide', sessionId}`,
  never `{type: 'watch', url}`

**Impact:** `npm test` / CI fails on this branch right now.

**Fix:** Update the 4 failing tests to match the new drop-on-start behavior
(or delete them if the behavior they cover no longer exists).

---

## 2. [x] Late-decorated cards never join MobileRider live-poll — CLOSED, not applicable

**File:** `event-libs/v1/c2/blocks/card-c2/session-routing.js:16`

`startMobileRiderPolling()` snapshots `.card-c2[data-mr-stream-id]` from the
DOM exactly once, gated by a module-level `mrPollStarted` flag that never
resets.

**Original impact concern:** Featured Sessions cards in a later-loaded/
lazily-decorated section finish decorating after polling has already
started, so their `mrStreamId` never enters `streamIds` and can never be
reported as "live".

**Why this doesn't apply:** Featured Sessions cards are authored
statically — all present in the DOM before `decorateEvent` runs, never
injected afterward. `hydrateBlocks()` (`hydrate.js:40-56`) hydrates every
`.card-c2.hydrate` element in the document in one **synchronous** `forEach`
pass, with no `await`, before Milo's `loadArea()` calls `init()` on any
individual block. So by the time the first card-c2 calls
`startMobileRiderPolling()`, every statically-authored card already has its
`data-mr-stream-id` set, and the one-time DOM snapshot already captures all
of them. The race only exists in theory for a card injected dynamically
*after* initial decoration, which isn't how this content is authored.

**Note for the future:** if Featured Sessions cards are ever authored
dynamically (injected post-load, SPA-style re-render), this snapshot+flag
pattern will silently break for those cards — re-open this item if that
authoring model changes.

---

## 3. [x] Ratio-variant class overwrites detected metadata key

**File:** `event-libs/v1/hydrate/card-c2.js:6-18`

`getMetadataKeyAndSessionCode()` overwrote `metadataKey` with the *last*
non-session-code class it saw, with no exclusion for card-c2's own
ratio-variant classes (`ratio-1-1`, `ratio-4-3`, `ratio-3-4`, `ratio-4-5`).

**Impact:** `class="card-c2 hydrate featured-sessions ratio-3-4 s6210"` →
`metadataKey` ended up as `'ratio-3-4'` instead of `'featured-sessions'`.
`getSessions()` returned `null`, `hydrateCardC2` silently returned — no
`lana.log`, no test coverage for this combination, card just never hydrated.

**Fix applied:** added a `RATIO_VARIANT_PATTERN = /^ratio-\d+-\d+$/` exclusion
alongside the existing `card-c2`/`hydrate` skip in
`getMetadataKeyAndSessionCode()`, so any `ratio-X-X` class is ignored when
scanning for the metadata key (covers all current variants and any future
ones matching the pattern, without needing to import/duplicate card-c2.js's
`VARIANTS` list). Added a regression test
(`'ignores a ratio-variant class when detecting the metadata key'` in
`test/unit/hydrate/card-c2.test.js`). Tests and lint clean.

---

## 4. [x] Cleanup function assigned but never invoked

**File:** `event-libs/v1/c2/blocks/upcoming-sessions/upcoming-sessions.js:497`

`el._upcomingSessionsCleanup` is assigned but has zero callers anywhere in
the repo.

**Impact:** MR poll interval/timeouts, the document-level `visibilitychange`
listener, and the favorited/scheduled/pendingActions subscriptions are never
torn down. If the block is ever re-decorated within the same page lifetime,
the original instance's timers/listeners keep running against a stale
closure — doubling polling and render calls once a second instance inits.

**Fix:** Call `el._upcomingSessionsCleanup()` from wherever block
teardown/re-decoration happens, or wire it into a `MutationObserver`/page
lifecycle hook if none currently exists.

---

## 5. [x] Pagination dots built twice for header+footer slider pattern — CLOSED, feature removed

**File:** `event-libs/v1/c2/blocks/slider/slider.js` (was line 205)

`buildDots(track)` was called unconditionally by `init()` for every
`.slider` instance. The slider is authored twice (header + footer) against
the same shared track, so each instance independently built its own
pagination-dot widget.

**Resolution:** the Figma design for this slider has no dots/pagination
indicator at all — `buildDots` was speculative/unused code, not a feature
this design calls for. Deleted `buildDots` entirely (JS) along with the
`.carousel-dots`/`.carousel-dot`/`.carousel-dot.is-active` rules in
`slider.css`. Confirmed no other file referenced `carousel-dots` or
`buildDots`. `buildArrows`'s own header+footer duplication is intentional
and tested (`renders arrows-only for the footer instance` in
`slider.test.js`) — arrows are meant to duplicate (nav controls above and
below the cards); dots, which represent a single page-state for the shared
track, were the actual problem and are now gone. `npm run test`/lint clean.

---

## 6. [x] Pagination dots can disappear permanently (no resize recompute) — CLOSED, feature removed

**File:** `event-libs/v1/c2/blocks/slider/slider.js` (was line 158)

Same root cause as #5 — `buildDots` computed `perView`/`pageCount` once at
init time with no resize recompute. Resolved by removing `buildDots`
entirely; see #5.

---

## 7. [ ] Byte-identical duplicate MobileRider controller file

**File:** `event-libs/v1/services/sessions/mobile-rider-controller.js:5`

Identical (verified via `diff`) to the pre-existing
`event-libs/v1/features/timing-framework/plugins/mobile-rider/mobile-rider-controller.js`.

**Impact:** A future fix or endpoint change (auth header, base URL,
error-shape handling) applied to one copy silently fails to apply to the
other. `isMediaActive`/`getMediaStatusMap` are duplicated but never called
by the new code — only `getMediaStatus` is used.

**Fix:** Delete the new duplicate and import the existing controller from
`features/timing-framework/plugins/mobile-rider/`.

---

## 8. [ ] Two independent MobileRider poll loops instead of the shared poller

**File:** `event-libs/v1/c2/blocks/card-c2/session-routing.js:23`

`session-routing.js` and `upcoming-sessions.js` each independently implement
their own `setInterval`-based MR poll loop and `?timing=` clock override,
instead of reusing the existing shared poller
(`event-libs/v1/services/sessions/poller.js`, already consumed by
`session-store.js`).

**Impact:** Each block showing an MR-backed live card adds another
independent 30s poller hitting the MobileRider endpoint — redundant network
calls, and risk of the per-block `liveStreamActiveIds` sets drifting out of
sync with each other and with `session-store.js`.

**Fix:** Consolidate on the shared poller / `session-store.js`'s
`liveStreamActiveIds` signal instead of each block polling independently.

---

## 9. [ ] card-c2 hydrator now eagerly imported on every page

**File:** `event-libs/v1/hydrate/hydrate.js:1`

`import hydrateCardC2 from './card-c2.js';` is now a static, eager import in
`hydrate.js`, which is itself unconditionally imported by `decorate.js`.

**Impact:** Every page pays the parse/eval cost of card-c2's hydrator module
(plus its dependencies) even on pages with zero card-c2 blocks — previously
all hydrators loaded lazily via `import()` only when a matching `.hydrate`
element existed.

**Fix:** Revert to lazy `import()` unless there's a specific ordering
requirement (see #10) that justifies the eager load — if so, document why.

---

## 10. [ ] Hardcoded `STATIC_HYDRATORS` allowlist fails silently if forgotten

**File:** `event-libs/v1/hydrate/hydrate.js:32`

`STATIC_HYDRATORS` is a manually-maintained, hardcoded single-entry allowlist
rather than a generalized static/dynamic hydrator registration mechanism.

**Impact:** A future `.hydrate` block needing the same "rewrite tokens before
`processTemplateInAllNodes` runs" guarantee as card-c2 gets written but the
author forgets to add it to `STATIC_HYDRATORS`. It still resolves via async
`import()` with no error, but lands one microtask after decorateEvent's
synchronous template scan — cards render blank/wrong content in production,
and the existing unit-test pattern wouldn't catch the regression.

**Fix:** Either document the requirement prominently near the hydrator
definition, or add a lint/test check that flags `.hydrate`-pattern hydrators
missing from `STATIC_HYDRATORS`.
