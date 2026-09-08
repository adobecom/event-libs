# SWAN Notifications: UNC Dependency Guide

SWAN (Site-Wide Alerts and Notifications) lets an attendee who schedules a session see
a reminder when it's about to go live, and again when it becomes available on-demand.
The reminder is rendered by **UNC**, Adobe's Universal Notification Client — the engine
behind the notification bell embedded in the nav. This guide documents the contract with
UNC — both the engine's own API and the way milo loads and exposes it on the page — as of
the UNC team's official web-host integration wiki ("Local Storage Reminder Campaigns in
UNC Web Host Integration"), cross-checked directly against UNC's own engine source
(`OneAdobe/unc`, branch `anjali1/MAX` — the branch that actually implements the feature the
wiki describes, not `main`).

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
        │  compute timing, register a UNC rule for the current stage (generateNotification:
        │  true fires it immediately; schedule_at/schedule_after control when it's shown),
        │  delete the previous stage's rule
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

## The real UNC contract (per the official wiki, cross-checked against engine source)

UNC is instantiated on the page as `new window.UNC.default(notificationContext)` by
whatever hosts the engine — on pages where UNav is already running (which SWAN requires
anyway), UNC is already initialized by UNav, and this feature uses that shared instance
rather than creating its own. Once that instance is available, it exposes two relevant
named methods:

- **`UpsertReminderFeatureFlag({ type: 'rule', action: 'upsert', campaignRules: [{ campaignId, campaignRule }] })`**
  — registers a rule. Confirmed network-free: registration is a pure in-memory write plus
  (for `local_storage`-tracked campaigns) a localStorage write, no HTTP call. `campaignId`
  casing is not actually load-bearing — the engine's `RulesStore.js` accepts `campaignID`,
  `campaignId`, and a typo'd `campignId`, all three, so this repo's choice of `campaignId`
  is just alignment with the wiki, not a hard requirement. The top-level `type`/`action`
  fields are similarly decorative for this call path — confirmed not read by the direct
  engine handlers, only by a separate CCD/UXP-only inter-plugin IPC layer unreachable from
  a browser — but included anyway for spec alignment.
- **`DeleteReminderFeatureFlag({ type: 'rule', action: 'delete', campaignRules: [{ campaignId }] })`**
  — removes a registered rule's in-memory tracking and (for a rule with a *native*
  local-notification channel) its localStorage record. **See "Known upstream bug" below —
  for a typical local-storage-tracked web campaign like SWAN's, this does not actually
  clear UNC's own persisted rule record.**

