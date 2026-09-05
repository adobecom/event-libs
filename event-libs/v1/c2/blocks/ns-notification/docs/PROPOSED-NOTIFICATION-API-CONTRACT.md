# Proposed client notification-push contract

## Why this exists

`ns-notification` (this block) needs a way to tell the site's bell icon "the user has a
session starting soon / live now / available on-demand" — computed entirely client-side
from the user's RainFocus schedule, with no server push involved (the same model as
northstar's old `NotificationsService.js`, which wrote into
`window.feds.data.notifications`).

That global is gone. Today's Milo global nav only exposes
`window.UniversalNav.getComponent('notifications')`, a server-driven, backend-fetched
widget keyed by `appID` — there is no way for a page to push a client-computed
notification into it. (`event-libs` PR #276 confirmed this the hard way, then
reverse-engineered an undocumented internal engine call —
`instance._uncContainer.handleMessageFromInterface('UpsertReminderFeatureFlag', ...)` —
to work around it. We are deliberately not using that path here: it's an internal,
unstable contract belonging to a "campaign rule" engine, not a supported public API.)

**This document is a formal ask to the global-nav/feds team**: please expose a small,
simple, supported client-push contract shaped like this. Until it exists, this block
runs against a local mock (`mock-notification-bridge.js`) that implements the exact same
shape, so the feature is fully functional and demoable today.

## Proposed contract

A new global, `window.eventNotificationBridge` — deliberately **not** `window.feds`
(defunct) and **not** the existing `window.UniversalNav.getComponent('notifications')`
component (a different, real, server-driven surface — reusing its name/slot would create
ambiguity about which contract a given call belongs to):

```ts
interface NotificationPayload {
  id: string;            // stable per notification; this block uses the session's id
  label: 'reminder' | 'live' | 'on-demand';
  title: string;         // e.g. the event name
  message: string;       // e.g. the session title
  url: string;           // absolute session/watch page URL
  startTimeUtc: string;  // ISO 8601
  endTimeUtc: string;    // ISO 8601
  createdAt: number;     // epoch ms, when this entry was last written
}

interface EventNotificationBridge {
  // Adds a new notification entry. Returns true if accepted.
  add(notification: NotificationPayload): boolean;

  // Patches an existing entry in place — used for reminder -> live -> on-demand
  // transitions, so the bell UI can update an existing entry instead of a
  // remove-then-add flicker. Returns true if the id existed and was updated.
  edit(id: string, patch: Partial<NotificationPayload>): boolean;

  // Removes an entry (e.g. the user unscheduled the session). Returns true if it existed.
  remove(id: string): boolean;

  // Synchronous snapshot of all currently active entries.
  list(): NotificationPayload[];

  // Notified on every add/edit/remove, called immediately with the current list on
  // subscribe. Returns an unsubscribe function.
  subscribe(fn: (list: NotificationPayload[]) => void): () => void;
}
```

## Write-result semantics this block relies on

`ns-notification.js` treats the boolean return values as meaningful, not decorative —
it self-heals off them rather than trusting its own local state blindly:

- `add()` returning `false` means "not accepted" — the entry is *not* recorded as pushed,
  so the next recompute cycle retries with a fresh `add()` for the same id.
- `edit()` returning `false` means "this id doesn't exist in your store anymore" (e.g. the
  user dismissed it from the bell UI) — the entry is dropped from this block's local
  `lastPushed` map, so the next transition retries via `add()` instead of `edit()` against
  an id that's never coming back.
- `remove()`'s return value isn't load-bearing either way — this block always forgets the
  id locally once it calls `remove()`, whether or not it existed on your side.

Please preserve these semantics (rather than always returning `true`, or throwing instead
of returning `false`) — they're what keeps this block's local state from permanently
diverging from the real bell if a write is ever rejected.

## Open questions for the global-nav/feds team

- Is `window.eventNotificationBridge` an acceptable name/slot, or is there an existing
  cross-team convention for this kind of page-level, client-authored integration point we
  should conform to instead?
- Any expected upper bound on concurrent entries per user we should design around (this
  block never pushes more than one entry per currently-scheduled session)?
- Should `add`/`edit`/`remove` be synchronous (as proposed) or `Promise`-returning? This
  block currently assumes synchronous, matching the old `window.feds.data.notifications`
  shape — happy to adjust if the real implementation needs to be async (e.g. it persists
  server-side).

## Why simple CRUD is sufficient here

This block only ever needs one thing: "here is the current, correct set of
notifications for sessions this user has scheduled — please show them." It always
computes the full desired state and diffs it locally before calling `add`/`edit`/`remove`
for just the delta (see `reminder-state.js`'s `diffNotificationState`) — the bridge itself
doesn't need any scheduling, campaign, or rule-matching logic. A plain CRUD store (the
same shape northstar's old `window.feds.data.notifications` already had) is enough.

## What changes once this ships

See `../REAL-API-CHECKLIST.md`.
