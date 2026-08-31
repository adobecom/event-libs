# SWAN Notifications: UNC Dependency Guide

SWAN (Site-Wide Alerts and Notifications) lets an attendee who schedules a session see
a reminder when it's about to go live, and again when it becomes available on-demand.
The reminder is rendered by **UNC**, Adobe's Universal Notification Client — the engine
behind the notification bell embedded in the nav. This guide documents the real,
source-confirmed contract with UNC — both the engine's own API and the way milo actually
loads and exposes it on the page, verified by fetching and inspecting the real deployed
bundles (`prod.adobeccstatic.com/unav/1.6/UniversalNav.js` and its lazily-loaded
`NotificationLoader` chunk), not just the two source repos in isolation.

Implementation lives in
[`event-libs/v1/features/swan-notifications/`](../event-libs/v1/features/swan-notifications/).
There is no authoring app and no per-event configuration — see
[Configuration](#configuration) below.

## How this works

Everything is client-side, on-device only. There is no server component:

```
RainFocus (schedule source of truth)
        │  session-store.js: toggleSchedule() / scheduled signal
        ▼
event-libs SWAN feature (this repo)
        │  compute timing, register a UNC rule for the current stage, fire its matching
        │  host event, delete the previous stage's rule
        ▼
window.UniversalNav.getComponent('notifications')   (milo's gnav, already on the page)
        │  lazily loads NotificationLoader chunk → loads the real UNC engine bundle
        │  (adobeccstatic.com/unc/<version>/UNC-shared.js) → constructs it, resolves
        │  { instance }
        ▼
UNC engine instance (unc-client.js)
        ▼
UNC bell UI
```

No ANS (Adobe Notification Service), no ESP bookkeeping resource, no cross-device sync.
A user's notification state can be out of sync between two of their own devices, and
**two tabs open on the same device will each independently fire the same transition**
(there's no dedupe/read-back API in the real contract to prevent this — an accepted,
known limitation, not a bug) — the only real requirement is that RainFocus (what's
scheduled) and UNC (what's shown) roughly agree on the device/tab the user is using.

## The real UNC contract (confirmed by reading `ccxi-unc`'s source — not a guess)

An earlier version of this feature was built against a guessed CRUD `Store` API
(`get()/add()/remove()/edit()`). A real copy of UNC's engine source (`ccxi-unc`) was used
to validate that guess, across six rounds of investigation reading actual method bodies.
**The guess was wrong.** The real contract:

UNC is instantiated on the page as `new UNC({ applicationContext: { appID } })` by
whatever hosts the engine inside milo's nav. Once that instance is available, it exposes
three relevant methods:

- **`UNC.UpsertReminderFeatureFlag({ campaignRules: [{ campaignID, campaignRule }] })`**
  — registers a rule. Confirmed network-free: registration is a pure in-memory write
  (`ReminderTracker.handleReminderFeatureData`), no HTTP call.
- **`UNC.AnalyticsEventFromHost(eventObject)`** — the host-driven trigger. Matches
  `eventObject`'s fields against every registered rule's `event_data`; on a full match,
  fires that rule's notification channel. Also network-free and synchronous.
- **`UNC.DeleteReminderFeatureFlag({ campaignRules: [{ campaignID }] })`** — removes a
  registered rule (and, as a side effect, the bell entry it produced). This only works
  for a rule that was actually registered via `UpsertReminderFeatureFlag` first — there
  is no way to remove a notification that was never registered as a rule.

**A single rule can only ever deliver one notification, ever** — confirmed by reading
`ReminderManager.isValidStageSequence()`/`isLastEventOfJourney()`/`scheduleNextReminderProcess()`:
multi-stage rule chaining is a drop-off/escalation model (only the terminal stage's content
fires, or an earlier stage's content fires as a stall/abandonment fallback), not "the same
notification, edited three times." So this feature registers **three independent
single-stage rules per scheduled session** — `swan-<rfCode>-reminder`,
`swan-<rfCode>-live`, `swan-<rfCode>-ondemand` — and is responsible for calling
`DeleteReminderFeatureFlag` on the previous stage's rule at the exact moment it registers
and fires the next one, or bell entries would stack up. See
[`swan-payload.js`](../event-libs/v1/features/swan-notifications/swan-payload.js)'s
`buildStageCampaignRule()` and
[`swan-notifications.js`](../event-libs/v1/features/swan-notifications/swan-notifications.js)'s
`applyStage()`.

A `local: true` notification channel with a **`schedule_at`** (absolute epoch seconds) is
held back by UNC's own engine and fired later by its internal ~60-second poller — no host
timer required. This feature uses it for the reminder stage only: it's registered once,
at schedule-time, with `schedule_at` baked in, so UNC's own poller delivers it on time.
Live/on-demand transitions still need this feature's own ticker to decide *when* (there's
no way to express "become live when the previous stage's condition ends" declaratively),
so those are registered with `schedule_after: 0` (fire immediately) exactly when the
ticker determines the transition is due. Never set `contentURL` (fetches from Adobe's ODIN
CDN) or a `tracking_server` session-tracking mechanism — either would reintroduce a
network dependency; the payload is always a static JSON string, and `session_tracking` is
left unset.

## How the page obtains the live UNC instance (now confirmed, not guessed)

An earlier version of this doc flagged this as the one open question — it isn't anymore.
Fetched the actual bundles milo loads and inspected them directly (not just the two
source repos):

- Milo's `global-navigation.js` loads
  `https://{prod,stage}.adobeccstatic.com/unav/1.6/UniversalNav.js` (confirmed: this repo
  is separate from `ccxi-unc` — it's the nav *shell*, not the notification engine).
  Grepping the fetched bundle found **no `window.feds` anywhere** — that was the old
  guess, and it's simply wrong for this bundle.
- That shell exposes `window.UniversalNav.getComponent(name)` — confirmed by reading its
  actual (minified but readable) source: for `name === 'notifications'`, it dynamically
  loads a separate webpack chunk (`NotificationLoader.<hash>.bundle.js`), which in turn
  `LoadJS`-injects the real engine bundle at
  `https://prod.adobeccstatic.com/unc/10.0/UNC-shared.js` (matching `ccxi-unc`'s own
  webpack build output naming), constructs it as `new window.UNC.default(config)`, and
  resolves `getComponent('notifications')` to `{ instance }`. Confirmed `instance` exposes
  the engine's methods directly — the same bundle calls `instance.ShowNotification`/
  `HideNotification` this way — so `instance.UpsertReminderFeatureFlag`/
  `DeleteReminderFeatureFlag`/`AnalyticsEventFromHost` are the same calls documented above.
- No dedicated "ready" event exists for this (checked milo's `global-navigation.js` for
  any `dispatchEvent` around gnav/unav decoration — found none for this specifically), and
  `getComponent()` itself resolves `undefined` (caught internally, not thrown) if called
  before the notifications component has actually been initialized. `unc-client.js`'s
  `whenUncReady()` therefore polls (`window.UniversalNav.getComponent('notifications')`
  every 250ms up to an 8s budget) rather than waiting on an event.

**The real remaining dependency this surfaces**: `getComponent('notifications')` only
ever resolves a real instance once the page's gnav has the notifications component
actually configured and initialized — i.e., `universal-nav` page metadata enabling it,
the same mechanism milo's `applicationContext.appID`/`uncConfig` are threaded through.
**da-events' pages need this configured** for SWAN to have anywhere to deliver to — this
is now the one open coordination item, replacing the old instance-handoff question.

## Configuration

A page opts in with a single boolean metadata flag, `swan-notifications` (value
`"true"`) — no authoring app, no per-event sheet. Everything else is either derived
from data already available (`eventName` from the `tier-1-event-config` metadata
already parsed elsewhere in this repo) or a hardcoded default (5-minute reminder lead
time; a 3600-second `schedule_time_buffer` so a backgrounded/throttled tab doesn't cause
UNC to drop a reminder as "stale"; icon/image currently hardcoded to empty strings — no
real default asset URL has been set yet) in
[`swan-config.js`](../event-libs/v1/features/swan-notifications/swan-config.js).

## Verifying the chain end-to-end

1. Confirm the page's gnav has `universal-nav` metadata with the notifications component
   enabled (see the coordination item above) — without this, `getComponent('notifications')`
   never resolves a real instance and everything below silently no-ops.
2. Add `<meta name="swan-notifications" content="true">` to a test page that already
   has `tier-1-event-config` metadata.
3. Schedule a session ~2 minutes out as a signed-in test user. Leave the tab open;
   confirm a bell entry appears once the reminder's `schedule_at` time arrives, without
   any further action from this code (validates UNC's own poller).
4. Let the session cross its live boundary with the tab open; confirm the reminder's bell
   entry is removed and a new one appears for "live" (not both at once, and not a
   duplicate of "live").
5. Let it cross the on-demand boundary; confirm the same for "live" → "on-demand".
6. Unschedule the session at any stage; confirm its currently-active bell entry is removed.
7. Reload mid-cycle; confirm no duplicate entry is created (the local
   `swan-notification-state-v2` `localStorage` key prevents re-registering a stage
   already reached).
