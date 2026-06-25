# Sessions Guide Block — Implementation Plan

**Ticket:** MWPW-194331 · **Epic:** MWPW-192677  
**Assignee:** Daniel Oliva  
**Stack:** Preact · ES Modules · BlockMediator (IMS + RSVP) · Milo/IMS · FEDS

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
| App-wide state | Preact Context + `useReducer` | Sessions, scheduled, favorited, active view, filters, search — single source of truth |
| Local UI state | `useState` | Drawer open/closed, carousel index, filter panel open/closed, mobile search open |
| Scheduled / favorited persistence | Rainfocus API (mocked) + localStorage | Source of truth for registered users — fetched on load, mutated via RF API calls, persisted locally |
| Auth/registration dev state | `localStorage` (`sg:dev-auth`) | Dev-only override so Milo's guest IMS cannot overwrite dev user state |
| IMS profile | `BlockMediator` | Read `imsProfile` — existing project pattern |
| RSVP / registration | `BlockMediator` | Read `rsvpData.registered` — existing project pattern |
| Inter-block (same page) | `BlockMediator` | Existing pattern used by other blocks on the page |
| URL state | `history.pushState` | Widget: `?sessions` / `?session=<slug>-<rfCode>`. Full page: `?view=` / `?filter=` / `?search=` |

### Why not BlockMediator as primary state
The widget (`/max.html`) and full-page (`/max/2026/sessions.html`) are on different pages — BlockMediator is in-memory and cannot survive a page navigation. Within a single page, Preact Context is cleaner and more testable than a global pub/sub store. Rainfocus is the authoritative persistence layer for scheduled and favorited sessions: mutations call the RF API, and each surface rehydrates from RF on init. localStorage provides a client-side cache between page loads.

### Polling architecture
A single `setInterval` (30 s) starts after sessions are loaded (when `sessionsStatus === 'ready'`). It calls the Mobile Rider batch API for all sessions that have an `mrStreamId`. The polling engine self-stops when all MR sessions report inactive (stream day over). Sessions are awaited in `init()` before Preact mounts, so polling starts immediately after the first `useEffect` runs on `sessionsStatus`.

### Auth architecture
Auth state comes from two sources coordinated in `SessionGuideProvider`:
1. `localStorage` (`sg:dev-auth`) — checked first; dev-mode override that prevents Milo's guest IMS from overwriting the dev user.
2. `BlockMediator` — listens to both `imsProfile` and `rsvpData`. `isRegistered` is derived from `rsvpData.registered === true`. Both `subscribe` handlers call the same `syncAuth()` function.

Real FEDS token (`getFedsToken()`) and RF credential wiring are implemented but not yet activated — Rainfocus service methods currently return mock data.

### Timezone
All session times come from the event API in UTC. `detectUserTimezone()` detects the user's timezone via `Intl.DateTimeFormat().resolvedOptions().timeZone` at init and stores it as `eventConfig.userTz`. Cards and overlays read `userTz` from context. A `?serverTime=<ms>` URL parameter overrides `Date.now()` for testing via `getNowMs()`.

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
              ├── Toast
              ├── ConflictModal
              └── RegistrationPrompt (modal wrapper in App, content from RegistrationPrompt component)
