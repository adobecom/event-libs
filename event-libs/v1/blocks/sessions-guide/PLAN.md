# Sessions Guide Block — Implementation Plan

**Ticket:** MWPW-194331 · **Epic:** MWPW-192677  
**Assignee:** Daniel Oliva  
**Stack:** Preact · Preact Signals (shared session state) · ES Modules · BlockMediator (IMS + RSVP) · Milo/IMS · FEDS

> **Architecture update (MWPW-199065):** Sessions, favorites, scheduled sessions, and auth were promoted out of this block's Preact Context into a page-level shared module (`event-libs/v1/utils/session-store.js`) so other blocks on the same page can read the same state. See "State layers" and "Why signals, not just BlockMediator" below for the rationale, `REAL-API-CHECKLIST.md` for the current mock/real-API status, and `../../utils/SHARED-STATE-USAGE.md` (co-located with `session-store.js` itself) for a how-to guide aimed at other blocks (Preact and vanilla JS) consuming this state. Sections below that still describe the old single-reducer design have been updated in place; historical phase descriptions (UI behavior, gestures, breakpoints) are unaffected and still accurate.
>
> **Follow-up (same ticket):** The toast and schedule-conflict modal were promoted the same way — out of this block's Preact tree into framework-agnostic, page-level modules (`event-libs/v1/features/toast/toast.js`, `event-libs/v1/features/conflict-modal/conflict-modal.js`), mounted once by `session-store.js`'s `initSessionState()`. They live under `features/`, not `utils/` or a new block, since blocks require author-placed content and `utils/` is otherwise pure logic with no DOM/CSS of its own — `features/` is this codebase's existing home for reusable, non-block rendering logic (see `features/carousel/`). Any block — Preact or vanilla — that calls `scheduleAction`/`favoriteAction` now gets the same feedback UI for free. `action-feedback.js` (the error → toast/conflict translator) moved with them to `event-libs/v1/services/sessions/` and no longer takes a `dispatch` argument at all. See Phase 4 below for the updated component/module descriptions.

---

## Overview

The Session Guide is a complex, stateful event browser that ships in two surfaces:

1. **Widget** — a peek-to-expand bottom drawer embedded on the event homepage
2. **Full Page** — a standalone page at `/max/2026/sessions.html`

Both surfaces share the same component architecture and must always reflect identical session state. Sessions are fetched from the event API on initial load (currently mocked). Scheduled and favorited sessions are fetched from Rainfocus on load (registration-gated; currently mocked). Live stream status for Mobile Rider sessions is polled every 30 s from the MR API (currently mocked). Non-MR sessions use time-window logic to determine live state. The block handles time-based state transitions, auth-aware views, and a rich set of user interactions across multiple responsive breakpoints.

---

## Architecture Decisions

### Preact over vanilla JS
The prototype (`prototype/index.js`) already exposed the complexity: ~2000 lines of imperative DOM manipulation to manage ~15 distinct pieces of state. Preact gives us reactive rendering, collocated component state, and a natural model for the time-driven update loop without a build step. Preact is confirmed available at `${miloLibs}/deps/htm-preact.js` (imported as `htm-preact.js` from the local `deps/` directory in this project).

### Component pattern — named exports, not factories
All components are **plain named exports** using htm tagged template literals. The factory pattern (`buildXxx(preact, store)`) described in the original plan was abandoned. Components import dependencies directly at the module level.

```javascript
// Actual pattern used throughout:
import { html, useState } from '../../../deps/htm-preact.js';
import { useSessionGuide } from '../store/index.js';

export function SessionCard({ session, forceOnDemand = false }) {
  const { state, dispatch } = useSessionGuide();
  // ...
  return html`<div class="sg-card">...</div>`;
}

// Some components also export a factory shim for test compatibility:
export const buildSessionCard = () => SessionCard;
```

### htm tagged template literals, not JSX
All template output uses `` html`...` `` from `htm-preact.js`. File extensions are `.js`, not `.jsx`. There is no JSX transform or build step.

### State layers
| Layer | Tool | Purpose |
|---|---|---|
| Shared, page-level state | Preact `signal()` (`event-libs/v1/utils/session-store.js`) | Sessions, favorited, scheduled, auth, live-stream status, pending actions — single source of truth, readable by **any** block on the page, not just this one |
| Shared, page-level re-render trigger | Preact `signal()` (`sessionStateVersion` in `event-libs/v1/utils/session-store.js`) | Bumped only when a session's derived state (upcoming/live/on-demand) actually changes due to time passing — see "Session-state ticker" below |
| Shared, page-level feedback UI | Preact `signal()` + vanilla DOM (`event-libs/v1/features/toast/toast.js`, `event-libs/v1/features/conflict-modal/conflict-modal.js`) | Toast and schedule-conflict modal — mounted once by `initSessionState()`, rendered with plain DOM so any block (Preact or vanilla) can trigger them via `showToast()`/`showConflictModal()`, not just this one |
| Block-local UI state | Preact Context + `useReducer` (`store/index.js`) | Drawer state, active view, active day, filters, search — this widget's own chrome, not needed elsewhere |
| Local component state | `useState` | Carousel index, filter panel open/closed, mobile search open |
| Scheduled / favorited persistence | Rainfocus API (mocked) + localStorage (`sessions:scheduled` / `sessions:favorited`) | Source of truth for registered users — fetched on load, mutated via RF API calls, persisted locally by `session-store.js` |
| Auth/registration dev state | `localStorage` (`sg:dev-auth`) | Dev-only override so Milo's guest IMS cannot overwrite dev user state — now seeded and read entirely inside `session-store.js` |
| IMS profile | `BlockMediator` | Read `imsProfile` — existing project pattern; bridged into the shared `auth` signal by `session-store.js` |
| RSVP / registration | `BlockMediator` | Read `rsvpData.registered` — existing project pattern; bridged into the shared `auth` signal |
| Inter-block (same page) | `BlockMediator` (legacy keys) + `session-store.js` signals (new shared keys) | `BlockMediator` keeps owning `imsProfile`/`rsvpData`/`espData` as before; new cross-block session data goes through signals instead of adding more `BlockMediator` keys |
| URL state | `history.pushState` | Widget: `?sessions` / `?session=<slug>-<rfCode>`. Full page: `?view=` / `?filter=` / `?search=` |

### Why signals, not just BlockMediator
The original design kept all session state in this block's own Preact Context, on the theory that the widget and full-page surfaces are on different pages and in-memory state can't survive navigation anyway. That held until a cross-block requirement came in: other blocks on the *same* page (favorites badges, registration-aware CTAs, etc.) need to read sessions/favorites/scheduled/auth too — state scoped to one block's Context isn't reachable from outside it.

`BlockMediator` (a plain keyed pub/sub, no reactivity of its own) already solves the "shared across blocks" half of that problem and is used elsewhere in this codebase, but bridging it into Preact requires hand-rolled `useEffect` + `subscribe` + `dispatch` boilerplate per key — exactly what the original `syncAuth()` effect below used to do. Preact Signals are already vendored in `deps/htm-preact.js` (this repo's Preact build has the signal-integration hooks patched in) and give both properties for free: a plain module-level value usable from **any** JS (Preact or vanilla), and automatic fine-grained re-rendering for any Preact component that reads `.value` during render — no Context/Provider plumbing needed across block boundaries.

So the split is: `BlockMediator` still owns what it already owned (`imsProfile`, `rsvpData`, `espData`), and `session-store.js` owns everything new that other blocks need, bridging the two BlockMediator keys it cares about into its own `auth` signal. This block's own Context/reducer only holds state that is genuinely private to this widget's UI (drawer position, active tab, toast, etc.).

`initSessionState()` bootstraps the shared store from `decorateEvent()` — before any block's own `init()` runs — gated on the `rainfocus-api-url` page metadata (mirroring the `event-id` gate `decorateEvent` already uses). That decouples "is the shared session data available" from "is the sessions-guide block specifically authored on this page."

`decorateEvent()` additionally requires `tier-1-event-state-enabled` metadata to be `'true'` before it even calls `initSessionState()`. `event-id` alone is already authored broadly across prod event pages for unrelated purposes, so gating on it alone would seed sessions-guide's mock data (`sg:dev-auth`, mock scheduled/favorited) on pages that never intend to use it. `tier-1-event-state-enabled` is an explicit opt-in, separate from — and checked before — the `rainfocus-api-url` gate inside `initSessionState()` itself.

### Polling architecture
A single `setInterval` (30 s) starts inside `session-store.js` after sessions are loaded (when `sessionsStatus.value === 'ready'`). It calls the Mobile Rider batch API for all sessions that have an `mrStreamId`. The polling engine self-stops when all MR sessions report inactive (stream day over). `poller.js`'s `startPolling(mrSessions, env, onUpdate, intervalMs)` takes a plain callback instead of a dispatch function — decoupling it from ever being tied to a specific reducer.

### Session-state ticker
MR polling only gives components an ambient re-render on a live-status change — a page with only non-MR sessions had no mechanism to notice a session crossing its start/end time purely because the clock moved forward, short of a user interacting with something else first. `event-libs/v1/services/sessions/session-state-ticker.js`'s `startSessionStateTicker(getSessions, getLiveStreamActiveIds, onChange, { intervalMs, getNow })` runs on its own 15 s interval (also started from `session-store.js`, unconditionally — not gated on MR sessions existing), diffs `deriveSessionState()` per session against its last-known value, and only calls `onChange` when at least one session's bucket actually changed. `session-store.js` wires `onChange` to bump the shared `sessionStateVersion` signal. It self-stops once every session is on-demand, mirroring the MR poller's own self-stop.

Components don't read `sessionStateVersion`'s value for anything — they read it purely to establish a Preact-signals re-render dependency (a bare `sessionStateVersion.value;` read, `eslint-disable`d for `no-unused-expressions`), then compute `nowMs`/`deriveSessionState()` fresh as normal. Currently read by `LiveUpcomingView`, `MySessionsView`, `MyFavoritesView`, `OnDemandView`, and `SessionDetailOverlay` — child components (`SessionCard`, `LiveCard`, `TimeSlotRow`, etc.) don't need it, since they re-render via the normal cascade when their parent view re-renders. The auto-transition effect in `store/index.js` also subscribes to it directly (via `.subscribe()`, since it's inside a `useEffect` rather than a render body), so the on-demand auto-switch fires from pure time passing too, not just from a `sessions`/`liveStreamActiveIds` write.

