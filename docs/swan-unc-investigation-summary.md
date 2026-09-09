# SWAN / UNC: Findings and Required Fix

## Conclusion

PR #276's approach is viable. No redesign is needed. `unc-client.js` calls the wrong
object path to reach the reminder-scheduling API — a one-line fix, not an
architectural blocker. FEDS is not involved in the gap. The only real dependency left
is on the UNC/UniversalNav team, to formalize an API path that currently works but
isn't a documented contract.

## Gnav / UNAV architecture

- Milo runs two separate, independently-selected gnav systems, chosen by the
  `foundation` metadata key:
  - **Classic gnav** (`foundation` unset, most of adobe.com) — Milo-owned JS with a
    native profile-dropdown fallback when UNAV is off.
  - **C2 gnav** (`foundation: c2`, used by MAX/event pages) — a thin Milo wrapper that
    delegates entirely to a `federal`-built bundle. There is no native fallback for
    anything in this path — profile, notifications, and app-switcher are 100%
    UNAV-delegated. If UNAV is off, the utilities bar is simply absent.
- For `foundation: c2` pages, `header: global-navigation` + `unav: on` is the correct
  and complete switch to enable UNAV. It's all-or-nothing: there is no partial/native
  mode.
- `universal-nav` (a comma list, e.g. `profile,appswitcher,notifications`) is a
  separate, second-stage setting: once UNAV is on, it selects which specific
  components UNAV activates. `profile` always renders regardless of the list.
- Metadata sheet rows merge top-down by URL specificity (per `adobe/helix-html-pipeline`'s
  `Modifiers.fromModifierSheet`): a blank cell in a more specific row is dropped during
  parsing and never overrides a value a broader row already set. As a result, MAX 2026
  pages already inherit `unav: on` and `universal-nav: profile,appswitcher,notifications`
  from the root `/**` row, confirmed live (`window.UniversalNav` exists on the page).
  **Action:** author these values explicitly on the event-specific rows rather than
  relying on inheritance from a default not written for events.

## FEDS is not a blocker

FEDS's only responsibilities are (1) deciding whether to load UNAV (`unav` metadata)
and (2) declaring which components to request (`universal-nav` metadata). Both work
correctly today. Everything downstream of that — what `getComponent()` returns and
what's on it — is entirely inside UNAV's own bundle and the UNC engine it lazy-loads.
FEDS has no code path that touches it. Any remaining question belongs to the
UNC/UniversalNav team, not FEDS.

## Root cause: the reminder API is reachable, but not through the top-level object

`window.UniversalNav.getComponent('notifications')` resolves a real UNC engine
instance for signed-in users (it doesn't resolve for signed-out users by design —
irrelevant here, since scheduling a session already requires sign-in).

That instance is missing `UpsertReminderFeatureFlag`, `DeleteReminderFeatureFlag`, and
`AnalyticsEventFromHost` as direct properties, because those three are defined as
regular class methods on the engine class's *prototype*, while whatever UNAV does to
package the instance for external callers only preserves *own* instance properties
(`appContext`, `initializeUNC`, `_uncContainer`, etc.) — a shallow, non-prototype-
preserving copy.

`_uncContainer` — one of the surviving own properties — is the internal object those
three missing methods call into anyway; each is a one-line pass-through to
`_uncContainer.handleMessageFromInterface(methodName, data)`. Calling
`instance._uncContainer.handleMessageFromInterface('UpsertReminderFeatureFlag', payload)`
directly reaches the real engine (verified live: the call surfaced
`UNCEngine: ReminderTracker: handleReminderFeatureData`, the real internal handler,
rejecting a placeholder test payload — proof the message is processed, not dropped).

**Fix:** `unc-client.js` should call
`instance._uncContainer.handleMessageFromInterface(methodName, payload)` in place of
`instance[methodName](payload)`.

**Risk:** `_uncContainer` is an underscore-prefixed internal field, not a documented
public contract. It works today but could change without notice.