```

### Shared utility components
- `CategoryBadge` — renders category icon + label; color driven by `eventConfig.categoryColors`
- `IconButton` — S2A icon-only button (solid/outlined/transparent variants, on-light/on-dark contexts)
- `icons.js` — SVG icon functions: `IconPlay`, `IconCalendarCheck`, `IconCalendarPlus`, `IconHeartFilled`, `IconHeartOutline`

---

## State Shape

```javascript
// Held in Preact Context via useReducer — actual shape from buildInitialState()
{
  sessions: Session[],              // fetched from event API on init; mocked currently
  sessionsStatus: 'loading' | 'ready' | 'error',
  drawerState: 'hidden' | 'peek' | 'expanded',
  scheduled: Set<string>,           // session IDs — persisted to localStorage; source of truth is Rainfocus (mocked)
  favorited: Set<string>,           // session IDs — persisted to localStorage; source of truth is Rainfocus (mocked)
  liveStreamActiveIds: Set<string>, // mrStreamIds currently active per MR poll (mocked = empty Set)
  activeView: 'live-upcoming' | 'my-sessions' | 'my-favorites' | 'on-demand',
  eventDays: string[],              // ISO date strings derived from sessions; replaces static config.days
  activeDay: string,                // ISO date string e.g. '2026-11-10'
  activeFilters: {                  // keyed by filter category id (session property name)
    [categoryId]: Set<string>,      // e.g. { track: Set<'Design','Video'>, type: Set<'Lab'> }
  },
  searchQuery: string,
  mySessionsTab: 'upcoming' | 'on-demand',
  myFavoritesTab: 'upcoming' | 'on-demand',
  isLoggedIn: null | boolean,        // null = IMS still loading
  isRegistered: undefined | boolean, // undefined = registration status loading
  userFirstName: string | null,
  eventConfig: EventConfig,
  activeSessionId: string | null,    // id of session shown in detail overlay (widget only)
  toast: ToastState | null,
  pendingActions: Set<string>,       // session IDs with in-flight RF API calls
  dismissingIds: Set<string>,        // session IDs currently animating out of My Sessions/My Favorites
  regPromptOpen: boolean,            // drives modal RegistrationPrompt (from App-level gating)
  conflictModal: ConflictState | null, // null = closed; object = conflict data + onConfirm callback
}
```

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

interface EventConfig {
  title: string;                 // event display name; authored as 'event-title'
  rfApiUrl: string;              // Rainfocus base API URL
  rfApiProfileId: string;        // per-event Rainfocus profile ID
  registerUrl: string;           // registration CTA URL; default '/register'
  showConflictModal: boolean;
  filterCategories: FilterCategory[];  // [{ id, label }]; id maps to session property
  trackIcons: Record<string, string>;  // track label → icon URL
  trackColors: Record<string, string>; // track label → CSS color
  categoryColors: Record<string, string>; // category key → CSS color (for CategoryBadge)
  manualOnDemandTransitionTime: string | null;
  featuredSessionIds: string[];  // session IDs for featured carousel; falls back to deterministic random
  theme: 'light' | 'dark';      // default: widget='dark', page='light'
  mrEnv: 'dev' | 'prod';        // Mobile Rider API environment
  surface: 'widget' | 'page';   // set from el.classList.contains('page')
  userTz: string;               // detected at init via detectUserTimezone()
}
```

Note: `session.state` is **not** stored in the reducer — it is computed on every render via `deriveSessionState(session, liveStreamActiveIds, now)` in `utils/session-state.js`. Keeping derived state out of the store prevents stale-state bugs.

Note: `eventConfig.days` from the original plan was removed. Event days are now **derived from sessions** via `deriveEventDays(sessions, userTz)` in the store, not authored as config. `state.eventDays` holds the derived array.

### Reducer actions (complete list)

| Action | Effect |
|---|---|
| `INIT_USER_DATA` | Set `scheduled` + `favorited` Sets from Rainfocus fetch |
| `LIVE_STATUS_UPDATE` | Update `liveStreamActiveIds`; auto-transition to `on-demand` view if all sessions ended or manual cutoff passed |
| `SCHEDULE_ADD` / `SCHEDULE_REMOVE` | Mutate `scheduled` Set |
| `FAVORITE_ADD` / `FAVORITE_REMOVE` | Mutate `favorited` Set |
| `SET_VIEW` | Change `activeView`; persist to `sessionStorage` (`sg:last-view`) |
| `SET_DAY` | Change `activeDay` |
| `SET_FILTERS` | Replace `activeFilters` |
| `SET_SEARCH` | Update `searchQuery` |
| `SET_MY_TAB` | Switch `mySessionsTab` (`upcoming` / `on-demand`) |
| `SET_MY_FAVORITES_TAB` | Switch `myFavoritesTab` (`upcoming` / `on-demand`) |
| `IMS_UPDATE` | Set `isLoggedIn`, `isRegistered`, `userFirstName` |
| `SESSIONS_LOADED` | Set `sessions` array, flip `sessionsStatus` to `'ready'`, re-derive `eventDays` / `activeDay` |
| `SET_SESSIONS_STATUS` | Set `sessionsStatus` to `'loading'` or `'error'` |
| `SET_DRAWER` | Set `drawerState`; restores last view from `sessionStorage` on open |
| `SET_ACTIVE_SESSION` | Set `activeSessionId` (opens/closes detail overlay) |
| `SHOW_TOAST` / `HIDE_TOAST` | Set / clear `toast` object |
| `SET_PENDING` | Add/remove session ID from `pendingActions` |
| `SHOW_REG_PROMPT` / `HIDE_REG_PROMPT` | Set `regPromptOpen` |
| `SHOW_CONFLICT` / `HIDE_CONFLICT` | Set / clear `conflictModal` |
| `ADD_DISMISSING_ID` / `REMOVE_DISMISSING_ID` | Manage `dismissingIds` Set for card exit animations |

