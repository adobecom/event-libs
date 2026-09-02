# ESP session-catalog / session-facets — reference for Phase 3

Real request/response shapes, pulled by hitting the Dev ESP tier directly and cross-checked against the actual route/service code in `/Users/doliva/code/events-service-platform` (`src/routes/events/sessions/read.js`, `src/services/EventSessionCatalogService.js`, `src/utils/customAttributeHelper.js`). Written in prep for Phase 3 (featured sessions picker) — not implementation, just the contract.

Test request used throughout:
```
GET https://wcms-events-service-platform-deploy-ethos102-stage-caff5f.stage.cloud.adobe.io/v1/events/ce15d0f5-b836-4118-9b3f-1a0614208112/session-catalog
GET https://wcms-events-service-platform-deploy-ethos102-stage-caff5f.stage.cloud.adobe.io/v1/events/ce15d0f5-b836-4118-9b3f-1a0614208112/session-facets
```
Both public (no auth required, gateway API key only — same as already documented in the app's PLAN.md).

## `/session-catalog`

**Query param:** `customAttributeValue=<attributeId>:<valueId>` — repeatable, **AND**-combined across *all* filter entries regardless of attribute grouping (confirmed in `sessionsMgr.listSessionsForEventWithFilter`: each filter queries independently, results are intersected). **This means there's no server-side "OR within one attribute" support** — passing two different `valueId`s for the *same* `attributeId` would (incorrectly) require a session to match both, which is impossible for a single-select field. Client-side filtering over the full fetched set (see below) is the only way to get "any of these values for this attribute" semantics.

**No pagination on the response** — `getCatalog()` internally follows `nextPageToken` in a loop and returns the *entire* event's session set in one response. For this event: 172 sessions, ~2.2MB. Worth knowing before building a picker UI that assumes paging.

**Response shape:**
```json
{
  "sessions": [ /* Session[] */ ],
  "sessionTimes": [ /* SessionTime[] */ ],
  "speakers": [ /* Speaker[] */ ],
  "sponsors": [ /* Sponsor[] */ ],
  "locations": [ /* Location[] */ ],
  "count": 172
}
```
`speakers`/`sponsors`/`locations` are **series-scoped, not session-scoped** — full records live in these top-level arrays once; each session only carries a small **association stub** (id + ordinal), not the full record. Cross-reference by id to get names/bios/etc.

**Session object** (real fields, from a live sample):
```json
{
  "eventId": "...",
  "sessionId": "...",
  "sessionCode": "S6304",
  "externalSessionId": "rf-...",           // RainFocus origin id
  "enTitle": "...",
  "sessionLengthInMinutes": 60,
  "sessionType": "Other",
  "published": false,
  "url": "https://www.adobe.com/drafts/.../sessions/...",
  "seriesId": "...",
  "creationTime": 1784321867574,           // epoch ms
  "modificationTime": 1784321869917,
  "customAttributes": [ /* CustomAttributeGroup[], see below */ ],
  "localizations": { "en-US": { "title": "...", "description": "..." } },
  "localizationOverrides": {},
  "speakers": [
    { "speakerId": "...", "speakerType": "Speaker", "ordinal": 1, "creationTime": ..., "modificationTime": ... }
  ],
  "images": [
    { "imageSource": "external", "mimeType": "image/jpeg", "imageKind": "session-card-image",
      "imageId": "...", "altText": "...", "imageUrl": "https://...", "creationTime": ..., "modificationTime": ... }
  ],
  "sponsors": []
}
```
No `resources[]`/`mrStreamId`/`videoAvailable` on the session itself (matches existing project notes — those live on `sessionTimes` and are deliberately stripped, see below).

**`sessionTimes[]`** — a session can have **multiple** times (e.g. a live slot + an on-demand replay); each time is its own object, linked by `sessionId`:
```json
{
  "eventId": "...", "sessionId": "...", "sessionTimeId": "...",
  "externalSessionTimeId": "rf-...",
  "startTimeMillis": 1761775200000, "endTimeMillis": 1761777000000,
  "timezone": "America/Los_Angeles",
  "attendeeCount": 0, "waitlistAttendeeCount": 0, "isFull": false,
  "allowWaitlisting": false, "allowGuestRegistration": false,
  "creationTime": ..., "modificationTime": ...
}
```
**`videos` is explicitly stripped before this leaves the service** (`_fetchAllEventSessionTimes()`: `times.map(({videos: _videos, ...time}) => time)`), with a code comment citing MWPW-200437 — private streaming details must never be exposed via this public catalog endpoint. Confirms the existing project note that `mrStreamId`/`videoAvailable` being absent is deliberate, not a schema gap.

**Update 2026-08-24 — this is no longer the route to the live stream id.** `videos` stays stripped, but per product the Mobile Rider *live* stream id will be delivered as an ordinary custom attribute instead, tentatively **`Mobilerider Live Stream ID`**. The VOD ids the catalog sends today are each for a different player and none answers "is this on air now?": `MPC ID` is an Adobe Video TV asset, `YouTube ID` is a YouTube-hosted session, and `Mobilerider Video ID (DVR)` is the Mobile Rider recording of a *finished* stream. Four sources in total once the live id lands, chosen per session rather than chained as fallbacks. See `MOBILE-RIDER-STREAM-ID-GAP.md`.

**Top-level `speakers[]`** (full record, series-scoped):
```json
{
  "speakerId": "...", "externalSpeakerId": "rf-...",
  "firstName": "Yuko", "lastName": "Shimizu", "company": "Yuko Shimizu",
  "localizations": { "en-US": { "title": "Illustrator and Educator", "bio": "..." } },
  "localizationOverrides": {},
  "creationTime": ..., "modificationTime": ...
}
```

**Top-level `locations[]`**:
```json
{ "locationId": "...", "externalLocationId": "rf-...", "name": "West Hall-518", "locationCode": "...", "venueId": "...", "creationTime": ..., "modificationTime": ... }
```

**`customAttributes[]` (CustomAttributeGroup)** — resolved, not raw:
```json
{
  "attributeId": "e131a8bc-93c5-477c-baaa-f8abe67a44d1",
  "name": "Primary Track for Agenda (Digital Agenda)",
  "label": "Primary Track for Agenda (Digital Agenda)",
  "inputType": "single-select",
  "enabled": true,
  "values": [
    { "valueId": "3f87489e-...", "label": "Graphic Design and Illustration", "value": "graphic-design-and-illustration", "ordinal": 9 }
  ]
}
```
Free-text attributes (e.g. `URL Title`, `Watch `) instead have `values: [{ "value": "...", "_ordinal": null }]` — no `valueId`/`label`. **Only `single-select`/`multi-select` attributes with a `valueId` get indexed for filtering/faceting at all** (`buildAttributeIndexItems` explicitly filters to entries with a `valueId`) — free-text attributes can never be filtered via `customAttributeValue` or appear in `/session-facets`, confirmed by cross-checking the real facets response (no free-text attribute shows up there).

**All distinct `customAttributes[].name` values seen on this real event** (28 total): Audience, CFP: Show session on event site, Closed Caption Information, Curated Sessions Header, Day, Format, LegalDisclaimer, MPC ID, Mobilerider Video ID (DVR), Playlist assignment/name, Playlist on session page, **Primary Track for Agenda (Digital Agenda)**, Product, Programming Category, Region, SEO Link 2 - Start for free, SEO Link 3 - Get involved, SEO Session Description, Session Image URL, **Session Type**, SkinID, Sponsored Session Information, Technical Level, Technical Level Catalog, **Track**, URL Title, Video Duration (hr:min:sec), Watch , YouTube ID.

Note there's a real, authored **`Day`** custom attribute (e.g. `"Americas Day 1"`) distinct from the `sessionsForDay`/`getFeaturedSessions` day-*derivation* logic PLAN.md already decided on (deriving day from `sessionTimes[].startTimeMillis` + viewer timezone, not from an authored field). Worth flagging to whoever builds the featured-sessions consuming side that an authored `Day` attribute exists but isn't the thing being used — don't confuse the two.

Also note `Track` and `Primary Track for Agenda (Digital Agenda)` are **both real, present, distinct** custom attributes on this event — confirms PLAN.md §5's earlier finding that these are two different fields sourced from different attributes, not a duplicate.

## `/session-facets`

Returns pre-aggregated counts, **independent of any current filter** (i.e. these are always the full, unfiltered per-event counts — not "counts within the current result set"). Response: `{ "facets": [ ... ] }`.

**Only attributes present in the event's series scope config with `enabled !== false` are included** — same enablement gate as filtering. Each group is sorted by the config's authored `ordinal` for that value (not alphabetical, not by count).

```json
{
  "attributeId": "...",
  "attribute": "Track",
  "values": [
    { "valueId": "...", "value": "Business", "count": 12 }
  ]
}
```

**All 14 facet groups on this real event**, with value/session counts:

| Attribute | # values | Total tagged sessions |
|---|---|---|
| Technical Level Catalog | 6 | 147 |
| Format | 3 | 249 |
| Technical Level | 3 | 56 |
| CFP: Show session on event site | 1 | 172 |
| Programming Category | 9 | 200 |
| Day | 6 | 92 |
| Audience | 20 | 625 |
| Region | 3 | 136 |
| Playlist on session page | 12 | 131 |
| **Track** | 9 | 198 |
| Playlist assignment/name | 12 | 191 |
| **Primary Track for Agenda (Digital Agenda)** | 12 | 118 |
| Product | 24 | 270 |
| Session Type | 7 | 172 |

("Total tagged sessions" sums each value's count — since attributes like `Audience`/`Product` can be multi-select, this total can exceed the event's 172-session count; a session can be tagged with more than one value for the same attribute.)

**Relevant for Phase 3's picker UX:** `Format` (In person / Online / On demand, post event) and `Session Type` are both real, populated, filterable facets — either could be a genuinely useful quick-filter in the featured-sessions picker, on top of the `Track`/`Primary Track for Agenda` grouping already planned. `Day` also exists as a facet (6 values, e.g. "Americas Day 1") — but per the note above, this is a *different* thing from the day-derivation logic already decided for the consuming side; using this facet for authoring-time filtering (e.g. "show me only Day 1 sessions while picking") is a separate, valid use from how "day" is computed for display later.

## Open questions worth resolving before building the Phase 3 picker

1. Given `session-catalog` returns the *entire* event's session set unpaginated (172 sessions / 2.2MB for this event), does the picker need any lazy-loading/virtualization, or is client-side filtering over the full set (as this app's `extractDistinctTracks` already does for tracks) sufficient? Given events-service-platform's own precedent (EMC) client-side-filters full fetched sets already, this is probably fine, but worth confirming for a Tier-1-scale event with potentially more sessions.
2. Do we want `Format`/`Session Type` as additional picker filters (facets confirm both are real and populated), or keep the picker scoped to track-only grouping as PLAN.md currently describes?
3. Should the picker use `/session-facets` at all (for filter-chip counts), or is `extractDistinctTracks`-style client-side counting over the already-fetched catalog sufficient, avoiding a second network call? Given `session-catalog` already returns full `customAttributes` per session, computing facet-like counts client-side is possible without a second request — `/session-facets` mainly buys you the *ordinal-sorted, config-driven* ordering for free.