## Action items

1. Confirm end-to-end with a real payload (`swan-payload.js`'s `buildStageCampaignRule()`
   shape) that a live notification appears via this path.
2. Update `unc-client.js` to call through `_uncContainer.handleMessageFromInterface(...)`.
3. Author `unav: on` and `universal-nav: profile,appswitcher,notifications` explicitly
   on event-specific metadata rows.
4. Ask the UNC/UniversalNav team to either bless the `_uncContainer` path officially or
   restore the convenience wrapper methods on the object returned to external callers.
5. Take PR #276 out of draft once (1) and (2) are done.

## Resolution

Item 2 is done. `unc-client.js`'s three exported functions now call through
`_uncContainer.handleMessageFromInterface(methodName, payload)` via a single private
`callUnc()` choke point, and `isUncInstance()` now gates on
`_uncContainer.handleMessageFromInterface` existing instead of the three (never-present)
top-level methods — the latter was a second, previously-undocumented bug: without also
fixing the gate, `whenUncReady()` would keep rejecting every real instance and time out,
regardless of the call-site fix. All three affected test files
(`unc-client.test.js`, `swan-notifications.test.js`, `session-store-swan-hook.test.js`)
were updated to mock and assert against the new shape; full suite and lint are green.

Item 1 is partially done: `unc-client.test.js` gained a test that pipes
`buildStageCampaignRule()`'s real output through `registerReminderRule()` and asserts the
exact production payload reaches `_uncContainer.handleMessageFromInterface` unchanged.
That was additionally exercised on a real stage page (`gnav-notification-test-1`) using
the PR's devtools stub in place of the real engine: scheduling a session there produced
the expected `REGISTER`/`FIRE` console output and a correct `swan-notification-state-v2`
localStorage entry, confirming the full `session-store.js` → `swan-notifications.js` →
`unc-client.js` chain wires together correctly against real page metadata and DOM — but
this still stubs out the engine itself, so it doesn't confirm the real `_uncContainer`
path. On that same page, the real UNC bell panel did not visibly render anything;
`UNC-shared.js` was independently failing `ans/v2/notifications/timeline` and
`ans/v2/notifications/search` with 401s in that stage session — an ANS auth issue in that
environment, unrelated to this fix (SWAN's reminder is a `local: true` rule and never
calls ANS), but it means the bell panel couldn't be used there to visually confirm the
real engine either. Live confirmation against the real, unstubbed engine (QA Test Plan
case J / #24 in PR #276) is still outstanding.

Items 3 and 4 remain open and are not code changes: 3 is a content-authoring task on the
event pages' own metadata sheet (outside both this repo and milo); 4 is a cross-team ask
to the UNC/UniversalNav team. Neither blocks item 5.

Item 5: PR #276's description has been updated to reflect this resolution. Taking it out
of draft is left as an explicit call for the PR author, pending the live QA in item 1.

## Resolved: direct-call pattern is the documented primary path for web hosts

UNC's own official web-host integration wiki ("Local Storage Reminder Campaigns in UNC Web
Host Integration") now documents named methods called directly on the resolved instance
(`unc.UpsertReminderFeatureFlag(payload)`, etc.) as the primary contract for web hosts. This
settles the question raised in an earlier draft of this doc — not by cross-referencing the
Photoshop/Adobe Home `nest/nest` PR #5275, which was a different client on a different stack
(CCD/native, not web) and was only ever a loose, unverified hint, never evidence. The wiki is
the authoritative source for this repo's integration.

Reading UNC's actual engine source (`OneAdobe/unc`, branch `anjali1/MAX`) directly confirms
`unc.UpsertReminderFeatureFlag(data)`/`DeleteReminderFeatureFlag(data)` are one-line
pass-throughs to `_uncContainer.handleMessageFromInterface(methodName, data)` — the exact
same internal handler, byte-identical dispatch. `unc-client.js`'s existing dual-path
`callUnc()` (try the direct method first, fall back to `_uncContainer`) already handles this
correctly with no code change needed — it was designed for exactly this kind of contract
ambiguity before the ambiguity was resolved.

The general-purpose `AnalyticsEventFromHost` host-driven-trigger mechanism this doc
previously discussed for reminder campaigns is now moot for SWAN specifically — this feature
no longer uses it, having switched to `generateNotification: true` +
`schedule_at`/`schedule_after` per the wiki's own demonstrated pattern (see
`docs/swan-unc-dependencies.md`). The general `_uncContainer`-fallback finding for
`UpsertReminderFeatureFlag`/`DeleteReminderFeatureFlag` themselves remains valid and in use.

