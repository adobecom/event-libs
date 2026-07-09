# Using Shared Session State From Other Blocks

Session, favorite, scheduled, and auth state for the event live in a page-level module —
`event-libs/v1/utils/session-store.js` — not inside the Sessions Guide block. Any block on
the page can read and mutate the same state, whether it's built with Preact or vanilla JS.
This doc shows how.

## What's available

| Module | Exports | Use for |
|---|---|---|
| `event-libs/v1/utils/session-store.js` | Signals: `sessions`, `sessionsStatus`, `liveStreamActiveIds`, `favorited`, `scheduled`, `auth`, `pendingActions`. Function: `getApiConfig()` | Reading state |
| `event-libs/v1/services/sessions/action-feedback.js` | `scheduleWithFeedback(session, opts)`, `favoriteWithFeedback(session, opts)` | Mutating state (recommended — includes the auth gate, conflict detection, and toast feedback) |
| `event-libs/v1/services/sessions/session-actions.js` | `scheduleAction(session, opts)`, `favoriteAction(session)`, `SessionActionError` | Lower-level mutations, only if you need custom feedback UI instead of the shared toast/modal |
| `event-libs/v1/features/toast/toast.js` | `showToast(opts)`, `hideToast()` | Any ad-hoc feedback message |
| `event-libs/v1/features/conflict-modal/conflict-modal.js` | `showConflictModal(opts)`, `hideConflictModal()` | Custom conflict flows outside schedule/favorite |

## Prerequisite: the store has to be bootstrapped

`initSessionState()` is called automatically from `decorateEvent()`, before any block's own
`init()` runs — you never call it yourself. It's a no-op unless the page has both:

```html
<meta name="tier-1-event-state-enabled" content="true">
<meta name="rainfocus-api-url" content="...">
```

Without those, every signal stays at its default (`sessions.value` is `[]`, `auth.value.isLoggedIn`
is `null`, etc.) — reads won't throw, but nothing populates.

## Reading state

Every signal exposes two things:
- `.value` — synchronous getter, the current value
- `.subscribe(fn)` — calls `fn(value)` immediately, then again on every write

### In a Preact block

Read `.value` directly during render — this repo's Preact build has the signals-integration
hooks patched in, so a component re-renders automatically when a signal it read changes.
No `useEffect`/`useState` needed.

```javascript
import { html } from '../../deps/htm-preact.js';
import { favorited } from '../../utils/session-store.js';

export function FavoritesCount() {
  return html`<span class="favorites-count">${favorited.value.size}</span>`;
}
```

### In a vanilla JS block

There's no render loop, so subscribe explicitly and update the DOM yourself in the callback —
this is exactly what `features/toast/toast.js` and `features/conflict-modal/conflict-modal.js`
do internally.

```javascript
import { createTag } from '../../utils/utils.js';
import { favorited } from '../../utils/session-store.js';

export default async function init(el) {
  const badge = createTag('span', { class: 'favorites-count' }, '', { parent: el });
  favorited.subscribe((ids) => { badge.textContent = ids.size; });
}
```

`.subscribe()` fires once immediately with the current value, so this also handles the
initial render — no separate "read once" step needed.

## Mutating state — schedule / favorite

Call `scheduleWithFeedback()` / `favoriteWithFeedback()` from `services/sessions/action-feedback.js`.
They're plain async functions with no Preact or DOM assumptions, so the call site looks
identical in a vanilla block and a Preact component:

```javascript
import { scheduleWithFeedback } from '../../services/sessions/action-feedback.js';
import { scheduled } from '../../utils/session-store.js';

async function onScheduleClick(session, eventConfig) {
  await scheduleWithFeedback(session, {
    eventConfig,
    isScheduled: scheduled.value.has(session.id),
  });
  // scheduled.value has already been updated by the time this resolves —
  // re-read it (or subscribe) to reflect the new state, don't cache it beforehand.
}
```

This one call handles:
- the auth/registration gate (shows a login/register toast with a CTA if the user isn't eligible)
- conflict detection (opens the shared conflict modal if `eventConfig.showConflictModal` is set
  and the session overlaps one already scheduled)
- the mutation itself, persistence, and the RF API call
- a success/failure toast

`favoriteWithFeedback(session, { eventConfig, isFavorited })` is the equivalent for favoriting —
same shape, no conflict detection.

### When to drop to a lower layer

Only reach for `scheduleAction()` / `favoriteAction()` (`services/sessions/session-actions.js`)
directly if you need custom feedback UI instead of the shared toast/modal — they throw a
`SessionActionError` with a `reason` (`'auth-required' | 'registration-required' | 'conflict' |
'network'`) instead of showing anything themselves, so you own the UI.

Don't call `session-store.js`'s `scheduleSession()` / `favoriteSession()` directly — those are
raw mutators with no auth gate at all. `session-actions.js` is what checks `auth.value` before
calling them.

## Ad-hoc toast / conflict modal

Outside the schedule/favorite flow, call `showToast()` / `showConflictModal()` directly — same
page-level singletons, usable from anywhere:

```javascript
import { showToast } from '../../features/toast/toast.js';

showToast({ message: 'Link copied', variant: 'positive' });
```

See `../blocks/sessions-guide/PLAN.md`'s Phase 4.3/4.4 sections for the full option shapes.

## Reference

- `auth` shape and registration-state table: "User registration states" in `../blocks/sessions-guide/PLAN.md`
- `Session` interface: "State Shape" in `../blocks/sessions-guide/PLAN.md`
- Full mock/real-API status per module: `../blocks/sessions-guide/REAL-API-CHECKLIST.md`