**The one field that actually enables persistence**: `campaignRule.session_tracking_mechanism`
must be the literal string `'local_storage'` — confirmed in engine source
(`ReminderManager.ts`'s `isLocalStorageReminder`) to be the switch that routes storage to
`localStorageStore`, writing to the exact key `unc_reminder_tracking_states`, scoped as
`{ userIds: { [userId]: { [category]: { [campaignId]: {...} } } } }` (`category` is usually
the appID, but can be the sentinel `'uncGlobal'`/`'baseUNC'` for global/surface-independent
reminders). Rule fields and UNC-owned tracking fields (`stage`, `event_qualified_timestamp`,
etc.) share the same flat record — never sent by this feature, never colliding with rule
field names.

**Trigger mechanism**: `campaignRule.generateNotification: true` causes UNC to self-inject
a synthesized "host event" using the rule's own `event_details[].event_data` immediately
upon upsert (subject to `cooldown_timestamp` already being complete — always true for a
fresh `campaignId` since this feature never reuses one). This feature sets it unconditionally
on every stage; `channel_details.schedule_at`/`schedule_after` (below) control purely *when*
the resulting notification is *shown*, independent of when it's internally qualified. An
earlier design instead registered a rule and then separately called a distinct
`AnalyticsEventFromHost` method to fire it — that mechanism still exists on the engine as a
general-purpose host-driven trigger, but this wiki's own testing guide never demonstrates it
for reminder campaigns, so this feature no longer uses it.

**`notification_type`/`notification_subtype`**: set to `com.adobe.reminder.v1` (generic,
platform-neutral) and `swan-session-reminder` (this feature's own descriptive constant) —
deliberately not the wiki's own example values (`com.adobe.reminder.v1` /
`com.adobe.ccd.route_path`). The second one has "ccd" (Creative Cloud **Desktop**) baked into
the string, which is backwards for a web integration given the wiki's own "Web vs CCD"
distinction. No evidence either field gates rendering behavior for local notifications (only
`payload.timeline.viewtype` does that per
[swan-notification-content-schema.md](./swan-notification-content-schema.md)) — they read as
informational/categorization only, so there's no reason to borrow a platform-mismatched string.

**`schedule_at`/`schedule_after` are epoch SECONDS, not milliseconds — the wiki says ms, but
this is a documentation bug.** Confirmed against engine source: `ChannelHandler.ts` compares
`schedule_at` directly against `Math.floor(Date.now() / 1000)`, and
`AddNotificationManager.jsx` explicitly does `parseInt(schedule_at, 10) * 1000` to convert to
ms internally. Worth reporting back to the UNC/wiki team — any integrator trusting the
wiki's stated units verbatim will send timestamps 1000x too large.

**A single rule can only ever deliver one notification, ever** — confirmed by reading
`ReminderManager.isValidStageSequence()`/`isLastEventOfJourney()`/`scheduleNextReminderProcess()`:
multi-stage rule chaining is a drop-off/escalation model (only the terminal stage's content
fires, or an earlier stage's content fires as a stall/abandonment fallback), not "the same
notification, edited three times." So this feature registers **three independent
single-stage rules per scheduled session** — `swan-<rfCode>-reminder`,
`swan-<rfCode>-live`, `swan-<rfCode>-ondemand` — and is responsible for calling
`DeleteReminderFeatureFlag` on the previous stage's rule at the exact moment it registers
the next one, or bell entries would stack up (see "Known upstream bug" for why this delete
is currently incomplete on UNC's side). See
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
CDN) — the notification content is always an inline `payload` object (see
[swan-notification-content-schema.md](./swan-notification-content-schema.md)), keeping this
feature network-free.

## Known upstream bug: delete doesn't clean up the local-storage rule record

On engine branch `anjali1/MAX`, `_handleDeleteReminderFeatureFlag`'s only storage-cleanup
call is gated on the deleted campaign having a **native** local-notification channel
(`channel_details.local`, meant for OS-level notifications) — a flag unrelated to
`session_tracking_mechanism === 'local_storage'`. A typical web-host local-storage campaign
(including all three of SWAN's stages) has no native channel, so this gate is false, and
delete never reaches the engine's localStorage cleanup. The rest of the function only clears
in-memory maps.

**Consequence**: this feature's `deleteReminderRule()` call on a superseded stage succeeds
(no error) but doesn't purge UNC's own persisted rule record. On the user's next page reload,
UNC's own restore-on-init logic reads all persisted campaigns back (matching on the record
having an `events` array, unrelated to whether it was ever deleted) and re-registers the
stage — which, since `generateNotification: true`, can self-fire its notification again. **A
stage this feature explicitly deleted can resurrect itself after a reload.**

This is upstream engine behavior, not something introduced by this feature's payload — no
client-side workaround has been implemented, since the only known mitigation would depend on
an undocumented internal filter (`Array.isArray(bucket[track].events)` in
`LocalStorageStore.getPersistedCampaignRules`) that could change without notice. Flagged to
the UNC/`anjali1` team as a bug report, separate from this repo's own work. This feature's
own `swan-notification-state-v2` local state and reconcile ticker remain correct in terms of
what they *attempt* to register/delete — the risk is purely that UNC's bell/Widget could
show a stage this feature believes it has deleted, until the browser tab is closed and
reopened.

## How the page obtains the live UNC instance

- Milo's `global-navigation.js` loads
  `https://{prod,stage}.adobeccstatic.com/unav/1.6/UniversalNav.js` — the nav *shell*, not
  the notification engine itself.
- That shell exposes `window.UniversalNav.getComponent(name)`: for `name === 'notifications'`,
  it dynamically loads a separate webpack chunk (`NotificationLoader.<hash>.bundle.js`),
  which in turn injects the real engine bundle at
  `https://prod.adobeccstatic.com/unc/<version>/UNC-shared.js`, constructs it as
  `new window.UNC.default(config)`, and resolves `getComponent('notifications')` to
  `{ instance }`.
- An earlier live investigation against that resolved `instance` found only a shallow copy
  of the engine's *own* properties (`appContext`, `initializeUNC`, `_uncContainer`, etc.) —
  missing the named prototype methods the wiki now documents as the primary web contract.
  `_uncContainer.handleMessageFromInterface(methodName, data)` was confirmed live to reach
  the same internal handlers. Both paths are now confirmed, by reading the engine source
  directly, to dispatch to byte-identical code — `UNC.UpsertReminderFeatureFlag(data)` is a
  one-line pass-through to `_uncContainer.handleMessageFromInterface('UpsertReminderFeatureFlag',
  data)`. `unc-client.js` tries the direct named method first and falls back to
  `_uncContainer` — compatible with either shape the resolved instance might have. See
  `docs/swan-unc-investigation-summary.md` for the full writeup.
- No dedicated "ready" event exists for this (checked milo's `global-navigation.js` for
  any `dispatchEvent` around gnav/unav decoration — found none for this specifically), and
  `getComponent()` itself resolves `undefined` (caught internally, not thrown) if called
  before the notifications component has actually been initialized. `unc-client.js`'s
  `whenUncReady()` therefore polls (`window.UniversalNav.getComponent('notifications')`
  every 250ms up to an 8s budget) rather than waiting on an event.

**The real remaining dependency this surfaces**: `getComponent('notifications')` only
ever resolves a real instance once the page's gnav has the notifications component
actually configured and initialized — i.e., `universal-nav` page metadata enabling it.
**da-events' pages need this configured** for SWAN to have anywhere to deliver to.

## Configuration

A page opts in with a single boolean metadata flag, `swan-notifications` (value
`"true"`) — no authoring app, no per-event sheet. Everything else is either derived
from data already available (`eventName` from the `tier-1-event-config` metadata
already parsed elsewhere in this repo) or a hardcoded default (5-minute reminder lead
time; a 3-day `localNotificationPersistTillDays` re-show window, sized for a multi-day
conference; icon currently hardcoded to an empty string — no real default asset URL has
been set yet) in
[`swan-config.js`](../event-libs/v1/features/swan-notifications/swan-config.js).

## Verifying the chain end-to-end

1. Confirm the page's gnav has `universal-nav` metadata with the notifications component
   enabled — without this, `getComponent('notifications')` never resolves a real instance
   and everything below silently no-ops.
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
   already reached) — but also see "Known upstream bug" above: a *superseded* stage's
   UNC-side record may still restore on reload independent of this feature's own state.
