# SWAN Notifications: UNC Dependency Guide

SWAN (Site-Wide Alerts and Notifications) lets an attendee who schedules a session see
a reminder when it's about to go live, and again when it becomes available on-demand.
The reminder is rendered by **UNC**, Adobe's notification-bell widget inside milo's
global navigation. This guide documents the (currently unconfirmed) contract with UNC
and the open questions that must be resolved with the UNC team before this goes live.

Implementation lives in
[`event-libs/v1/features/swan-notifications/`](../event-libs/v1/features/swan-notifications/).
There is no authoring app and no per-event configuration anymore — see
[Configuration](#configuration) below.

## How this works

Everything is client-side, on-device only. There is no server component:

```
RainFocus (schedule source of truth)
        │  session-store.js: toggleSchedule() / scheduled signal
        ▼
event-libs SWAN feature (this repo)
        │  compute timing, build an entry, diff against what's already in UNC's
        │  store (filtered to entries this feature created)
        ▼
UNC's local notification store (window.feds.data.notifications, or wherever the
UniversalNav bundle actually exposes it — see Open Questions)
        │  itself localStorage-backed
        ▼
UNC bell UI
```

No ANS (Adobe Notification Service), no ESP bookkeeping resource, no cross-device
sync. A user's notification state can be out of sync between two of their own devices
— all that matters is that RainFocus (what's scheduled) and UNC (what's shown) agree
**on the device the tab is open on**.

Because there's no server-side scheduled delivery, timed transitions (the T-5-minute
reminder, the live/on-demand badge flips) are computed client-side and only get applied
while a tab happens to be open at the right moment — see
[`session-state-ticker.js`](../event-libs/v1/services/sessions/session-state-ticker.js),
which SWAN's reconcile pass now rides on. If the tab isn't open when a trigger time
passes, that transition silently doesn't happen until the tab is reopened and the next
tick (or the on-load reconcile) catches up. This is an accepted trade-off, not a bug.

## The UNC contract (unconfirmed — placeholder)

There is currently no known, documented client-side API into UNC anywhere in `milo`,
`event-libs`, or `da-events` — the previous design routed everything through ANS
specifically because UNC was believed to only render what ANS delivered it. This
feature is built against a **placeholder** shape for a local UNC store, modeled on
legacy AEM gnav's notifications clientlib:

- Exposed at `window.feds.data.notifications` (via `exposeData({ path:
  'data.notifications', data: store })`), with a `feds.data.notifications.loaded`
  event fired once available.
- Backed by `localStorage` itself, under a key like `feds-notifications_<locale>`.
- Public API: `get()`, `add(entry)`, `remove(identifier)`, `update(dataArray)`,
  `edit(id, partialData)`, `clear()`, `subscribe(event, cb)` / `unsubscribe(...)`.

See [`unc-store.js`](../event-libs/v1/features/swan-notifications/unc-store.js) for
the (single) place this shape is assumed — update that file once the real contract is
confirmed.

## Open questions for the UNC team

These block real, verified end-to-end behavior — everything above is designed
against the placeholder shape and needs confirmation:

1. **What is the actual global/path** in the current UniversalNav bundle that
   `da-events` loads (via milo's `global-navigation.js` →
   `adobeccstatic.com/unav/<version>/UniversalNav.js`)? Is it really
   `window.feds.data.notifications`, or a differently-namespaced equivalent — e.g.
   under `window.UniversalNav` itself, alongside its existing `getComponent()`/
   `reload()` surface?
2. **What entry schema** does `add(entry)`/`edit(id, partialData)` expect
   (title/message/url/icon/timestamp/expiry/read-state/category), and what's
   required vs. optional?
3. **What does `remove(identifier)` take** — a caller-supplied id (so our
   deterministic `swan-${rfCode}` scheme works), or an id the store assigns back
   from `add()` that we'd have to capture?
4. **Does an entry auto-expire/hide** once some timestamp field passes, or must we
   explicitly `edit()`/`remove()` it ourselves at on-demand time?
5. **Is the store shared across products** in one `localStorage` key with no
   product-scoping field, or does it already support a `source`/category tag we
   should use so our diff logic never touches another team's entries? (This
   feature already tags every entry it creates with `source: 'swan-events'` —
   see [`swan-payload.js`](../event-libs/v1/features/swan-notifications/swan-payload.js)
   — assuming the field is at least harmless to include even if UNC doesn't act on it.)
6. **Timing/readiness** — can we reliably wait on a `feds.data.notifications.loaded`
   (or equivalent) event before the first `add()` call, and is there any race with
   SWAN's own page-load init to worry about?
7. **Does `universal-nav` gnav metadata / `unav.uncAppId` config still matter** at
   all now that we're not routing through ANS, or was that purely an ANS-routing
   concern we can now ignore?

## Configuration

A page opts in with a single boolean metadata flag, `swan-notifications` (value
`"true"`) — no authoring app, no per-event sheet. Everything else is either derived
from data already available (`eventName` from the `tier-1-event-config` metadata
already parsed elsewhere in this repo) or a hardcoded default (5-minute reminder lead
time; icon/image currently hardcoded to empty strings — no real default asset URL has
been set yet) in
[`swan-config.js`](../event-libs/v1/features/swan-notifications/swan-config.js).

## Verifying the chain end-to-end

1. Add `<meta name="swan-notifications" content="true">` to a test page that already
   has `tier-1-event-config` metadata.
2. Schedule a session as a signed-in test user. Once the UNC contract above is
   confirmed and `unc-store.js` is updated accordingly, inspect the real store (per
   its confirmed global) and confirm an entry with id `swan-<rfCode>` appears once the
   session's reminder trigger time has passed and a tick has run.
3. Let the session cross its live/on-demand boundaries with the tab open; confirm the
   entry updates via `edit()` rather than duplicating.
4. Unschedule the session; confirm the entry is removed.
5. Reload mid-cycle; confirm no duplicate entry is created (the local
   `swan-notification-state` `localStorage` key prevents re-adding a stage already
   applied).
6. Dismiss the notification via the real UNC bell UI, then trigger a reconcile
   (schedule/unschedule another session, or wait for the next tick); confirm the
   dismissed entry is **not** recreated.
