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
so the displayed range is self-labeling (e.g. `9:00am - 10:00am PDT`) regardless of
which timezone the viewer or the session happens to be in. `sessionTime.timezone` itself
is still authored/present on the session shape but is no longer read by this function —
it describes what zone the millis were originally authored against, not how they should
render. `Intl`/`toLocaleTimeString` always renders the meridiem as uppercase `AM`/`PM`;
`formatTimeRange()` lowercases it afterward (leaving the `timeZoneName` abbreviation,
e.g. `PDT`/`PST`, untouched).

## Card removal / state timers

- **All sessions, including MR (Mobile Rider)**: rely on the authored scheduled start
  time. Already-started sessions are filtered before rendering.
- `scheduleStateTimers()` maintains one active `setTimeout` per timed session, capped
  at `2_147_483_647` milliseconds (about 24.9 days) to avoid browser timer overflow.
  Each callback recalculates `startTimeMillis - getNowMs()` and either schedules the
  remaining wait, capped again, or drops the card when its start time has passed.
  Sessions within the limit use their actual remaining wait, not a fixed 24.9 days.
- Returning to a visible tab clears existing timers and rechecks session times before
  rendering. Active timer handles are tracked in a `Set`, including replacement timers,
  so re-decoration cleanup can cancel every outstanding wait.
- `dropSession()` removes a session from both the DOM and the in-memory `sessions` list
  together, so a later full re-render (favorited/scheduled/pending state changes)
  can't resurrect a card that already started.

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

Favorite/schedule/pending updates patch each existing card in place (`syncCardState` —
toggles `is-scheduled`/`is-favorited`/`is-pending` and the buttons' icon, label,
`aria-pressed`, `daa-ll`, and `disabled`) instead of rebuilding the track. Rebuilding
dropped the hovered/focused card's `:hover`/`:focus-within`, so it would snap back to its
resting width and then re-expand once the browser re-evaluated hover. The click handlers
read the current state at click time, so a patched card never acts on stale state.

A full rebuild (`renderTrack`) only happens on initial render and when the tab becomes
visible again; it captures and restores the track's `scrollLeft` so it doesn't yank a
mid-browse user back to the start of the carousel.

## `?serverTime=<epoch-ms>` override

Lets QA simulate "now" as any instant (e.g. right before a session starts, or mid-live)
without waiting for real time to pass. Uses the shared `getNowMs()` override from
`utils/session-state.js` — read once at page load as an origin (not a frozen value), so
time still advances in real time from that point, and the capped `setTimeout`-based
timers keep firing correctly relative to it. Absent/invalid `serverTime` falls back to
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

The attached carousel extends to the right edge of its full-width marquee wrapper
at every breakpoint, including viewports wider than 2300px. At 1920px and above,
its left padding is `max(220px, (100vw - 1920px) / 2)`, preserving alignment with
the marquee's capped foreground without capping the carousel itself.

## CSS notes (`upcoming-sessions.css`)

- Container sections with a direct `.upcoming-sessions` child remove their right
  padding so the carousel can reach the section edge. Left and authored vertical
  padding remain unchanged; other container sections are unaffected.
- Design tokens come from `milo/libs/c2/styles/styles.css` (the C2 foundation
  stylesheet, guaranteed loaded whenever this block's `foundation: c2` metadata is
  present) rather than `c2/styles/tokens.css`, which isn't guaranteed present on a
  page that doesn't load a block that imports it. Every `var()` has a literal fallback
  matching the Figma dev-mode export. Values with no exact matching token (e.g.
  `#8a8a8a`, `#f2f2f2`, `blur(4.6875px)`) are left as plain literals rather than forcing
  a mismatched token.
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
  2. **Action buttons** — on mobile/tablet (<1280px) the action-icon column stays
     always visible, since sessions-guide's hover-only reveal would leave the buttons
     unreachable on touch there. At desktop (`@media (min-width: 1280px)`) this now
     matches sessions-guide exactly: the action-icon column (and the wider "hover"
     card width) is revealed via `:is(:hover, :focus-within)` or `.is-scheduled`/
     `.is-favorited`, hidden (`width: 0; opacity: 0; pointer-events: none;`)
     otherwise — see MWPW-207701.
- Desktop card geometry (`@media (min-width: 1280px)`): the card keeps a uniform 24px
  inset on every side in every state. The card has `gap: 0`; `.sg-card__body` flexes
  (`flex: 1 1 0`) and the 24px between body and buttons is the actions column's own
  `padding-left`, so the column goes from `0` to `56px` (24px + 32px buttons) while the
  card goes from 375px to 431px — the body width (and title wrapping) never changes.
  The actions rules repeat `.upcoming-sessions-card` to outrank sessions-guide.css's
  unscoped `.sg-card.is-scheduled:not(.sg-card--on-demand) .sg-card__actions`, which ties
  on specificity and loads later on pages with the Session Guide widget.
- Desktop track height: `.upcoming-sessions-track` reserves the expanded card height
  (`--upcoming-sessions-card-height-expanded`, 150px) and centers cards in it, with a
  negative `margin-block` cancelling that reservation at rest. A card expanding on
  hover/focus therefore never changes the track height, so the bottom-anchored attached
  carousel no longer pushes its heading and arrows up.
- The dark surface variant is authored as `dark-card` (not `dark`) deliberately —
  `dark` is a reserved global Milo class that paints a solid dark background site-wide,
  which would collide with this block's own local "dark card surface" meaning. There's no
  Theme pick in the Upcoming Sessions configurator (removed — dark/light was never
  config-driven for Featured Sessions either, see its own README): `decorate()` itself
  adds `dark-card` to `el` automatically when the *ancestor* `.section` carries a plain
  `dark` class (DA's own Section Metadata `style: dark` authoring / decorate.js's
  `applyAreaTheme()`) — the same section-driven signal `event-card.css`'s/
  `event-carousel.css`'s own dark rules key off directly (`.section.dark .event-card ...`),
  with no JS-set attribute involved. Only ever adds `dark-card` to `el` itself, never
  touches `dark` on `el`, so there's no ambiguity with the reserved global class this
  note is about.
- Desktop (`@media (min-width: 1280px)`) uses a fixed `margin-top` on `.sg-card__footer`
  rather than `margin-top: auto` (which sessions-guide uses, since its card is
  min-height/grows to fit content) — this card is fixed-height, so `auto` would push the
  footer to the box's bottom edge whenever the title doesn't use its full 2-line
  allowance.
- `.sg-card__time`'s `margin-left: auto` at desktop is unconditional: `.sg-card__footer`'s
  `space-between` only pins time to the right when its sibling badge actually renders;
  when category doesn't resolve to a known badge, time becomes the row's only
  participating flex child and `space-between` would otherwise collapse it to the start.
