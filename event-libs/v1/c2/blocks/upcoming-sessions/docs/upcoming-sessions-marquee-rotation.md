# Upcoming Sessions Marquee Rotation — Design Doc

## Status

Design discussion complete, not yet implemented. Captured so work can continue in a
new session.

Tracked in [MWPW-200850](https://jira.corp.adobe.com/browse/MWPW-200850).

## Overview

The hero marquee (e.g. Adobe MAX "Featured content" hero) includes an "Upcoming"
sessions rail showing up to N cards (**authorable, defaults to 9 — not a
hardcoded value**), each linking to an individual session page (or, for `live`
sessions, routing to the Watch destination — see §5). The list must
continuously reflect "what's upcoming" as sessions start and end, without
harming the hero's LCP and without visible glitches when cards rotate out.

The marquee's own content is already driven by `chrono-box`: authors use
**Schedule Maker** to define a schedule of `{ startTime, fragmentPath }`
entries, each pointing to a separate DA-authored fragment document that gets
swapped in wholesale at the scheduled time. Because each fragment corresponds
to a specific point in the live event schedule, **the author already knows
what's "upcoming next" at the moment they author that fragment** — this is
the key fact that shapes the whole architecture below: card population is
**authored, not fetched**, using an **Upcoming Sessions Configurator** tool
and a `metadata` JSON payload, mirroring how `chrono-box` itself already
reads its schedule via `getMetadata('schedules')`.

Throughout this doc, "9" refers to the default/example value of the
authorable card-count limit (`N`); it is a soft authoring guideline, not a
runtime-enforced cap — the actual card count is just "however many the
author put in the configured array."

## Goals

- Never block or contend with hero LCP. (Resolved structurally — see §1: this
  block has no fetch at decoration time, so there's no network work to
  defer or sequence around the hero image.)
- Show up to `N` upcoming/in-progress session cards, where `N` is a soft
  authoring guideline (default 9) — the component must render gracefully
  with fewer cards (see §2.3, no system auto-hide).
- Rotate cards out of `live` state based on the session's **actual** end,
  not just its scheduled end — sessions can under-run (end early) or
  post-run (run long), so this requires consulting a live signal, not
  purely a baked-in `endTimeUtc` (see §4).
- Route card clicks correctly by session state: `upcoming` opens the
  Session Guide modal to that session's detail; `live` navigates to the
  resolved Watch URL — different destinations, not variants of one modal
  (see §5).
- Favorite/Add-to-Schedule icons must match Session Guide's persisted state
  and interaction contract exactly, including the logged-out sign-in prompt
  flow (see §2.4 / §9).

## Non-goals

- Reusing the `agenda` block or its data — this page does not use the agenda
  block, so there is no shared in-memory session payload to reuse.
- A live ESP/ESL fetch to populate the card list at decoration time —
  evaluated and rejected in favor of author-configured, baked-in content
  (see §1). The only thing this block still consumes live is the shared
  live-poll signal used to confirm actual session end (§4).
- Full-fragment content swapping owned by this block — `chrono-box` already
  owns fragment swapping for the marquee; this block's cards live *inside*
  the fragment `chrono-box` swaps, they don't trigger swaps of their own.
- Standalone "blade" placement elsewhere on the page — out of scope per the
  ticket; this design covers exactly one instance, in the marquee, per page.
- Auto-hiding the component when the live session pool thins — toggling
  visibility off late in the event is an authoring/ops decision, not runtime
  behavior this component implements.
- Automating the write of authored content into the fragment document (e.g.
  via the DA Admin API) — the Configurator tool only produces a JSON array
  for the author to copy; pasting it into the fragment's `metadata` block is
  a manual authoring step, same as any other metadata authoring today.

## Component Scope & Authoring Configuration

### 2.1 Single instance, marquee-scoped

Exactly one Upcoming Sessions instance is supported per page, placed within
the marquee area (see §8 for how it attaches to the preceding hero/marquee
block via `.attach-upcoming`). Standalone blade placement elsewhere on the
page is an explicit future enhancement, not part of this story.

### 2.2 Session selection — authored, not queried

Which sessions populate the row is decided entirely by the author, via the
**Upcoming Sessions Configurator** (§3) — there is no channel/tag query
against ESP/ESL at runtime. The Configurator resolves everything against
ESP once, at configuration time, and the author copies the fully-resolved
JSON array into the marquee fragment's `metadata` block.

### 2.3 Max card count and no system auto-hide

- Max card count `N` is a soft authoring guideline (default 9, ≈2-3
  streaming blocks of lookahead) enforced by nothing but the author's own
  judgment — there is no runtime cap or fetch-size parameter, since there
  is no runtime fetch.
- Show/hide of the entire component is a **manual authoring decision** — the
  system never auto-hides it based on live card count. As the schedule
  naturally thins late in the event, the author/event-ops team is
  responsible for either omitting the metadata payload for that fragment or
  authoring fewer cards. Engineering's job is only to render gracefully with
  fewer than `N` cards (including zero) — never to decide visibility itself.

### 2.4 Favorite / Add-to-Schedule interaction parity

Add to Schedule and Favorite icons must function identically to their
Session Guide counterparts:

- Same add/remove toggle behavior, reading/writing the same persisted state
  (`event-libs/v1/utils/session-store.js` — `favoriteSession()`/
  `scheduleSession()`).
- A logged-out user clicking either icon must follow the **same sign-in
  prompt flow** Session Guide uses.
- **Both icons are always active** — per §12 (design update), this
  component never renders a `live` card state (a session's card is removed
  the instant it starts), so there's no "hide Add to Schedule while live"
  case to handle here.
- This is the one piece of card interaction that is inherently per-user and
  therefore can never be baked in by the Configurator — it's always hydrated
  client-side regardless of how the base card list was populated.

## Card Content & States

Each card displays:

- Session title
- Category/topic (channel badge)
- Time range
- Speaker avatar(s)
- Add to Schedule icon (always active — see §2.4/§12)
- Favorite icon

All of the above **except the favorite/schedule toggle state** are baked in
by the Configurator at authoring time (title, category, time range, speaker
avatar, session ID, canonical URLs). Favorite/schedule toggle state is
always computed/read client-side, never authored.

**Design update (§12):** this component only ever renders one card state —
"upcoming" (clickable, opens the Session Guide detail). There is no `live`
or `on-demand` card state — the instant a session starts (confirmed via
scheduled start time for non-MR sessions, or via Mobile Rider poll
confirmation for MR sessions), its card is removed from the row entirely
rather than switching to a different visual/interactive state.

| Session state | Click target | Add to Schedule | Favorite |
|---|---|---|---|
| `upcoming` (the only rendered state) | Session Guide modal, opened directly to this session's detail view (not the default Session Guide view) | active | active |
| removed (session has started) | n/a — card is gone from the row (§12) | n/a | n/a |

## Architecture

### 1. Content population — authored metadata, zero decoration-time fetch

This is the central architectural decision, and it removes the entire
class of problems (LCP contention, buffer management, rotation-worker
timing) that a live-fetch design would have created:

- An **Upcoming Sessions Configurator** tool (§3) lets an author search,
  pick, and order sessions, resolving each against ESP once at
  configuration time (title, category, start/end times, speaker avatar,
  session ID, canonical session-page URL). The author copies the resulting
  JSON array.
- While authoring the marquee fragment (the same DA document
  `chrono-box`/Schedule Maker points to for that time window), the author
  pastes this JSON array as the value of a `metadata` block row — e.g. key
  `upcoming-sessions` — in that same fragment document.
- At decoration, `init(el)` calls `getMetadata('upcoming-sessions')`,
  `JSON.parse`s it in a `try/catch`, and renders cards directly from the
  array. **This mirrors `chrono-box.js`'s own `getSchedule()` pattern**
  (`getMetadata('schedules')` + parse + `window.lana?.log` on failure) —
  reusing an authoring mechanism this codebase already trusts, rather than
  inventing a new one.
- **LCP consequence:** because there is no fetch, there is nothing for this
  block to defer or sequence relative to the hero image's load. Decoration
  is a synchronous metadata read + JSON parse + small DOM render — the old
  concern about contending with hero LCP (deferred fetch timing,
  `requestIdleCallback` caveats, skeleton placeholders to reserve layout)
  no longer applies. Render whenever `chrono-box`/Milo naturally reaches
  this block in the decoration order.
- If `getMetadata('upcoming-sessions')` is absent or fails to parse, render
  nothing (§2.3 — this is a valid, author-controlled state, not an error to
  recover from with a fetch fallback).

### 2. Upcoming Sessions Configurator (authoring tool)

- A tool alongside Schedule Maker (exact integration — a section added onto
  Schedule Maker's existing per-schedule-entry UI, vs. a fully standalone
  tool — is still open, see Open Questions) that:
  - Searches/lists the event's sessions (pulled from ESP within the tool
    itself — this is authoring-time tooling, not the live page, so a
    fetch here is unproblematic).
  - Lets the author pick and reorder a set of sessions.
  - Resolves each selected session's full card content (title, category,
    time range, speaker avatar, session ID, canonical URL) against ESP,
    once, at configuration time.
  - Shows a live preview of resolved card content before the author copies
    the array, so nothing is authored blind.
  - Produces a **Copy** action that copies the resolved JSON array to the
    clipboard — nothing more. No DA write access, no direct-write
    automation, no concurrency/idempotency concerns, since the author
    performs the actual paste manually as part of normal fragment
    authoring.
