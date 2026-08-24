# SWAN Notifications: UNC & External Dependency Guide

SWAN (Site-Wide Alerts and Notifications) lets an attendee who schedules a session
receive a reminder when it's about to go live, and again when it becomes available
on-demand. The reminder itself is rendered by **UNC**, Adobe's notification-bell widget
inside milo's global navigation — event-libs never talks to UNC directly. This guide
documents every external system this feature depends on, the exact contracts involved,
and the risks that must be resolved with each dependency's owning team before this goes
live for a real event.

Implementation lives in
[`event-libs/v1/features/swan-notifications/`](../event-libs/v1/features/swan-notifications/).
Config is authored via the "SWAN Notifications" tab in the Tier 1 Event Configurator DA
app ([`event-libs/swan-notification-configurator/`](../event-libs/swan-notification-configurator/))
— see the [authoring guide on da.live](https://da.live/edit#/adobecom/event-libs/docs/swan-notification-authoring-guidelines)
for the content-author-facing version of this doc.

## Table of Contents

1. [How UNC fits in](#how-unc-fits-in)
2. [Dependency list](#dependency-list)
3. [Configuration](#configuration)
4. [Open risks — resolve before going live](#open-risks--resolve-before-going-live)
5. [Verifying the chain end-to-end](#verifying-the-chain-end-to-end)

---

## How UNC fits in

SWAN never calls UNC's API. The actual flow is:

```
event-libs (this repo)  →  ANS (Adobe Notification Service)  →  UNC (renders the bell UI)
        │
        └────────────────→  ESP swan-notifications resource (tracks which ANS ids belong to which session)
```

UNC is a passive listener on ANS — whatever notification records exist in ANS for the
signed-in user's `x-adobe-app-id` are what UNC renders. This means UNC only shows a
SWAN-created notification if:

1. The user is signed in with the same IMS session milo's gnav uses.
2. Milo's gnav on the page has `universal-nav` metadata enabling the `notifications`
   component.
3. That component's configured `appID` (`getConfig().unav?.uncAppId`, defaults to
   `'adobecom'`) **exactly matches** the `appId` this feature sends as `x-adobe-app-id`
   (see [Configuration](#configuration)).

If any of those three don't line up, SWAN will still create records in ANS successfully
— they just won't render anywhere. This is the single most common way this feature
appears "broken" during setup; check gnav config first.

## Dependency list

### 1. Adobe IMS
Already available in event-libs via `session-store.js`'s existing IMS wiring — no new
setup. Used for `window.adobeIMS.getAccessToken().token` (Bearer auth on every ANS/ESP
call) and `tokenService.getTokenAndProfile()` (the `user-id` claim ANS requires).

### 2. ANS — Adobe Notification Service
External, owned by Adobe's notification platform team, not this repo.

- Endpoint: authored per-event via `ansEndpoint` (see [Configuration](#configuration)).
  Northstar's only known values are stage: `https://notify-stage.adobe.io/ans/v1/notifications`.
  **No production URL exists in any source repo today.**
- Auth: `Authorization: Bearer <IMS token>`.
- Required headers: `x-adobe-app-id` (must match gnav's UNC `appID`), `x-api-key: adobedotcomdx`,
  `accept: Application/json`, `from: <epoch-ms timestamp>`, `content-type: application/json`.
- Create: `POST` with `{ notifications: { notification: [{ 'user-id', type, 'sub-type', payload, timestamp }] } }`.
- Expire: `PUT` with `{ notifications: { notification: [{ 'notification-id', state: 'EXPIRED' }] } }`
  — **not** `DELETE`. UNC's rendering only reacts to a `PUT`+`EXPIRED` state change.
- Payload quirk: `goLiveTime`/`goLiveExpireTime` inside the stringified `payload` must be
  in **seconds**, not milliseconds — undocumented, confirmed only by reading the prior
  implementation.

### 3. Bookkeeping — ESP `swan-notifications` resource
Tracks which ANS notification ids belong to which session — ANS itself has no list/diff
endpoint of its own. This lives on `events-service-platform` (ESP), the same
Node/Express + DynamoDB backend event-libs already depends on for the session catalog
(`services/sessions/sessions-api.js`), not a separate bespoke service — see
`events-service-platform/src/managers/swanNotificationsMgr.js` and
`src/routes/attendees/swan-notifications/`.

- Endpoints (attendee-scoped, `me` resolves from the IMS bearer token — same convention
  as `esp-controller.js`'s `getAttendee()`): `GET /v1/attendees/me/swan-notifications`,
  `POST /v1/attendees/me/swan-notifications` (body `{ rfCode, notificationId }`),
  `DELETE /v1/attendees/me/swan-notifications/{rfCode}`.
- Auth: same `constructRequestOptions()` helper every other ESP call in this repo uses
  (`Authorization: Bearer <IMS token>`, `x-api-key: acom_event_service`, etc.) — see
  `ans-controller.js`.
- Endpoint is resolved from `ENV_MAP` (`event-libs/v1/utils/constances.js`), fixed in
  source per environment like every other ESP call — not authored, and not affected by
  the ANS production-URL gap below.

### 4. RainFocus & ESP/ESL session catalog
No new dependency — both already used elsewhere in event-libs
(`services/sessions/rainfocus.js`, `services/sessions/sessions-api.js`). SWAN reuses the
same session catalog and confirmed-schedule state every other session/schedule feature
in this repo already depends on.

### 5. gnav / UniversalNav widget
Not code this repo builds — a coordination dependency. The consuming site (da-events)
must have milo's `universal-nav` page metadata include `notifications`, and its
`unav.uncAppId` must equal the `appId` this feature is configured with. See
[How UNC fits in](#how-unc-fits-in).

### 6. The config-library sheet itself (new runtime dependency)
`event-libs/swan-notification-configurator/`'s DA app writes authored configs to
`/tools/da-apps/swan-notification-configurator/configs.json` and — unlike every other
DA-app config-library sheet in this repo (`tier-1-event-configurator`'s and
`session-guide-configurator`'s own sheets are authoring-UI-only, never read by a live
page) — must also **publish** that sheet after every save/delete
(`previewAsset`+`publishAsset` in `swan-notification-configurator/scripts/da-controller.js`),
because `swan-config.js` resolves a page's `configId` against it with a plain,
unauthenticated `fetch()` at runtime. If a save's publish step fails, the app surfaces a
persistent warning with a "Retry publish" action — a `configId` copied before that
succeeds will resolve to nothing on a live page.

## Configuration

A page opts in with a single metadata row, `swan-notification-config`, whose value is a
short **config ID** (a `crypto.randomUUID()`) generated by the "SWAN Notifications" tab
in the Tier 1 Event Configurator DA app — not raw JSON. The full config (environment,
notification sub-type, timing, icon/image, optional app-id override) is authored through
that app's form and stored in the sheet described above; `swan-config.js` resolves the
ID to the full config at page-load time. See the
[da.live authoring guide](https://da.live/edit#/adobecom/event-libs/docs/swan-notification-authoring-guidelines)
for the field-by-field authoring reference.

The feature is a no-op (`isSwanEnabled()` returns `false`) whenever: no `configId` is
authored, the ID doesn't resolve to any row in the published sheet, or the resolved
config is missing `ansEndpoint`. See `swan-config.js` for the resolution/fallback logic
and `swan-payload.js`/`ans-controller.js` for how each field is used. The bookkeeping
endpoint isn't part of this check at all — it isn't authored (see
[Bookkeeping](#3-bookkeeping--esp-swan-notifications-resource) above).

**Trust boundary:** because `ansEndpoint` carries the visitor's live Adobe IMS access
token (`Authorization: Bearer ...`) on every request, the authoring app locks this field
to a Stage/Production dropdown (`SWAN_ENV_OPTIONS` in
`swan-notification-configurator/constants.js`) mapped to a fixed, code-owned endpoint —
an author can no longer type an arbitrary URL into it at all. `swan-config.js`
additionally keeps a host allowlist (`.adobe.io`, `.adobeioruntime.net`, `.adobe.com`) as
defense-in-depth against the sheet being hand-edited outside the app; a resolved config
with the endpoint on a non-Adobe host is treated as disabled rather than sending the
token there. If a legitimate future endpoint lives on a different Adobe-owned host,
extend the allowlist in `swan-config.js` **and** add it to `SWAN_ENV_OPTIONS`.

## Open risks — resolve before going live

Most of these are external coordination items this repo alone cannot resolve; one
(marked below) is an accepted internal design trade-off instead. Track them before
authoring a real config for a production event:

- **The published config-library sheet exposes every event's row, not just one.**
  `swan-config.js`'s runtime lookup has to be a plain unauthenticated `fetch()` of the
  whole sheet (see [Configuration](#configuration)), which means anyone with the URL —
  not just visitors to the specific event page — can read every authored event's
  `eventId`/`backendEventTitle`, potentially ahead of that event's own page going live.
  No credentials or endpoint access are exposed by this (the stage `ansEndpoint` value is
  already public in the authoring app's own source), so severity is low/moderate. This is
  a known, accepted trade-off of keeping this a "lite" single-sheet tool rather than
  splitting authoring data from public runtime data — revisit if event-name
  confidentiality before launch becomes a real requirement.
- **No production ANS URL exists anywhere in source.** Obtain a real value from whichever
  team owns ANS, then fill it into `SWAN_ENV_OPTIONS`'s `production` entry in
  `event-libs/swan-notification-configurator/constants.js` — that single edit is all
  that's needed to enable the "Production" option in the authoring app (it renders
  disabled until then). The bookkeeping endpoint needs no equivalent fix — it's already
  first-party ESP infra with real dev/stage/prod deployments.
- **CORS from da-events' actual publish domain** against ANS has not been verified.
  Confirm with a manual preflight check (`curl -H "Origin: <da-events-domain>"`) before
  wiring a real endpoint.
- **UNC `appId` coordination.** No UniversalNav/gnav configuration exists in event-libs or
  da-events today — whoever authors `swan-notification-config.appId` must coordinate
  directly with whoever configures gnav's `universal-nav` metadata on the same pages.
- **Absolute-URL resolution.** ESP's normalized session only exposes one relative
  `sessionPageUrl` (unlike northstar's separate absolute `liveUrl`/`cardUrl`). This
  feature resolves it against the *creating* page's own origin at notification-create
  time — confirm that's correct for a notification that may be opened later, on a
  different device, or via an OS-level push.
- **`ENFORCE_PUBLISHED_FILTER`** in `sessions-api.js` is currently `false`. If it's ever
  flipped on, a scheduled-but-unpublished session disappears from the session catalog
  while remaining in RainFocus's schedule; `reconcileSwanNotifications()` already skips
  (rather than throws on) a scheduled id it can't find in the catalog, but the resulting
  orphaned ANS notification is not automatically cleaned up in that case.

## Verifying the chain end-to-end

1. In the Tier 1 Event Configurator DA app, open (or create) the Tier 1 config for a test
   event, then switch to its "SWAN Notifications" tab and save a config with the
   **Stage** environment (once CORS is confirmed for your dev/test origin — Production
   isn't available until real endpoints are added, see [Open risks](#open-risks--resolve-before-going-live)).
   Confirm the save reports "Published," not the publish-failure warning.
2. `curl https://main--event-libs--adobecom.aem.live/tools/da-apps/swan-notification-configurator/configs.json`
   and confirm the new row is present — this is the exact fetch `swan-config.js` makes at
   runtime, so if this doesn't return the row, nothing downstream will work.
3. Paste the copied config ID into the test page's `swan-notification-config` metadata
   row. Confirm gnav's `universal-nav` metadata and `unav.uncAppId` are set to match.
4. Schedule a session as a signed-in test user; confirm a `POST` to
   `/v1/attendees/me/swan-notifications` (ESP) and `ansEndpoint` both fire (browser
   network tab), and that a `GET` to that same ESP endpoint reflects the new entry.
5. Unschedule the same session; confirm the `PUT`+`EXPIRED` call to `ansEndpoint` and a
   `DELETE /v1/attendees/me/swan-notifications/{rfCode}` call to ESP both fire.
6. Reload the page as the same user; confirm `reconcileSwanNotifications()` runs once
   (no duplicate notifications created for an already-scheduled session).
7. Only once 3–5 are confirmed working should UNC's actual bell-icon rendering be checked
   — a rendering failure at that point is a gnav/UNC coordination issue, not a SWAN one.
