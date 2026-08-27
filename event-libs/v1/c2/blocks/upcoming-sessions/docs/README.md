# upcoming-sessions

Horizontally-scrolling carousel of upcoming session cards. Never hand-authored — an
author builds the session list in the Tier 1 Event Configurator's Homepage editor, copies
its "Copy Link" output, and pastes that link into the page's doc body. `decorate.js`'s
`tec-homepage` auto-block builder decodes the link's hash payload and replaces it with a
`.upcoming-sessions` div carrying the decoded `{ heading, entries }` config as a
`data-upcoming-sessions-config` attribute, which this block's `init()` reads directly —
no `section-metadata` involved.

This block never displays a "live" state. The instant a session starts, its card is
removed entirely rather than switching to a live badge/routing — every visible card is
always in the "upcoming" state, so a click can only ever mean "open the Session Guide
detail view" (`resolveClickAction`).

## Time display

`formatTimeRange()` always renders in the *viewer's* local timezone, not the authored
`sessionTime.timezone` — `startTimeMillis`/`endTimeMillis` are real UTC instants, so
`timeZone` is intentionally omitted from the `Intl`/`toLocaleTimeString` options, letting
it default to the browser's own zone. The end time also carries `timeZoneName: 'short'`
so the displayed range is self-labeling (e.g. `9:00 AM - 10:00 AM PDT`) regardless of
which timezone the viewer or the session happens to be in. `sessionTime.timezone` itself
is still authored/present on the session shape but is no longer read by this function —
it describes what zone the millis were originally authored against, not how they should
render.

## Card removal / state timers

- **Non-MR (e.g. YouTube) sessions**: rely purely on the authored scheduled start time.
  `scheduleStateTimers()` sets a `setTimeout` per session for `startTime - now()`; once
  it fires (or is already past — e.g. a long-backgrounded tab recomputing on
  `visibilitychange`), the card is dropped immediately.
- **MR (Mobile Rider) sessions**: excluded from the time-based timers above. Their
  removal is owned by `startMobileRiderPolling()`, gated on each session's own authored
  `sessionTime.startTimeMillis` — MR's raw `active`/`inactive` flags are **not**, by
  themselves, trustworthy "has this session started/ended" signals:
  - `active` can be true for a session well before it's actually live — some MR setups
    flip every stream for the day to `active` up front (account/venue-level
    provisioning), only flipping a given id to `inactive` once its own segment ends. On
    its own, `active` would falsely read as "started" for a session hours away.
  - `inactive` can equally mean "hasn't started yet" (nothing to report) or "already
    ended" (including ending early/underrunning its own scheduled window) — the flag
    alone can't distinguish the two.

  The fix: **once a session's own `startTimeMillis` has passed, both `active` and
  `inactive` are trusted outright** — either one means "no longer upcoming" (it's either
  live now, or it already aired/underran). Before that instant, only `active` is ever
  meaningful, and even then it's ignored, since a stream reporting active ahead of its own
  schedule is exactly the day-provisioning false positive above. This mirrors
  `deriveSessionState()`'s (`utils/session-state.js`) own MR handling, used by
  `event-card`/Featured Sessions — same signal, same trust model, just a binary
  upcoming/not-upcoming outcome here instead of upcoming/live/on-demand. (A session with
  no authored start time at all falls back to trusting `active` outright, since there's
  nothing to gate it against.)

  Every `mrStreamId` is registered with the shared poller (see below) immediately at
  `decorate()` time, regardless of how far off its own start time is — there is no
  per-session delayed registration. The first time a poll resolves a session via the rule
  above, that id is unregistered and `onStarted(doneIds)` fires, dropping the card — this
  block never cares about re-entering a resolved session, so once resolved, that id is
  gone from every future poll for good.

  **There is no reliable "session started" signal from MR at all** — only a `streamend`
  player event exists (attached once a player is already embedded, e.g. in the
  `mobile-rider` block), and the poll's `active` flag is provisioning-level, not
  per-session. The `startTimeMillis` gate above is the only defense against a premature
  drop; there is currently no way to independently confirm a session is actually live
  beyond trusting the authored schedule plus MR's (start-time-gated) status.
- `dropSession()` removes a session from both the DOM and the in-memory `sessions` list
  together, so a later full re-render (favorited/scheduled/pending state changes)
  can't resurrect a card that already started.

MR polling itself goes through the shared registry at
`event-libs/v1/services/sessions/poller.js`
(`registerStreamIds`/`unregisterStreamIds`/`subscribe`), not a poller local to this
block — if `event-card`'s Featured Sessions cards (or `sessions-guide`, via that same
module's `startPolling`/`stopPolling` adapter) are also on the page tracking
overlapping `mrStreamId`s, all of them get batched into the same underlying
`fetchLiveStatus()` call instead of independent loops. `fetchLiveStatus(ids, env)`
(`services/sessions/mobile-rider.js`) is env-aware — prod vs dev/stage host, via
`session-store.js`'s `getApiConfig().mrEnv` — so every surface hits the correct
environment consistently. `session-store.js`'s own `liveStreamActiveIds` signal is
still irrelevant here — this block has no live state to feed it, and maintains its
own `liveStreamActiveIds` locally via the shared registry's `subscribe()`.