- **Session state is never baked into the array** — only the static fields
  above. State is always computed client-side from `startTimeUtc`/
  `endTimeUtc` (for the `upcoming` boundary) and the shared live-poll signal
  (for confirming `live`→`on-demand`, see §4).

### 3. Authoring — C2 style guidelines

This block should be authored following the **C2 design system** conventions
(per `build-content-from-figma` skill), not the general event-libs/EDS
defaults:

- Authored DOM must include a `metadata` section with `foundation: c2` in
  the same DA document — required for the EDS block loader to resolve the
  block from `libs/c2/blocks/` and load its JS/CSS.
- Block markup follows the standard C2 authoring table: a header row
  `<p>upcoming-sessions (variant1, variant2)</p>` (variants comma-separated,
  parentheses omitted if none), with `section-metadata` in the same section
  (`style: container, wide`), no `---` separator between them. The block's
  own table needs no per-card rows — all card data comes from the
  `upcoming-sessions` metadata key (§1), not from table rows.
- **CSS breakpoints use the modern C2 syntax** `@media (width >= Npx)`, not
  the legacy event-libs `@media screen and (min-width: Npx)` convention used
  elsewhere in this repo (e.g. `chrono-box.css`). Confirm during
  implementation review since it's easy to default to the surrounding
  repo's older pattern.
