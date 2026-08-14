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

**Resolved — Option 1 below was implemented.** `FeaturedSessionsEditor.js` has an
optional per-session "Mobile Rider stream ID" (and "Watch URL") field next to each
picked session; `buildSessionAuthorEntry()` (`tier-1-event-configurator/utils.js`)
folds that author-entered `meta` into each session entry. Those entries feed the
"Copy Link" payload (`ConfigEditor.js`'s `handleCopyHomepageLink`) — not, as this doc
originally said, a JSON blob pasted into section-metadata; that pre-link authoring
path no longer exists. `decorate.js`'s `tec-homepage` auto-block builder decodes the
link and passes `mrStreamId`/`watchUrl` straight through to `upcoming-sessions.js`/
`featured-sessions.js`, so an author only needs to fill this field in for the few
sessions that are actually MR-streamed — no hand-editing of copied output required.

## Options considered

1. **Manual input field per session** in the Upcoming/Featured Sessions picker —
   an optional "Mobile Rider stream ID" text field next to each picked session,
   author fills it in only for the few sessions that are actually MR-streamed.
   Doesn't require any backend change; purely a configurator UX addition.
   **— chosen, see above.**
2. **Leave it out of the UI** — keep relying on hand-editing the copied JSON.
3. **Wait on backend** — don't build anything now; once ESP/RF actually exposes
   a real stream-id field, both Session Guide and the Homepage configurator
   should consume it the same way, so building a workaround now risks being
   thrown away.

Revisit if/when ESP/RF exposes a real `mrStreamId` field — the manual field could
then be dropped in favor of reading it straight from the session catalog.
