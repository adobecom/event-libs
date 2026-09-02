# Real API Integration Checklist

Remove or replace every item below once real IMS login and Rainfocus registration APIs are wired up.

> **Note (MWPW-199065):** the dev-mock scaffolding and the Rainfocus/Mobile Rider/sessions services all moved out of this block into shared, page-level modules (`event-libs/v1/utils/session-store.js` and `event-libs/v1/services/sessions/`) so other blocks on the same page can read the same session/auth state. The steps below reference the new locations.

> **Status (MWPW-200311, 2026-08-04):** items 1, 2, 4, and 7 are done — real IMS profile + a real jwt-exchanged `rfAuthToken` now drive every Rainfocus call, with the dev-mock localStorage scaffolding fully removed. Item 3 is superseded: `rainfocus-api-url`/`rainfocus-api-profile-id` no longer live in separate flat metadata — they're `rfApiUrl`/`rfProfileId` fields inside the Tier 1 Event Configurator's single `tier-1-event-config` JSON payload instead. Item 6 is done. Item 5 (Mobile Rider) remains open.
>
> **Update (MWPW-200314):** the standalone `tier-1-event-state-enabled` opt-in flag referenced below was retired — the shared store now gates on `tier-1-event-config` metadata being present instead (see item 3).

---

## 1. Delete the dev-seeding logic in the shared store ✅ Done

**File:** `event-libs/v1/utils/session-store.js`

Delete `seedDevData()` and its call inside `initSessionState()`:

```js
// DELETE this function and its call site:
function seedDevData() {
  try {
    if (!localStorage.getItem('sg:dev-auth')) {
      localStorage.setItem('sg:dev-auth', JSON.stringify({
        isLoggedIn: true,
        isRegistered: true,
        userFirstName: 'Dev',
      }));
    }
    if (!localStorage.getItem(LS_SCHEDULED)) {
      localStorage.setItem(LS_SCHEDULED, JSON.stringify(SEED_SCHEDULED));
    }
    if (!localStorage.getItem(LS_FAVORITED)) {
      localStorage.setItem(LS_FAVORITED, JSON.stringify(SEED_FAVORITED));
    }
  } catch { /* ignore */ }
}
```

This used to live in a standalone `services/dev-mock.js` inside this block, called from `sessions-guide.js`'s `init()`. It moved into the shared store because `initSessionState()` now runs from `decorateEvent()` — before any block's `init()` — so seeding has to happen at the same, earlier point or the store reads empty localStorage on first load.

---

## 2. Remove the `sg:dev-auth` priority check in `syncAuth` ✅ Done

**File:** `event-libs/v1/utils/session-store.js` — inside `syncAuth()`

```js
// DELETE this block:
try {
  const devAuth = JSON.parse(localStorage.getItem('sg:dev-auth') || 'null');
  if (devAuth) {
    auth.value = {
      isLoggedIn: devAuth.isLoggedIn ?? null,
      isRegistered: devAuth.isRegistered ?? undefined,
      userFirstName: devAuth.userFirstName ?? null,
    };
    return;
  }
} catch { /* ignore */ }
```

After removal, `syncAuth()` falls through directly to reading `imsProfile` and `rsvpData` from `BlockMediator`, which is the correct production path. This affects every block reading the shared `auth` signal, not just this one.

---

## 3. Move `rainfocus-api-url` / `rainfocus-api-profile-id` from mock metadata to real values — superseded, see status note above

**Where:** page `<meta>` tags, read by `getMetadata()` in `initSessionState()` (`event-libs/v1/utils/session-store.js`)

```html
<meta name="rainfocus-api-url" content="...">
<meta name="rainfocus-api-profile-id" content="...">
```