- CSS selectors still scoped under the block root class
  (`.upcoming-sessions`), consistent with both C2 and general event-libs
  conventions.

### 4. State derivation and rotation — scheduled start, polled end

Session timing state is derived via the existing
`event-libs/v1/utils/session-state.js` → `deriveSessionState(session,
liveStreamActiveIds, nowMs)`, returning `'live' | 'upcoming' | 'on-demand'`.
But the two transitions this block cares about are not symmetric, and must
be handled differently:

- **`upcoming` → `live`:** driven by the card's baked-in `startTimeUtc`
  vs. `Date.now()` — a simple per-card timer (`setTimeout` scheduled at
  `startTimeUtc`), no `chrono-box`-style Worker needed (there's no fetch to
  protect from background-tab throttling glitches this time — a missed or
  delayed timer just means the "Live Now" badge/click-routing flips a beat
  late, not a broken fetch). Still worth a `visibilitychange` recompute
  safeguard (see below) so a long-backgrounded tab corrects itself
  immediately on refocus rather than waiting for the next natural timer
  tick.
- **`live` → `on-demand` (card rotates out):** **cannot** be driven by the
  card's baked-in `endTimeUtc` alone. Sessions under-run (end early) or
  post-run (run long), so a scheduled-endTime timer would rotate cards out
  too early or leave stale "Live Now" cards on screen too long. This
  transition must be confirmed by the **shared live-poll signal** — the
  same `liveStreamActiveIds` mechanism `deriveSessionState` already
  consults for MR-streamed sessions. This block does not own or start a new
  poll; it **subscribes** to whatever BlockMediator-published live-poll
  state an existing block (e.g. `sessions-guide`) already maintains. When
  that signal indicates a currently-`live` card's session is no longer
  active, treat it as `on-demand` and rotate it out immediately —
  regardless of what the baked-in scheduled end time would have suggested.
- Detection latency for true end is bounded by however often the existing
  shared live-poll already updates — this block cannot tighten that
  further; it's an inherited constraint, not something to solve locally
  (see Open Questions on confirming the shared poll's key/interval).
- **Correctness/drift safeguard:** on `visibilitychange` (tab refocus),
  recompute both the `upcoming`→`live` timer state and re-check the current
  live-poll snapshot directly, rather than trusting a timer that may have
  been throttled while backgrounded.
- Since the card set is a small, static, already-rendered array (not a
  fetched/buffered window), "rotation" here is a lightweight DOM
  show/hide/reorder among existing cards — there is no buffer to refill,
  no sliding window, no network dependency at the moment of the swap.

### 5. Card click routing (implemented — simplified by §12's design update)

**Design update:** this section originally described state-dependent
routing (`upcoming` → Session Guide modal, `live` → Watch URL, `on-demand`
→ unreachable), recomputed fresh at click time to guard against a session
crossing a state boundary between paint and click. That's no longer
necessary: per §12, this component never renders a `live` or `on-demand`
card at all — a session's card is removed the instant it starts (via
scheduled start time for non-MR sessions, or Mobile Rider poll confirmation
for MR sessions), rather than switching to a different clickable state.

The only state a rendered card can ever be in is "upcoming", so every card
click has exactly one possible destination: it opens the **Session Guide
modal**, directly to that session's detail view (not the default Session
Guide view) — implemented as `resolveClickAction()` in `upcoming-sessions.js`,
kept as its own function (rather than inlined) purely for parity/testability
with sessions-guide's own click-decision pattern, not because there's a
decision to make anymore.

### 6. Attaching to a preceding block via `.attach-upcoming`