---

## Phase 0 — Foundation ✅ Complete

**Goal:** Set up the block skeleton, Preact integration, state architecture, and shared utilities.

### 0.1 Block scaffold ✅
- `sessions-guide.js` with `export default async function init(el)` entry point
- `'sessions-guide'` registered in `event-libs/v1/libs.js` → `EVENT_BLOCKS`
- Imports Preact from `event-libs/v1/deps/htm-preact.js` (local `deps/`, not URL-resolved)
- `init()` awaits the session fetch (resolves to mock data), then mounts Preact
- Widget surface: mounts into a `<div class="sg-portal">` appended to `document.body`
- Page surface: mounts directly into `el`
- Dev helpers: `setupDevUser()` / `seedDevStorage()` called in `init()` — sets `sg:dev-auth`, `sg:scheduled`, `sg:favorited` in localStorage for development (TODO: remove before shipping)

### 0.2 Config parsing ✅
`parseConfig(el)` reads the authoring table (standard Milo block format) into `eventConfig`:
- `event-title`, `rainfocus-api-url`, `rainfocus-api-profile-id`, `register-url`
- `show-conflict-modal` (boolean)
- `filter-categories` (JSON: `[{ id, label }]`)
- `track-icons` (JSON map), `track-colors` (JSON map), `category-colors` (JSON map)
- `manual-on-demand-transition-time` (ISO datetime or null)
- `theme` (`light` | `dark`; defaults: widget=`'dark'`, page=`'light'`)
- `mr-env` (`dev` | `prod`; default `'dev'`)
- `featured-sessions` (JSON array of session IDs)
- `surface` derived from `el.classList.contains('page')`
- `userTz` set via `detectUserTimezone()`

### 0.3 Data layer ✅ (mocked)
All service files exist and export the correct API surface; all currently return mock data:

**`services/sessions-api.js`** — `fetchSessions(apiUrl)` returns `normalizeSessions(MOCK_SESSIONS)`. `MOCK_SESSIONS` is a 30-session catalog covering Adobe MAX 2026 Nov 10–12. TODO: replace with real API call.

**`services/rainfocus.js`** — stub implementations returning mock data:
- `fetchScheduled()` → `['session-1', 'session-3']`
- `fetchFavorited()` → `['session-2']`
- `addSession()`, `removeSession()`, `toggleSessionInterest()` → `{ ok: true }`

**`services/mobile-rider.js`** — `fetchLiveStatus(mrStreamIds, env)` → `{ active: new Set(), inactive: new Set(mrStreamIds) }`. TODO: replace with real MR API call.

**`services/feds.js`** — `getFedsToken()` — implemented (checks `window?.feds?.data?.authToken`, waits for `feds.data.authToken.loaded` event, 8 s timeout). Not yet called in production flow.

**`services/dev-mock.js`** — `setupDevUser()` / `seedDevStorage()` — sets `sg:dev-auth` and seeds `sg:scheduled` / `sg:favorited` in localStorage for development.

### 0.4 Preact Context + Reducer ✅
`store/index.js` exports:
- `buildInitialState(eventConfig, initialSessions)` — initializes all state including reading localStorage for `scheduled`, `favorited`, `sg:dev-auth`
- `reducer(state, action)` — handles all action types listed above
- `SessionGuideContext` — the Preact context object (also exposed as `SessionGuideContext._current` for direct useContext compatibility workaround)
- `SessionGuideProvider` — wraps the app; manages auth sync, localStorage persistence, session fallback fetch, and polling lifecycle
- `useSessionGuide()` — `useContext(SessionGuideContext)` convenience hook
- `buildStore()` — compatibility shim for tests (returns `{ SessionGuideContext, useSessionGuide }`)