### Auth architecture
Auth state is synced entirely inside `session-store.js`'s `syncAuth()`, from two sources:
1. `localStorage` (`sg:dev-auth`) — checked first; dev-mode override that prevents Milo's guest IMS from overwriting the dev user. Seeded by `session-store.js` itself (see Phase 0.3).
2. `BlockMediator` — subscribes to both `imsProfile` and `rsvpData`. `isRegistered` is derived from `rsvpData.registered === true`. Both subscriptions call the same `syncAuth()` function, which writes the shared `auth` signal.

The block's own components (and any other block) read `auth.value` directly — no dispatch or Context involved.

Real FEDS token (`getFedsToken()`) and RF credential wiring are implemented but not yet activated — Rainfocus service methods currently return mock data.

### Timezone
All session times come from the event API in UTC. `detectUserTimezone()` detects the user's timezone via `Intl.DateTimeFormat().resolvedOptions().timeZone` at init and stores it as `guideConfig.userTz`. Cards and overlays read `userTz` from context. A `?serverTime=<ms>` URL parameter lets `getNowMs()` simulate landing on the page at a specific instant — time then keeps advancing from there at the real clock's rate, rather than freezing forever, matching the same-named parameter's semantics in `features/timing-framework`.

### User registration states
Three distinct states drive the UI:

| State | `isLoggedIn` | `isRegistered` | Scheduled / favorited |
|---|---|---|---|
| Loading | `null` | `undefined` | from localStorage |
| Logged out | `false` | `false` | localStorage only |
| Logged in, not registered | `true` | `false` | localStorage only |
| Logged in + registered | `true` | `true` | Rainfocus (mocked) |

All users can schedule and favorite sessions (stored in localStorage). The registration gate for My Sessions / My Favorites views shows `<RegistrationPrompt />` when `isRegistered !== true`. Toast messages prompt login or registration on action if not authenticated. Action buttons call the RF API when `isRegistered === true` (currently mocked).

---

## Component Tree (Actual)

```
SessionsGuideBlock (init entry point — sessions-guide.js)
  └── SessionGuideProvider (store/index.js — Preact context + useReducer)
        └── App (components/App.js)
              ├── DrawerShell  (widget surface)
              │     ├── DrawerHeader
              │     │     ├── DateTabs
              │     │     ├── ViewDropdown
              │     │     ├── DownloadButton (My Sessions view only)
              │     │     └── inline mobile search field (no separate SearchField component)
              │     ├── FilterPanel (rendered inside DrawerShell when filterOpen)
              │     ├── ViewRouter
              │     │     ├── LiveUpcomingView  (activeView === 'live-upcoming')
              │     │     │     ├── Carousel (live sessions, variant="live") → LiveCard[]
              │     │     │     ├── Carousel (featured sessions, variant="featured") → LiveCard[]
              │     │     │     ├── TimeSlotRow[] (upcoming) → SessionCard[]
              │     │     │     └── TimeSlotRow[] (previously aired, forceOnDemand) → SessionCard[]
              │     │     ├── MySessionsView    (activeView === 'my-sessions')
              │     │     │     ├── Carousel (live scheduled, variant="live") → LiveCard[]
              │     │     │     ├── tab bar: Upcoming | On Demand (smart: hidden tab when empty)
              │     │     │     ├── TimeSlotRow[] (upcoming scheduled)
              │     │     │     └── TrackRow[] (on-demand scheduled, grouped by track)
              │     │     ├── MyFavoritesView   (activeView === 'my-favorites')
              │     │     │     ├── Carousel (live favorited, variant="live") → LiveCard[]
              │     │     │     ├── tab bar: Upcoming | On Demand (smart: hidden tab when empty)
              │     │     │     ├── TimeSlotRow[] (upcoming favorited)
              │     │     │     └── TrackRow[] (on-demand favorited, grouped by track)
              │     │     └── OnDemandView      (activeView === 'on-demand')
              │     │           └── track sections (h3 + SessionCard[] per track)
              │     └── SessionDetailOverlay (inside .sg-detail-panel, widget only)
              ├── FullPageShell (page surface)
              │     ├── DrawerHeader (reused; hideClose=true)
              │     ├── FilterPanel (when filterOpen)
              │     └── ViewRouter (same as widget)
              └── RegistrationPrompt (modal wrapper in App, content from RegistrationPrompt component)
```

Toast and the schedule-conflict modal are **not** part of this tree anymore — they're page-level singletons mounted directly to `document.body` by `event-libs/v1/features/toast/toast.js`/`features/conflict-modal/conflict-modal.js` (via `initSessionState()`), independent of whether this block is on the page at all.

### Shared utility components
- `CategoryBadge` — renders category icon + label; color driven by `getTrackIcon()`
  (`event-libs/v1/utils/tier-1-event-config.js`, the Tier 1 Event Configurator app's
  page-level output — see `MWPW-200314-HANDOFF.md`)
- `IconButton` — S2A icon-only button (solid/outlined/transparent variants, on-light/on-dark contexts)
- `icons.js` — SVG icon functions: `IconPlay`, `IconCalendarCheck`, `IconCalendarPlus`, `IconHeartFilled`, `IconHeartOutline`

---

## State Shape

State is split across two modules — shared signals (readable by any block) and this block's own UI-only reducer.

```javascript
// event-libs/v1/utils/session-store.js — module-level Preact signal()s, page-scoped.
// Preact components read `.value` directly during render for fine-grained reactivity;
// non-Preact code uses `.subscribe()` / `.peek()`. Not tied to this block in any way.
{
  sessions: Session[],              // fetched from event API on init; mocked currently
  sessionsStatus: 'idle' | 'loading' | 'ready' | 'error',
  liveStreamActiveIds: Set<string>, // mrStreamIds currently active per MR poll (mocked = empty Set)
  favorited: Set<string>,           // session IDs — persisted to localStorage; source of truth is Rainfocus (mocked)
  scheduled: Set<string>,           // session IDs — persisted to localStorage; source of truth is Rainfocus (mocked)
  auth: {                           // bridged from BlockMediator (imsProfile/rsvpData) or sg:dev-auth
    isLoggedIn: null | boolean,        // null = IMS still loading
    isRegistered: undefined | boolean, // undefined = registration status loading
    userFirstName: string | null,
  },
  pendingActions: Set<string>,       // session IDs with in-flight RF API calls
  sessionStateVersion: number,       // bumped only on a real upcoming/live/on-demand transition; see session-state-ticker.js
}
```

```javascript
// store/index.js — held in this block's own Preact Context via useReducer.
// Everything here is genuinely private to this widget's UI; nothing here is
// needed by any other block. Actual shape from buildInitialState().
{
  drawerState: 'hidden' | 'peek' | 'expanded',
  activeView: 'live-upcoming' | 'my-sessions' | 'my-favorites' | 'on-demand',
  eventDays: string[],              // ISO date strings, derived from the shared `sessions` signal via useEffect
  activeDay: string,                // ISO date string e.g. '2026-11-10'
  activeFilters: {                  // keyed by filter category id (session property name)
    [categoryId]: Set<string>,      // e.g. { track: Set<'Design','Video'>, type: Set<'Lab'> }
  },
  searchQuery: string,
  mySessionsTab: 'upcoming' | 'on-demand',
  myFavoritesTab: 'upcoming' | 'on-demand',
  guideConfig: GuideConfig,
  activeSessionId: string | null,    // id of session shown in detail overlay (widget only)
  dismissingIds: Set<string>,        // session IDs currently animating out of My Sessions/My Favorites
  regPromptOpen: boolean,            // drives modal RegistrationPrompt (from App-level gating)
}
```

Toast and conflict-modal state moved out of this reducer entirely — see `event-libs/v1/features/toast/toast.js` (`toast` signal) and `event-libs/v1/features/conflict-modal/conflict-modal.js` (`conflict` signal), both page-level and independent of this block.