The rail is not always a standalone block in normal document flow — per the
Figma designs (`docs/upcoming-sessions/event-marquee-desktop.json`,
`docs/upcoming-sessions/with-event-marquee-mobile.json`), the "Upcoming"
rail is an overlay near the bottom edge of the preceding hero/marquee block.
This is reinforced, not just assumed, by the authoring model in §1: since
both the hero content and the `upcoming-sessions` block live in the *same*
fragment document (authored and swapped together by `chrono-box`), they are
naturally always co-located as siblings in the same section.

- **On decoration, check the immediately preceding sibling element** within
  the same authored section for the class `attach-upcoming`.
- **If found:** don't render the rail in normal flow. Instead, position it
  as an overlay anchored to the bottom of that preceding block, matching
  the desktop/mobile Figma reference layouts — full-width card track pinned
  near the bottom edge.
- **If not found:** render the rail as a normal standalone block in document
  flow (default behavior).
- This check only looks at the block's own preceding sibling in the
  section — it should not search further up the DOM or across sections.
- Desktop and mobile Figma refs differ in card sizing/visible count within
  the overlay — the overlay positioning logic should read from CSS
  breakpoints (per the C2 convention in §3), not duplicate layout logic in
  JS.

### 7. Shared carousel mechanics

Two sibling components on the same Homepage — `Featured Sessions` and
`Speakers` — need near-identical horizontal-scroll/arrow/keyboard mechanics,
differing only in edge-clip behavior:

- **`Upcoming Sessions`** and **`Featured Sessions`** both clip on the
  **end (right) only** — the first card sits flush at the left edge, no
  partial card peeks in from the left.
- **`Speakers`** clips on **both edges** — a partial card is visible peeking
  in from the left as well as cut off on the right.

Extract a shared carousel utility (scroll mechanics, arrow-button wiring,
keyboard nav / roving tabindex) — e.g. `event-libs/v1/utils/carousel.js` —
consumed by all three blocks, with a CSS modifier class selecting the
variant (`clip-end` default, `clip-both` for Speakers). Card content and
per-card behavior (click routing, action icons, state derivation) remain
entirely block-specific — the shared piece is narrowly scoped to scroll
mechanics and the edge-clip visual, not a generic "carousel block" that
tries to also know about session state or speaker data.

`Featured Sessions` and `Featured Speakers` are both fully manually
authored (per their own tickets) — `Featured Sessions` needs the same
`upcoming`/`live`/`on-demand` click-routing rules as this block (plus an
`on-demand` → individual Session Page destination this block never needs,
since it never shows on-demand cards), while `Featured Speakers` has no
data connection and no click behavior at all. Whether `Featured Sessions`
reuses the same Configurator-authored-metadata pattern as this block is an
implementation decision for whoever builds that ticket, not a hard
dependency of this design.

### 8. Accessibility considerations

The rail changes content on state transitions, which is exactly the pattern
that trips up screen readers and keyboard/motion-sensitive users if not
handled deliberately.

- **Don't silently push live-region announcements on every state change.**
  An `aria-live="polite"` region firing every time a card's state flips
  (potentially many times over a multi-day event) is noisy and
  disorienting. Prefer an `aria-live="polite"` region scoped to a wrapper
  around the rail that announces only when the *visible set changes as a
  result of user interaction* (e.g. manual carousel arrow nav), not on
  every automatic state transition.
- **Respect `prefers-reduced-motion`.** The rotate-out transition must have
  a reduced/instant fallback — check `matchMedia('(prefers-reduced-motion:
  reduce)')` before running the animated transition, and swap the DOM
  instantly otherwise.
- **Don't move focus involuntarily.** If a card the user has focused (via
  keyboard) is the one being rotated out, do not silently destroy focus —
  either keep focus in a sane place (e.g. the carousel container or the
  next card) or defer that specific swap until focus moves away, rather
  than dropping focus to `<body>`.
- **Carousel nav must remain keyboard-operable** (arrow buttons visible in
  the design) — standard roving-tabindex or native button semantics, with
  visible focus states, independent of the state-transition logic.
- **Each card needs an accessible name distinguishing it from its
  neighbors** — the session title alone may repeat across cards in the same
  track, so include the time range and/or track name in the card's
  accessible name (e.g. via `aria-label` or visually-hidden text).
- **Favorite icon buttons** (heart, checkmark icons on each card) need
  real accessible labels (`aria-label="Favorite session: <title>"`) and
  `aria-pressed`/state, not icon-only buttons with no text alternative.
- **Add-to-calendar action on the session page** (§9) should be a real
  link/button with a clear accessible name (e.g. "Add to calendar"), not an
  icon-only control.

### 9. Individual session pages — calendar action

Each `upcoming`-state card links to an individual session page. Scope any
"add to calendar" affordance (`.ics` generation from the session's known
start/end time) to the **session page itself**, not the marquee card —
keeps the hero rail lightweight and avoids adding interaction surface to a
component that's already changing state on its own.

