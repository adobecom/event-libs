# Schedule Maker: authoring page schedules

[Schedule Maker](../../event-libs/schedule-maker/README.md) is a standalone DA app:

```text
https://da.live/app/{org}/{repo}/tools/da-apps/schedule-maker
```

Code lives in `event-libs/schedule-maker/`; the local entry is
[tools/da-apps/schedule-maker.html](../../event-libs/tools/da-apps/schedule-maker.html).
It uses vendored Preact/HTM, runtime Spectrum components, DA SDK authentication,
and context providers for DA scope, navigation, and local schedule state.
Run `npm run da-apps` from the Git root and open the app with `?ref=local`.

## Author-to-runtime handoff

1. Author and publish fragments for pre-session, live, and post-session moments.
   A live fragment must contain the actual video block/link.
2. Create a named schedule manually or import spreadsheet/CSV rows. For each
   entry set `title`, `fragmentPath`, and `startDateTime` in epoch milliseconds.
   The editor's local datetime input and epoch field update the same value.
3. For MR-controlled moments, enable `includeLiveStream` and set
   `liveStream: { provider: 'MobileRider', streamId: 'MR_MEDIA_ID' }`.
   That media ID must match the fragment's video; it is **not** the Events or
   RainFocus session ID.
4. Copy Link. `prepareScheduleForServer()` stamps `modificationTime`, sorts
   entries by `startDateTime`, and removes editor/sync-only fields. JSON is
   UTF-8/base64 encoded into the canonical DA-app `#schedule=` URL.
5. Paste the copied anchor into the event page and publish.
   `processAutoBlockLinks()` decodes the href and builds `chrono-box`.
6. The mapper converts `fragmentPath -> pathToFragment` and
   `startDateTime -> toggleTime`, retaining the title. Only enabled streams with
   provider exactly `MobileRider` and a non-empty `streamId` become
   `mobileRider: { sessionId: streamId }`. The inline schedule runs through the
   [Timing Framework](timing-framework.md) and fragment loader.

Schedule Maker stores a **page schedule**, not catalog records or video embed
configuration. Marking a slot live does not create its player, upload a video,
or configure `skinid`. Author those in the fragment separately, using the
[player contracts](video-players.md).

Completeness indicators require title, fragment path, start time, and, for an
enabled stream, stream ID. Do not confuse those indicators with the narrower
`validateSchedule()` checks. Export complete data even if the UI permits an
incomplete state.

## Link persistence and Sync

Schedule JSON, including `scheduleId`, lives in the authored link; there is no
schedule-sheet backend write. Editing/copying a link does **not** update every
document with an older copy: replace and publish each intended reference.
Drag order is editor-only; Copy Link restores chronological order.
This differs from the sheet-backed libraries used by [configurators](configurators.md).

The app's mount-time loader reads `window.location.hash` only. Runtime auto-block
decoding also accepts old `?schedule=` links and checks the query payload before
the hash. Do not rely on the old query format for automatic editor opening.

`syncSchedules()` scans DA HTML documents under the selected folder with bounded
concurrency, decodes links, and returns an in-memory list with document references.
Identical ID/content combinations are deduplicated; different content under one
ID remains separate and is flagged as conflicting versions. Unreadable documents
abort the scan rather than yielding an incomplete success.

**Current default:** `ENABLE_LEGACY_LINK_MIGRATION = false` in
[constants.js](../../event-libs/schedule-maker/constants.js). Normal Sync is read-only.
If enabled, the controller can rewrite non-canonical hrefs via DA source POSTs
with ETag/`If-Match` protection and retries. This is link-format migration, not
propagation of newly edited schedule content. The README's unconditional rewrite
and ID-only deduplication descriptions are outdated.

See [testing](testing.md) for serialization, controller, and runtime checks.
