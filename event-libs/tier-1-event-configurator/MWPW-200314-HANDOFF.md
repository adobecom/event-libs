# MWPW-200314 handoff — consuming-side work this app's output requires

This app (MWPW-201380, Tier 1 Event Configurator) is authoring-only: it
produces a `Config` JSON blob an author pastes by hand into an event page's
own `tier-1-event-config` metadata row. It never touches the page itself.
Everything below is what **reads** that metadata and needs to change —
explicitly out of scope for this app's own PR, and explicitly in scope for
MWPW-200314. See `PLAN.md` for the full narrative/sourcing behind each item
(search each ticket/file reference below); this doc is just the
consolidated checklist so it doesn't have to be reconstructed from PLAN.md's
chronological log every time.

## 1. Rename `track-icon-config.js` into a broader `tier-1-event-config.js`-style singleton — done 2026-07-27

`event-libs/v1/utils/track-icon-config.js` → `event-libs/v1/utils/tier-1-event-config.js`.
One `getMetadata('tier-1-event-config')` read exposing `getTrackIcon()` and
`getAllowDoubleBooking()` off the same parsed object (a featured-sessions
getter lands once Phase 3/item 3 does), rather than three separate ad-hoc
reads. `getTrackIcon()` now unwraps `parsedConfig.trackIcons[trackName]`
(the new key nests track icons under `.trackIcons`, unlike the old key which
*was* the track map directly).

**Resolved 2026-07-27, per Daniel: no legacy-key fallback needed.** The
pages this whole config system targets — both the old standalone
`track-icon-config` key and the new `tier-1-event-config` key — are not yet
published, so there's no live content to regress. Dropped the fallback
chain entirely: new key or nothing, no legacy-key check. The built-in
`DEFAULT_TRACK_ICON_CONFIG` gap-fill for known tracks with no authored
entry is unrelated to that fallback and still applies as before.