`SessionGuideProvider` runs four `useEffect` hooks:
1. Auth sync from `localStorage` / BlockMediator (`imsProfile` + `rsvpData`)
2. localStorage persistence of `scheduled` / `favorited` on change (skips initial mount)
3. Fallback session fetch when `initialSessions` is empty
4. MR polling lifecycle keyed on `sessionsStatus === 'ready'`

### 0.5 Time utilities ✅
`utils/time.js`:
- `getNowMs()` — `Date.now()` with `?serverTime=<ms>` URL override for testing
- `detectUserTimezone()` — `Intl.DateTimeFormat().resolvedOptions().timeZone` with `'UTC'` fallback
- `formatSessionTime(utcIso, userTz)` — localized with timezone abbreviation
- `formatShortTime(utcIso, userTz)` — localized without timezone abbreviation
- `formatSessionDate(utcIso, userTz)` — weekday + month + day
- `isSessionLive(session, nowMs)`, `isSessionUpcoming(session, nowMs)`, `isSessionOnDemand(session, nowMs)`, `allSessionsEnded(sessions, nowMs)`
- `getSessionDayKey(session, userTz)` — ISO date string using `en-CA` locale (YYYY-MM-DD)

### 0.6 Polling engine ✅
`services/poller.js`:
- Module-level `_dispatch` and `_timerId` singletons
- `injectDispatch(dispatch)` — called from `SessionGuideProvider` before starting polling
- `tick(mrSessions, env)` — calls `fetchLiveStatus`, dispatches `LIVE_STATUS_UPDATE`, self-stops polling when all MR sessions inactive
- `startPolling(mrSessions, env, intervalMs = 30_000)` — no-op when `mrSessions.length === 0`; calls `stopPolling()` first to reset any prior interval; fires immediate first tick
- `stopPolling()` — clears interval, nulls timer

### 0.7 Auth integration ✅ (dev path only; production credentials not yet wired)
Auth state flows from localStorage (`sg:dev-auth`) or BlockMediator (`imsProfile` + `rsvpData`) into the store via `IMS_UPDATE` dispatch. The localStorage path takes priority to prevent Milo's guest IMS from overwriting a dev user.

`isRegistered` is derived from `rsvpData.registered === true` — sourced from BlockMediator `rsvpData` key.

Real FEDS token (`getFedsToken()`) and RF credential wiring: `session-actions.js` passes `null` for `rfAuthToken`/`clientId` to all RF service calls (TODO comments mark the integration points).

### 0.8 CSS custom properties ✅
`sessions-guide.css` contains all block styles. Theme applied via `data-theme` attribute on `sg-portal` (widget) or `el` (page).

---

## Phase 1 — Drawer Shell (Widget) ✅ Complete

**Goal:** The peek-to-expand bottom drawer renders correctly on all breakpoints with the header and view routing.

### 1.1 Surface detection ✅
```javascript
const surface = el.classList.contains('page') ? 'page' : 'widget';
```
`surface` is stored in `eventConfig` and drives the `App` branch between `<DrawerShell>` and `<FullPageShell>`.

### 1.2 Portal architecture (widget only) ✅
The widget mounts into `<div class="sg-portal">` appended to `document.body`. The `.sessions-guide.widget` block element is cleared (`el.innerHTML = ''`) and serves as an invisible mount point.

### 1.3 Sessions fetch — dual-path pattern ✅
Sessions are fetched and awaited in `init()` before Preact mounts. If `init()` resolves sessions, they are passed as `initialSessions` and `sessionsStatus` starts as `'ready'`. If the initial fetch fails (returns `[]`), `SessionGuideProvider` has a fallback `useEffect` that re-fetches from `eventConfig.rfApiUrl`.

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

**`userTz` source:** read from `eventConfig.userTz` via context.

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
- Auto-activated by `LIVE_STATUS_UPDATE` reducer when `allEnded || pastManualCutoff`

### 3.5 View transitions ✅
All view switches are instant — `ViewRouter` returns the active view component based on `state.activeView`.

---

## Phase 4 — Session Interactions ✅ Complete

