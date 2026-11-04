# Multi-time session pages and replays (MWPW-206947)

**Ticket:** [MWPW-206947](https://jira.corp.adobe.com/browse/MWPW-206947)

## Summary

One RainFocus (RF) session maps to one EMC/ESP session and one DA session page,
even when it has multiple scheduled times. The frontend switches that page's
experience as each airing starts and ends. Session Guide presents a card for
each time, with all cards linking to the same session page.

Previously, AEM could generate a separate page for each replay time. The RF-to-DA
flow requires a one-to-one session mapping to support delta syncs, so separate
pages per time are no longer an option. A regional replay with its own RF session
record still has its own page.

## What existed before

Session details already considered multiple time windows for some status and CTA
behavior. However, video playback and catalog mapping primarily used the first
time, and a playlist removed during a state change could not return for a later
on-demand period. Those paths did not provide a complete repeating page journey.

## Implemented features

### Session-page state switching

| Point in the journey | Page experience |
|---|---|
| Before the first airing | Add to schedule; no video in the marquee |
| During an airing | Watch now; no on-demand video in the marquee |
| Between airings | On-demand video in the marquee, subject to existing video availability and DVR rules |
| During a later airing | Returns to Watch now and hides the on-demand video |
| After the final airing | Returns to the on-demand experience |

Playback evaluates all distinct airing windows and schedules updates at their
boundaries, without requiring a page reload. Video and playlist content can hide
and return across successive airings. Stale asynchronous video loads cannot
restore an embed after the page has moved to another playback state.

Existing single-window MobileRider polling, IPOD behavior, and DVR availability
rules are retained; multiple times do not override those existing content rules.

### Per-time Session Guide cards

The catalog produces one entry for each actual session-time row, sorted by start
time. Entries share session content, identity, and page URL, but retain their own
scheduled times. Rendering, detail selection, and dismissal distinguish these
entries instead of collapsing them because they have the same session ID.

### Independent scheduling and calendar entries

Each airing can be added to or removed from the attendee's schedule independently.
Schedule hydration, pending actions, conflict checks, My Sessions, and notification
state use the selected time's identity.

Calendar downloads include only scheduled times. Each selected time has its own
calendar UID and start/end times, while retaining the shared session-page URL.

On the session page, the schedule button prefers an already-scheduled upcoming
time, then the next upcoming time, then an ongoing time. It does not select an
expired airing when choosing among multiple times.

### Shared favorites

Favorites remain session-level. Favoriting one time card updates the favorite
state across all cards for that session and on its session page. Scheduling a time
does not change this shared favorite identity.

### Correct airing selection and broadcast routing

Guide detail links can identify a particular time. Broadcast requests using a
base session ID resolve to its currently live airing rather than the first
catalog entry. Explicit time requests remain exact: an expired or future time
is not silently replaced by a live sibling.

## Actual catalog identity contract

| Field | Meaning and use |
|---|---|
| `sessions[].sessionId` | Shared session identity; remains the normalized entry's `id` |
| `sessionTimes[].sessionId` | Associates a time row with its session |
| `sessionTimes[].sessionTimeId` | Actual time identity used for per-airing UI state and scheduling state |
| `sessionTimes[].externalSessionTimeId` | RF time identifier used by scheduling API calls, through `rfCode` |
| `sessions[].externalSessionId` | RF session identifier used by favorite API calls, through `rfSessionId` |

No composite session IDs are generated. `getSessionKey(session)` uses the actual
`sessionTimeId`, falling back to `id` for entries without a time identifier.
Favorites and favorite pending state continue to use the shared session `id`.

Distinct time IDs alone do not prove that a session has separate replay windows.
The supplied catalog's S6231 has distinct windows but is in-person/on-demand, while
Online session OS231 has two time IDs with identical windows. Playback treats
identical windows as one airing window; format classification is not inferred
from the number of times.

The supplied sample did not contain an Online session with distinct replay
windows. Repeating online playback is therefore covered by regression fixtures,
not claimed as a replay example observed in that sample.

## Implementation areas

- Session catalog, store, state helpers, and ticker.
- Session details, video player, and video playlist.
- Session Guide cards, details, recommendations, scheduling, and calendar export.
- Broadcast selection and player lifecycle.
- SWAN notification reconciliation.

For the detailed identity and routing notes, see
[Session Guide implementation notes](./sessions-guide-implementation-notes.md).

## Verification

The implementation was verified with 98 relevant unit-test files passing, followed
by a passing focused recommendation regression. Repository lint and
`git diff --check` also passed. This is targeted validation, not a claim that the
entire repository test suite passed.

Key regression cases cover shared session IDs with distinct real time IDs,
independent scheduling, shared favorites, exact detail selection, distinct calendar
UIDs, identical-window handling, and video/playlist transitions across airings.

For preview validation, use a playable session with two distinct airing windows:

1. Before its first airing, verify Add to schedule and no marquee video.
2. During each airing, verify Watch now and no on-demand marquee video.
3. Between and after airings, verify the video and eligible playlist return.
4. Schedule one guide card and verify its sibling remains unscheduled; favorite
   either card and verify both reflect the favorite.
5. Schedule both times and verify the calendar contains two events linking to the
   same page. Open each time's detail link and verify the selected time is retained.
