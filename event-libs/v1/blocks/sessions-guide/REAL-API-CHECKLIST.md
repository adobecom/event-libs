# Real API Integration Checklist

Remove or replace every item below once real IMS login and Rainfocus registration APIs are wired up.

---

## 1. Delete the entire dev-mock service

**File:** `services/dev-mock.js`

Delete the whole file. It exists only to seed localStorage with a fake logged-in user.

Also remove its call from `event-libs/scripts/scripts.js`:

```js
// DELETE these lines:
if (['localhost', '127.0.0.1'].includes(window.location.hostname)) {
  const { setupDevUser, seedDevStorage } = await import('../v1/blocks/sessions-guide/services/dev-mock.js');
  setupDevUser();
  seedDevStorage();
}
```

---

## 2. Remove the localhost self-bootstrap in the store

**File:** `store/index.js` — inside `buildInitialState()`

```js
// DELETE this block:
let devAuth = JSON.parse(localStorage.getItem('sg:dev-auth') || 'null');
if (!devAuth && ['localhost', '127.0.0.1'].includes(window.location.hostname)) {
  devAuth = { isLoggedIn: true, isRegistered: true, userFirstName: 'Dev' };
  localStorage.setItem('sg:dev-auth', JSON.stringify(devAuth));
}
```

Also remove the `sg:dev-auth` read that follows it — initial auth state should come entirely from the `IMS_UPDATE` dispatch in the `syncAuth` effect once BlockMediator has a real profile.

---

## 3. Remove the `sg:dev-auth` priority check in `syncAuth`

**File:** `store/index.js` — inside the `syncAuth` function in `useEffect`

```js
// DELETE this block:
try {
  const devAuth = JSON.parse(localStorage.getItem('sg:dev-auth') || 'null');
  if (devAuth) {
    dispatch({
      type: 'IMS_UPDATE',
      isLoggedIn: devAuth.isLoggedIn ?? null,
      isRegistered: devAuth.isRegistered ?? undefined,
      userFirstName: devAuth.userFirstName ?? null,
    });
    return;
  }
} catch { /* ignore */ }
```

After removal, `syncAuth` falls through directly to reading `imsProfile` and `rsvpData` from BlockMediator, which is the correct production path.

---

## 4. Implement real Rainfocus API calls

**File:** `services/rainfocus.js`

Every function is currently a stub returning hardcoded data. Replace with real `fetch` calls to the Rainfocus API.

Credentials needed per call: `rfAuthToken` (from FEDS/IMS), `clientId` (IMS userId), `rfApiProfileId` and `rfApiUrl` (from `eventConfig`).

---

## 5. Pass real credentials in session actions

**File:** `services/session-actions.js`

Two call sites pass `null` for `rfAuthToken` and `clientId`:

- Line ~59: `await removeSession(session.rfCode, null, null, rfApiProfileId, rfApiUrl)`
- Line ~110: `await toggleSessionInterest(session.rfCode, session.id, null, null, rfApiProfileId, rfApiUrl)`
- (and `addSession` just above line 59)

Replace the `null` values with the real token and user ID sourced from the IMS profile on BlockMediator.

---

## localStorage keys used by the mock (safe to clear after migration)

| Key | Purpose |
|-----|---------|
| `sg:dev-auth` | Fake logged-in user — written by `setupDevUser()` and the store self-bootstrap |
| `sg:scheduled` | Persisted scheduled session IDs — keep this, it maps to real user data |
| `sg:favorited` | Persisted favorited session IDs — keep this, it maps to real user data |

`sg:scheduled` and `sg:favorited` are production-worthy; they provide offline persistence and should remain. Only `sg:dev-auth` is mock-only.