These already live in page metadata (not this block's authoring table) so the shared bootstrap can start fetching before any block mounts — just point them at the real Rainfocus endpoint/profile once it exists. `register-url` now lives in the Tier 1 Event Configurator instead of flat metadata (see the status note above); `manual-on-demand-transition-time` metadata is gone entirely — post-event state is driven solely by the Tier 1 Event Configurator's `eventEndDateTime` (`getEventApiConfig().eventEndMs`, consumed by `isPostEvent()` in `session-state.js`).

**Also required:** `tier-1-event-config` metadata — `decorateEvent()` (`event-libs/v1/utils/decorate.js`) gates both `initTierOneEventConfig()` and `initSessionState()` on it being present, so pages must author that config before the shared store bootstraps at all. (The standalone `tier-1-event-state-enabled` opt-in flag this section used to describe was retired — presence of `tier-1-event-config` is the gate now.)

---

## 4. Implement real Rainfocus API calls ✅ Done

**File:** `event-libs/v1/services/sessions/rainfocus.js`

Every function is currently a stub returning hardcoded data. Replace with real `fetch` calls to the Rainfocus API.

Credentials needed per call: `rfAuthToken` (from FEDS/IMS), `clientId` (IMS userId), `rfProfileId` and `rfApiUrl` (from `session-store.js`'s `getEventApiConfig()`).

---

## 5. Implement the real Mobile Rider API call

**File:** `event-libs/v1/services/sessions/mobile-rider.js`

`fetchLiveStatus(mrStreamIds, env)` currently returns `{ active: new Set(), inactive: new Set(mrStreamIds) }` (always inactive). Replace with the real MR batch status endpoint.

---

## 6. Real sessions API call — done, pending real `event-id` metadata

**File:** `event-libs/v1/services/sessions/sessions-api.js`

`fetchSessions(eventId)` calls the real ESL/ESP catalog endpoint
(`GET {serviceApiEndpoints.esp}/v1/events/{eventId}/session-catalog`) via `fetchEslSessions()` +
`mapEslPayloadToRawSessions()`. `eventId` is resolved in `session-store.js`'s
`initSessionState()` from `tier-1-event-config.eventId` (stamped in by the Tier 1 Event
Configurator at save time), falling back to page `event-id` metadata only when the config
has none.

Known gaps in the real mapping (not blockers, just incomplete real-data coverage):
- `resources[]` always `[]` — backend hasn't shipped this field yet.
- `mrStreamId` always `null` — the catalog carries no attribute for it yet. It is the Mobile
  Rider **live** stream id that `poller.js` keys on, authored in RainFocus and inbound as a new
  attribute, tentatively named **`Mobilerider Live Stream ID`**. Mapping it in
  `mapEslPayloadToRawSessions()` is the single change that turns stream polling on, so it stays
  unmapped until the name is confirmed.

- Sessions with multiple `sessionTimes` (recurring/repeated) only surface their earliest
  occurrence.
- `CategoryBadge`'s icon set — `getTrackIcon()` has no built-in default map anymore (see
  `event-libs/v1/utils/tier-1-event-config.js`); every Track needs an authored
  `track-icon-config` entry to show a badge at all — a content/authoring task, not a code gap.

### Video sources

A session's video comes from one of **four** attributes, each its own player. These are
alternatives, not a fallback chain — a session carries whichever it was produced for, so an
empty field means "not this source", never "try another".

| Attribute | Field | Player | State |
|---|---|---|---|
| `Mobilerider Live Stream ID` | `mrStreamId` | Mobile Rider **live** | inbound; name tentative |
| `MPC ID` | `mpcId` | **Adobe Video TV** | mapped, unread |
| `YouTube ID` | `youTubeId` | **YouTube** | mapped, unread |
| `Mobilerider Video ID (DVR)` | `mrDvrVideoId` | Mobile Rider **post-stream recording**, gated by `DVR Timing (in hours)` | mapped, unread |

`Skin ID` → `mrSkinId` is the Mobile Rider player skin, and applies only to the two Mobile
Rider sources. All of the above are mapped ahead of the playback work and read by nothing yet.

---

## 7. Pass real credentials in session actions ✅ Done

**File:** `event-libs/v1/services/sessions/session-actions.js`

`toggleSchedule()`/`toggleFavorite()` (in `session-store.js`, which this file calls) now pass a real jwt-exchanged `rfAuthToken` — no more hardcoded `null`. `clientId` was dropped from the contract entirely (confirmed against real MAX26 traffic and northstar's `determineParams()`: it's only ever sent on the unused `AUTH`/`jwt` endpoint, never on `addSession`/`removeSession`/`toggleSessionInterest`).

---

## localStorage keys ✅ Removed (MWPW-200311)

`sg:dev-auth`/`sessions:scheduled`/`sessions:favorited` and the `seedDevData()`/`loadPersisted()`/`persistScheduled()`/`persistFavorited()` functions that read/wrote them are gone — `session-store.js` no longer touches `localStorage` at all. Real IMS (`BlockMediator`'s `imsProfile`) and a real `myData` call on every load are the sole sources of truth now.

`sessions:scheduled` and `sessions:favorited` are production-worthy; they provide offline persistence and should remain. Only `sg:dev-auth` is mock-only. (These keys were renamed from `sg:scheduled` / `sg:favorited` when the store became shared/page-level rather than specific to this block.)
