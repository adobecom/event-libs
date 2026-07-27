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

## 2. Wire `allowDoubleBooking`

Read `tier-1-event-config.allowDoubleBooking` (via the new singleton's
`getAllowDoubleBooking()`) and drive `session-actions.js`'s `scheduleAction`
`showConflictModal` param from it — one shared, page-level, event-wide read,
not a per-block setting.

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
legacy-flag cleanup.

**`sessions-hub.js` is explicitly OUT of scope, by design, not a gap.** It
has its own entirely independent scheduling/conflict flow
(`handleSessionRegistration` → `findConflictingSession` →
`openConflictModal`, vanilla DOM, no import from `session-actions.js`/
`action-feedback.js`) that shows its conflict modal unconditionally. This
platform serves 3 event tiers; `sessions-hub` is mostly Tier 2/3, while this
whole config system (and MWPW-200314) is specifically Tier 1 (MAX,
Summit-scale events). Don't wire it in as a side effect of this work without
a separate, deliberate decision to do so.

## 3. Featured sessions — bigger than "wire an existing read"

- **Fix `getFeaturedSessions` to iterate `featuredSessions` in *authored*
  order, not filter the day's catalog order.** As it stands today it does
  something like `sessionsForDay(...).filter((s) => idSet.has(s.id))` —
  that's the catalog's order, not the author's. This app's
  `FeaturedSessionsEditor.js` reorder UI (drag-and-drop + keyboard) has no
  visible effect on real display order until this is fixed.
- **Add a new function reading the *same* `featuredSessions` array for
  `OnDemandView.js`** — ID-membership only, authored order, **no
  day-scoping** (`getFeaturedSessions`'s `activeDay` requirement doesn't
  apply to on-demand content at all).
- **Build a new featured-carousel section in `OnDemandView.js`** — doesn't
  exist there today. Mirror `LiveUpcomingView.js`'s
  `<Carousel variant="featured">` pattern.
- `featuredSessions` is a single flat array of session IDs — no day-keying,
  no `duringEvent`/`postEvent` split. `LiveUpcomingView` filters it down to
  whatever's relevant for the active day (existing `sessionsForDay`
  day-intersection logic, once the order fix above lands);
  `OnDemandView`'s new function filters it with no day-scoping. Same
  authored list, two views, each applying its own natural filter — a
  session is never authored twice to be featured in both places.

## 4. Optional, cheap, high-value: self-verification against a mispasted config

`Config` now carries its own `eventId`/`backendEventTitle`/`updated`,
duplicated deliberately (not redundant) so the pasted JSON is self-
describing once it lands in a page's metadata. The consuming side can
cross-check `tier-1-event-config.eventId` against the page's own `event-id`
metadata at read time and `window.lana?.log()` a warning on mismatch —
catches the real failure mode this manual copy/paste hand-off invites (an
author pastes the wrong event's config onto the wrong page). Not required,
just flagged as a cheap addition once the field exists.

## Test-plan items relevant to the consuming side

(mirrors `PLAN.md`'s own test-plan section, consuming-side subset only)

- [ ] `tier-1-event-config.trackIcons`/`getAllowDoubleBooking()`/featured-
      sessions all read correctly off one shared `getMetadata('tier-1-event-config')`
      parse, not three separate reads.
- [ ] A page with only the legacy standalone `track-icon-config` key still
      renders correct icons/colors (fallback verified independently of this
      app).
- [ ] Allow double booking shows the conflict modal consistently across
      Tier 1 scheduling surfaces (today: sessions-guide only —
      `sessions-hub` intentionally not wired).
- [ ] A featured session shows on whichever day it actually falls on in
      `LiveUpcomingView` for each viewer; reordering the authored
      `featuredSessions` array actually changes carousel order (verifies
      the `getFeaturedSessions` order fix); `OnDemandView.js` renders a
      featured carousel reading the same array where none exists today.
- [ ] Pasting a `Config` whose `eventId` doesn't match the page's own
      `event-id` metadata is at least visible/detectable in the data (full
      warning logic is item 4 above, optional).
