# event-card

Generic content card. Renders a media (image) + body (title/description/CTA), with
six aspect-ratio variants authored via class name: `media-square`, `media-standard` (default),
`media-standard-rev`, `standard-m`, `media-wide`, `media-tall`.

If no media image is found, the card removes itself — a card with no image is not a
valid authored card.

## Session-driven cards

Cards built by other flows (e.g. `event-libs/v1/c2/blocks/featured-sessions/`) can carry
`data-session-id` and related `data-*` attributes (`data-start-time-utc`,
`data-end-time-utc`, `data-mr-stream-id`, `data-watch-url`, `data-session-url`) before
calling this block's own `init()` on the generated card. When present, `utils/session-routing.js`
is lazy-loaded to make the card clickable and route it based on derived session state.
Plain authored cards (no `data-session-id`) are unaffected — this is a no-op for them.

## session-routing.js

Lives at `event-libs/v1/utils/session-routing.js` — a shared utility, not scoped to
this block, since other consumers may lazy-load it the same way in future.

Resolves where a hydrated card should navigate, mirroring the click rules established
for Upcoming Sessions / Session Guide:

- **upcoming** → open the Session Guide modal to this session's detail (`?session=`)
- **live** → the streaming destination (watch URL, falling back to the session page)
- **on-demand** → the individual Session Page

### Mobile Rider polling

Cards with `data-mr-stream-id` need to know which MR streams are currently
broadcasting to distinguish "live" from "upcoming"/"on-demand" (non-MR cards ignore
this and use pure time-window checks). The first MR-backed card wired up registers
every `.event-card[data-mr-stream-id]` on the page with the shared registry at
`event-libs/v1/services/sessions/mobile-rider-poller.js`
(`registerStreamIds`/`subscribe`) and never unregisters — this block needs ongoing
live→on-demand tracking, unlike `upcoming-sessions`, which drops an id the moment
it's confirmed started. The registry itself batches ids from every registered
caller into a single `getMediaStatus()` call per 30s tick, so if `upcoming-sessions`
is also polling overlapping ids on the same page, both blocks share one underlying
request instead of two independent loops. Results feed a local `liveStreamActiveIds`
set that `deriveSessionState` reads from.

### `?serverTime=<epoch-ms>` override

Lets QA simulate "now" as any instant (e.g. mid-live) without waiting for real time.
Uses the shared `getNowMs()` override from `utils/session-state.js` — read once at page
load as an origin, so time still advances in real time from that point rather than
freezing. Absent/invalid falls back to the real `Date.now()`. The same override drives
`upcoming-sessions.js`, `sessions-guide`, and the rest of the Timing Framework, so one
`serverTime` value simulates "now" consistently across every time-aware block on the
page.

### Click target

The whole card is the click target. The authored `.card-cta` link stays a real anchor
(for keyboard/right-click/new-tab), but its plain click defers to the same router so
behavior can't diverge between clicking the card and clicking the CTA. Modified clicks
(cmd/ctrl/shift) on the CTA anchor are left alone to behave natively (open in new tab, etc.).
