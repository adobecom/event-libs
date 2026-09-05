# Real API Integration Checklist

Remove or replace the item below once the global-nav/feds team ships a real
`window.eventNotificationBridge` (or whatever name they settle on — see
`docs/PROPOSED-NOTIFICATION-API-CONTRACT.md` for the proposed shape and rationale).

---

## 1. Replace the mock bridge

**Files:** `notification-bridge.js`, `mock-notification-bridge.js`

`notification-bridge.js`'s `ensureNotificationBridge()` already feature-detects a real
implementation and only installs the mock when nothing contract-shaped exists at
`window.eventNotificationBridge` — so no call site in `ns-notification.js` needs to
change. Once the real bridge ships:

- Confirm the real global's name/shape matches `docs/PROPOSED-NOTIFICATION-API-CONTRACT.md`
  exactly (`add`/`edit`/`remove`/`list`/`subscribe`, same `NotificationPayload` fields).
  If the real team shipped a different name or shape, update `isContractShaped()` and the
  thin wrappers in `notification-bridge.js` to match — that file is the only place that
  should ever need to change.
- Delete `mock-notification-bridge.js` and its import in `notification-bridge.js`.
- Delete the `?nsDebug=1` debug-panel CSS block in `ns-notification.css`.
- Delete `mock-notification-bridge.test.js` and the "mock installed when absent" case in
  `notification-bridge.test.js` (keep the "real contract-shaped global left untouched"
  case — it's still valid against the real implementation).