```typescript
interface Session {
  id: string;
  slug: string;                  // for URL params: ?session=<slug>-<rfCode>
  rfCode: string;                // Rainfocus session code
  title: string;
  description: string;
  startTimeUtc: string;          // ISO 8601 UTC
  endTimeUtc: string;            // ISO 8601 UTC
  duration: number;              // minutes
  track: string;
  type: string;
  technicalLevel: string;
  category: string;
  audience: string;
  speakers: Speaker[];
  products: string[];
  resources: Resource[];
  mrStreamId: string | null;     // Mobile Rider stream ID; non-null = MR session
  videoAvailable: boolean;       // recording is ready
  inPerson: boolean;             // in-person session ("Recording coming soon" until videoAvailable)
  sessionPageUrl: string;
  watchUrl: string;              // Watch Now destination
  isKeynote: boolean;
  thumbnailUrl: string | null;   // video thumbnail; null when unavailable
  copyrightDisclaimer?: string;
}

// This block's own per-instance authoring config, parsed by parse-config.js's
// parseSessionsGuideConfig(). Named GuideConfig (not EventConfig) to stay distinct
// from utils.js's page-wide getEventConfig() and the Tier 1 Event Configurator's
// tier-1-event-config.js singleton — see MWPW-200314-HANDOFF.md item 1.
//
// showConflictModal, trackIcons/trackColors/categoryColors, and featuredSessionIds
// used to live here but were retired (MWPW-200314 items 2/3): allow-double-booking,
// track icons/colors, and featured sessions are now page-level settings authored
// once via the Tier 1 Event Configurator app and read through
// event-libs/v1/utils/tier-1-event-config.js's getAllowDoubleBooking()/
// getTrackIcon()/getFeaturedSessionIds() — not block-instance config.
interface GuideConfig {
  title: string;                 // event display name; authored as 'event-title'
  registerUrl: string;           // registration CTA URL; sourced from session-store's apiConfig (page metadata), default '/register'
  filterCategories: FilterCategory[];  // [{ id, label }]; id maps to session property
  theme: 'light' | 'dark';      // default: widget='dark', page='light'
  surface: 'widget' | 'page';   // set from el.classList.contains('page')
  userTz: string;               // detected at init via detectUserTimezone()
}
```