**Goal:** Add to Schedule, Favorite, Conflict Modal, and ICS download all work, with pessimistic updates.

### 4.1 Add to Schedule / Remove ✅
`session-actions.js` → `scheduleAction(session, state, dispatch)`:
- Auth gate: `isLoggedIn !== true` → toast "Login required" with login CTA; `isRegistered !== true` → toast "Registration required" with register link. Both use `SHOW_TOAST` with `duration: null` (persistent until dismissed)
- Pending guard: no-op if `pendingActions.has(session.id)`
- `SET_PENDING` dispatched before and after RF call
- Remove path: `removeSession()` → `SCHEDULE_REMOVE` → toast "Removed from schedule"
- Add path: optional `SHOW_CONFLICT` if `showConflictModal` and time conflict found; else `addSession()` → `SCHEDULE_ADD` → toast "Added to schedule"
- Error: toast "Something went wrong. Please try again." (variant `negative`)
- Dismiss animation: `ADD_DISMISSING_ID` + 450 ms delay before RF call when removing from My Sessions view

### 4.2 Favorite / Unfavorite ✅
`session-actions.js` → `favoriteAction(session, state, dispatch)`:
- Same auth gate as schedule
- `toggleSessionInterest()` → `FAVORITE_ADD` or `FAVORITE_REMOVE` → toast
- Dismiss animation: same 450 ms pattern when removing from My Favorites view

### 4.3 ConflictModal component ✅
- Renders two radio-style `<label>` cards: "Currently scheduled" (existing) vs "New session" (incoming)
- Save button calls `conflictModal.onConfirm(keep, remove)` then `HIDE_CONFLICT`
- Cancel / backdrop click: `HIDE_CONFLICT`
- Local `saving` state drives "Saving…" label and disabled state on Save button
- `conflictModal` in state holds `{ existing, incoming, onConfirm }` — callback is a closure over current session data

### 4.4 Toast component ✅
- Four variants: `neutral`, `informative`, `positive`, `negative`
- Icons: `InfoIcon` (informative), `CheckIcon` (positive), `AlertIcon` (negative)
- Enter animation: double rAF to ensure browser paints hidden state before CSS transition
- Auto-dismiss after `toast.duration` ms (default 1500); `duration: null` = persistent (auth prompts)
- Manual dismiss: X button sets `visible = false`; `transitionend` fires `HIDE_TOAST` and unmounts
- Optional CTA: `ctaHref` renders as `<a>`; `ctaAction` renders as `<button>`

### 4.5 ICS download ✅
`utils/ics.js` → `generateICS(sessions)` / `downloadICS(sessions, filename)`:
- RFC 5545 compliant: `BEGIN:VCALENDAR`, `VEVENT` per session
- `DTSTART`/`DTEND` in UTC (`Z` suffix)
- `SUMMARY`, `DESCRIPTION` (includes speaker names), `URL`
- Line folding at 75 octets per RFC 5545 §3.1
- Triggered by `DownloadButton` in My Sessions view header (only shown when `activeView === 'my-sessions'`)

### 4.6 RegistrationPrompt component ✅
- `isLoggedIn === false` → "Sign in and register" + `window.adobeIMS?.signIn()` button
- Else (logged in, not registered) → "Register for the event" + `<a href="/register">` (register URL from eventConfig)
- Rendered inline inside each view (My Sessions, My Favorites) for the full-view gate
- Also rendered as a modal from `App` when `regPromptOpen === true` (triggered by `SHOW_REG_PROMPT`)

> **Note:** The current auth gate for scheduleAction/favoriteAction uses `SHOW_TOAST` (not `SHOW_REG_PROMPT`). The modal RegistrationPrompt (`regPromptOpen`) is wired up in `App` but not currently triggered by schedule/favorite interactions.

---

## Phase 5 — Session State & Time-Based Behaviors ✅ Complete

**Goal:** Live Now eligibility, on-demand derivation, and post-event auto-transition are all implemented.

### 5.1 Session state derivation ✅
`utils/session-state.js` → `deriveSessionState(session, liveStreamActiveIds, nowMs)`:
- MR sessions: inactive in poll API → `'on-demand'` (if past start) or `'upcoming'` (pre-start); active → `'live'` (if past start) or `'upcoming'`
- Non-MR: pure time window — `'on-demand'` if past end, `'live'` if between start/end, `'upcoming'` if pre-start