### 10. Scroll / carousel behavior

- **Desktop:** horizontally scrollable row with a scroll indicator (arrow
  buttons visible in the design mock — final scroll-button styling pending
  design). Keyboard operability for this nav is covered in §8.
- **Mobile:** cards are swipeable (native touch/scroll, not a custom swipe
  gesture library) — consistent with the mobile Figma reference
  (`docs/upcoming-sessions/with-event-marquee-mobile.json`).
- Both behaviors coexist with the state-transition logic in §4 — a card
  rotating out should not reset horizontal scroll position or interrupt an
  in-progress swipe/scroll gesture.

### 11. ICS calendar export format

The "add to calendar" action on the session page (§9) generates a standard
[RFC 5545](https://www.rfc-editor.org/rfc/rfc5545) `.ics` file client-side
from data already present on the page — no additional ESP/ESL call needed.

**Minimal VEVENT structure:**

```
BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Adobe//Event Sessions//EN
CALSCALE:GREGORIAN
METHOD:PUBLISH
BEGIN:VEVENT
UID:<sessionId>@events.adobe.com
DTSTAMP:<generation-time, UTC, YYYYMMDDTHHMMSSZ>
DTSTART:<session start, UTC>
DTEND:<session end, UTC>
SUMMARY:<session title>
DESCRIPTION:<session description, escaped>
LOCATION:<venue/room name, if available>
URL:<canonical session page URL>
END:VEVENT
END:VCALENDAR
```

**Field mapping and rules:**

- **`UID`** — must be globally unique and **stable across re-exports** (same
  session → same UID every time) so that re-adding to a calendar updates the
  existing entry rather than duplicating it. Use the session's ESP/ESL id,
  not a randomly generated one.
- **`DTSTART`/`DTEND`** — always emit in UTC (`...Z` suffix), converted from
  the session's timezone-aware start/end already used for on-page display
  (same timezone-conversion logic referenced in
  `docs/agenda-timezone-support.md` — reuse it rather than re-deriving).
- **`DTSTAMP`** — the moment the `.ics` file is generated (`Date.now()`), not
  the session start time — this is a required RFC 5545 field distinct from
  `DTSTART`.
- **`SUMMARY`/`DESCRIPTION`** — escape commas, semicolons, and newlines per
  RFC 5545 (`\,`, `\;`, `\n`) — do not pass raw authored text through
  unescaped, since session descriptions may contain characters that break
  calendar app parsing.
- **`LOCATION`** — omit the field entirely if no venue/room data exists for
  the session rather than emitting an empty `LOCATION:` line.
- **Line folding** — RFC 5545 requires folding lines longer than 75 octets
  with `\r\n ` continuation. Long `DESCRIPTION`/`SUMMARY` values must be
  folded, or some calendar clients (notably Outlook) will misparse the file.

**Delivery mechanism:**

- Generate the `.ics` content as a string client-side, wrap in a `Blob`
  (`type: 'text/calendar;charset=utf-8'`), and trigger download via a
  temporary `<a>` with `URL.createObjectURL` — no server round-trip.
- Do **not** use a `webcal://` or `data:` URI as the primary path — Blob +
  object URL has the most consistent cross-browser download behavior;
  `webcal://` only makes sense if a persistent, updatable calendar feed is a
  future goal (out of scope here — this is a one-time export per session,
  not a subscribed feed).
- File name: `<session-slug-or-id>.ics`, not a generic `event.ics`, so
  multiple exports from the same event don't collide/overwrite in the
  browser's downloads folder.

### 12. Mobile Rider live-status polling — no live state, remove on start (implemented)

**Design update, superseding the previous version of this section
entirely:** this component does not support showing a "live" state at all.
As soon as a session starts, its card is removed from the row — there is no
`live` badge, no watch/broadcast click-routing, no "Add to Schedule hidden
while live" special case. The only two states a session ever occupies here
are "upcoming" (rendered, clickable, opens the Session Guide detail) and
"gone" (removed). §5's live-state click-routing table and §2.4's "Add to
Schedule hidden/disabled in `live` state" note are no longer accurate —
there's no `live` card state left for either of those to apply to.

- **Only sessions with an authored `mrStreamId` are polled** against the
  real Mobile Rider endpoint (`MobileRiderController.getMediaStatus`).
  Sessions without one are non-MR / YouTube-style and are handled purely by
  their baked-in `startTimeUtc` — "blindly" time-based, no network call.
- **Non-MR sessions**: the card is removed the instant the scheduled start
  time passes. This relies solely on the authored start time — there is no
  live-status confirmation step for these, by design (nothing to poll).
- **MR sessions**: removal relies solely on the Mobile Rider poll
  confirming the session has actually started — **not** on the scheduled
  start time. A session past its scheduled start but not yet MR-confirmed
  stays on screen as a normal "upcoming" card (clickable, opens Session
  Guide) rather than being removed or shown as live.
- **Polling for a given MR session does not start until that session's own
  scheduled start time arrives** — there is nothing for MR to report
  before a session has started. A per-session `setTimeout` fires a poll
  tick at exactly that session's start time (not the next arbitrary
  interval boundary), then every **30 seconds** thereafter, for every MR
  session whose start time has passed and hasn't yet been confirmed
  started.
