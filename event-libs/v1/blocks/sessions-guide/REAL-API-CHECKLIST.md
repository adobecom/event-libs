# Real API Integration Checklist

Remove or replace every item below once real IMS login and Rainfocus registration APIs are wired up.

> **Note (MWPW-199065):** the dev-mock scaffolding and the Rainfocus/Mobile Rider/sessions services all moved out of this block into shared, page-level modules (`event-libs/v1/utils/session-store.js` and `event-libs/v1/services/sessions/`) so other blocks on the same page can read the same session/auth state. The steps below reference the new locations.

> **Status (MWPW-200311, 2026-08-04):** items 1, 2, 4, and 7 are done — real IMS profile + a real jwt-exchanged `rfAuthToken` now drive every Rainfocus call, with the dev-mock localStorage scaffolding fully removed. Item 3 is superseded: `rainfocus-api-url`/`rainfocus-api-profile-id` no longer live in separate flat metadata — they're `rfApiUrl`/`rfProfileId` fields inside the Tier 1 Event Configurator's single `tier-1-event-config` JSON payload instead (`tier-1-event-state-enabled` is still required, unchanged). Items 5–6 (Mobile Rider, sessions API) remain open.

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

These already live in page metadata (not this block's authoring table) so the shared bootstrap can start fetching before any block mounts — just point them at the real Rainfocus endpoint/profile once it exists. Optional `register-url` and `manual-on-demand-transition-time` metadata follow the same pattern.

**Also required:** `tier-1-event-state-enabled` metadata, checked in `decorateEvent()` (`event-libs/v1/utils/decorate.js`) *before* `initSessionState()` is even called:

```html
<meta name="tier-1-event-state-enabled" content="true">
```

`event-id` alone is already authored on prod event pages for unrelated purposes, so gating the shared session-store bootstrap on it alone would seed mock data on pages that don't want it. Pages that actually want the sessions-guide store must opt in with both `tier-1-event-state-enabled="true"` and `rainfocus-api-url`.

---

## 4. Implement real Rainfocus API calls ✅ Done

**File:** `event-libs/v1/services/sessions/rainfocus.js`

Every function is currently a stub returning hardcoded data. Replace with real `fetch` calls to the Rainfocus API.

Credentials needed per call: `rfAuthToken` (from FEDS/IMS), `clientId` (IMS userId), `rfApiProfileId` and `rfApiUrl` (from `session-store.js`'s `getApiConfig()`).

---

## 5. Implement the real Mobile Rider API call

**File:** `event-libs/v1/services/sessions/mobile-rider.js`

`fetchLiveStatus(mrStreamIds, env)` currently returns `{ active: new Set(), inactive: new Set(mrStreamIds) }` (always inactive). Replace with the real MR batch status endpoint.

---

## 6. Implement the real sessions API call

**File:** `event-libs/v1/services/sessions/sessions-api.js`

`fetchSessions(apiUrl)` currently returns `normalizeSessions(MOCK_SESSIONS)`. Replace with the real event sessions endpoint; keep `normalizeSessions()`'s output shape.

---

## 7. Pass real credentials in session actions ✅ Done

**File:** `event-libs/v1/services/sessions/session-actions.js`

`scheduleSession()`/`favoriteSession()` (in `session-store.js`, which this file calls) now pass a real jwt-exchanged `rfAuthToken` — no more hardcoded `null`. `clientId` was dropped from the contract entirely (confirmed against real MAX26 traffic and northstar's `determineParams()`: it's only ever sent on the unused `AUTH`/`jwt` endpoint, never on `addSession`/`removeSession`/`toggleSessionInterest`).

---

## localStorage keys ✅ Removed (MWPW-200311)

`sg:dev-auth`/`sessions:scheduled`/`sessions:favorited` and the `seedDevData()`/`loadPersisted()`/`persistScheduled()`/`persistFavorited()` functions that read/wrote them are gone — `session-store.js` no longer touches `localStorage` at all. Real IMS (`BlockMediator`'s `imsProfile`) and a real `myData` call on every load are the sole sources of truth now.

`sessions:scheduled` and `sessions:favorited` are production-worthy; they provide offline persistence and should remain. Only `sg:dev-auth` is mock-only. (These keys were renamed from `sg:scheduled` / `sg:favorited` when the store became shared/page-level rather than specific to this block.)
