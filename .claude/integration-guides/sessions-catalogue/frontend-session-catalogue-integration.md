# Frontend integration guide: event sessions catalogue

This document explains how to use **GET** responses from the Events Service Platform to build a **sessions catalogue** for one event: catalogue cards (title, schedule, location, tags, speakers, description, registration state, calendar action) and a **speaker detail modal** opened from speaker avatars. It is derived from `src/api/openapi.json` and the route implementations under `src/routes/`.

**Scope:** Public-style catalogue UX typically uses read permissions (`event:read`, `series:read`). Exact auth headers, IMS tokens, and group context (`x-adobe-esp-group-id`) follow your environment and `src/middleware/authorize.js` — this guide focuses on **which resources to call** and **how to map fields**.

---

## 1. UI field mapping (catalogue card)

| UI element | Primary source | API field / notes |
|------------|----------------|-------------------|
| Session title | `Session` | Prefer localized `title` on the session object; fallback `enTitle` from base session properties (see `BaseSessionProperties` + `SessionLocalizationProperties` in OpenAPI). |
| Date & time | `SessionTime` | Use `startTimeMillis`, `endTimeMillis`, and **`timezone`** (required on `BaseSessionTime`). Format in the user’s locale on the client. A session may have **multiple** session times — decide product rules (e.g. show next occurrence, primary slot, or range). |
| Location name | `VenueLocation` + `SessionTime` | `SessionTime.locationId` references a venue location. Resolve with `GET /v1/venues/{venueId}/locations/{locationId}` → use location **`name`** (and address fields if needed). You need **`venueId`** from the parent **Event** (see §3). |
| Tags / pills | `Session` | `tags` is a **`TagIdList`**: a **single comma-separated string** of CAAS tag ids (e.g. `caas:foo/bar,caas:other/baz`) or `null` — see `TagIdList` in OpenAPI. Split on **`,`** for multiple pills. **There is no tags resolution GET route in this repo**; map ids to human-readable labels via your content/tag service or design conventions. |
| Description + “Read more” | `Session` | Localized **`description`** (`SessionLocalizationProperties`) or empty if not set. |
| Speaker avatars (row) | `SessionSpeaker` + `Speaker` | `GET .../sessions/{sessionId}/speakers` returns only **`speakerId`**, **`speakerType`**, **`ordinal`** (no photo). Load **`GET /v1/series/{seriesId}/speakers/{speakerId}`** for **`photo.imageUrl`**, name, etc. Sort speakers by **`ordinal`**. |
| “Registered” vs not | Attendee + session times | Registration is stored **per session time**, not per session. See §6. |
| “Download to calendar” | Client-generated | The API does not return a calendar file URL. Build an **.ics** (or platform calendar link) on the client from session time bounds + title + timezone + optional location text. |

---

## 2. Core GET endpoints

Base path: your deployment’s API root (e.g. `/v1/...`). All paths below are as registered in OpenAPI.

### 2.1 Sessions for the event

**`GET /v1/sessions?eventId={eventId}&page-size={n}&next-page-token={token}`**

- **Auth:** `requirePermission('event', 'read')` on this route.
- **Response:** `{ sessions, nextPageToken, count }` per `SessionList`.
- **Behaviour:** With `eventId`, returns **full session records** for that event (not just stubs). Paginate with `next-page-token` until absent.

Filter **catalogue visibility** client-side using session fields such as **`published`** (boolean) and **`status`** if your product rules require it.

### 2.2 Session times (schedule, timezone, location id)

**`GET /v1/session-times?sessionId={sessionId}&page-size={n}&next-page-token={token}`**

- **Auth:** `requirePermission('event', 'read')`.
- **Response (actual handler):** `{ sessionTimes, count }` — the handler in `src/routes/session-times/read.js` **does not currently attach `nextPageToken`** even though `SessionTimeList` in OpenAPI allows it. If you have sessions with many times, verify pagination behaviour in your environment.

Each **`SessionTime`** includes `sessionTimeId`, `sessionId`, `eventId`, `startTimeMillis`, `endTimeMillis`, **`timezone`**, optional **`locationId`**, capacity fields (`attendeeLimit`, `isFull`, etc.).

**`GET /v1/session-times/{timeId}`**