- **One batched request per poll tick**, not one per session — all due,
  unresolved `mrStreamId`s are deduplicated into a single
  `getMediaStatus(ids)` call.
- **The instant MR confirms a session has started, its card is removed
  immediately (no live state ever rendered in between), and that
  session's `mrStreamId` is permanently excluded from all future polling**
  — there's nothing further to check for it once it's gone. Once every MR
  session in the row has been resolved this way, the poll interval itself
  is cleared automatically (nothing left to check).
- **Removed sessions cannot be resurrected.** Favorite/Add to
  Schedule/pending-action changes elsewhere on the page still trigger a
  full re-render of the remaining cards, but the removed session's data is
  dropped from the block's own working list at the moment it's removed
  (not just removed from the DOM) — so a later re-render can't
  accidentally re-add a card for a session that's already started.
- Scroll position is still explicitly preserved across every re-render
  (`track.scrollLeft` saved/restored), so removals/favorite/schedule
  updates never yank a mid-browse user back to the start of the carousel.

#### Test plan — start-time/MR-based removal

Manual/exploratory (no automated tests yet — standing "no tests until dev
complete" instruction still applies to this block):

1. **No polling before start.** Author an MR session (`mrStreamId` set)
   with a `startTimeUtc` several minutes in the future. Confirm (via
   network panel) that no `getMediaStatus` request fires for that id until
   the scheduled start time is reached.
2. **Poll starts exactly at session start.** Confirm a `getMediaStatus`
   request fires at (not meaningfully after) the MR session's
   `startTimeUtc`, and every ~30s afterward until resolved.
3. **Batching.** With 2+ MR sessions due simultaneously, confirm exactly
   one `getMediaStatus` request per tick containing all due, unresolved
   ids — not one request per session.
4. **MR session stays visible past its scheduled start until confirmed.**
   Mock `getMediaStatus` to keep returning a due MR session as inactive
   past its scheduled start. Confirm the card is still rendered, still
   shows its normal time range, and clicking it still opens the Session
   Guide detail — it is not removed or shown as live just because
   scheduled time has passed.
5. **MR session removed the instant it's confirmed started.** Mock
   `getMediaStatus` to flip a due MR session to active. Confirm, without
   reloading the page: the card is removed immediately (no live badge
   ever appears), and no further `getMediaStatus` request is made for that
   session's `mrStreamId` afterward.
6. **Non-MR session removed purely by start time.** Author a session with
   no `mrStreamId`. Confirm it never triggers any `getMediaStatus`
   request, and its card is removed the instant its scheduled start time
   passes (check both the live `setTimeout` case and the
   `visibilitychange` recompute case — background the tab past the start
   time, then refocus and confirm the card is gone).
7. **All MR sessions resolved stops the interval.** With every MR session
   in the row confirmed started, confirm no further `getMediaStatus`
   requests fire at all (the poll interval is cleared automatically).
8. **Removed sessions don't come back.** After a session is removed
   (either path), trigger an unrelated re-render (favorite/schedule a
   different session). Confirm the removed session's card does not
   reappear.
9. **Scroll position preserved.** Scroll the carousel partway, then let a
   removal or an unrelated favorite/schedule update fire. Confirm scroll
   position is unchanged afterward.
10. **Multiple MR sessions, independent resolution.** Author 3+ MR
    sessions with staggered start times and independently mock each one
    active at different times. Confirm each is removed independently, at
    the correct time, without affecting unrelated cards.
11. **Cleanup.** Remove the block from the DOM (or trigger its
    `_upcomingSessionsCleanup`) while a poll interval and pending
    per-session start timers are active. Confirm no further
    `getMediaStatus` requests fire afterward.

### 13. Card surface color — token-driven, supports both light and dark (implemented)

The card's background is bound to the semantic design token
`s2a/color/background/subtle` (Figma), not a hardcoded literal color. This
token resolves differently depending on the surface it sits on:

- **Light context** (the default): `s2a/color/background/subtle` →
  `--s2a-color-gray-50` → `#f8f8f8`, with dark (`#000`/`--s2a-color-
  gray-1000`) title/badge text and `--s2a-color-gray-600` (`#717171`)
  secondary/time text.
- **Dark context** (opt-in — this is the original look this card shipped
  with, for the dark MAX marquee hero overlay per §6): `s2a/color/
  background/subtle` → `--s2a-color-gray-700` → `#505050`, with white
  (`--s2a-color-gray-25`) title/badge/time text.

**Design update:** earlier drafts of this doc (and discussion during
implementation) assumed the card would *always* render on a dark surface,
since every reference so far had been the dark hero/marquee overlay per §6.
That assumption was corrected once the design confirmed this same
token-driven card also supports a light surface. **Implemented as:** light
is the default (unscoped `.sg-live-card*` rules in `upcoming-sessions.css`);
authoring the `dark` block variant (`upcoming-sessions (dark)`, per the C2
variant convention in §3) adds a `dark` class to the block root, which
switches every color value above via `.upcoming-sessions.dark` overrides.
No JS change was needed — `decorate()`/`attachToPrecedingBlock()` don't
need to know which surface is active, since it's purely a CSS class Milo
already applies from the authored variant.

### 14. Schedule-conflict modal (implemented)

Supersedes the earlier "conflict detection is disabled" note under §2.4 —
Add to Schedule now shows the same schedule-conflict modal Session Guide
uses, with no new modal implementation needed here:

- `EVENT_CONFIG.showConflictModal` (in `upcoming-sessions.js`) is `true`.
- `scheduleWithFeedback()` → `runSessionAction()` →
  `services/sessions/session-actions.js`'s `scheduleAction()` already checks
  `findScheduleConflict()` whenever `showConflictModal` is `true` — this is
  shared, UI-agnostic logic, not something owned by this block.
- On conflict, `services/sessions/action-feedback.js`'s `runSessionAction()`
  opens the same shared, page-level
  `features/conflict-modal/conflict-modal.js` Session Guide itself uses
  (built on Milo's own modal component — focus trap, Escape-to-close, body
  scroll lock, etc. come for free). That module is already plain vanilla JS
  (`createTag`, no Preact dependency), so it works unmodified from this
  vanilla block.

**Important scoping detail:** `findScheduleConflict()` checks the incoming
session against the shared `session-store.js` `sessions` signal — the full
catalog populated by `initSessionState()`'s `loadSessions()` (a real fetch
against `rainfocus-api-url`) — **not** this block's own authored
`upcoming-session-author-data.json` payload. So two overlapping cards from
this block's own authored data will **not** conflict with each other unless
their exact ids/times also happen to exist in that separately-fetched
catalog. This is inherent to how conflict detection is scoped page-wide
(matches Session Guide's own behavior exactly — a session scheduled from
Session Guide will conflict with one scheduled from this marquee block, and
vice versa, since both write to the same `scheduled` signal) — not a gap
specific to this block.

