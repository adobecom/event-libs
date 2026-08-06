# `mrStreamId` has no backend source yet

Both `upcoming-sessions.js` (Homepage) and Session Guide rely on a per-session
`mrStreamId` field to know a session is livestreamed via Mobile Rider — it drives
polling Mobile Rider directly and dropping/updating the session once MR confirms
the stream actually started, instead of trusting only the scheduled time.

**There is currently no ESP/RF field this can be read from.** Confirmed in
`event-libs/v1/services/sessions/sessions-api.js` (`mapEslPayloadToRawSessions`,
around line 459):

```js
// resources[]/mrStreamId intentionally omitted — no source in this payload yet
// (resources still in development backend-side; video/stream data is deliberately
// withheld from this public endpoint until the session goes live). normalizeSessions()
// defaults both to empty/null.
```

`normalizeSessions()` (same file, ~line 348) defaults every real session's
`mrStreamId` to `null` unconditionally. This means **Session Guide itself has no
live Mobile Rider integration wired up from real ESP/ESL data today** — mock data
aside — so there's no existing "correct" configured pattern to copy for the
Homepage configurator either. Both surfaces are blocked on the same backend gap.

## Current state in the Homepage configurator

`buildSessionAuthorEntry()` (`tier-1-event-configurator/utils.js`) builds the
JSON an author copies into `upcoming-sessions`/Featured Sessions' section-metadata.
It does **not** include `mrStreamId` (or `watchUrl`, which isn't read by
`upcoming-sessions.js` at all yet). For any session that genuinely is
MR-streamed, an author currently has to hand-edit `mrStreamId` into the copied
JSON after the fact — same workaround the older `build-author-data.mjs` CLI
script already required, for the same reason (ESP's session catalog carries no
such field either).

## Options once this needs solving for real

1. **Manual input field per session** in the Upcoming/Featured Sessions picker —
   an optional "Mobile Rider stream ID" text field next to each picked session,
   author fills it in only for the few sessions that are actually MR-streamed.
   Doesn't require any backend change; purely a configurator UX addition.
2. **Leave it out of the UI** — keep relying on hand-editing the copied JSON,
   i.e. today's status quo, no configurator change.
3. **Wait on backend** — don't build anything now; once ESP/RF actually exposes
   a real stream-id field, both Session Guide and the Homepage configurator
   should consume it the same way, so building a workaround now risks being
   thrown away.

No decision has been made yet — revisit this doc once there's a concrete need
or the backend gap closes.
