# `mrStreamId` has no backend source yet — resolved via manual input field

**Backend gap resolved 2026-09-03, for Session Guide's real-catalog path.** The
ESP `session-catalog` payload now carries `Mobilerider Video ID (Livestream)` (the
real attribute name, confirmed against a live capture — not the tentative
`Mobilerider Live Stream ID` guess below), and `mapEslPayloadToRawSessions()`
(`event-libs/v1/services/sessions/sessions-api.js`) maps it to `mrStreamId`. That
was the single remaining step to switch MR live polling on for Session Guide (see
option 3's closing note below) — `fetchLiveStatus()` was already hitting the real
Mobile Rider endpoint. **Not yet verified against an actual live stream in the
browser.**
>
> This does **not** by itself retire the Homepage configurator's manual field
> below — that workaround exists because `buildSessionAuthorEntry()` builds a
> static, author-time JSON blob, a separate data path from Session Guide's
> per-page-load catalog fetch. Whether the configurator can now read the real
> attribute the same way depends on whether its own session-picker data source
> also carries `customAttributes` — not verified as part of this change.

**Resolved (configurator workaround):** option 1 below was implemented —
`FeaturedSessionsEditor.js`'s `META_FIELD_DEFS.mrStreamId` renders a per-session
"Mobile Rider stream ID" text field, and `buildSessionAuthorEntry()`
(`tier-1-event-configurator/utils.js`) now includes it in the copied JSON when
set. Per the update above, the underlying backend gap this workaround was built
around is now resolved on Session Guide's side — the rest of this doc is kept as
the historical record of why the workaround exists, and to flag re-evaluating it
now that real data exists.

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

| Attribute | Field | Player |
|---|---|---|
| `MPC ID` | `mpcId` | **Adobe Video TV** (Adobe Media Publishing Cloud asset) |
| `YouTube ID` | `youTubeId` | **YouTube**-hosted sessions |
| `Mobilerider Video ID (DVR)` | `mrDvrVideoId` | Mobile Rider recording of a **finished** stream — what some sessions become watchable from after the live window closes, delayed by `DVR Timing (in hours)` |
| `Mobilerider Video ID (Livestream)` | `mrStreamId` | Mobile Rider **live** — what `poller.js` polls for on-air status |

Four sources, four players, and they are **alternatives rather than a fallback chain**: a session
carries whichever it was produced for, so an empty field means "not this source", never "try
another". All four are now mapped in `mapEslPayloadToRawSessions()`, though only `mrStreamId`
is actually read downstream today (`mpcId`/`youTubeId` by session-broadcast's player adapters;
`mrDvrVideoId` for presence only).

**Resolved 2026-09-03:** the custom attribute carrying the live id arrived under the name
**`Mobilerider Video ID (Livestream)`** — close to, but not exactly, the tentative
`Mobilerider Live Stream ID` guess. It is now mapped.

**For Session Guide, real ESP/ESL data now includes the live Mobile Rider id** — this
paragraph previously said otherwise; see the update at the top of this doc. Whether the
Homepage configurator's own session-picker data source also carries `customAttributes` (and
so could read the real attribute the same way, retiring the manual field below) has not been
checked.

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

**Done, for Session Guide, 2026-09-03:** the attribute arrived as
`Mobilerider Video ID (Livestream)` and is mapped in `mapEslPayloadToRawSessions()`
— see the update at the top of this doc. Mapping it is also what switches MR
polling on, letting sessions show as Live — not yet verified against a real
live stream in the browser (see A1 in the session-guide PM questions).
**Still open:** whether this manual configurator field is now actually redundant
for the Homepage surface too depends on that picker's own data source also
carrying `customAttributes` — not checked as part of this change.