### 5.2 Live Now eligibility ✅
`utils/session-state.js` → `isInLiveNow(session, liveStreamActiveIds, nowMs)`:
- Only MR sessions past their start time that are active in the MR API qualify for Live Now

### 5.3 Reducer — LIVE_STATUS_UPDATE ✅
Implemented in `reducer` in `store/index.js`. Post-event auto-transition: `allEnded || pastManualCutoff` and `activeView === 'live-upcoming'` → switch to `'on-demand'`.

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
No separate block entry (`sessions-guide-full-page.js` does not exist). The same `sessions-guide` block handles both surfaces via `el.classList.contains('page')`. Authors write `sessions-guide (page)` in the table.

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
- `store/index.js`: full reducer coverage, `buildInitialState`, localStorage persistence
- `utils/time.js`: timezone conversion, `getNowMs` override, `getSessionDayKey`
- `utils/session-state.js`: `deriveSessionState` + `isInLiveNow` — pure functions, easy to cover
- `utils/session-filters.js`: all filter/grouping functions
- `utils/ics.js`: RFC 5545 output, line folding, edge cases
- `services/session-actions.js`: auth gate, pessimistic mutation flow, conflict detection
- `services/feds.js`: already-present token, late arrival via event, 8 s timeout

### 14.2 Component tests (priority order)
- `SessionCard`: on-demand/upcoming rendering, `forceOnDemand` prop, `dismissingIds` class, `hoverAnim` state, iOS touch handler
- `Toast`: auto-dismiss timing, enter/exit transitions, variant classes, persistent (duration=null) behavior
- `ConflictModal`: radio selection, save/cancel flow
- `FilterPanel`: local filter state, apply/reset, dynamic option derivation
- `RegistrationPrompt`: logged-out vs logged-in-unregistered variants

### 14.3 Integration tests (priority order)
- Full view rendering for all 4 views
- Poll-driven state update via `LIVE_STATUS_UPDATE`
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
  - `setupDevUser()` / `seedDevStorage()` calls in `sessions-guide.js`
  - `services/dev-mock.js` (or gate behind `?sgDev=true`)
- Wire real API calls in `services/rainfocus.js` (replace mock stubs with FEDS token + IMS userId)
- Wire real API call in `services/mobile-rider.js`
- Wire real API call in `services/sessions-api.js` (replace `MOCK_SESSIONS` with actual endpoint)
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
| `isRegistered` source wiring | Wired via `BlockMediator.get('rsvpData').registered`; dev state via `sg:dev-auth` localStorage; production wiring blocked on real Rainfocus integration |
| Real Rainfocus API calls not wired | All RF service methods are stubs; `null` credentials passed in `session-actions.js`; must replace before shipping |
| Real Mobile Rider API not wired | `fetchLiveStatus` returns all-inactive mock; polling runs but no live sessions will appear |
| Real sessions API not wired | `MOCK_SESSIONS` used; replace `fetchSessions` with real endpoint before shipping |
| Dev scaffolding (`setupDevUser`) in production path | `TODO` comments present; must remove or gate before PR |
| 30 s polling causes excessive re-renders | Preact diffing handles; `useMemo` guards in view components on filter-derived lists |
| RF pessimistic mutations feel slow | `pendingActions` Set + `is-pending` class on buttons covers perceived latency; error toast on failure |
| Timezone DST edge case on multi-day events | `Intl.DateTimeFormat` handles DST automatically; date tabs use noon UTC to avoid midnight DST edge |
| iOS synthetic click routing through transform ancestors | Handled via `ontouchend` in `SessionCard`; `elementFromPoint` dispatch to correct action button |
| `drawerStateRef` stale closure in gesture handlers | All gesture handler refs use `useRef` values; re-registered once on mount with stable `[]` deps |
| `SessionGuideContext._current` direct assignment | Workaround for Preact `useContext` behavior when `App` is called directly from `children()`; documented in comment |

---

## File Structure