**On which instance to call these methods on**: the wiki's own testing guide settles this too
— its Step 1 explicitly says *"On an Adobe page where UNav is running, UNC is already
initialized by UNav — use that instance instead"* of constructing a new
`new window.UNC.default(...)`. This confirms this feature's design (reusing UNav's shared
instance via `getComponent('notifications')`, never constructing a second instance) is the
wiki's own prescribed pattern for a page like ours, not a workaround. What the wiki does NOT
address is whether that reused instance actually exposes the named methods directly — its
examples only ever show `unc.UpsertReminderFeatureFlag(...)` called on "the instance," without
distinguishing a freshly-constructed one from one obtained through UNav. The
`_uncContainer.handleMessageFromInterface` fallback below exists purely to cover the
possibility that it doesn't, a gap this repo's own investigation found, not something the
wiki documents or anticipates.

An earlier pass of this same source-verification cross-check misread
`_handleDeleteReminderFeatureFlag`'s `channel.channel_details?.local` gate as a "native
OS-notification channel" check distinct from web/local-storage campaigns, and concluded
`DeleteReminderFeatureFlag` never cleans up a SWAN campaign's persisted record. That gate is
actually the same `local: true`/`false` field the wiki documents (local vs. server-delivered
notification), which SWAN sets to `true` on every stage — so the cleanup path is always
reached for SWAN's campaigns. Live testing against a real UNC engine build confirmed deletes
succeeding (`LocalStorageStore: deleteTrackingData` removing each superseded stage's record).
The earlier "known upstream bug" finding was retracted; no bug report was filed with the UNC
team.

## Independent re-verification against the real engine bundle + the wiki PDF

A later pass re-derived every claim above directly from a fresh download of the production
engine bundle (`UNC-shared.js`, version `10.0.1067`) and the UNC team's own PDF ("Local
Storage Reminder Campaigns in UNC Web Host Integration"), rather than relying on the prior
investigation's notes. All of it held up unchanged: `UpsertReminderFeatureFlag`/
`DeleteReminderFeatureFlag` are confirmed prototype methods on the `UNC` class (defined via
`UNC_createClass(UNC, [...])`), each a one-line pass-through to
`_uncContainer.handleMessageFromInterface`; `schedule_at` is confirmed epoch seconds via
`AddNotificationManager`'s `parseInt(msgData.schedule_at, 10) * 1000` and `ChannelHandler`'s
`Math.floor(Date.now() / 1000)` comparison, contradicting the wiki's stated "ms"; and
`LocalStorageStore.deleteTrackingData` is confirmed to `delete bucket[track]` and
`saveState(...)`, a real, complete removal — the "known upstream bug" retraction above is
accurate.

**Following this reconfirmation, `unc-client.js`'s `_uncContainer` fallback has been removed.**
Now that official support for the wiki's documented direct-method contract is expected, this
repo commits fully to it: `callUnc()` calls `instance[methodName](payload)` directly, with no
fallback branch, and `isUncInstance()` gates only on the two named methods existing. This is a
real behavior change from the "Resolution" section above (which kept the dual-path design) —
an instance that only exposes `_uncContainer.handleMessageFromInterface`, with no direct
methods, is no longer treated as ready. All three affected test files were updated to mock
only the direct-method shape.