Consumers updated (imports of the renamed file): `CategoryBadge.js`,
`LiveCard.js`, `SessionDetailOverlay.js`, `SessionCard.js`, `decorate.js`
— the actual current importers (`parse-config.js` and `LiveUpcomingView.js`
were listed above but don't import this module).

## 2. Wire `allowDoubleBooking` — done 2026-07-27

`action-feedback.js`'s `toggleScheduleWithFeedback` now derives `toggleScheduleAction`'s
`showConflictModal` param from `getAllowDoubleBooking()` (the item 1
singleton) instead of `eventConfig.showConflictModal` — one shared,
page-level, event-wide read, not a per-block setting. Inverted, since
allowing double booking means suppressing the conflict modal.

**Retire sessions-guide's per-block `show-conflict-modal` table row**
(`parse-config.js:27`) as part of this — it's superseded, not kept as a
competing per-block override.

**Resolved 2026-07-24, per Daniel: no da.live/admin legacy-content check
needed before retiring that flag** — the pages this config system targets
are greenfield (not yet authored), so there's no live page currently
authoring `show-conflict-modal: true` to worry about migrating. **What
actually matters instead: make sure the new/updated logic reads from
`tier-1-event-config` (this app's output), not the old per-block
`show-conflict-modal` config shape.** That's the real migration here, not a
legacy-flag cleanup. Removed `parse-config.js`'s `show-conflict-modal` case
and default entirely, plus the row from `sessions-guide`'s demo/mock
authoring fixtures and the now-meaningless `showConflictModal` filler field
from unrelated component test mocks.

**`sessions-hub.js` is explicitly OUT of scope, by design, not a gap.** It
has its own entirely independent scheduling/conflict flow
(`handleSessionRegistration` → `findConflictingSession` →
`openConflictModal`, vanilla DOM, no import from `session-actions.js`/
`action-feedback.js`) that shows its conflict modal unconditionally. This
platform serves 3 event tiers; `sessions-hub` is mostly Tier 2/3, while this
whole config system (and MWPW-200314) is specifically Tier 1 (MAX,
Summit-scale events). Don't wire it in as a side effect of this work without
a separate, deliberate decision to do so.

## 3. Featured sessions — done 2026-07-27

- **Fixed `getFeaturedSessions` to iterate `featuredSessions` in *authored*
  order.** It used to do `sessionsForDay(...).filter((s) => idSet.has(s.id))`
  — the catalog's order, not the author's. Now builds a `Map` keyed by day
  session id and maps `featuredIds` through it, so `FeaturedSessionsEditor.js`'s
  reorder UI actually affects real display order.
- **Added `getOnDemandFeaturedSessions(sessions, featuredIds)`** to
  `session-filters.js` — same authored array, same order, but ID-membership
  only, **no day-scoping**, and (unlike the live view) no deterministic-shuffle
  fallback: nothing authored means nothing shown, since on-demand content
  isn't tied to a single event day the way the live carousel needs to fill
  dead space.
- **Built a new featured-carousel section in `OnDemandView.js`**, mirroring
  `LiveUpcomingView.js`'s `<Carousel variant="featured">` pattern. Reads from
  `onDemandRaw` (all on-demand sessions), not the viewer's filtered
  `available` list — featured is a curated highlight reel, not something the
  viewer's search/filter selections should be able to hide.
- **Both `getFeaturedSessions`/`getOnDemandFeaturedSessions` now read
  `getFeaturedSessionIds()`** — a new getter added to the `tier-1-event-config.js`
  singleton (`tierOneEventConfig.featuredSessions || []`), per item 1's own
  anticipated Phase 3 addition.
- **Retired sessions-guide's old per-block `featured-sessions` authoring
  row** (`parse-config.js`) in favor of the page-level source, same call as
  item 2 made for `show-conflict-modal` — confirmed with Daniel rather than
  assumed, since this handoff's original text didn't say so explicitly.
  `LiveUpcomingView.js` no longer reads `eventConfig.featuredSessionIds`.

## 4. Optional, cheap, high-value: self-verification against a mispasted config — done 2026-07-27

`initTierOneEventConfig()` now cross-checks `tierOneEventConfig.eventId`
against the page's own `getMetadata('event-id')` immediately after a
successful parse — the same one-shot bootstrap, not a separate call site
callers would need to remember to invoke. Warns via `window.lana?.log()`
only on an actual mismatch; skips silently if either side is missing (e.g.
an older Config authored before the `eventId` field existed, or a context
with no page `event-id` at all).

## Test-plan items relevant to the consuming side

(mirrors `PLAN.md`'s own test-plan section, consuming-side subset only)

- [x] `tier-1-event-config.trackIcons`/`getAllowDoubleBooking()`/featured-
      sessions all read correctly off one shared `getMetadata('tier-1-event-config')`
      parse, not three separate reads. Covered by
      `tier-1-event-config.test.js`/`-invalid.test.js`/`-retry.test.js`.
- [x] ~~A page with only the legacy standalone `track-icon-config` key still
      renders correct icons/colors (fallback verified independently of this
      app).~~ **N/A — resolved 2026-07-27, per Daniel: no legacy-key fallback
      implemented at all** (see item 1). No live pages author either key, so
      there's nothing to verify here.
- [x] Allow double booking shows the conflict modal consistently across
      Tier 1 scheduling surfaces (today: sessions-guide only —
      `sessions-hub` intentionally not wired). Covered by
      `action-feedback.test.js`/`action-feedback-allow-double-booking.test.js`;
      real DA-page verification still pending (needs a page with
      `tier-1-event-config.allowDoubleBooking` authored via the app).
- [x] A featured session shows on whichever day it actually falls on in
      `LiveUpcomingView` for each viewer; reordering the authored
      `featuredSessions` array actually changes carousel order (verifies
      the `getFeaturedSessions` order fix); `OnDemandView.js` renders a
      featured carousel reading the same array where none exists today.
      Order-correctness covered directly in `session-filters.test.js`;
      component-level wiring covered in
      `LiveUpcomingView-featured.test.js`/`OnDemandView-featured.test.js`.
      Real DA-page verification still pending (needs a page with
      `tier-1-event-config.featuredSessions` authored via the app).
- [x] Pasting a `Config` whose `eventId` doesn't match the page's own
      `event-id` metadata is at least visible/detectable in the data (full
      warning logic is item 4 above, optional). Covered by
      `tier-1-event-config-eventid-mismatch.test.js`/`-match.test.js`/
      `-no-config-id.test.js`. Real DA-page verification still pending.
