# `mrStreamId` has no backend source yet — resolved via manual input field

**Resolved:** option 1 below was implemented — `FeaturedSessionsEditor.js`'s
`META_FIELD_DEFS.mrStreamId` renders a per-session "Mobile Rider stream ID"
text field, and `buildSessionAuthorEntry()` (`tier-1-event-configurator/utils.js`)
now includes it in the copied JSON when set. The backend gap itself is
unchanged — this is a configurator-side workaround, not a real data source —
so the rest of this doc is kept as the historical record of why.

Both `upcoming-sessions.js` (Homepage) and Session Guide rely on a per-session
`mrStreamId` field to know a session is livestreamed via Mobile Rider — it drives
polling Mobile Rider directly and dropping/updating the session once MR confirms
the stream actually started, instead of trusting only the scheduled time.

**There is currently no ESP/RF field this can be read from.** Confirmed in
`mapEslPayloadToRawSessions()` (`event-libs/v1/services/sessions/sessions-api.js`),
which omits `mrStreamId` and lets `normalizeSessions()` default it to `null` for
every real session.

### Why — updated 2026-08-24

Two separate things were conflated here. Both are true:

1. **`sessionTimes[].videos` really is stripped** before the catalog leaves the
   service — `_fetchAllEventSessionTimes()` maps it out, citing MWPW-200437, because
   private streaming details must not be exposed on a public endpoint. See
   `ESP-SESSION-ENDPOINTS.md`. That part of the original note was correct.
2. **But that is no longer the route we are waiting on.** Per product, the live
   stream id will be delivered as an ordinary **custom attribute** instead, which
   sidesteps the stripped `videos` array entirely — so there is no time-gated or
   authenticated fetch to design, just an attribute to map.

The two video ids the catalog *does* send are for different players and neither
substitutes for the live id:

| Attribute | What it is | Use |
|---|---|---|
| `MPC ID` | Adobe Media Publishing Cloud asset id | VOD playback on **Adobe Video TV** |
| `Mobilerider Video ID (DVR)` | Mobile Rider recording of a **finished** stream | what some sessions become watchable from after the live window closes, delayed by `DVR Timing (in hours)` |
| *(missing)* | Mobile Rider **live** stream id | what `poller.js` polls for on-air status |

A new custom attribute is expected to carry the live id, tentatively named
**`Mobilerider Live Stream ID`**. So the thing to wait for is a *pending attribute*
on a payload we already fetch — not access to a locked-down one.

This still means **Session Guide has no live Mobile Rider integration wired up from
real ESP/ESL data today** — mock data aside — so there's no existing "correct"
configured pattern to copy for the Homepage configurator either. Both surfaces are
blocked on the same missing attribute.

## Current state in the Homepage configurator

`buildSessionAuthorEntry()` (`tier-1-event-configurator/utils.js`) builds the
JSON an author copies into `upcoming-sessions`/Featured Sessions' section-metadata.
It now includes `mrStreamId` (and `watchUrl`/`imageUrl`) when an author fills in
the per-session override fields in the picker UI — see "Resolved" above. Before
that field existed, an author had to hand-edit `mrStreamId` into the copied JSON
after the fact — same workaround the older `build-author-data.mjs` CLI script
already required, for the same reason (ESP's session catalog carries no such
field either).

## Options considered

1. **Manual input field per session** in the Upcoming/Featured Sessions picker —
   an optional "Mobile Rider stream ID" text field next to each picked session,
   author fills it in only for the few sessions that are actually MR-streamed.
   Doesn't require any backend change; purely a configurator UX addition.
   **← chosen, implemented.**
2. **Leave it out of the UI** — keep relying on hand-editing the copied JSON,
   i.e. today's status quo, no configurator change.
3. **Wait on backend** — don't build anything now; once ESP/RF actually exposes
   a real stream-id field, both Session Guide and the Homepage configurator
   should consume it the same way, so building a workaround now risks being
   thrown away.

Revisit once **`Mobilerider Live Stream ID`** (name tentative) appears on the
catalog: map it in `mapEslPayloadToRawSessions()`, at which point this manual
configurator field becomes redundant and both surfaces should read it directly.
Note that mapping it is also what switches MR polling on, letting sessions show as
Live — see A1 in the session-guide PM questions before flipping it.
