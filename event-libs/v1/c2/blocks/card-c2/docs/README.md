# card-c2

Generic content card. Renders a media (image) + body (title/description/CTA), with
five aspect-ratio variants authored via class name: `ratio-1-1`, `ratio-4-3` (default),
`ratio-3-4`, `ratio-4-5`, `ratio-16-9`.

If no media image is found, the card removes itself — a card with no image is not a
valid authored card.

## Session-hydrated cards

Cards rendered by other flows (e.g. Featured Sessions) can carry `data-session-id` and
related `data-*` attributes (`data-start-time-utc`, `data-end-time-utc`, `data-mr-stream-id`,
`data-watch-url`, `data-session-url`). When present, `session-routing.js` is lazy-loaded
to make the card clickable and route it based on derived session state. Plain authored
cards (no `data-session-id`) are unaffected — this is a no-op for them.

## session-routing.js

Resolves where a hydrated card should navigate, mirroring the click rules established
for Upcoming Sessions / Session Guide:

- **upcoming** → open the Session Guide modal to this session's detail (`?session=`)
- **live** → the streaming destination (watch URL, falling back to the session page)
- **on-demand** → the individual Session Page

### Mobile Rider polling

Cards with `data-mr-stream-id` need to know which MR streams are currently
broadcasting to distinguish "live" from "upcoming"/"on-demand" (non-MR cards ignore
this and use pure time-window checks). A single shared poll (every 30s) is started
lazily the first time an MR-backed card is wired up, and keeps a shared
`liveStreamActiveIds` set that `deriveSessionState` reads from.

### `?timing=<epoch-ms>` override

Lets QA simulate "now" as any instant (e.g. mid-live) without waiting for real time.
Read once at module load as an *offset* from the real clock, so `now()` still advances
in real time from that point rather than freezing. Absent/invalid falls back to the
real `Date.now()`. The identical override exists in `upcoming-sessions.js`.

### Click target

The whole card is the click target. The authored `.card-cta` link stays a real anchor
(for keyboard/right-click/new-tab), but its plain click defers to the same router so
behavior can't diverge between clicking the card and clicking the CTA. Modified clicks
(cmd/ctrl/shift) on the CTA anchor are left alone to behave natively (open in new tab, etc.).