#### Test plan — schedule-conflict modal

No automated tests yet (standing "no tests until dev complete" instruction
applies here too). Manual steps:

1. **Set up a guaranteed conflict** via the browser console, since the
   block's own authored sessions won't reliably conflict with each other
   (see the scoping note above). Pick one of the authored cards — e.g.
   `S6210` (`id: 1c2f7e9a-3b4d-4e21-9a6f-6d1f1a2b3c4d`, starts
   `1784624404633`) — and inject a fake already-scheduled session into the
   shared catalog with an overlapping time window:
   ```js
   const store = await import('/event-libs/v1/utils/session-store.js');
   store.sessions.value = [
     ...store.sessions.value,
     {
       id: 'fake-conflict-1',
       title: 'Existing Scheduled Session',
       track: 'Design',
       startTimeUtc: new Date(1784624404633).toISOString(),
       endTimeUtc: new Date(1784628904633).toISOString(),
     },
   ];
   store.scheduled.value = new Set([...store.scheduled.value, 'fake-conflict-1']);
   ```
2. **Trigger it.** Click Add to Schedule on the overlapping card (`S6210` in
   the example above). Confirm the shared conflict modal opens — title "You
   have conflicting sessions", a radio option per session (existing vs.
   incoming) with title/track/duration shown correctly, incoming
   pre-selected, and a Save button.
3. **Keep existing.** Select the existing option and Save. Confirm the
   incoming session is *not* added to `scheduled` and the card's schedule
   icon stays in its unscheduled state.
4. **Keep incoming.** Reopen the conflict (repeat step 1's seeding if
   needed) and this time select incoming, then Save. Confirm the fake
   existing session is removed from `scheduled`, the incoming session is
   added, and the card's schedule icon updates immediately (via the
   existing `scheduled.subscribe()` re-render) with no page refresh.
5. **Auth gating still applies.** Clear `localStorage.getItem('sg:dev-auth')`
   (or otherwise force `isLoggedIn`/`isRegistered` to not both be `true`) and
   confirm Add to Schedule shows the login/registration toast instead of a
   conflict modal — `assertAuthorized()` runs before the conflict check.
6. **Non-conflicting schedule still works.** Confirm scheduling a card with
   no time overlap against anything in `scheduled` succeeds immediately with
   no modal, exactly as before this change.