`rfApiUrl`, `rfApiProfileId`, `mrEnv`, and `manualOnDemandTransitionTime` moved **out** of `EventConfig` (and out of this block's authoring table) and into page-level metadata read by `session-store.js`'s `getApiConfig()` — see "Config parsing" in Phase 0.2 below. They gate the shared bootstrap, not this widget's rendering, so other blocks on the page can rely on the same values without this block being authored at all.

Note: `session.state` is **not** stored anywhere — it is computed on every render via `deriveSessionState(session, liveStreamActiveIds, now)` in `event-libs/v1/utils/session-state.js` (promoted out of this block since other blocks need "is this session live" too). Keeping derived state out of the store prevents stale-state bugs.

Note: event days are **derived from the shared `sessions` signal**, not authored as config. `SessionGuideProvider` watches `sessions.subscribe(...)` and dispatches `SET_EVENT_DAYS` into the local reducer, which holds the derived array in `state.eventDays`.

### Reducer actions (complete list)

Actions that used to manage shared data (`INIT_USER_DATA`, `LIVE_STATUS_UPDATE`, `SCHEDULE_ADD`/`SCHEDULE_REMOVE`, `FAVORITE_ADD`/`FAVORITE_REMOVE`, `IMS_UPDATE`, `SESSIONS_LOADED`, `SET_SESSIONS_STATUS`, `SET_PENDING`) no longer exist — that data lives in `session-store.js` signals and is mutated directly (`scheduleSession()`, `favoriteSession()`, signal assignment), not through this reducer. The reducer now only holds UI-only state:

| Action | Effect |
|---|---|
| `SET_EVENT_DAYS` | Set `eventDays` from the shared `sessions` signal; recompute `activeDay` if it's no longer in the new list |
| `SET_VIEW` | Change `activeView`; persist to `sessionStorage` (`sg:last-view`) |
| `SET_DAY` | Change `activeDay` |
| `SET_FILTERS` | Replace `activeFilters` |
| `SET_SEARCH` | Update `searchQuery` |
| `SET_MY_TAB` | Switch `mySessionsTab` (`upcoming` / `on-demand`) |
| `SET_MY_FAVORITES_TAB` | Switch `myFavoritesTab` (`upcoming` / `on-demand`) |
| `SET_DRAWER` | Set `drawerState`; restores last view from `sessionStorage`, falling back to a caller-supplied `defaultView` (computed from the shared `auth` signal at the dispatch site, since the reducer itself must stay a pure function of its own state) |
| `SET_ACTIVE_SESSION` | Set `activeSessionId` (opens/closes detail overlay) |
| `SHOW_REG_PROMPT` / `HIDE_REG_PROMPT` | Set `regPromptOpen` |
| `ADD_DISMISSING_ID` / `REMOVE_DISMISSING_ID` | Manage `dismissingIds` Set for card exit animations |

`SHOW_TOAST`/`HIDE_TOAST` and `SHOW_CONFLICT`/`HIDE_CONFLICT` no longer exist as reducer actions — `showToast()`/`hideToast()` (`utils/toast.js`) and `showConflictModal()`/`hideConflictModal()` (`utils/conflict-modal.js`) write directly to their own shared signals instead, with no `dispatch` involved.

The live→on-demand auto-transition (`allEnded || pastManualCutoff` while `activeView === 'live-upcoming'`) is likewise no longer a reducer case — it's a `useEffect` in `SessionGuideProvider` that watches the shared `sessions`/`liveStreamActiveIds` signals and dispatches a plain `SET_VIEW` when the condition is met.

---

## Phase 0 — Foundation ✅ Complete

**Goal:** Set up the block skeleton, Preact integration, state architecture, and shared utilities.

### 0.1 Block scaffold ✅
- `sessions-guide.js` with `export default async function init(el)` entry point
- `'sessions-guide'` registered in `event-libs/v1/libs.js` → `EVENT_BLOCKS`
- Imports Preact from `event-libs/v1/deps/htm-preact.js` (local `deps/`, not URL-resolved)
- `init()` no longer fetches sessions itself — the shared `session-store.js` module is bootstrapped by `decorateEvent()` before any block's `init()` runs, so sessions/auth/favorites are already loading (or loaded) by the time this block mounts
- Widget surface: mounts into a `<div class="sg-portal">` appended to `document.body`
- Page surface: mounts directly into `el`
- Dev seeding (`sg:dev-auth`, `sessions:scheduled`, `sessions:favorited` in localStorage) now lives inside `session-store.js`'s `initSessionState()`, not in this block's `init()` — see Phase 0.3 (TODO: remove once real IMS/Rainfocus auth is wired up)

### 0.2 Config parsing ✅
`parseSessionsGuideConfig(el)` (in `utils/parse-config.js`) reads the authoring table
(standard Milo block format) into `guideConfig` — presentational/per-instance config
only:
- `event-title`
- `filter-categories` (JSON: `[{ id, label }]`)
- `theme` (`light` | `dark`; defaults: widget=`'dark'`, page=`'light'`)
- `surface` derived from `el.classList.contains('page')`
- `userTz` set via `detectUserTimezone()`
- `registerUrl` is **not** authored here — it's merged in from `getApiConfig()` (see below) after `parseSessionsGuideConfig()` runs

`rainfocus-api-url`, `rainfocus-api-profile-id`, `register-url`, and `manual-on-demand-transition-time` moved to **page metadata** (read by `session-store.js`, not this block) since they gate data other blocks need too, not just this widget's presentation. See `REAL-API-CHECKLIST.md` for the current metadata keys.

**`show-conflict-modal`, `track-icons`/`track-colors`/`category-colors`, and
`featured-sessions` used to be per-block authoring rows here — retired
(`MWPW-200314` items 2/3).** Allow-double-booking, track icons/colors, and featured
sessions are now page-level settings authored once via the Tier 1 Event Configurator
app and read through `event-libs/v1/utils/tier-1-event-config.js`'s
`getAllowDoubleBooking()`/`getTrackIcon()`/`getFeaturedSessionIds()` — see
`MWPW-200314-HANDOFF.md` for the full history.

### 0.3 Data layer ✅ (mocked)
All service files exist and export the correct API surface; all currently return mock data. They live in `event-libs/v1/services/sessions/` (promoted out of this block so the shared `session-store.js` — which owns fetching/polling/mutations — doesn't have to import from inside another block's folder):

**`services/sessions/sessions-api.js`** — ✅ wired to the real ESL/ESP endpoint (`fetchEslSessions`/`mapEslPayloadToRawSessions`); `fetchSessions(eventId)` falls back to `normalizeSessions(mapEslPayloadToRawSessions(MOCK_ESL_PAYLOAD))` only when no `eventId` is given. `MOCK_ESL_PAYLOAD` is a 15-session raw-ESL-shaped catalog covering Adobe MAX 2026 Nov 10–12, piped through the same mapping pipeline as real data so it can't structurally drift.

**`services/sessions/rainfocus.js`** — stub implementations returning mock data:
- `fetchScheduled()` → `['session-1', 'session-3']`
- `fetchFavorited()` → `['session-2']`
- `addSession()`, `removeSession()`, `toggleSessionInterest()` → `{ ok: true }`

**`services/sessions/mobile-rider.js`** — `fetchLiveStatus(mrStreamIds, env)` → `{ active: new Set(), inactive: new Set(mrStreamIds) }`. TODO: replace with real MR API call.

**`services/feds.js`** (still block-local — not yet needed by any other block) — `getFedsToken()` — implemented (checks `window?.feds?.data?.authToken`, waits for `feds.data.authToken.loaded` event, 8 s timeout). Not yet called in production flow.

**Dev seeding** — folded into `event-libs/v1/utils/session-store.js`'s `seedDevData()`, called from `initSessionState()` before `loadPersisted()`/`syncAuth()` run. Sets `sg:dev-auth` and seeds `sessions:scheduled` / `sessions:favorited` in localStorage for development. (Previously a standalone `services/dev-mock.js` called from this block's own `init()` — moved because the shared bootstrap now runs *before* any block's `init()`, so seeding had to move earlier too, or the shared store would read empty localStorage on first load.)

### 0.4 Shared session state + Preact Context/Reducer ✅
**`event-libs/v1/utils/session-store.js`** (shared, page-level) exports:
- Signals: `sessions`, `sessionsStatus`, `liveStreamActiveIds`, `favorited`, `scheduled`, `auth`, `pendingActions`
- `initSessionState()` — idempotent bootstrap, gated on `rainfocus-api-url` metadata, called from `decorateEvent()`
- `getApiConfig()` — the parsed metadata (`apiUrl`, `profileId`, `registerUrl`, `manualCutoff`, `mrEnv`)
- `scheduleSession(session)` / `favoriteSession(session)` — mutators that call the RF API and update the signals + localStorage

**`store/index.js`** (block-local) exports:
- `buildInitialState(guideConfig)` — initializes this block's UI-only state; reads `auth.value.isRegistered` for the initial `activeView`
- `reducer(state, action)` — handles the UI-only action types listed above
- `SessionGuideContext` — the Preact context object (also exposed as `SessionGuideContext._current` for direct useContext compatibility workaround)
- `SessionGuideProvider` — wraps the app; watches the shared signals via `useEffect` to derive `eventDays` and the on-demand auto-transition, but no longer owns fetching, polling, auth sync, or persistence
- `useSessionGuide()` — `useContext(SessionGuideContext)` convenience hook
- `buildStore()` — compatibility shim for tests (returns `{ SessionGuideContext, useSessionGuide }`)

`SessionGuideProvider` runs two `useEffect` hooks (down from four — fetching, auth sync, and persistence moved to `session-store.js`):
1. Recompute `eventDays`/`activeDay` whenever the shared `sessions` signal changes
2. Auto-switch out of `'live-upcoming'` once all sessions are on-demand or the manual cutoff has passed, watching the shared `sessions`/`liveStreamActiveIds`/`sessionStateVersion` signals

### 0.5 Time utilities ✅
`utils/time.js` (re-exports `getNowMs` from `event-libs/v1/utils/session-state.js`, promoted there since the shared session-state-ticker needs it):
- `getNowMs()` — `Date.now()`, or a `?serverTime=<ms>` origin that keeps advancing at the real clock's rate rather than freezing
- `detectUserTimezone()` — `Intl.DateTimeFormat().resolvedOptions().timeZone` with `'UTC'` fallback
- `formatSessionTime(utcIso, userTz)` — localized with timezone abbreviation
- `formatShortTime(utcIso, userTz)` — localized without timezone abbreviation
- `formatSessionDate(utcIso, userTz)` — weekday + month + day
- `isSessionLive(session, nowMs)`, `isSessionUpcoming(session, nowMs)`, `isSessionOnDemand(session, nowMs)`, `allSessionsEnded(sessions, nowMs)`
- `getSessionDayKey(session, userTz)` — ISO date string using `en-CA` locale (YYYY-MM-DD)

### 0.6 Polling engine ✅
`services/sessions/poller.js` (promoted out of this block; called from `session-store.js`):
- Module-level `_timerId` singleton — no more `_dispatch`/`injectDispatch`
- `tick(mrSessions, env, onUpdate)` — calls `fetchLiveStatus`, invokes `onUpdate(active, inactive, now)` directly, self-stops polling when all MR sessions inactive
- `startPolling(mrSessions, env, onUpdate, intervalMs = 30_000)` — no-op when `mrSessions.length === 0`; calls `stopPolling()` first to reset any prior interval; fires immediate first tick
- `stopPolling()` — clears interval, nulls timer

`session-store.js`'s `loadSessions()` calls `startPolling(mrSessions, apiConfig.mrEnv, (active) => { liveStreamActiveIds.value = active; })` — the callback writes straight to the shared signal, no reducer/dispatch involved.

### 0.7 Auth integration ✅ (dev path only; production credentials not yet wired)
Auth state flows from localStorage (`sg:dev-auth`) or BlockMediator (`imsProfile` + `rsvpData`) into the shared `auth` signal via `session-store.js`'s `syncAuth()`. The localStorage path takes priority to prevent Milo's guest IMS from overwriting a dev user.

`isRegistered` is derived from `rsvpData.registered === true` — sourced from BlockMediator `rsvpData` key.

Real FEDS token (`getFedsToken()`) and RF credential wiring: `services/sessions/session-actions.js` passes `null` for `rfAuthToken`/`clientId` to all RF service calls (TODO comments mark the integration points).

### 0.8 CSS custom properties ✅
`sessions-guide.css` contains all block styles. Theme applied via `data-theme` attribute on `sg-portal` (widget) or `el` (page).

---

## Phase 1 — Drawer Shell (Widget) ✅ Complete

**Goal:** The peek-to-expand bottom drawer renders correctly on all breakpoints with the header and view routing.

### 1.1 Surface detection ✅
```javascript
const surface = el.classList.contains('page') ? 'page' : 'widget';
```
`surface` is stored in `guideConfig` and drives the `App` branch between `<DrawerShell>` and `<FullPageShell>`.

### 1.2 Portal architecture (widget only) ✅
The widget mounts into `<div class="sg-portal">` appended to `document.body`. The `.sessions-guide.widget` block element is cleared (`el.innerHTML = ''`) and serves as an invisible mount point.

### 1.3 Sessions fetch ✅ (now owned by the shared store, not this block)
Sessions are fetched once by `session-store.js`'s `loadSessions()`, kicked off from `initSessionState()` in `decorateEvent()` — before this (or any) block's `init()` runs. This block's `init()` no longer awaits a fetch or passes `initialSessions` into the provider; `DrawerShell`/`FullPageShell` render a loading state by reading `sessionsStatus.value` directly until it flips to `'ready'`.

### 1.4 Drawer open/close ✅

**Triggers:**
- **CTA button** — Preact-rendered `position: fixed; bottom: 0` button inside `DrawerShell` (only rendered when `drawerState === 'hidden'`)
- **`?sessions` URL param** — checked on mount in `DrawerShell`; auto-opens to `expanded`
- **`?session=<slug>-<rfCode>` URL param** — auto-opens to `expanded` + resolves `activeSessionId` once sessions are loaded

**State machine:**

| From | To | Trigger |
|---|---|---|
| `hidden` | `expanded` | CTA click on narrow (≤1279 px) |
| `hidden` | `peek` | CTA click on wide (≥1280 px) |
| `hidden` | `expanded` | `?sessions` or `?session=` on load |
| `peek` | `expanded` | Scroll-down (wheel) or swipe-up (touch) |
| `peek` | `hidden` | Backdrop click |
| `expanded` | `hidden` | Backdrop click or close button |

**Heights:**
- **Peek:** `Math.round(window.innerHeight * (window.innerWidth > 1440 ? 0.65 : 0.55))`
- **Expanded:** `getTopMargin()` from top — 0 px on ≤1279 px, 20 px on ≥1280 px

**CSS transition:** `top` property with `cubic-bezier(0.4, 0, 0.2, 1)` at `0.45 s`. Drag uses `0.08 s linear`.

**Body scroll lock:** `document.body.style.overflow = 'hidden'` on open; restored on close.

**Scroll container:** `.sg-body-scroll--scrollable` class enables `overflow-y` scrolling only when `drawerState === 'expanded'`.

### 1.5 Gesture handling ✅
- **Wheel** — `deltaY > 0` (scroll down) expands from peek; multiplied 1.2×
- **Touch** — `touchmove` delta with 1.5× multiplier; `touchstart` initializes `touchPrevYRef`
- Both use module-level refs (`expandedRef`, `currentTopRef`, `drawerStateRef`) via `useRef` so gesture handlers don't need to be re-registered on state changes
- `passive: false` on wheel and touchmove; `passive: true` on touchstart

### 1.6 Responsive variants ✅
Breakpoint at 1280 px: CTA goes to `peek` on wide, directly to `expanded` on narrow.

### 1.7 DrawerHeader component ✅
- Renders title (personalized "FirstName, see what's happening" when logged in), date tabs, right controls
- Mobile search: inline `<input type="search">` revealed in a separate row below controls; toggle via search icon button; Escape closes and clears
- Filter button: shows active filter count badge
- `hideControls` prop: collapses the entire controls area when detail overlay is open

### 1.8 DateTabs component ✅
- Renders one tab per `state.eventDays` entry (derived from sessions, not authored config)
- Disabled (`pointer-events: none`) when `activeView === 'on-demand'`
- Uses noon UTC offset (`T12:00:00`) to avoid DST edge cases in `formatDay()`

### 1.9 ViewDropdown component ✅
- Four options: `'Live & upcoming'` / `'My sessions'` / `'My favorites'` / `'On demand'`
- All views selectable by any user (no registration gate at dropdown level; gate is inside each view component)
- Click-outside closes via `document` event listener in `useEffect`
- `sessionStorage` (`sg:last-view`) persists last view; restored when drawer re-opens via `SET_DRAWER` action

---

## Phase 2 — Session Cards ✅ Complete

**Goal:** The two card variants render with all action buttons wired up.

### 2.0 Component conventions

**Direct imports, no factory:** all components import `useSessionGuide` directly. The `buildXxx = () => Xxx` factory shims are retained for test compatibility only.

**Context over props:** cards read all shared state from `useSessionGuide()`. Only `session` (and sometimes `forceOnDemand`) is passed as a prop.

**`userTz` source:** read from `guideConfig.userTz` via context.

### 2.1 SessionCard component ✅
- `session` prop required; `forceOnDemand` prop (boolean, default false) forces on-demand display for previously-aired sessions
- Local `hoverAnim` state (`null | 'fav' | 'sched'`) drives slide-in animation class on the actions column — `sg-card--anim-fav` / `sg-card--anim-sched`
- `dismissingIds.has(session.id)` drives `sg-card--collapsing` for exit animation
- Time label logic:
  - `forceOnDemand` → `'ON DEMAND'`
  - `onDemandNatural && inPerson && !videoAvailable` → `'Recording coming soon'`
  - `onDemandNatural` → `'ON DEMAND'`
  - else → `formatSessionTime(startTimeUtc, userTz)` with short end time
- Card click:
  - Page surface → navigate to `session.sessionPageUrl`
  - Widget + on-demand → navigate to `session.sessionPageUrl`
  - Widget + upcoming/live → `SET_ACTIVE_SESSION` dispatch + push `?session=` URL param
- Actions:
  - `forceOnDemand`: Play button only (navigates to `sessionPageUrl`)
  - Upcoming/live: Schedule button (calendar icon) + Favorite button (heart icon)
  - On-demand: Favorite button only
- iOS workaround: `ontouchend` handler on actions div prevents iOS synthetic click routing through `transform + overflow:hidden` ancestor

### 2.2 LiveCard component ✅
- `session` prop required; `variant` prop (`'live'` | `'featured'`, default `'live'`)
- Progress bar: `width: ${progressPct}%` — computed at render time from `getNowMs()`
- Duration label: `Xh Ym` format
- Primary CTA varies by `variant` + `sessionState`:
  - `variant='live'` + has `watchUrl` → "Watch now" button
  - `variant='featured'` + `sessionState='upcoming'` → "Add to schedule" / "Added to schedule" toggle button
  - `variant='featured'` + `sessionState='on-demand'` + has `watchHref` → "Watch on demand" button
- Widget card click opens detail overlay; non-widget does nothing
- Schedule and favorite icon buttons always present with `isPending` disabled state

### 2.3 TimeSlotRow component ✅
- Required prop: `sessions` — pre-filtered `Session[]` for this time slot; `forceOnDemand` boolean
- Label shows `formatShortTime(sessions[0].startTimeUtc, userTz)`
- Transform-based horizontal scroll (desktop + mobile): `translateX(-${offset * cardWidth}px)`
- Card width DOM-computed once after first render via `useEffect` + `useRef`; includes `columnGap`
- `allDismissing` — when all sessions in the row are in `dismissingIds`, adds `sg-time-row--collapsing`

### 2.4 Carousel component ✅
- Required: `sessions`, `title`, `formatTime`, `variant`
- Dual-mode: **paged** (desktop: `overflowX: visible`, transform-based) vs **native scroll** (mobile/tablet: scrollLeft-based)
- `paged` state determined by CSS `overflowX` computed style — auto-detects breakpoint via `measure()` after render
- `visibleCountRef` — number of visible cards per page; used for `maxOffset`
- Resize listener updates `measure()` and `refreshEdges()`
- Nav: prev/next arrow buttons; disabled when at start/end edge

---

## Phase 3 — Views ✅ Complete

**Goal:** All four views render with the correct content.

### 3.1 Live & Upcoming view ✅ (`LiveUpcomingView`)
- Live section: `liveSessions()` filtered to `activeDay` — uses `isInLiveNow()` for MR sessions, `isSessionLive()` for non-MR
- Featured carousel: shown when `live.length === 0`; uses `getFeaturedSessions()` which maps `featuredSessionIds` to day sessions (falls back to deterministic random shuffle keyed on `activeDay`)
- Upcoming section: `upcomingSessions()` filtered to `activeDay`, then `filterSessions()` applied
- Previously aired section: shown when both `timeSlots.length === 0 && live.length === 0`; shows all sessions for the day with `forceOnDemand={true}`, grouped by start time
- Empty state: "No sessions scheduled for this day."

### 3.2 My Sessions view ✅ (`MySessionsView`)
- Registration gate: `isRegistered !== true` → `<RegistrationPrompt />`
- Live section: scheduled sessions currently live for activeDay
- Smart tab bar: tabs only shown for non-empty halves; if both upcoming and on-demand have sessions, both tabs show; single-tab case hides the tab bar automatically (via `effectiveTab` clamping)
- Upcoming tab: `TimeSlotRow[]` for scheduled upcoming sessions on activeDay
- On Demand tab: `TrackRow[]` for scheduled on-demand sessions on activeDay (grouped by track)
- Empty state: "You currently have no scheduled sessions." + "See Live & Upcoming" button
- Filter + search applied to both upcoming and on-demand lists

### 3.3 My Favorites view ✅ (`MyFavoritesView`)
- Mirror of My Sessions view using `favorited` Set and `myFavoritesTab` state
- Empty state: "You currently have no favorited sessions." + "See Live & Upcoming" button
- Tab dispatch: `SET_MY_FAVORITES_TAB` (separate from `SET_MY_TAB`)

### 3.4 On Demand view ✅ (`OnDemandView`)
- `onDemandSessions()` across all sessions (no day filter); `filterSessions()` applied
- Grouped by track via `groupByTrack()` → `h3 + SessionCard[]` sections (not via `TrackRow`)
- Empty state: "Sessions will be available on demand after the event."
- Auto-activated by a `useEffect` in `SessionGuideProvider` watching the shared `sessions`/`liveStreamActiveIds` signals, dispatching `SET_VIEW` when `allEnded || pastManualCutoff`

### 3.5 View transitions ✅
All view switches are instant — `ViewRouter` returns the active view component based on `state.activeView`.

---

## Phase 4 — Session Interactions ✅ Complete

**Goal:** Add to Schedule, Favorite, Conflict Modal, and ICS download all work, with pessimistic updates.

### 4.1 Add to Schedule / Remove ✅
`services/sessions/session-actions.js` → `scheduleAction(session, { showConflictModal })` — promoted out of this block, UI-agnostic (no `dispatch`/reducer knowledge, so any block — Preact or vanilla — can call it):
- Auth gate: reads the shared `auth` signal directly; `isLoggedIn !== true` throws `SessionActionError('auth-required')`; `isRegistered !== true` throws `SessionActionError('registration-required')`
- Pending guard: no-op if `pendingActions.value.has(session.id)` (read from `session-store.js`, not a reducer field)
- Conflict check: if not yet scheduled and `showConflictModal` (passed explicitly by the caller, since it's block-instance config), throws `SessionActionError('conflict', { conflict, incoming })` instead of dispatching a modal itself
- Success path: calls `session-store.js`'s `scheduleSession(session)`, which mutates the shared `scheduled` signal, persists to localStorage, and calls the RF API
- Failure: any thrown error is a discriminated `SessionActionError` (`reason: 'auth-required' | 'registration-required' | 'conflict' | 'network'`) — **this module never shows a toast, opens a modal, or touches a reducer**. `services/sessions/action-feedback.js` (`runSessionAction()`, promoted alongside it) translates the error into a call to the shared `showToast()`/`showConflictModal()` modules — usable by any block, Preact or vanilla, with no `dispatch` argument at all
- Dismiss animation: unchanged — still `ADD_DISMISSING_ID` + 450 ms delay before the action, driven by the calling component (`SessionCard`/`LiveCard`/`SessionDetailOverlay`); `SessionCard`'s two call sites share this logic via a local `withDismissAnimation()` helper
- Conflict resolution: `resolveScheduleConflict(conflict, incoming)` — called from `action-feedback.js`'s `onConfirm` handler; reuses `scheduleSession()`'s toggle behavior to remove the conflicting session then add the incoming one
- Call-site convenience: `scheduleWithFeedback(session, { eventConfig, isScheduled })` / `favoriteWithFeedback(session, { eventConfig, isFavorited })` (also in `action-feedback.js`) wrap `runSessionAction()` with the shared success copy so `SessionCard`/`LiveCard`/`SessionDetailOverlay` don't each repeat it

### 4.2 Favorite / Unfavorite ✅
`services/sessions/session-actions.js` → `favoriteAction(session)` — same auth-gate/error-throwing contract as `scheduleAction`, calling `session-store.js`'s `favoriteSession(session)` on success. Toast composition and dismiss-animation timing live in the calling component via `favoriteWithFeedback()`, same as scheduling.

### 4.3 Conflict modal ✅ (promoted to `event-libs/v1/features/conflict-modal/conflict-modal.js`)
No longer a Preact component — `mountConflictModal()` builds a backdrop + modal once via plain DOM (`createTag`), mounted to `document.body` by `initSessionState()`, and subscribes to the module's own `conflict` signal:
- Renders two radio-style `<label>` cards: "Currently scheduled" (existing) vs "New session" (incoming)
- Save button awaits `conflict.value.onConfirm(keep)`, then calls `hideConflictModal()`
- Cancel / backdrop click: `hideConflictModal()` directly, no `onConfirm` call
- Local (closure, not `useState`) `saving` variable drives "Saving…" label and disabled state on Save button
- `showConflictModal({ existing, incoming, onConfirm })` (called from `action-feedback.js`) sets the signal — `onConfirm` is a closure over the current session data, same contract as before
- CSS is co-located at `event-libs/v1/features/conflict-modal/conflict-modal.css`, loaded via `loadStyle(new URL('./conflict-modal.css', import.meta.url).href)` — same convention as `features/carousel/milo-carousel.css`

> **Why `features/`, not a block:** blocks are decorated from author-placed DOM (Milo's `loadArea()` matches a block's class name in content); toast/conflict-modal have no authored instance and must exist as soon as `initSessionState()` runs, page-wide, regardless of what's authored. `features/` is this codebase's existing home for reusable, non-block rendering logic that a caller imports and invokes directly (see `features/carousel/milo-carousel.js`, imported by `blocks/bento-cards/bento-cards.js`) — a much closer structural fit than either a block or the block-agnostic-but-pure-logic `utils/` directory.

### 4.4 Toast ✅ (promoted to `event-libs/v1/features/toast/toast.js`)
No longer a Preact component — `mountToast()` builds the toast element once via plain DOM, mounted to `document.body` by `initSessionState()`, and subscribes to the module's own `toast` signal:
- Four variants: `neutral`, `informative`, `positive`, `negative`
- Icons: `InfoIcon` (informative), `CheckIcon` (positive), `AlertIcon` (negative) — inlined as static SVG strings
- Enter animation: double rAF to ensure browser paints hidden state before CSS transition
- Auto-dismiss after `toast.duration` ms (default 1500); `duration: null` = persistent (auth prompts)
- Manual dismiss: X button starts the exit transition; `transitionend` clears the `toast` signal and hides the element
- Optional CTA: `ctaHref` renders as `<a>`; `ctaAction` renders as `<button>`
- `showToast({ message, variant, ctaLabel, ctaAction, ctaHref, duration })` / `hideToast()` are the only two entry points — any block can call them directly
- CSS is co-located at `event-libs/v1/features/toast/toast.css`, loaded the same way as the conflict modal's

### 4.5 ICS download ✅
`utils/ics.js` → `generateICS(sessions)` / `downloadICS(sessions, filename)`:
- RFC 5545 compliant: `BEGIN:VCALENDAR`, `VEVENT` per session
- `DTSTART`/`DTEND` in UTC (`Z` suffix)
- `SUMMARY`, `DESCRIPTION` (includes speaker names), `URL`
- Line folding at 75 octets per RFC 5545 §3.1
- Triggered by `DownloadButton` in My Sessions view header (only shown when `activeView === 'my-sessions'`)

### 4.6 RegistrationPrompt component ✅
- `isLoggedIn === false` → "Sign in and register" + `window.adobeIMS?.signIn()` button
- Else (logged in, not registered) → "Register for the event" + `<a href="/register">` (hardcoded `/register`, not currently sourced from `guideConfig.registerUrl`)
- Rendered inline inside each view (My Sessions, My Favorites) for the full-view gate
- Also rendered as a modal from `App` when `regPromptOpen === true` (triggered by `SHOW_REG_PROMPT`)

> **Note:** The current auth gate for scheduleAction/favoriteAction uses `showToast()` (not `SHOW_REG_PROMPT`). The modal RegistrationPrompt (`regPromptOpen`) is wired up in `App` but not currently triggered by schedule/favorite interactions.

---

## Phase 5 — Session State & Time-Based Behaviors ✅ Complete

**Goal:** Live Now eligibility, on-demand derivation, and post-event auto-transition are all implemented.

### 5.1 Session state derivation ✅
`event-libs/v1/utils/session-state.js` (promoted out of this block) → `deriveSessionState(session, liveStreamActiveIds, nowMs)`:
- MR sessions: inactive in poll API → `'on-demand'` (if past start) or `'upcoming'` (pre-start); active → `'live'` (if past start) or `'upcoming'`
- Non-MR: pure time window — `'on-demand'` if past end, `'live'` if between start/end, `'upcoming'` if pre-start

### 5.2 Live Now eligibility ✅
`event-libs/v1/utils/session-state.js` → `isInLiveNow(session, liveStreamActiveIds, nowMs)`:
- Only MR sessions past their start time that are active in the MR API qualify for Live Now

### 5.3 Auto-transition to on-demand ✅
No longer a reducer case (`LIVE_STATUS_UPDATE` doesn't exist). Implemented as a `useEffect` in `SessionGuideProvider` (`store/index.js`) that subscribes to the shared `sessions`/`liveStreamActiveIds` signals and dispatches a plain `SET_VIEW`. Post-event auto-transition: `allEnded || pastManualCutoff` (cutoff from `getApiConfig().manualCutoff`) and `activeView === 'live-upcoming'` → switch to `'on-demand'`.

### 5.4 In-person on-demand cards ✅
- `session.inPerson && !session.videoAvailable` → time label "Recording coming soon" in `SessionCard`; detail overlay shows "Recording coming soon" badge
- `session.inPerson && session.videoAvailable` → navigates to `session.sessionPageUrl`

---

## Phase 6 — Session Detail Overlay ✅ Complete

**Goal:** The session expansion panel (widget only) renders all session metadata and syncs action states.

### 6.1 SessionDetailOverlay component ✅
- Controlled by `activeSessionId` in store; reads session from `sessions.find(s => s.id === activeSessionId)`
- Two-column layout: main col (summary + description + products + resources + copyright) + side col (speakers)
- Actions:
  - Upcoming sessions: Schedule / Scheduled toggle button (primary) + Favorite icon button + Share icon button
  - Live/on-demand sessions: Watch now link (primary) + Favorite icon button + Share icon button
  - "Recording coming soon" badge for in-person sessions without `videoAvailable`
- Description expand/collapse: "More" / "Less" button with `is-expanded` class; local `descExpanded` state
- Attributes list: Technical level, Track, Content category, Audience (filtered for non-empty values)
- Share: `navigator.share()` if available; else `navigator.clipboard.writeText()` with "Link copied" toast; swallows `AbortError`

### 6.2 URL param for open overlay (widget) ✅
- `DrawerShell` handles `handleDetailBack()`: pushes `setSessionsParam()` URL
- `DrawerShell` handles `closeDrawer()`: pushes `clearSessionParams()` URL
- Opening detail: `SessionCard` / `LiveCard` push `setSessionParam(slug-rfCode)` URL
- `popstate` listener in `DrawerShell` restores state from URL without pushing new entries

### 6.3 State sync ✅
Schedule/favorite actions in the overlay dispatch through the same store → both the overlay and the list card update from the same state source automatically.

---

## Phase 7 — Filter System ✅ Complete

**Goal:** Multi-category filter panel that updates session lists with active filter count.

### 7.1 FilterPanel component ✅
- Two-panel layout: left sidebar (category buttons) + right options (checkboxes)
- Category options derived dynamically from `sessions` via `useMemo` — no hardcoded option values
- Local `localFilters` state (copy of `activeFilters`) — only committed to store on Apply; Reset clears both local and store
- Active category highlighted; count badge per category in sidebar
- Total active count badge in panel header

### 7.2 Filter state ✅
`SET_FILTERS` action replaces the entire `activeFilters` object. Filter panel initializes `localFilters` from current `activeFilters` on open.

### 7.3 Filter composition with search ✅
`utils/session-filters.js` → `filterSessions(sessions, activeFilters, searchQuery)`:
- Each active filter category is applied as AND between categories, OR within a category
- Array session properties (e.g. `products`) support array membership check
- Search: title, description, speakers names, track, type (case-insensitive includes)
- Applied together as a pipeline; neither filter nor search alone gates the other

### 7.4 Filter options ✅
Derived from `sessions[n][categoryId]` values — no authored option lists needed. Array properties are expanded.

---

## Phase 8 — Search ✅ Complete

**Goal:** Full-text keyword search across session fields.

### 8.1 Search implementation ✅
Search is inline in `DrawerHeader` (not a separate `SearchField` component):
- Mobile search row: hidden below controls; toggle via search icon button in the right controls area; Escape key closes + clears; clear (✕) button
- Desktop: same mobile search row revealed (no separate desktop inline field)
- `oninput` dispatches `SET_SEARCH` immediately

### 8.2 Search logic ✅ (in `filterSessions`)
```javascript
function matchesSearch(session, q) {
  return (
    session.title?.toLowerCase().includes(q)
    || session.description?.toLowerCase().includes(q)
    || session.speakers?.some((sp) => sp.name?.toLowerCase().includes(q))
    || session.track?.toLowerCase().includes(q)
    || session.type?.toLowerCase().includes(q)
  );
}
```

---

## Phase 9 — Full Page Version ✅ Complete

**Goal:** A standalone block that shares all components with the widget.

### 9.1 Full page surface ✅
There **is** a separate block entry, `sessions-guide-full-page.js`, registered as its own `EVENT_BLOCKS` name (`'sessions-guide-full-page'`) alongside `'sessions-guide'` — this section previously claimed otherwise, which was already stale before this refactor. Authors write either `sessions-guide (page)` (surface detected from the `page` class, same block as the widget) or a dedicated `sessions-guide-full-page` block (surface forced to `'page'` in its own `parseConfig()`). Both entry points mount the same `SessionGuideProvider`/`App` tree and read `registerUrl` from the shared `session-store.js` the same way.

`FullPageShell` renders `DrawerHeader` (with `hideClose={true}`) + `ViewRouter` + optional `FilterPanel`.

### 9.2 Behavioral differences vs widget ✅

| Feature | Widget | Full Page |
|---|---|---|
| Shell | Peek-to-expand drawer in portal | Inline layout in block element |
| Session card click | Opens detail overlay (upcoming/live); navigates (on-demand) | Always navigates to session page |
| Session detail overlay | Yes (`sg-detail-panel` inside drawer) | No |
| URL params | `?sessions`, `?session=<slug>-<rfCode>` | `?view=`, `?filter=`, `?search=` |
| CTA button | "View all sessions" fixed button | Not rendered |

### 9.3 URL param management (full page) ✅
`FullPageShell` uses two `useEffect` hooks:
1. On mount: reads `?view=`, `?search=`, `?filter=cat:val,cat:val` and dispatches store actions
2. On `activeView` / `activeFilters` / `searchQuery` change: `history.replaceState` to sync URL

---

## Phase 10 — URL Deep Linking (Widget) ✅ Complete

**Goal:** Widget open state and active session detail reflected in URL.

### 10.1 Widget open/close URL ✅
- Open → `history.pushState({}, '', setSessionsParam())` (sets `?sessions=`, drops `?session=`)
- Close → `history.pushState({}, '', clearSessionParams())`

### 10.2 Session detail URL ✅
- Open detail → `history.pushState({}, '', setSessionParam('slug-rfCode'))` (drops `?sessions=`)
- Close detail (keep drawer open) → `history.pushState({}, '', setSessionsParam())`

### 10.3 popstate handler ✅
`DrawerShell` registers a single `popstate` listener using a `sessionsRef` to avoid re-registration on every session list change. Handles three URL states: `?session=`, `?sessions=`, neither.

---

## Phase 11 — Brand Concierge AI Ribbon ⬜ Not Started

**Goal:** Entry point for Brand Concierge AI after the 2nd visible session row.

No `BrandConciergeRibbon` component exists. Not yet implemented.

---

## Phase 12 — Analytics ⬜ Not Started

**Goal:** Fire analytics events at the correct moments.

No `utils/analytics.js` exists. Not yet implemented.

---

## Phase 13 — Theme & Responsive Polish 🔄 In Progress

### 13.1 Dark / Light theme 🔄
`data-theme` attribute applied to `sg-portal` (widget) or `el` (page). CSS token switching via `[data-theme="dark"]` / `[data-theme="light"]` attribute selectors. Default: widget=dark, page=light.

### 13.2 Responsive breakpoints 🔄
Key breakpoints in use:
- `≤1279 px` (narrow) — CTA opens directly to `expanded`; top margin = 0
- `≥1280 px` (wide) — CTA opens to `peek`; top margin = 20 px

Carousel: `overflowX` computed style determines paged vs native scroll mode — responsive without JS breakpoint checks.

### 13.3 Accessibility 🔄
Present: `role="dialog"` / `aria-modal` / `aria-label` on drawer, conflict modal, filter panel; `aria-label` on all icon buttons; `role="tablist"` / `role="tab"` / `aria-selected` on date tabs; `aria-haspopup` / `aria-expanded` on dropdowns; `aria-pressed` on toggle buttons; `aria-live="polite"` on toast; focus trap not yet implemented.

---

## Phase 14 — Testing 🔄 In Progress

Tests mirror `test/unit/blocks/sessions-guide/`. Coverage status to be assessed against actual test files.

### 14.1 Priority unit tests
- `store/index.js`: reducer coverage for the remaining UI-only actions, `buildInitialState`
- `event-libs/v1/utils/session-store.js`: signal mutations, localStorage persistence, `initSessionState()` gating, auth bridge from BlockMediator/dev-auth
- `utils/time.js`: timezone conversion, `getNowMs` override, `getSessionDayKey`
- `event-libs/v1/utils/session-state.js`: `deriveSessionState` + `isInLiveNow` — pure functions, easy to cover
- `utils/session-filters.js`: all filter/grouping functions
- `utils/ics.js`: RFC 5545 output, line folding, edge cases
- `event-libs/v1/services/sessions/session-actions.js`: auth gate, pessimistic mutation flow, conflict detection, `SessionActionError` reasons
- `event-libs/v1/services/sessions/action-feedback.js` ✅ (`test/unit/services/sessions/action-feedback.test.js`): translation of each `SessionActionError` reason into the right `showToast()`/`showConflictModal()` call
- `event-libs/v1/features/toast/toast.js` ✅ (`test/unit/features/toast/toast.test.js`): signal mutations, mount idempotency, rendering, CTA link/button, transition-driven dismiss
- `event-libs/v1/features/conflict-modal/conflict-modal.js` ✅ (`test/unit/features/conflict-modal/conflict-modal.test.js`): signal mutations, mount idempotency, rendering, selection gating Save, confirm/cancel/backdrop-dismiss flows
- `services/feds.js`: already-present token, late arrival via event, 8 s timeout

### 14.2 Component tests (priority order)
- `SessionCard`: on-demand/upcoming rendering, `forceOnDemand` prop, `dismissingIds` class, `hoverAnim` state, iOS touch handler
- `FilterPanel`: local filter state, apply/reset, dynamic option derivation
- `RegistrationPrompt`: logged-out vs logged-in-unregistered variants

(Toast and the conflict modal are no longer Preact components — see the `features/toast/toast.js` / `features/conflict-modal/conflict-modal.js` entries in 14.1 above.)

### 14.3 Integration tests (priority order)
- Full view rendering for all 4 views
- Poll-driven state update: `session-store.js`'s `liveStreamActiveIds` signal changing on a poll tick, and the on-demand auto-transition `useEffect` reacting to it
- URL param handling: `?sessions` auto-opens, `?session=slug-rfCode` resolves detail
- Filter + search composition

---

## Phase 15 — Linting & PR Readiness ⬜ Not Started

- `npm run lint:fix` passes for all new files
- `npm test` green with ≥80 % line coverage on new code
- No `console.error` — all errors via `window.lana?.log()`
- No hardcoded Milo URLs — all deps resolved from local `event-libs/v1/deps/`
- All imports use `.js` extensions
- `EVENT_BLOCKS` confirmed updated in `libs.js`
- Remove dev scaffolding before shipping:
  - `seedDevData()` in `event-libs/v1/utils/session-store.js` (writes `sg:dev-auth` / `sessions:scheduled` / `sessions:favorited`)
  - (or gate behind `?sgDev=true`)
- Wire real API calls in `event-libs/v1/services/sessions/rainfocus.js` (replace mock stubs with FEDS token + IMS userId)
- Wire real API call in `event-libs/v1/services/sessions/mobile-rider.js`
- ✅ `event-libs/v1/services/sessions/sessions-api.js` wired to the real ESL/ESP catalog endpoint (`fetchEslSessions`/`mapEslPayloadToRawSessions`); `MOCK_ESL_PAYLOAD` remains only as the no-`event-id` fallback
- Confirm FEDS event name `feds.data.authToken.loaded` and attribute path `window.feds.data.authToken` against live integration
- PR description references MWPW-194331 and includes testing notes for widget and full-page surfaces

---

## Dependency Map

```
Phase 0 (Foundation) ✅
  └─► Phase 1 (Drawer Shell) ✅
        └─► Phase 2 (Session Cards) ✅
              ├─► Phase 3 (Views) ✅
              │     └─► Phase 4 (Interactions) ✅ ──► Phase 6 (Detail Overlay) ✅
              │           └─► Phase 5 (Time/Polling) ✅
              │                 └─► Phase 3 (feeds On Demand auto-transition) ✅
              ├─► Phase 7 (Filter) ✅
              ├─► Phase 8 (Search) ✅
              └─► Phase 9 (Full Page) ✅ ──► Phase 10 (URL Deep Linking) ✅
                    └─► Phase 11 (Brand Concierge) ⬜
Phase 12 (Analytics) ⬜ — can be wired alongside any phase
Phase 13 (Polish) 🔄 — parallel to later phases
Phase 14 (Tests) 🔄 — written alongside each phase
Phase 15 (PR Readiness) ⬜ — final gate
```

---

## Key Risks & Mitigations

| Risk | Mitigation / Status |
|---|---|
| FEDS event name / attribute path differs from what's documented | `getFedsToken()` implemented with timeout; FEDS integration not yet activated — confirm before shipping Phase 0.7 |
| `isRegistered` source wiring | Wired via `BlockMediator.get('rsvpData').registered` inside `session-store.js`'s `syncAuth()`; dev state via `sg:dev-auth` localStorage; production wiring blocked on real Rainfocus integration |
| Real Rainfocus API calls not wired | All RF service methods are stubs; `null` credentials passed in `services/sessions/session-actions.js`; must replace before shipping |
| Real Mobile Rider API not wired | `fetchLiveStatus` returns all-inactive mock; polling runs but no live sessions will appear |
| Real sessions API | ✅ wired (`fetchEslSessions`/`mapEslPayloadToRawSessions`); `MOCK_ESL_PAYLOAD` used only when no `eventId` is present |
| Dev scaffolding (`seedDevData()` in `session-store.js`) in production path | `TODO` comments present; must remove or gate before PR — now runs page-wide via `decorateEvent`, not just for this block, so removal affects any page with `rainfocus-api-url` metadata |
| 30 s polling causes excessive re-renders | Preact diffing handles; `useMemo` guards in view components on filter-derived lists |
| RF pessimistic mutations feel slow | `pendingActions` Set + `is-pending` class on buttons covers perceived latency; error toast on failure |
| Timezone DST edge case on multi-day events | `Intl.DateTimeFormat` handles DST automatically; date tabs use noon UTC to avoid midnight DST edge |
| iOS synthetic click routing through transform ancestors | Handled via `ontouchend` in `SessionCard`; `elementFromPoint` dispatch to correct action button |
| `drawerStateRef` stale closure in gesture handlers | All gesture handler refs use `useRef` values; re-registered once on mount with stable `[]` deps |
| `SessionGuideContext._current` direct assignment | Workaround for Preact `useContext` behavior when `App` is called directly from `children()`; documented in comment |

---

## File Structure

Shared, page-level modules now live outside this block's directory — anything another block might need (data, mutations, derived-state helpers) had to move up so `v1/utils/` isn't reaching back into `v1/blocks/sessions-guide/`.

```
event-libs/v1/utils/
  session-store.js               # SHARED, page-level: sessions/sessionsStatus/liveStreamActiveIds/favorited/scheduled/auth/pendingActions/sessionStateVersion signals; initSessionState(), getApiConfig(), scheduleSession(), favoriteSession(); also calls mountToast()/mountConflictModal()
  session-state.js                # SHARED: getNowMs, deriveSessionState, isInLiveNow — pure functions (moved out of this block)
  decorate.js                     # calls initSessionState() from decorateEvent(), before any block's init()

event-libs/v1/features/           # SHARED, non-block reusable rendering logic — imported directly by whichever
                                   # block needs it (existing convention, see features/carousel/milo-carousel.js)
  toast/
    toast.js                     # toast signal, showToast(), hideToast(), mountToast() — vanilla DOM, no Preact dependency
    toast.css                    # .sg-toast* rules, co-located and loaded on demand by mountToast() via loadStyle()
  conflict-modal/
    conflict-modal.js            # conflict signal, showConflictModal(), hideConflictModal(), mountConflictModal() — vanilla DOM
    conflict-modal.css           # .sg-modal-backdrop / .sg-conflict-modal* rules, co-located, loaded the same way

event-libs/v1/services/sessions/  # SHARED service layer (moved out of this block)
  sessions-api.js                 # fetchSessions — real ESL/ESP endpoint, falls back to MOCK_ESL_PAYLOAD with no event-id
  rainfocus.js                    # stub: fetchScheduled, fetchFavorited, addSession, removeSession, toggleSessionInterest
  mobile-rider.js                 # stub: fetchLiveStatus (returns all-inactive)
  poller.js                       # startPolling, stopPolling — takes a plain onUpdate callback, no dispatch coupling
  session-state-ticker.js          # startSessionStateTicker, stopSessionStateTicker — diffs deriveSessionState() per session on an interval, only calls onChange on a real transition
  session-actions.js              # scheduleAction, favoriteAction, hasTimeConflict, resolveScheduleConflict, SessionActionError — UI-agnostic; throws instead of dispatching toasts
  action-feedback.js              # runSessionAction(), scheduleWithFeedback(), favoriteWithFeedback() — translate SessionActionError into showToast()/showConflictModal() calls; no dispatch argument, usable by any block

event-libs/v1/blocks/sessions-guide/
  sessions-guide.js               # block entry (widget default, page via CSS class)
  sessions-guide-full-page.js     # separate block entry, registered as 'sessions-guide-full-page' in EVENT_BLOCKS; forces surface='page'
  sessions-guide.css              # all styles
  PLAN.md                         # this document
  REAL-API-CHECKLIST.md           # current mock → real API status
  store/
    index.js                      # block-local Preact Context + useReducer; UI-only state (drawer, view routing, filters) — toast/conflict modal moved out, see event-libs/v1/features/
  services/
    feds.js                       # getFedsToken() — implemented; not yet called in production flow (still block-local; no other block needs it yet)
  utils/
    time.js                       # getNowMs, detectUserTimezone, formatSessionTime, formatShortTime, formatSessionDate, isSessionLive, isSessionUpcoming, isSessionOnDemand, allSessionsEnded, getSessionDayKey
    session-filters.js            # sessionsForDay, groupByStartTime, groupByTrack, liveSessions, upcomingSessions, onDemandSessions, getFeaturedSessions, filterSessions
    url.js                        # setSessionsParam, setSessionParam, clearSessionParams
    ics.js                        # generateICS, downloadICS — RFC 5545 compliant
  components/
    App.js                       # root: branches on surface; renders RegistrationPrompt modal (Toast/ConflictModal are page-level singletons now, not rendered here)
    DrawerShell.js                # widget shell: peek/expand drawer, gestures, URL deep-linking, FilterPanel, SessionDetailOverlay
    FullPageShell.js             # page shell: URL params in/out, FilterPanel
    DrawerHeader.js               # title, DateTabs, ViewDropdown, DownloadButton, inline mobile search
    DateTabs.js                  # per-day tabs from state.eventDays
    ViewDropdown.js               # 4-option dropdown; sentence-case labels
    ViewRouter.js                 # routes activeView to the correct view component
    LiveUpcomingView.js          # live carousel + featured carousel + upcoming slots + previously-aired slots
    MySessionsView.js            # registration gate + live carousel + smart tabs + upcoming/on-demand subtabs
    MyFavoritesView.js           # mirror of MySessionsView using favorited set
    OnDemandView.js               # on-demand sessions grouped by track
    Carousel.js                   # LiveCard carousel with paged/native-scroll dual mode
    TimeSlotRow.js                # time label + horizontal SessionCard strip with transform scroll
    TrackRow.js                   # track label + horizontal SessionCard strip (on-demand in My Sessions/My Favorites)
    SessionCard.js                # small card: category badge, title, desc, time, action buttons
    LiveCard.js                   # large card: thumbnail, progress bar, CTAs
    SessionDetailOverlay.js      # full session detail: 2-col layout, share, expand description
    FilterPanel.js                # sidebar category list + checkbox options
    RegistrationPrompt.js        # inline/modal auth gate: login vs register variant
    DownloadButton.js             # ICS download trigger (My Sessions only)
    CategoryBadge.js              # category icon + label + color from getTrackIcon() (tier-1-event-config.js)
    IconButton.js                 # S2A icon-only button (solid/outlined/transparent)
    icons.js                      # IconPlay, IconCalendarCheck, IconCalendarPlus, IconHeartFilled, IconHeartOutline

test/unit/blocks/sessions-guide/
  sessions-guide.test.js
  store/index.test.js
  services/feds.test.js
  services/poller.test.js       # still tests here — imports from the new event-libs/v1/services/sessions/poller.js path
  utils/time.test.js
  utils/session-filters.test.js
  utils/ics.test.js
  components/SessionCard.test.js
  components/LiveCard.test.js
  components/FilterPanel.test.js
  components/RegistrationPrompt.test.js
  components/ViewRouter.test.js
  components/LiveUpcomingView.test.js
  components/MySessionsView.test.js
  components/OnDemandView.test.js
  components/Carousel.test.js
  components/TimeSlotRow.test.js
  mocks/
    default.html
    sessions.json               # sample sessions API response

test/unit/features/toast/
  toast.test.js                  # features/toast/toast.js — signal, mount idempotency, rendering, dismiss

test/unit/features/conflict-modal/
  conflict-modal.test.js         # features/conflict-modal/conflict-modal.js — signal, mount idempotency, rendering, confirm/cancel flows

test/unit/services/sessions/
  action-feedback.test.js        # services/sessions/action-feedback.js — SessionActionError reason → toast/conflict-modal mapping
  session-state-ticker.test.js   # services/sessions/session-state-ticker.js — diff-and-notify, self-stop, injectable clock
```

Test files for code that stayed block-local (`store/index.js`, `services/feds.js`, everything under `components/`) were **not** relocated when their imports moved to shared paths — they stayed under `test/unit/blocks/sessions-guide/` and just updated their import paths. `toast.js`, `conflict-modal.js`, and `action-feedback.js` are the first modules whose tests actually moved to sit next to the shared code they cover (`test/unit/features/`, `test/unit/services/sessions/`) rather than staying under this block's test tree — the pattern to follow for any future promotion out of this block.