## Removal animation (FLIP)

`slideIntoPlace()` uses the FLIP technique (First-Last-Invert-Play): by the time it
runs (right after `card.remove()`), the remaining cards have already reflowed into
their post-removal positions. Each mover is jumped back to its pre-removal position
with transitions disabled, then released on the next frame with a transition enabled —
it animates smoothly from old to new position instead of snapping, reading as "later
cards slide left to fill the gap." A forced layout read
(`movers[0]?.getBoundingClientRect()`) between the jump and the release is required so
the browser can't coalesce both style writes into one paint and skip the visible slide.

## Re-render / scroll preservation

Live/favorite/schedule updates rebuild every card from scratch (`renderTrack` — state is
derived fresh per render, not diffed), but the track's `scrollLeft` is captured and
restored across that rebuild so a background update (e.g. a session going live) doesn't
yank a mid-browse user back to the start of the carousel.

## `?serverTime=<epoch-ms>` override

Lets QA simulate "now" as any instant (e.g. right before a session starts, or mid-live)
without waiting for real time to pass. Uses the shared `getNowMs()` override from
`utils/session-state.js` — read once at page load as an origin (not a frozen value), so
time still advances in real time from that point, and `setTimeout`-based timers and the
MR poll keep firing correctly relative to it. Absent/invalid `serverTime` falls back to
the real `Date.now()`. The same override drives `utils/session-routing.js` (used by
`event-card`), `sessions-guide`, and the rest of the Timing Framework, so one
`serverTime` value simulates "now" consistently across every time-aware block on the
page.

## Re-decoration cleanup

`decorate()` mirrors sessions-hub's own defensive re-init cleanup: there's no
framework-level teardown hook for this block, so if `decorate()` ever runs again on the
same element, it tears down the previous instance's timers/polling/subscriptions/
listener (`el._upcomingSessionsCleanup`) before building new ones.

## Attach-to-preceding-block

Per §8 of the design doc, this block can overlay on the immediately preceding block in
the same section, but only if that block opts in via an `attach-upcoming` class
(`attachToPrecedingBlock`).

## CSS notes (`upcoming-sessions.css`)

- Design tokens: `c2/styles/tokens.css` now loads page-wide via `c2-global.css`
  whenever `foundation: c2` is present (see `scripts.js`'s `loadStyles`), and for
  font-family specifically its full stacks intentionally override the bare names
  Milo's own `c2/styles/styles.css` defines. Every `var()` here still carries a
  literal fallback matching the Figma dev-mode export regardless, as defense against
  any stylesheet load failure. Values with no exact matching token (e.g. `#8a8a8a`,
  `#f2f2f2`, `blur(4.6875px)`) are left as plain literals rather than forcing a
  mismatched token.
- The `.sg-card`/`.sg-icon-btn`/`.sg-category-badge` families are copied from
  `sessions-guide.css` (see `SessionCard.js`) so cards visually match Session Guide's
  real session card. Copied on purpose, not `@import`'d, so this block has no runtime
  dependency on `sessions-guide.css` being loaded (per the design doc: keep decoupled).
  Because `sessions-guide.css` defines its own same-specificity rules for these class
  names, and both stylesheets can legitimately load on the same page, every selector
  here is scoped under `.upcoming-sessions` to win deterministically rather than racing
  on `<link>` load order.
- Two deliberate divergences from sessions-guide's own `.sg-card`:
  1. **Sizing** — sessions-guide's card grows on hover via literal width/min-height
     because it sits in a fixed grid/time-row. This card sits in a horizontally
     scrolling peeking carousel, where growing the box on hover would reflow sibling
     cards (width) or the section height (height). So width/height stay fixed at
     resting size (255×152px mobile/tablet, 375×108px desktop — matching Figma's dev-mode
     export; note 375px rather than the "Small session row" frame's own 431px card,
     since 431px doesn't actually fit 3 cards + gaps in that frame's stated 1440px
     width — flagged to design), and the "grows on hover" cue comes from
     `transform: scale()` instead.
  2. **Action buttons** — sessions-guide reveals the action-icon column only on
     hover/`.is-scheduled`/`.is-favorited`, which leaves buttons unreachable on
     touch/keyboard otherwise. This card keeps them always visible at every breakpoint.
- The dark surface variant is authored as `dark-card` (not `dark`) deliberately —
  `dark` is a reserved global Milo class that paints a solid dark background site-wide,
  which would collide with this block's own local "dark card surface" meaning.
- Desktop (`@media (min-width: 1280px)`) uses a fixed `margin-top` on `.sg-card__footer`
  rather than `margin-top: auto` (which sessions-guide uses, since its card is
  min-height/grows to fit content) — this card is fixed-height, so `auto` would push the
  footer to the box's bottom edge whenever the title doesn't use its full 2-line
  allowance.
- `.sg-card__time`'s `margin-left: auto` at desktop is unconditional: `.sg-card__footer`'s
  `space-between` only pins time to the right when its sibling badge actually renders;
  when category doesn't resolve to a known badge, time becomes the row's only
  participating flex child and `space-between` would otherwise collapse it to the start.