## Open questions for implementation

- **Configurator integration:** should the Upcoming Sessions Configurator be
  a section added onto Schedule Maker's existing per-schedule-entry UI, or a
  fully standalone tool? Affects whether it can reuse Schedule Maker's
  existing session-data access.
- **Shared live-poll signal:** what BlockMediator key (or equivalent)
  already publishes `liveStreamActiveIds` (or the underlying MR live-poll
  data) that this block should subscribe to, and at what interval does it
  update? This bounds how quickly this block can detect a session's actual
  end (§4) — confirm the existing publisher (likely inside `sessions-guide`
  or `sessions-hub`) before implementation.
- **`upcoming` → `live` reliability:** is scheduled `startTimeUtc` reliable
  enough on its own for this transition, or can sessions also start late in
  a way that needs the same live-poll confirmation §4 requires for the end
  transition?
- Does the channel/tag filter concept from earlier drafts still matter now
  that selection happens via the Configurator's own search/pick UI, or is
  it fully superseded by "author searches and picks directly"?
- **Analytics attribution** — should favorite/schedule/watch actions
  originating from this component be distinguished from the same actions
  taken within Session Guide, or tracked as the same event regardless of
  source? Needs stakeholder input on reporting needs (per ticket).
- Payload size sanity check: confirm a JSON array of ~9 resolved sessions
  (compact fields only) comfortably fits within whatever practical size
  limits apply to a `metadata` block value in DA.

## Summary of key decisions

| Decision | Choice | Why |
|---|---|---|
| Card population mechanism | Author-configured JSON array pasted into a `metadata` block, read via `getMetadata()` | Mirrors `chrono-box`'s existing `schedule` metadata pattern; eliminates all live-fetch/LCP/buffer concerns |
| Card limit | Soft authoring guideline `N` (default 9), not runtime-enforced | No runtime fetch exists to size a request against; it's just how many the author put in the array |
| LCP handling | No special handling needed | Decoration has no fetch — nothing to defer or sequence against hero LCP |
| `upcoming`→`live` transition | Local per-card timer keyed to baked-in `startTimeUtc` | Simple, no fetch to protect, background-tab safeguard via `visibilitychange` recompute |
| `upcoming`→removed transition (§12) | Non-MR: removed at scheduled start time. MR: removed only on Mobile Rider poll confirmation, never by scheduled time | Design update — this component never shows a `live` state; a session's card disappears the instant it starts instead of switching state |
| MR poll ownership | This block's own direct poll (`MobileRiderController`), not the shared/mocked `session-store.js` signal | The shared signal is permanently mocked/empty; a direct poll is the only way to get real MR confirmation today |
| Click destination | Always the Session Guide modal (session detail) — the only card state that ever renders | Per §12's design update: there's no `live`/`on-demand` state left to route differently for |
| Component scope | Single instance per page, marquee-only | Standalone blade placement is an explicit future enhancement, out of scope now |
| Show/hide behavior | Manual authoring/ops toggle only; component renders gracefully with fewer than `N` cards, never auto-hides | Per ticket: not intended for a thin session pool, but the system must not decide that |
| Favorite/Schedule contract | Match Session Guide's persisted state and sign-in prompt flow exactly; `live` state hides/disables Add to Schedule, keeps Favorite active | Per ticket: consistent behavior with Session Guide; a live session can't be scheduled |
| Configurator write mechanism | Copy-to-clipboard JSON only, no direct DA write | Avoids concurrency/idempotency/permission risk of automating writes into hand-authored fragments |
| Shared carousel mechanics | One utility for scroll/arrow/keyboard, CSS variant for `clip-end` (Upcoming Sessions, Featured Sessions) vs `clip-both` (Speakers) | Two of three carousels need identical mechanics; keep the shared piece narrowly scoped to scroll behavior only |
| Calendar/chrono action | Session page only | Keeps hero rail lightweight |
| Attach to preceding block | Check immediate preceding sibling for `.attach-upcoming`; overlay if present, normal flow otherwise | Matches Figma desktop/mobile designs; also structurally guaranteed since both blocks are authored in the same fragment |
| Card surface (light/dark) | Light is the default (`s2a/color/background/subtle` → `#f8f8f8`); authoring the `dark` block variant switches to `#505050` via a `.dark` CSS class — no JS involvement | Design defines the card token-driven for both surfaces (§13); `dark` is opt-in since it's the less common placement (marquee hero overlay) |
| Schedule-conflict modal | `EVENT_CONFIG.showConflictModal: true` — reuses Session Guide's own shared `session-actions.js`/`action-feedback.js`/`conflict-modal.js` as-is, no new modal built (§14) | That layer was already UI-agnostic and vanilla-JS compatible; conflicts are checked against the shared page-wide `sessions`/`scheduled` catalog, not this block's own authored subset |
