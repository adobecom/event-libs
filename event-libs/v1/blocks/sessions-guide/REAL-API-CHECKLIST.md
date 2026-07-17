# Real API Integration Checklist

Remove or replace every item below once real IMS login and Rainfocus registration APIs are wired up.

> **Note (MWPW-199065):** the dev-mock scaffolding and the Rainfocus/Mobile Rider/sessions services all moved out of this block into shared, page-level modules (`event-libs/v1/utils/session-store.js` and `event-libs/v1/services/sessions/`) so other blocks on the same page can read the same session/auth state. The steps below reference the new locations.

---

## 1. Delete the dev-seeding logic in the shared store

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

## 2. Remove the `sg:dev-auth` priority check in `syncAuth`

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

## 3. Move `rainfocus-api-url` / `rainfocus-api-profile-id` from mock metadata to real values

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

## 4. Implement real Rainfocus API calls

**File:** `event-libs/v1/services/sessions/rainfocus.js`

Every function is currently a stub returning hardcoded data. Replace with real `fetch` calls to the Rainfocus API.

Credentials needed per call: `rfAuthToken` (from FEDS/IMS), `clientId` (IMS userId), `rfApiProfileId` and `rfApiUrl` (from `session-store.js`'s `getApiConfig()`).

---

## 5. Implement the real Mobile Rider API call

**File:** `event-libs/v1/services/sessions/mobile-rider.js`

`fetchLiveStatus(mrStreamIds, env)` currently returns `{ active: new Set(), inactive: new Set(mrStreamIds) }` (always inactive). Replace with the real MR batch status endpoint.

---

## 6. Real sessions API call — done, pending real `event-id` metadata

**File:** `event-libs/v1/services/sessions/sessions-api.js`

`fetchSessions(eventId)` now calls the real ESL/ESP catalog endpoint
(`GET {serviceApiEndpoints.esp}/v1/events/{eventId}/sessions`) via `fetchEslSessions()` +
`mapEslPayloadToRawSessions()`, and only falls back to `MOCK_ESL_PAYLOAD` when `eventId` is
falsy. `event-id` metadata is read in `session-store.js`'s `initSessionState()` and passed
through — **no further code change needed here**; this activates automatically once a page
authors real `event-id` metadata (today, per item 3's note, `event-id` is already present
on prod pages for unrelated purposes, but hasn't been verified to resolve against the real
ESL/ESP backend for sessions-guide specifically).

Known gaps in the real mapping (not blockers, just incomplete real-data coverage):
- `resources[]` always `[]` — backend hasn't shipped this field yet.
- `mrStreamId` always `null` — video/stream data is deliberately stripped from this public
  endpoint until a session goes live; needs a different, likely time-gated/authenticated
  fetch once that's designed.
- Sessions with multiple `sessionTimes` (recurring/repeated) only surface their earliest
  occurrence.
- `CategoryBadge`'s icon set (`BADGE_MAP`) and `eventConfig.trackIcons` were built for mock
  vocabulary and don't cover all real `Track`/`Primary Track for Agenda` label values yet —
  a content/design task, not a code gap.

---

## 7. Pass real credentials in session actions

**File:** `event-libs/v1/services/sessions/session-actions.js`

Call sites pass `null` for `rfAuthToken` and `clientId` (via `event-libs/v1/utils/session-store.js`'s `scheduleSession()` / `favoriteSession()`, which these call):

- `scheduleSession()` → `addSession(session.rfCode, null, null, apiConfig.profileId, apiConfig.apiUrl)` / `removeSession(...)`
- `favoriteSession()` → `toggleSessionInterest(session.rfCode, session.id, null, null, apiConfig.profileId, apiConfig.apiUrl)`

Replace the `null` values with the real token and user ID sourced from the IMS profile on `BlockMediator`.

---

## localStorage keys used by the mock (safe to clear after migration)

| Key | Purpose |
|-----|---------|
| `sg:dev-auth` | Fake logged-in user — written by `seedDevData()` and read by `syncAuth()`, both in `session-store.js` |
| `sessions:scheduled` | Persisted scheduled session IDs — keep this, it maps to real user data |
| `sessions:favorited` | Persisted favorited session IDs — keep this, it maps to real user data |

`sessions:scheduled` and `sessions:favorited` are production-worthy; they provide offline persistence and should remain. Only `sg:dev-auth` is mock-only. (These keys were renamed from `sg:scheduled` / `sg:favorited` when the store became shared/page-level rather than specific to this block.)