- Returns a single **`SessionTime`**. Note: this route is implemented **without** `requirePermission` in `read.js` — align with your security review; OpenAPI still documents 403.

### 2.3 Session speakers (linkage only)

**`GET /v1/sessions/{sessionId}/speakers`**

- **Response:** `{ speakers: SessionSpeaker[] }`.
- Each item: `speakerId`, `speakerType`, `ordinal`, timestamps — **not** enough for the modal or avatars alone.

**`GET /v1/sessions/{sessionId}/speakers/{speakerId}`**

- Same shape as a single **`SessionSpeaker`** — still **no** bio/photo; use series speaker for rich UI.

### 2.4 Series speakers (avatar + modal content)

**`GET /v1/series/{seriesId}/speakers/{speakerId}`**

- **Auth:** `requirePermission('series', 'read')`.
- Returns **`Speaker`**: `firstName`, `lastName`, `company`, **`socialLinks[]`** (`serviceName` + `link`), optional **`photo`** (`imageUrl`, `altText`, …), **`localizations`** / **`localizationOverrides`** for **`title`** (job title) and **`bio`**, etc.

Optional bulk load:

**`GET /v1/series/{seriesId}/speakers?page-size=…&next-page-token=…`**

- Returns speakers with **first image** hydrated as **`photo`** — useful to cache a series-level map `speakerId → Speaker` for catalogue performance.

### 2.5 Venue location (room name)

**`GET /v1/venues/{venueId}/locations/{locationId}`**

- Returns a **venue location** object (`BaseVenueLocation`: **`name`**, `locationType`, address-related fields, etc.).
- **`venueId`** comes from the **Event** (§3).

**`GET /v1/venues/{venueId}/locations`**

- List all locations for the venue if you prefer to cache and resolve `locationId` locally.

---

## 3. Event context (series id + venue id)

Before loading speakers and locations, fetch the event:

**`GET /v1/events/{eventId}`**

Use the response to read **`seriesId`** and **`venueId`** (and any event-level fields your UX needs). OpenAPI `Event` / related schemas are the contract.

---

## 4. Recommended data-loading strategies

### 4.1 Minimal waterfall (simplest)

1. `GET /v1/events/{eventId}` → `seriesId`, `venueId`.
2. `GET /v1/sessions?eventId=…` (paginate).
3. For each session (or in parallel with a concurrency limit):
   - `GET /v1/session-times?sessionId=…`
   - `GET /v1/sessions/{sessionId}/speakers`
4. Batch-resolve:
   - **Locations:** unique `(venueId, locationId)` from all session times → `GET .../locations/{locationId}` (or one list call + map).
   - **Speakers:** unique `speakerId` → `GET /v1/series/{seriesId}/speakers/{speakerId}` **or** prefetch all series speakers once and join in memory.

### 4.2 Catalogue performance tips

- **Dedupe** speaker and location GETs; memoize by id.
- **Lazy-load** speaker details for the **modal** on first click (`GET .../speakers/{speakerId}`) if catalogue load must stay small; still need **photo URL** for avatars — either eager small set or include from a series speaker list prefetch.
- **Virtualize** long session lists; keep filter/sort on a normalized in-memory model.

---

## 5. Filtering and search

The **list sessions** endpoint supports **`eventId`**, **`page-size`**, and **`next-page-token`** only. There are **no** server-side query parameters for text search, tags, track, or format on `GET /v1/sessions`.

**Implement on the client:**

- **Search:** substring match on `title`, `description`, speaker names (after hydration), location name, etc.
- **Filters:** map UI facets to session fields, for example:
  - `sessionType`, `sessionFormats`, `publicTracks`, `primaryTracks`, `technicalLevels`, `audiences`, `industries`, `relatedProducts`, `businessTypes`, **`tags`** (split the comma-separated `TagIdList` string), date range from **session times** (`startTimeMillis` / `endTimeMillis`).

Normalize strings for comparison; respect locale where needed.

---

## 6. “All sessions” vs “My sessions”

### 6.1 Product model

- Event registration and session registration are separate concerns in this platform: **session attendance** is tied to a **`sessionTimeId`** (see `sessionTimeAttendeesMgr`).

A practical rule for the toggle:

- **“My sessions”:** sessions where the current user has **at least one** `SessionTime` registration (or waitlist — define with PM) under that session for the event.
- **“All sessions”:** full list (still apply `published` / catalogue rules as needed).

### 6.2 Documented attendee API

OpenAPI defines:

**`GET /v1/attendees/{attendeeId}/events/{eventId}/sessions`**

- **Wire response (handler):** `{ sessionIds: string[] }` (`src/routes/attendees/read.js`). OpenAPI describes a bare `SessionIdList` array — treat the **object with `sessionIds`** as authoritative for the running service unless/until spec and handler are aligned.
- **Path alias:** use **`attendeeId = me`** (case-insensitive after lowercasing) with the bearer token; the route resolves the IMS user id.

**Integration note:** The route calls `attendeesMgr.listEventSessionsForAttendee`. **Verify in your branch that this manager method exists and returns data** before relying on it in production; if it is missing, you will need a backend follow-up or an alternate strategy (e.g. aggregate session-time registrations via a supported API).

### 6.3 Granular registration state (per slot)

To know if the user is registered for a **specific** occurrence:

**`GET /v1/session-times/{timeId}/attendees/{attendeeId}`**

- Use **`attendeeId = me`** if your gateway supports the same pattern as other attendee routes (confirm in OpenAPI and implementation).

Returns session-time attendee payload including **`registrationStatus`** (e.g. registered vs waitlisted — see `SessionTimeAttendee` schema).

For the **card-level** “Registered” button like the mock:

- If the session has **one** primary time, mirror that row’s registration state.
- If the session has **multiple** times, define UX (e.g. “Registered” if any slot is registered, or show per-slot state in expanded UI).

---

## 7. Speaker modal (screenshot 2)

On avatar click, open a modal and load (or read from cache):

**`GET /v1/series/{seriesId}/speakers/{speakerId}`**

Map to UI:

| Modal area | Field |
|------------|--------|
| Small label / “speaker title” | Localized **`title`** inside `localizations['xx']` or top-level patterns your tenant uses; job title lives here per `SpeakerLocalizationProperties`. |
| Name | `firstName` + `lastName` (and optional `company` as subtitle if desired). |
| Bio | Localized **`bio`**. |
| Social icons | `socialLinks[]`: match `serviceName` enum (e.g. `Instagram`, `Facebook`, `YouTube`, `TikTok`, `X`) to icons; use **`link`**. |
| Hero image / video | **`photo.imageUrl`** is the primary still; additional media would be product-specific (e.g. extra speaker images routes under `/series/.../speakers/.../images` if you extend the UX). |

**Session context:** `SessionSpeaker.speakerType` and `ordinal` are only on the session–speaker association; they do not replace series-level speaker profile data.

---

## 8. Calendar download

There is **no** built-in `.ics` or `calendarLink` on `Session` / `SessionTime`.

Generate on the client, for example:

- **Summary:** session title.
- **Start / end:** from `startTimeMillis` / `endTimeMillis` + **IANA timezone string** from `timezone`.
- **Location:** resolved location name (and address if needed).
- **Description:** session description + optional speaker names.

Use a well-tested ICS library; handle **all-day vs timed** sessions per product rules.

---

## 9. OpenAPI as source of truth

When in doubt, align request/response shapes with **`src/api/openapi.json`**. The validator middleware enforces these contracts.

---

## 10. Quick reference (endpoints)

| Goal | Method & path |
|------|------------------|
| Event + series + venue | `GET /v1/events/{eventId}` |
| All sessions for event | `GET /v1/sessions?eventId={eventId}` |
| Times for a session | `GET /v1/session-times?sessionId={sessionId}` |
| One session time | `GET /v1/session-times/{timeId}` |
| Speakers on session | `GET /v1/sessions/{sessionId}/speakers` |
| Speaker profile + photo | `GET /v1/series/{seriesId}/speakers/{speakerId}` |
| Location name | `GET /v1/venues/{venueId}/locations/{locationId}` |
| My session ids (documented) | `GET /v1/attendees/me/events/{eventId}/sessions` |
| My registration for a time | `GET /v1/session-times/{timeId}/attendees/{attendeeId}` |

---

*Adobe confidential — internal integration reference for events-service-platform.*