```
event-libs/v1/blocks/sessions-guide/
  sessions-guide.js             # block entry (both surfaces — widget default, page via CSS class)
  sessions-guide.css            # all styles
  PLAN.md                       # this document
  store/
    index.js                    # Preact Context + useReducer; buildInitialState, reducer, SessionGuideProvider, useSessionGuide
  services/
    sessions-api.js             # fetchSessions — mocked with MOCK_SESSIONS; includes MOCK_FEATURED_IDS
    rainfocus.js                # stub: fetchScheduled, fetchFavorited, addSession, removeSession, toggleSessionInterest
    mobile-rider.js             # stub: fetchLiveStatus (returns all-inactive)
    poller.js                   # startPolling, stopPolling, injectDispatch
    feds.js                     # getFedsToken() — implemented; not yet called in production flow
    session-actions.js          # scheduleAction, favoriteAction, hasTimeConflict — orchestrates RF API + dispatch
    dev-mock.js                 # setupDevUser, seedDevStorage — TODO: remove before shipping
  utils/
    time.js                     # getNowMs, detectUserTimezone, formatSessionTime, formatShortTime, formatSessionDate, isSessionLive, isSessionUpcoming, isSessionOnDemand, allSessionsEnded, getSessionDayKey
    session-state.js            # deriveSessionState, isInLiveNow — pure functions
    session-filters.js          # sessionsForDay, groupByStartTime, groupByTrack, liveSessions, upcomingSessions, onDemandSessions, getFeaturedSessions, filterSessions
    url.js                      # setSessionsParam, setSessionParam, clearSessionParams
    ics.js                      # generateICS, downloadICS — RFC 5545 compliant
  components/
    App.js                      # root: branches on surface; renders Toast, ConflictModal, RegistrationPrompt modal
    DrawerShell.js              # widget shell: peek/expand drawer, gestures, URL deep-linking, FilterPanel, SessionDetailOverlay
    FullPageShell.js            # page shell: URL params in/out, FilterPanel
    DrawerHeader.js             # title, DateTabs, ViewDropdown, DownloadButton, inline mobile search
    DateTabs.js                 # per-day tabs from state.eventDays
    ViewDropdown.js             # 4-option dropdown; sentence-case labels
    ViewRouter.js               # routes activeView to the correct view component
    LiveUpcomingView.js         # live carousel + featured carousel + upcoming slots + previously-aired slots
    MySessionsView.js           # registration gate + live carousel + smart tabs + upcoming/on-demand subtabs
    MyFavoritesView.js          # mirror of MySessionsView using favorited set
    OnDemandView.js             # on-demand sessions grouped by track
    Carousel.js                 # LiveCard carousel with paged/native-scroll dual mode
    TimeSlotRow.js              # time label + horizontal SessionCard strip with transform scroll
    TrackRow.js                 # track label + horizontal SessionCard strip (on-demand in My Sessions/My Favorites)
    SessionCard.js              # small card: category badge, title, desc, time, action buttons
    LiveCard.js                 # large card: thumbnail, progress bar, CTAs
    SessionDetailOverlay.js     # full session detail: 2-col layout, share, expand description
    FilterPanel.js              # sidebar category list + checkbox options
    ConflictModal.js            # schedule conflict resolution modal
    Toast.js                    # transient notification with enter/exit animation
    RegistrationPrompt.js       # inline/modal auth gate: login vs register variant
    DownloadButton.js           # ICS download trigger (My Sessions only)
    CategoryBadge.js            # category icon + label + color from eventConfig.categoryColors
    IconButton.js               # S2A icon-only button (solid/outlined/transparent)
    icons.js                    # IconPlay, IconCalendarCheck, IconCalendarPlus, IconHeartFilled, IconHeartOutline

test/unit/blocks/sessions-guide/
  sessions-guide.test.js
  store/index.test.js
  services/sessions-api.test.js
  services/rainfocus.test.js
  services/mobile-rider.test.js
  services/poller.test.js
  services/feds.test.js
  services/session-actions.test.js
  utils/time.test.js
  utils/session-state.test.js
  utils/session-filters.test.js
  utils/ics.test.js
  components/SessionCard.test.js
  components/LiveCard.test.js
  components/ConflictModal.test.js
  components/Toast.test.js
  components/FilterPanel.test.js
  components/RegistrationPrompt.test.js
  mocks/
    default.html
    sessions.json               # sample sessions API response
```
