# Sessions Guide Block — Implementation Plan

**Ticket:** MWPW-194331 · **Epic:** MWPW-192677  
**Assignee:** Daniel Oliva  
**Stack:** Preact · ES Modules · BlockMediator (IMS only) · Milo/IMS · FEDS

---

## Overview

The Session Guide is a complex, stateful event browser that ships in two surfaces:

1. **Widget** — a peek-to-expand bottom drawer embedded on the event homepage
2. **Full Page** — a standalone page at `/max/2026/sessions.html`

Both surfaces share the same component architecture and must always reflect identical session state. Sessions are fetched from the event API on initial load; scheduled and favorited sessions are fetched from Rainfocus on load (registration-gated). Live stream status for Mobile Rider sessions is polled every 30 s from the MR API. Non-MR sessions use time-window logic to determine live state. The block handles time-based state transitions, auth-aware views, and a rich set of user interactions across multiple responsive breakpoints.

---

## Architecture Decisions

### Preact over vanilla JS
The prototype (`prototype/index.js`) already exposes the complexity: ~2000 lines of imperative DOM manipulation to manage ~15 distinct pieces of state. Preact gives us reactive rendering, collocated component state, and a natural model for the time-driven update loop without a build step. Preact is confirmed available at `${miloLibs}/deps/htm-preact.js`.

### State layers
| Layer | Tool | Purpose |
|---|---|---|
| App-wide state | Preact Context + `useReducer` | Sessions, scheduled, favorited, active view, filters, search — single source of truth |
| Local UI state | `useState` | Drawer open/closed, carousel index, panel open/closed |
| Scheduled / favorited persistence | Rainfocus API | Source of truth for registered users — fetched on load, mutated via RF API calls |
| IMS profile | `BlockMediator` | Read `imsProfile` — existing project pattern |
| Inter-block (same page) | `BlockMediator` | Publish `scheduledCount` etc. to other blocks on the homepage |
| URL state | `history.pushState` | Widget: `?sessions` / `?session=<slug>`. Full page: `?view=` / `?filter=` / `?search=` |

### Why not BlockMediator as primary state
The widget (`/max.html`) and full-page (`/max/2026/sessions.html`) are on different pages — BlockMediator is in-memory and cannot survive a page navigation. Within a single page, Preact Context is cleaner and more testable than a global pub/sub store. Rainfocus is the authoritative persistence layer for scheduled and favorited sessions: mutations call the RF API, and each surface rehydrates from RF on init.

### Polling architecture
A single `setInterval` (30 s) starts after sessions are loaded — it is not started on component mount. Because `init()` awaits the session fetch before mounting Preact, sessions are available as a prop when the component mounts, and polling starts immediately in the `useEffect`. It calls the Mobile Rider batch API for all sessions that have an `mrStreamId`.

```javascript
// poller.js
let _dispatch = null;
export const injectDispatch = (dispatch) => { _dispatch = dispatch; };

async function tick(mrSessions, env) {
  const ids = mrSessions.map(s => s.mrStreamId).join(',');
  const base = env === 'prod'
    ? 'https://overlay-admin.mobilerider.com'
    : 'https://overlay-admin-dev.mobilerider.com';
  const { active, inactive } = await fetch(`${base}/api/media-status?ids=${ids}`)
    .then(r => r.json());
  _dispatch?.({ type: 'LIVE_STATUS_UPDATE', active: new Set(active), inactive: new Set(inactive), now: Date.now() });
}

export function startPolling(mrSessions, env, intervalMs = 30_000) {
  if (!mrSessions.length) return; // nothing to poll
  tick(mrSessions, env);          // immediate first run
  return setInterval(() => tick(mrSessions, env), intervalMs);
}
```

### Timezone
All session times come from the event API in UTC. A `formatSessionTime(utcIso, userTz)` utility converts on render. `Intl.DateTimeFormat().resolvedOptions().timeZone` handles detection with a fallback to `eventConfig.baseTimezone`.

### User registration states
Three distinct states drive the UI:

| State | `isLoggedIn` | `isRegistered` | RF data |
|---|---|---|---|
| Loading | `null` | `undefined` | — |
| Logged out | `false` | `false` | absent |
| Logged in, not registered | `true` | `false` | absent |
| Logged in + registered | `true` | `true` | available |

All users see session cards, schedule/favorite buttons, and the My Sessions tab. The action gate is `isRegistered === true` — unregistered users clicking a gated action receive a `<RegistrationPrompt />`. The `isLoggedIn` flag is still held in state for display purposes (e.g. showing the user's first name) but does not gate any actions.

`isRegistered` source is deferred — it will be wired to either a BlockMediator key or `window.feds.utilities.getEventData()` in a follow-up. For Phase 0, mock it.

---

## Component Tree (High Level)

```
SessionsGuideBlock (init entry point)
  ├── SessionsGuideApp (Preact root)
  │     ├── DrawerShell  (widget only)
  │     │     ├── DrawerHeader
  │     │     │     ├── HeaderTitle
  │     │     │     ├── DateTabs
  │     │     │     └── RightControls
  │     │     │           ├── ViewDropdown
  │     │     │           ├── FilterButton → FilterPanel
  │     │     │           ├── SearchButton → SearchField
  │     │     │           └── DownloadButton (My Sessions only)
  │     │     ├── DrawerBody (scrollable)
  │     │     │     ├── LiveNowSection → LiveCardCarousel
  │     │     │     ├── FeaturedSection → FeaturedCarousel (future days)
  │     │     │     ├── BrandConciergeRibbon
  │     │     │     ├── UpcomingSessions → TimeSlotRow[] → SessionCard[]
  │     │     │     └── OnDemandSessions → TrackSection[] → SessionCard[]
  │     │     └── SessionDetailOverlay
  │     └── FullPageShell  (full page only)
  │           ├── FullPageHeader (same controls as DrawerHeader)
  │           ├── FullPageBody
  │           │     └── [same sections as DrawerBody]
  │           └── (no SessionDetailOverlay — cards link directly to session pages)
  ├── ConflictModal
  ├── RegistrationPrompt
  └── Toast
```

---

## State Shape

```javascript
// Held in Preact Context via useReducer — this is the shape of the reducer state
{
  sessions: Session[],              // fetched from event API on init, static after load
  scheduled: Set<string>,           // session IDs — source of truth is Rainfocus
  favorited: Set<string>,           // session IDs — source of truth is Rainfocus
  liveStreamActiveIds: Set<string>, // mrStreamIds currently active per MR poll
  activeView: 'live-upcoming' | 'my-sessions' | 'my-favorites' | 'on-demand',
  activeDay: string,                // ISO date string, e.g. '2026-10-28'
  activeFilters: {                  // keyed by filter category name
    channel: Set<string>,
    type: Set<string>,
    product: Set<string>,
    // ...configurable per event
  },
  searchQuery: string,
  mySessionsTab: 'upcoming' | 'on-demand',
  isLoggedIn: null | boolean,        // null = IMS still loading
  isRegistered: undefined | boolean, // undefined = registration status loading; mocked in Phase 0
  userFirstName: string | null,
  eventConfig: EventConfig,
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
  // Live section eligibility flags
  mrStreamId: string | null;     // Mobile Rider stream ID; non-null = MR session
  // On-demand
  videoAvailable: boolean;       // recording is ready; drives card click behavior
  inPerson: boolean;             // in-person session ("Recording coming soon" until videoAvailable)
  sessionPageUrl: string;
  watchUrl: string;              // Watch Now destination (keynote → homepage, other → channel page)
  isKeynote: boolean;
  thumbnailUrl: string | null;   // video thumbnail for LiveCard image panel; null when unavailable
  copyrightDisclaimer?: string;
}

interface EventConfig {
  title: string;
  days: string[];                // ISO date strings
  baseTimezone: string;          // IANA, e.g. 'America/Los_Angeles'
  userTz: string;                // detected at init via detectUserTimezone(baseTimezone); cards read from here
  rfApiUrl: string;              // Rainfocus base API URL
  rfApiProfileId: string;        // per-event Rainfocus profile ID; authored as config
  manualOnDemandTransitionTime: string | null;
  showConflictModal: boolean;
  filterCategories: FilterCategory[];
  trackIcons: Record<string, string>;   // track label → Spectrum SVG path
  trackColors: Record<string, string>;
  mrEnv: 'dev' | 'prod';
  surface: 'widget' | 'page';   // set in parseConfig from el.classList; drives App routing
}
```

Note: `session.state` is **not** stored in the reducer — it is derived on every render via `deriveSessionState(session, liveStreamActiveIds, now)` (see Phase 5). Keeping derived state out of the store prevents stale-state bugs.

---

## Phase 0 — Foundation

**Goal:** Set up the block skeleton, Preact integration, state architecture, and shared utilities.

### 0.1 Block scaffold
- Create `sessions-guide.js` with `export default async function init(el)` entry point
- Register `'sessions-guide'` in `event-libs/v1/libs.js` → `EVENT_BLOCKS`
- Import Preact from `${miloLibs}/deps/htm-preact.js` (confirmed available)
- `init()` awaits the session fetch before mounting Preact; all other async sources (FEDS token, IMS profile, Rainfocus) are non-blocking and flow in via dispatches after mount
- Mount `<SessionsGuideApp />` into `el`, passing parsed block config and initial session data as props

### 0.2 Config parsing
Parse authoring table (the standard Milo block table format) into `eventConfig`:
- `event-title`, `event-days`, `base-timezone`
- `show-conflict-modal` (boolean)
- `filter-categories` (JSON or delimited list)
- `track-icons` (JSON map)
- `manual-on-demand-transition-time` (ISO datetime or null)
- `theme` (`light` | `dark`)
- `rainfocus-api-url` — Rainfocus base API endpoint
- `rainfocus-api-profile-id` — per-event `rfApiProfileId` query param sent with every RF call

### 0.3 Data layer
Three distinct data sources, each in its own service file:

**`services/sessions-api.js`** — event API (own infrastructure):
- `fetchSessions(apiUrl)` → `Session[]`
- Called once in `init()`, awaited before Preact mounts. Response is normalized to the `Session` interface.
- Error handling with `window.lana?.log()`

**`services/rainfocus.js`** — Rainfocus API (registration-gated):
- `fetchScheduled(rfAuthToken, clientId, rfApiProfileId, rfApiUrl)` → `string[]` (session IDs)
- `fetchFavorited(rfAuthToken, clientId, rfApiProfileId, rfApiUrl)` → `string[]` (session IDs)
- `addSession(sessionTimeId, rfAuthToken, clientId, rfApiProfileId, rfApiUrl)` → confirmation
- `removeSession(sessionTimeId, rfAuthToken, clientId, rfApiProfileId, rfApiUrl)` → confirmation
- `toggleSessionInterest(sessionTimeId, sessionId, rfAuthToken, clientId, rfApiProfileId, rfApiUrl)` → confirmation
- Only called when `isRegistered === true`. Returns lists of session IDs cross-referenced against the sessions catalog in the store.
- All mutations are **pessimistic** — state is updated only after the RF call confirms success. The calling component shows a loading/disabled state on the action button while the call is in flight.

**`services/mobile-rider.js`** — Mobile Rider API (no auth):
- `fetchLiveStatus(mrStreamIds, env)` → `{ active: Set<string>, inactive: Set<string> }`
- Called by the polling engine every 30 s. Only sessions with `mrStreamId !== null` are included.

**`services/feds.js`** — FEDS auth utilities:
- `getFedsToken()` → `Promise<string>` — resolves immediately if `window.feds.data.authToken` is already set, otherwise waits for the FEDS auth token loaded event with an 8-second timeout before rejecting.

```javascript
export function getFedsToken() {
  const token = window?.feds?.data?.authToken;
  if (token) return Promise.resolve(token);

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error('[sessions-guide] FEDS auth token timed out')),
      8000,
    );
    window.addEventListener('feds.data.authToken.loaded', () => {
      clearTimeout(timeout);
      resolve(window.feds.data.authToken);
    }, { once: true });
  });
}
```

Note: the exact event name and attribute path must be confirmed against the live FEDS integration before shipping.

### 0.4 Preact Context + Reducer (primary state)
Create `event-libs/v1/blocks/sessions-guide/store/index.js`:

```javascript
// Action types
// INIT_USER_DATA      — set scheduled Set, favorited Set from Rainfocus fetch after registration confirmed
// LIVE_STATUS_UPDATE  — update liveStreamActiveIds from MR poll tick
// SCHEDULE_ADD/REMOVE — update scheduled set after RF API confirms; dispatch only on RF success
// FAVORITE_ADD/REMOVE — update favorited set after RF API confirms; dispatch only on RF success
// SET_VIEW            — change activeView
// SET_DAY             — change activeDay
// SET_FILTERS         — update activeFilters
// SET_SEARCH          — update searchQuery
// SET_MY_TAB          — switch Upcoming / On Demand tab
// IMS_UPDATE          — set isLoggedIn (null | boolean), isRegistered (undefined | boolean), userFirstName

export const SessionGuideContext = createContext(null);

export function SessionGuideProvider({ children, eventConfig, initialSessions }) {
  const [state, dispatch] = useReducer(reducer, buildInitialState(eventConfig, initialSessions));

  // sessions are in initialSessions (fetched before mount), so polling starts immediately
  useEffect(() => {
    injectDispatch(dispatch);
    const mrSessions = initialSessions.filter(s => s.mrStreamId);
    const timerId = startPolling(mrSessions, eventConfig.mrEnv);
    return () => clearInterval(timerId);
  }, []); // runs once — sessions are static after init

  return <SessionGuideContext.Provider value={{ state, dispatch }}>{children}</SessionGuideContext.Provider>;
}
```

- `scheduled` and `favorited` start as empty Sets in `buildInitialState()` and are populated by `INIT_USER_DATA` after the Rainfocus fetch resolves
- `initialSessions` is passed as a prop — sessions are fetched and awaited in `init()` before Preact mounts

### 0.5 Time utilities
Create `event-libs/v1/blocks/sessions-guide/utils/time.js`:
- `detectUserTimezone()` → IANA string with `Intl` fallback to base timezone
- `formatSessionTime(utcIso, userTz)` → localized display string
- `formatSessionDate(utcIso, userTz)` → localized date string
- `isSessionLive(session, nowMs)` → boolean
- `isSessionUpcoming(session, nowMs)` → boolean
- `isSessionOnDemand(session, nowMs)` → boolean
- `allSessionsEnded(sessions, nowMs)` → boolean (drives post-event auto-transition)
- `getSessionDayKey(session, userTz)` → ISO date string for date-tab grouping

### 0.6 Polling engine
Create `event-libs/v1/blocks/sessions-guide/services/poller.js`.

The engine polls only Mobile Rider sessions. Sessions without `mrStreamId` are handled purely by time-window logic in `deriveSessionState()` and never touch the network after initial load.

Polling starts from `SessionGuideProvider`'s `useEffect` on mount. Because `initialSessions` is passed as a prop (fetched and awaited in `init()` before mount), `mrSessions` is never empty due to a timing issue.

```javascript
let _dispatch = null;
export const injectDispatch = (dispatch) => { _dispatch = dispatch; };

async function tick(mrSessions, env) {
  try {
    const { active, inactive } = await fetchLiveStatus(
      mrSessions.map(s => s.mrStreamId),
      env,
    );
    _dispatch?.({ type: 'LIVE_STATUS_UPDATE', active, inactive, now: Date.now() });

    // Stop polling once all MR sessions are inactive (stream day is over)
    if (mrSessions.every(s => inactive.has(s.mrStreamId))) stopPolling();
  } catch (err) {
    window.lana?.log(`[sessions-guide] MR poll failed: ${err.message}`);
  }
}

let _timerId = null;
export function startPolling(mrSessions, env, intervalMs = 30_000) {
  if (!mrSessions.length) return; // no MR sessions on this event
  tick(mrSessions, env);          // immediate first run on init
  _timerId = setInterval(() => tick(mrSessions, env), intervalMs);
  return _timerId;
}
export function stopPolling() { clearInterval(_timerId); _timerId = null; }
```

`mrSessions` is the filtered list of sessions that have `mrStreamId !== null`. This list is static — sessions don't gain or lose `mrStreamId` after load.

### 0.7 Auth integration

Authentication and registration state come from two independent async sources that must both resolve before Rainfocus calls can fire:

- **`rfAuthToken`** — a FEDS-issued JWT. Fetched via `getFedsToken()` (see `services/feds.js`). Only present when `isRegistered === true`.
- **`clientId`** — the user's Adobe ID from `imsProfile.userId` via BlockMediator.

Coordination rules:
1. `BlockMediator.get('imsProfile')` is checked once on init. If a profile is already present, the IMS flow is triggered immediately. `BlockMediator.subscribe('imsProfile', ...)` handles late arrivals. Only one path fires — whichever resolves first sets a flag so the second is a no-op.
2. Once `isRegistered === true` (mocked in Phase 0; wired to FEDS/BlockMediator in a follow-up), trigger `Promise.all([getFedsToken(), getImsProfile()])`. Both must resolve before calling `fetchScheduled` / `fetchFavorited`.
3. Dispatch `IMS_UPDATE` with `{ isLoggedIn, isRegistered, userFirstName }` whenever auth state changes. `isLoggedIn` is `null` while IMS is loading, then `true` or `false`. `isRegistered` is `undefined` while loading, then `true` or `false`.
4. On successful Rainfocus fetch: dispatch `INIT_USER_DATA` with `{ scheduled: Set, favorited: Set }`.
5. All registration-gated actions gate on `state.isRegistered === true`; if false, the component renders `<RegistrationPrompt />`.

```javascript
// Rough init() sequence:
// 1. fetchSessions(apiUrl) — awaited; Preact mounts only after this resolves
// 2. render(<SessionsGuideApp initialSessions={sessions} />)
// 3. BlockMediator.get('imsProfile') — check immediately on init
// 4. BlockMediator.subscribe('imsProfile', handler) — for late IMS arrival; no-op if step 3 already fired
// 5. When isRegistered resolves to true:
//    Promise.all([getFedsToken(), getImsProfile()])
//      .then(([rfAuthToken, { userId }]) =>
//        Promise.all([
//          fetchScheduled(rfAuthToken, userId, rfApiProfileId, rfApiUrl),
//          fetchFavorited(rfAuthToken, userId, rfApiProfileId, rfApiUrl),
//        ]))
//      .then(([scheduled, favorited]) =>
//        dispatch({ type: 'INIT_USER_DATA', scheduled: new Set(scheduled), favorited: new Set(favorited) }))
//      .catch(err => window.lana?.log(err.message))
```

### 0.8 CSS custom properties
Port the S2A design tokens from `prototype/style.css` into `sessions-guide.css`. Keep the same token names (`--s2a-*`). No hardcoded hex values in component styles.

---

## Phase 1 — Drawer Shell (Widget)

**Goal:** The peek-to-expand bottom drawer renders correctly on all breakpoints with the header and skeleton content areas. Authoritative reference: `prototype/index.js` lines 1281–1368.

### 1.1 Surface detection
The block determines which surface to render from its second CSS class, added automatically by Milo's block decoration when the author writes `sessions-guide (page)` in the table:

```javascript
const surface = el.classList.contains('page') ? 'page' : 'widget'; // defaults to widget
```

`surface` is passed into `App` as an initial state value. `App` branches once at the top — `surface === 'widget' ? <DrawerShell> : <FullPage>` — and all shared inner content (session cards, views, filters, search, store) is surface-agnostic.

### 1.2 Portal architecture (widget only)
Both the CTA button and the drawer shell are portaled to `document.body` from the Preact tree. The `.sessions-guide.widget` block element becomes a zero-output invisible mount point — its physical position on the page is irrelevant to visual output.

Rationale: any ancestor with `transform`, `filter`, or `will-change` creates a new stacking context and makes `position: fixed` relative to that ancestor instead of the viewport. Portaling to body guarantees correct viewport-relative positioning regardless of the homepage's CSS.

In full-page mode, nothing is portaled — `el` is the visual surface rendered inline.

### 1.3 Sessions fetch — mount-first pattern
Sessions are fetched in a `useEffect` post-mount, not awaited before Preact mounts:

```javascript
// In SessionsGuideProvider
useEffect(() => {
  dispatch({ type: 'SET_SESSIONS_STATUS', status: 'loading' });
  fetchSessions(eventConfig.rfApiUrl)
    .then(sessions => dispatch({ type: 'SESSIONS_LOADED', sessions }))
    .catch(err => {
      window.lana?.log(`[sessions-guide] session fetch failed: ${err.message}`);
      dispatch({ type: 'SET_SESSIONS_STATUS', status: 'error' });
    });
}, []);
```

A spinner is shown inside the drawer body while `sessionsStatus === 'loading'`. This requires two additions to the store (see Phase 0 cross-reference):
- State field: `sessionsStatus: 'loading' | 'ready' | 'error'`
- Action: `SESSIONS_LOADED` — sets `sessions` array and flips `sessionsStatus` to `'ready'`

Polling starts in a second effect keyed on `sessionsStatus === 'ready'`:
```javascript
useEffect(() => {
  if (sessionsStatus !== 'ready') return;
  const mrSessions = sessions.filter(s => s.mrStreamId);
  injectDispatch(dispatch);
  const id = startPolling(mrSessions, eventConfig.mrEnv);
  return () => clearInterval(id);
}, [sessionsStatus]);
```

### 1.4 Drawer open/close

**Triggers:**
- **CTA button** — a Preact-rendered `position: fixed; bottom: 0` button portaled to `document.body`. Since the button lives in the Preact tree, it cannot be clicked before the handler exists — no window API, no `CustomEvent`, no BlockMediator key needed for this.
- **`?sessions` URL param** — checked on mount; opens directly to **expanded** (skips peek). `new URLSearchParams(location.search).has('sessions')` → `dispatch({ type: 'SET_DRAWER', drawer: 'expanded' })`.
- **`?session=<slug>` URL param** — opens to expanded + triggers session detail (Phase 6/10).

**State machine:**

Mobile (≤767 px) and desktop/tablet (≥768 px) differ in how the CTA opens the drawer:

| From | To | Trigger | Breakpoint |
|---|---|---|---|
| `hidden` | `expanded` | CTA button click | **Mobile (≤767 px)** |
| `hidden` | `peek` | CTA button click | Desktop/tablet (≥768 px) |
| `hidden` | `expanded` | `?sessions` or `?session=<slug>` on load | All |
| `peek` | `expanded` | Scroll-down (wheel) or swipe-up (touch) — proportional drag | Desktop/tablet only |
| `peek` | `hidden` | Backdrop click or close button | Desktop/tablet only |
| `expanded` | `hidden` | Backdrop click or close button | All |

On mobile the `peek` state is never entered — the CTA goes directly to `expanded` and the X button / backdrop tap goes directly to `hidden`. There is no `expanded → peek` transition on any breakpoint. Scroll-up while expanded scrolls content, never collapses the drawer.

**Heights:**
- **Peek:** content-derived — `headerH + liveH + (rowH × 0.5)` — measured from the rendered DOM at open time. Falls back to header-only when the live section is not visible.
- **Expanded:** full viewport minus `TOP_MARGIN = 20 px` (i.e. `drawer.style.top = '20px'`).

**CSS transition:** `top` property animated with `cubic-bezier(0.4, 0, 0.2, 1)` at `0.45 s` on open/close and on commit. Proportional drag uses `0.08 s linear` while gesture is in progress.

**Body scroll lock:** `document.body.style.overflow = 'hidden'` on open; restored on close.

**Content scroll:** `.body-scroll` is not scrollable until `drawerFullyExpanded` latches (`top ≤ TOP_MARGIN`). Before that, `overflow-y: hidden` is enforced on the scroll container, and `e.preventDefault()` on wheel/touch events prevents scroll-through to the page.

### 1.5 Gesture handling

Gesture handling is only relevant on desktop/tablet where the drawer can be in the `peek` state. On mobile the drawer goes directly from `hidden` to `expanded`, so these handlers are effectively no-ops on mobile (the guard `drawerStateRef.current === 'peek'` is never true).

**Desktop — wheel (peek → expanded):**
```javascript
drawerEl.addEventListener('wheel', (e) => {
  if (!open || drawerFullyExpanded) return;
  e.preventDefault();
  if (e.deltaY > 0) { // scroll down = expand
    const newTop = Math.max(TOP_MARGIN, currentTop - Math.abs(e.deltaY) * 1.2);
    if (newTop <= TOP_MARGIN) { drawerFullyExpanded = true; setDrawerTop(TOP_MARGIN, true); }
    else { setDrawerTop(newTop, false); }
  }
}, { passive: false });
```

**Desktop/tablet touch — swipe-up (peek → expanded):**
```javascript
drawerEl.addEventListener('touchmove', (e) => {
  if (!open || drawerFullyExpanded) return;
  const delta = touchPrevY - e.touches[0].clientY; // positive = swipe up
  touchPrevY = e.touches[0].clientY;
  if (delta > 0) {
    const newTop = Math.max(TOP_MARGIN, currentTop - delta * 1.5);
    if (newTop <= TOP_MARGIN) { drawerFullyExpanded = true; setDrawerTop(TOP_MARGIN, true); }
    else { setDrawerTop(newTop, false); }
    e.preventDefault();
  }
}, { passive: false });
```

The `drawerFullyExpanded` flag is a module-level boolean held in the `DrawerShell` component's closure (not in the Preact store — it is a UI implementation detail, not shared state).

### 1.6 Responsive variants

Mobile uses a simplified `hidden ↔ expanded` two-state model. Desktop/tablet uses the full `hidden → peek → expanded → hidden` model with gesture-driven expansion.

| Breakpoint | Drawer width | Drawer open behavior | Session row behavior |
|---|---|---|---|
| ≥1024 px | Centered, `min(1400px, 100%)` | CTA → `peek` → gesture → `expanded` | Transform-based horizontal scroll |
| 768–1023 px | Full width | CTA → `peek` → gesture → `expanded` | Transform-based horizontal scroll |
| ≤767 px | Full width | CTA → `expanded` directly (no `peek`) | Native horizontal scroll |

### 1.7 DrawerHeader component
- `position: sticky; top: 0` inside `.body-scroll`. Sticks to the top of the scroll container — not the viewport.
- Border-radius (`20px 20px 0 0`) matches the drawer shell's top corners.
- Contains: `HeaderTitle`, `DateTabs`, `RightControls`
- When a session detail overlay is open: `RightControls` collapses via `max-height: 0; opacity: 0; overflow: hidden; pointer-events: none` CSS transition (0.3 s ease). The `.drawer.detail-open` class on the shell drives this.

### 1.8 DateTabs component
- Renders one pill per `eventConfig.days` entry (ISO date strings)
- **Default active tab on open:** today's date matched against `eventConfig.days`. Fallbacks: first day if current date is before the event starts; last day if after the event ends.
- Active tab drives `activeDay` in store via `SET_DAY` dispatch
- Disabled state (`opacity: 0.35; pointer-events: none`) when `activeView === 'on-demand'`
- Tab label formatted with `Intl.DateTimeFormat` (e.g. "Oct 28")

### 1.9 ViewDropdown component
- Four options: "Live & Upcoming" / "My Sessions" / "My Favorites" / "On Demand"
- Updates `activeView` in store via `SET_VIEW`
- Unregistered users selecting "My Sessions" or "My Favorites" receive `<RegistrationPrompt />` instead of switching view
- Button label reflects active view; chevron rotates 180° on open (`transition: transform 0.15s ease`)
- Dropdown panel: `position: absolute; top: calc(100% + 6px); right: 0` — renders above body scroll, z-index above drawer content

---

## Phase 2 — Session Cards

**Goal:** The two card variants (small session card, large live card) render with all action buttons wired up.

### 2.0 Component conventions

**Factory pattern:** All Phase 2 components follow the same pattern as Phase 1 — `buildXxx(preact, store)` returns the component function. No raw `React.createElement` outside the factory.

**Context over props:** Cards read all shared state directly from `useSessionGuide()`. The only required prop for a card is `session`. Everything else (`scheduled`, `favorited`, `isRegistered`, `userTz`, `surface`, `eventConfig`) comes from context.

```javascript
export function buildSessionCard(preact, store) {
  const { html } = preact;
  const { useSessionGuide } = store;

  return function SessionCard({ session }) {
    const { state, dispatch } = useSessionGuide();
    const { scheduled, favorited, isRegistered, eventConfig } = state;
    const userTz = eventConfig.userTz;
    const isScheduled = scheduled.has(session.id);
    const isFavorited = favorited.has(session.id);
    // ...
  };
}
```

**`userTz` source:** Detected once in `parseConfig` via `detectUserTimezone(config.baseTimezone)` and stored as `eventConfig.userTz`. Cards read it from context — no prop threading required.

**Time-based state in Phase 2:** Cards derive display state (upcoming / live / on-demand) using the time utilities from `utils/time.js`. `isSessionOnDemand(session, Date.now())` is called at render time. Full MR-poll-aware derivation via `deriveSessionState()` is wired up in Phase 5; Phase 2 cards use pure time-window logic only.

**Interim mutation behavior (Phase 4 boundary):** Phase 2 wires up the schedule and favorite buttons with direct dispatch — no RF API call yet:
- `isRegistered !== true` → no-op (button click is silently swallowed; Phase 4 adds `<RegistrationPrompt />`)
- `isRegistered === true` → dispatch `SCHEDULE_ADD` / `SCHEDULE_REMOVE` / `FAVORITE_ADD` / `FAVORITE_REMOVE` immediately

Phase 4 replaces the direct dispatch with the pessimistic RF-then-dispatch pattern.

### 2.1 SessionCard component

Factory: `buildSessionCard(preact, store)`  
Only required prop: `session`

Renders:
- Track badge (Spectrum SVG icon + label + color from `eventConfig.trackIcons` / `eventConfig.trackColors`)
- Session title
- Session description (truncated to 2 lines via CSS `-webkit-line-clamp`)
- Time range (localized via `formatSessionTime(session.startTimeUtc, userTz)`) or `On-demand` label when `isSessionOnDemand(session, Date.now())`
- Schedule button (`icon-calendar`) — hidden when session is on-demand; no-op when `isRegistered !== true`
- Favorite button (`icon-heart`) — always rendered; no-op when `isRegistered !== true`

**Always-visible column (CSS-driven):**  
Active action buttons are permanently visible via CSS class modifiers; inactive icons appear only on hover:

```css
.sg-card .sg-card__actions { opacity: 0; }
.sg-card:hover .sg-card__actions { opacity: 1; }
.sg-card.is-scheduled .sg-card__btn--schedule { opacity: 1; } /* always visible when active */
.sg-card.is-favorited .sg-card__btn--favorite { opacity: 1; }
```

`.is-scheduled` and `.is-favorited` classes are applied to the card root element based on context state. No JavaScript visibility toggling.

**Card click behavior by surface and session state:**
- **Widget, upcoming/live:** opens `<SessionDetailOverlay />`
- **Widget, on-demand (video available):** navigates to `session.sessionPageUrl`
- **Widget, in-person on-demand (video not available):** opens `<SessionDetailOverlay />` with "Recording coming soon"
- **Full page (`eventConfig.surface === 'page'`):** navigates to `session.sessionPageUrl` in all states

### 2.2 LiveCard component (large)

Factory: `buildLiveCard(preact, store)`  
Only required prop: `session`

Used in Live Now section and Featured (upcoming days) section.

Renders:
- Large image panel (560 × 316 px) — `session.thumbnailUrl` as `<img>`; falls back to track-colored placeholder when `thumbnailUrl` is `null`
- Progress bar — `width: ((Date.now() - startMs) / (endMs - startMs) * 100)%` — snapshot at render time. Refreshes for free on every 30 s MR poll tick (the `LIVE_STATUS_UPDATE` dispatch triggers a re-render of the card tree)
- Track badge, localized time, title, description
- `Watch now` primary CTA → `session.watchUrl` (keynote: homepage player, other: channel page)
- Schedule button — same interim behavior as `SessionCard` (direct dispatch when registered, no-op otherwise)
- Favorite button — same
- Hover: background flips black, text flips white (CSS `transition` on `.sg-live-card`)

### 2.3 TimeSlotRow component

Factory: `buildTimeSlotRow(preact, store)`  
Required prop: `sessions` — pre-filtered `Session[]` for this time slot, passed in from the parent view

The parent view is responsible for filtering: it groups sessions by time slot, applies `activeDay` / `activeFilters` / `searchQuery`, and passes only the visible subset to each `TimeSlotRow`. The row itself does no filtering.

Renders:
- Time label (e.g. "9:15 AM") — derived from `sessions[0].startTimeUtc` via `formatShortTime` (no timezone abbreviation — times are shown in the user's local timezone)
- Horizontal card scroll strip containing one `<SessionCard />` per session in `sessions`
- Left/right scroll arrow buttons
  - **Desktop/tablet (≥768 px):** transform-based scroll — `translateX(offset)` with `offset` incremented by card width per arrow click
  - **Mobile (< 768 px):** native CSS horizontal scroll (`overflow-x: auto; scroll-snap-type: x mandatory`)
- Card width for desktop/tablet offset calculation is DOM-computed once on first render via `ref` on the first card element — no hardcoded pixel value

Row is omitted entirely when `sessions.length === 0` (parent view never renders it with an empty array).

### 2.4 Carousel component (shared)

Factory: `buildCarousel(preact, store)`  
Required prop: `sessions` — `Session[]` to display as `LiveCard`s

Reusable for Live Now section and Featured (upcoming days) section. The carousel owns rendering of `<LiveCard />`s internally — callers pass session objects, not pre-rendered cards.

Features:
- Prev/Next arrow buttons
- Dot indicators (one per session)
- Active index tracked in local `useState` (not in the global store — carousel position is ephemeral UI state)
- Keyboard: left/right arrows navigate when carousel is focused

---

## Phase 3 — Views

**Goal:** All four views render with the correct content and transitions between them are instant.

### 3.1 Live & Upcoming view
- Shows `<LiveNowSection />` for the current day if sessions are currently live
- Shows `<FeaturedSection />` for future days (upcoming keynotes/featured sessions)
- Shows `<UpcomingSessions />` grouped by time slot, filtered to `activeDay`
- `<BrandConciergeRibbon />` injected after the 2nd visible session row
- Heading: "Sessions" (or event title from config)
- Date tabs are enabled and control which day's sessions are shown

### 3.2 My Sessions view
- Registration gate: unregistered users (logged out or logged in) see `<RegistrationPrompt />`
- Sub-tabs: `Upcoming` | `On Demand`
- Upcoming sub-tab: same `<TimeSlotRow />` layout, filtered to `scheduled` sessions
- On Demand sub-tab: `<OnDemandSessions />` filtered to `scheduled` sessions
- `<DownloadButton />` visible (generates `.ics` file)
- `<BrandConciergeRibbon />` after 2nd row
- Personalized greeting: "Hi, {firstName}" in header

### 3.3 My Favorites view
- Registration gate: unregistered users (logged out or logged in) see `<RegistrationPrompt />`
- Same layout as My Sessions Upcoming tab, filtered to `favorited` sessions
- `<BrandConciergeRibbon />` after 2nd row

### 3.4 On Demand Sessions view
- Organized by primary track (channel)
- Track order controlled by `eventConfig.onDemandTrackOrder`
- Session cards show no time
- In-person sessions with `videoAvailable: false` show "Recording coming soon" label
- Date tabs disabled in this view
- `<BrandConciergeRibbon />` after 2nd row
- Activated automatically post-event (see Phase 5)

### 3.5 View transitions
- All view switches are instant (no animation) — user chose this explicitly in the prototype
- `applyView(instant = true)` equivalent: Preact re-render with new filter predicate

---

## Phase 4 — Session Interactions

**Goal:** Add to Schedule, Favorite, Conflict Modal, and ICS download all work correctly and sync to Rainfocus.

### 4.1 Add to Schedule / Remove
- Gate: `isRegistered === false` → `<RegistrationPrompt />` (two variants: logged-out shows login+register CTA; logged-in shows register CTA)
- If `eventConfig.showConflictModal` is true and a time conflict exists: open `<ConflictModal />`
- **Pessimistic update**: RF `addSession` / `removeSession` API call fires first; `SCHEDULE_ADD` / `SCHEDULE_REMOVE` is dispatched only on confirmed success. The button shows a loading/disabled state while the call is in flight.
- On RF error: show error toast, button resets to its previous state
- Toast: "Added to schedule" (success green) or "Removed from schedule"
- Sync to `blockMediator` so other blocks on the same page receive the update immediately

### 4.2 Favorite / Unfavorite
- Same registration gate and pessimistic pattern as 4.1
- RF `toggleSessionInterest` API call fires first; `FAVORITE_ADD` / `FAVORITE_REMOVE` dispatched only on success
- Toast: "Added to favorites" (success) or "Removed from favorites"
- Sync via BlockMediator

### 4.3 ConflictModal component
- Renders two `<ConflictOption />` cards: currently scheduled session vs new session
- Radio-style selection (only one can be kept)
- "Save" resolves the conflict, updating `scheduled` via the RF API (pessimistic)
- "Cancel" / outside-click: dismiss, keep existing
- Only shown when `eventConfig.showConflictModal === true`

### 4.4 Toast component
- Variants: default (blue), success (green), alert (red)
- Icons: check, heart, alert
- Auto-dismiss after 1500 ms, dismissible via X button
- Positioned `fixed` bottom-center, above the drawer z-index

### 4.5 ICS download (My Sessions)
- `generateICS(sessions, userTz)` → produces an `.ics` string
- Each event: `DTSTART;TZID=...`, `DTEND;TZID=...`, `SUMMARY`, `DESCRIPTION`
- Triggered by the download icon button in My Sessions header
- Uses `Blob` + `URL.createObjectURL` to trigger browser download

### 4.6 RegistrationPrompt component
- Shown inline (not a modal) when an unregistered user tries to access a gated view or action
- Two variants driven by `isLoggedIn` state:
  - **Logged out**: "Sign in and register for the event" — CTA calls `window.adobeIMS.signIn()`
  - **Logged in, not registered**: "Register for the event" — CTA links to the event registration flow
- Replaces the `SignInPrompt` name from earlier drafts

---

## Phase 5 — Session State & Time-Based Behaviors

**Goal:** Live Now eligibility is derived correctly from MR poll results and time windows; sessions transition to on-demand at the right moment; the post-event view transition is handled automatically.

### 5.1 Session state derivation (pure function, no store)

`state` is never stored — it is computed on every render from the current store snapshot:

```javascript
// utils/session-state.js

/**
 * Derive the display state of a session.
 * liveStreamActiveIds — Set<mrStreamId> from the latest MR poll (store.liveStreamActiveIds)
 * nowMs              — Date.now() at render time (passed in so the function stays pure/testable)
 */
export function deriveSessionState(session, liveStreamActiveIds, nowMs) {
  const start = Date.parse(session.startTimeUtc);
  const end   = Date.parse(session.endTimeUtc);

  if (session.mrStreamId) {
    // MR session: inactive in MR API = on-demand regardless of time
    if (!liveStreamActiveIds.has(session.mrStreamId)) {
      return nowMs < start ? 'upcoming' : 'on-demand';
    }
    // Active in MR API + past start time = live
    return nowMs >= start ? 'live' : 'upcoming';
  }

  // Non-MR: pure time-based
  if (nowMs > end)   return 'on-demand';
  if (nowMs >= start) return 'live';
  return 'upcoming';
}
```

### 5.2 Live Now section eligibility (pure function)

Only sessions with the right flag AND the right time/poll conditions are shown in Live Now:

```javascript
// utils/session-state.js

export function isInLiveNow(session, liveStreamActiveIds, nowMs) {
  const start = Date.parse(session.startTimeUtc);
  const end   = Date.parse(session.endTimeUtc);

  if (session.mrStreamId) {
    // MR: must be past start time AND currently active in MR API
    return nowMs >= start && liveStreamActiveIds.has(session.mrStreamId);
  }

  return false; // all other sessions never appear in Live Now
}
```

`<LiveNowSection />` renders only when `sessions.some(s => isInLiveNow(s, liveStreamActiveIds, now))` for the active day. No Live Now section = the section is simply not rendered.

### 5.3 Reducer — LIVE_STATUS_UPDATE action

On each poll tick the reducer receives `{ active: Set, inactive: Set, now: number }`:

```javascript
case 'LIVE_STATUS_UPDATE': {
  const next = { ...state, liveStreamActiveIds: action.active };

  // Post-event auto-transition: if all sessions for the event are on-demand
  // and the user is still on the live-upcoming view, switch to on-demand view.
  const allEnded = state.sessions.every(s =>
    deriveSessionState(s, action.active, action.now) === 'on-demand'
  );
  // Honour manual override from authoring config if provided
  const manualCutoff = state.eventConfig.manualOnDemandTransitionTime
    ? Date.parse(state.eventConfig.manualOnDemandTransitionTime)
    : null;
  const pastManualCutoff = manualCutoff ? action.now >= manualCutoff : false;

  if ((allEnded || pastManualCutoff) && next.activeView === 'live-upcoming') {
    next.activeView = 'on-demand';
  }

  return next;
}
```

### 5.4 In-person on-demand cards
- `session.inPerson && !session.videoAvailable`: card shows "Recording coming soon" label; click opens Session Detail modal with the same label
- `session.inPerson && session.videoAvailable`: click navigates to `session.sessionPageUrl`
- `videoAvailable` is part of the static sessions payload and updated on the next full session refresh (not via polling)

---

## Phase 6 — Session Detail Overlay

**Goal:** The session expansion panel (widget only) renders all session metadata and syncs its action states to the main card.

### 6.1 SessionDetailOverlay component
- Slides in from the right within the drawer (CSS: `transform: translateX(100%)` → `translateX(0)`)
- Header controls collapse (same mechanism as Phase 1.3)
- Back button closes overlay, returns to list
- Main close (×) button: if overlay open → close overlay; if not → close drawer

Displays (from `Session`):
- Track badge (icon + color + label)
- Session title
- Type, date, premiere time (all localized)
- Description
- Technical level, category, channel, audience
- Copyright disclaimer (if present)
- Speakers list (name, title, photo)
- Featured products (icons + names)
- Session resources (links)
- Add to Schedule / Scheduled CTA (sync to card state; gated on `isRegistered`)
- Favorite / Favorited CTA (gated on `isRegistered`)
- Watch Now button (only when `session.state === 'live'`)

### 6.2 URL param for open modal (widget)
When detail opens: `history.pushState({}, '', `?session=${session.slug}-${session.rfCode}``)`  
When detail closes (back/X without closing drawer): `history.pushState({}, '', '?sessions')`  
When drawer closes: `history.pushState({}, '', window.location.pathname)`  
`popstate` listener handles browser back button.

### 6.3 State sync
Any schedule/favorite toggle inside the detail overlay dispatches through the same store action → both the overlay and the underlying card update from the same state source (no separate sync step needed with Preact's reactive model).

---

## Phase 7 — Filter System

**Goal:** A fully configurable multi-category filter panel that updates the session list with an active filter count.

### 7.1 FilterPanel component
- Positioned absolutely within the drawer (above body-scroll z-index)
- Layout: left sidebar (filter categories) + right content grid (filter options)
- Filter categories are driven by `eventConfig.filterCategories`; unneeded categories hidden
- Multi-select within each category
- Apply / Reset actions
- Active filter count badge on the Filter button

### 7.2 Filter state
`activeFilters` in the store is an object keyed by category name, each a `Set<string>`.  
`applyFilters()` updates the store and triggers a Preact re-render.

### 7.3 Filter composition with search
Both `activeFilters` and `searchQuery` are applied simultaneously via a single `filterSessions(sessions, activeFilters, searchQuery)` pure function. This function is memoized (via `useMemo` with the correct deps) in the component tree.

### 7.4 Track icons in filter options
Channel filter options render the corresponding Spectrum SVG icon beside the label (same icons used on session cards). Icons are injected from `eventConfig.trackIcons`.

---

## Phase 8 — Search

**Goal:** Full-text keyword search across title, description, presenter name, and tags returns results in under 200 ms.

### 8.1 SearchField component
- Desktop: collapses into an inline field in `RightControls`; search icon button toggles it open
- Mobile: expands into a row below `RightControls`
- Escape key closes search; clear (×) button clears query
- `oninput` updates `searchQuery` in store

### 8.2 Search logic
```javascript
function matchesSearch(session, query) {
  if (!query) return true;
  const q = query.toLowerCase();
  return (
    session.title.toLowerCase().includes(q) ||
    session.description.toLowerCase().includes(q) ||
    session.speakers.some(s => s.name.toLowerCase().includes(q)) ||
    session.track.toLowerCase().includes(q) ||
    session.type.toLowerCase().includes(q)
  );
}
```
Client-side only (P1). P2 features (autocomplete, semantic search) are out of scope for this ticket.

---

## Phase 9 — Full Page Version

**Goal:** A standalone block at `/max/2026/sessions.html` that shares all components and state with the widget.

### 9.1 `sessions-guide-full-page.js`
- Separate block entry — registers as `'sessions-guide-full-page'` in `EVENT_BLOCKS`
- Mounts `<SessionsGuideApp mode="full-page" />` (no drawer shell, no peek animation)
- Reads the same `eventConfig` from the authoring table
- Connects to the same `BlockMediator` key so state is shared with any widget instance on the same page

### 9.2 Behavioral differences vs widget
| Feature | Widget | Full Page |
|---|---|---|
| Shell | Peek-to-expand drawer | Full-page layout |
| Session card click | Opens detail overlay | Navigates to session page |
| Default view (registered) | My Sessions | Live & Upcoming |
| Default view (unregistered) | Live & Upcoming | Live & Upcoming |
| Session detail overlay | Yes | No (card → page navigation) |
| URL params | `?sessions`, `?session=<slug>` | `?view=`, `?filter=`, `?search=` |

### 9.3 URL param management (full page)
- `?view=my-sessions` / `?view=my-favorites` / `?view=on-demand` → set `activeView` on load
- `?filter=track:design,level:beginner` → populate `activeFilters` on load
- `?search=typography` → populate `searchQuery` on load
- All URL param writes use `history.replaceState` (no new history entry per keystroke); use `pushState` only on view switches
- Clearing view reverts to base URL (no `?view=` param)

### 9.4 Widget ↔ Full Page sync
The widget (`/max.html`) and full page (`/max/2026/sessions.html`) are on different pages — in-memory state cannot survive navigation between them. Rainfocus is the authoritative persistence layer: scheduled and favorited sets are fetched from RF on init for each surface independently. When the user navigates from one surface to the other, the destination page re-fetches from RF on load and reflects the latest confirmed state.

There is no client-side sync mechanism between the two surfaces. Any mutation (add to schedule, favorite) is written to RF immediately via the pessimistic pattern (Phase 4.1/4.2), so the next surface load will read the correct state.

---

## Phase 10 — URL Deep Linking (Widget)

**Goal:** The widget's open state and active session detail are reflected in the URL and can be restored on page load.

### 10.1 Widget open/close URL
- Open: `history.pushState({ sessionsOpen: true }, '', '?sessions')`
- Close: `history.pushState({}, '', window.location.pathname)`
- On page load: if `?sessions` in URL → auto-open drawer
- If `?session=<slug>-<rfCode>` in URL → auto-open drawer AND open the matching session detail

### 10.2 Session detail URL
- Open detail: replace `?sessions` with `?session=${slug}-${rfCode}`
- Close detail (keep drawer open): revert to `?sessions`
- Close drawer while detail open: revert to base URL

### 10.3 Shareable URLs
The URL at any point accurately encodes the visible state. No server-side routing needed — all state restoration is client-side on `DOMContentLoaded`.

---

## Phase 11 — Brand Concierge AI Ribbon

**Goal:** The Brand Concierge entry point appears after the 2nd visible row of sessions in every view.

### 11.1 BrandConciergeRibbon component
- Positioned as a sibling to session rows (not as a CSS overlay)
- The session list rendering logic tracks row count and inserts the ribbon component after index 1 (zero-based)
- Appears in all four views: Live & Upcoming, My Sessions, My Favorites, On Demand
- If fewer than 2 rows exist, ribbon appears after the last row

### 11.2 Content
- Entry point text and CTA driven by authoring config (separate content table row in the block)
- Clicking the CTA opens the Brand Concierge experience (external integration, not in scope of this ticket)

---

## Phase 12 — Analytics

**Goal:** All required events fire at the correct moments.

Create `event-libs/v1/blocks/sessions-guide/utils/analytics.js`:

```javascript
// All analytics dispatched via window.digitalData or the existing Milo analytics util
export const track = {
  guideOpen: ()                    => fire('sessions_guide_open'),
  viewToggle: (view)               => fire('sessions_view_toggle', { view }),
  filterApply: (filters)           => fire('sessions_filter_apply', { filters }),
  scheduleAdd: (sessionId)         => fire('sessions_schedule_add', { sessionId }),
  scheduleRemove: (sessionId)      => fire('sessions_schedule_remove', { sessionId }),
  favoriteAdd: (sessionId)         => fire('sessions_favorite_add', { sessionId }),
  favoriteRemove: (sessionId)      => fire('sessions_favorite_remove', { sessionId }),
  watchNow: (sessionId, dest)      => fire('sessions_watch_now', { sessionId, dest }), // dest: 'homepage' | 'channel'
  modalOpen: (sessionId)           => fire('sessions_modal_open', { sessionId }),
  sessionPageClick: (sessionId)    => fire('sessions_page_click', { sessionId }),
};
```

---

## Phase 13 — Theme & Responsive Polish

### 13.1 Dark / Light theme
`eventConfig.theme` adds a `data-theme="dark"` or `data-theme="light"` attribute to the drawer root. All color tokens switch via CSS attribute selectors. Dark theme is used in the prototype (parent page has `background: #1a1a2e`).

### 13.2 Responsive breakpoints
| Breakpoint | Session rows | Live card width | Drawer behavior |
|---|---|---|---|
| ≥1280 px | 4 cards/row max | 1104 px | Drawer centered, max 1400 px |
| 1024–1279 px | 3 cards | Scaled | Full width |
| 768–1023 px (tablet) | 2–3 cards | Scaled | Full width, transform-based row scroll |
| ≤767 px (mobile) | 1.2 cards (peek) | Full width | Full width, native scroll |

### 13.3 Accessibility
- All interactive elements have `aria-label` or visible label text
- Focus trap inside open drawer and open modals
- `role="dialog"` + `aria-modal="true"` on drawer, detail overlay, conflict modal
- Keyboard: Escape closes open panels/modals in order (detail → drawer; filter → closed)
- `prefers-reduced-motion`: disable card collapse/expand animations

---

## Phase 14 — Testing

Tests mirror `test/unit/blocks/sessions-guide/`.

### 14.1 Unit tests
- `store/index.js`: state init, pessimistic mutation dispatch (only on RF success)
- `utils/time.js`: timezone conversion, DST edge case, `isSessionLive`, `allSessionsEnded`
- `utils/analytics.js`: event firing
- `services/rainfocus.js`: response normalization, error handling, pessimistic mutation flow
- `services/feds.js`: `getFedsToken()` — already-present token, late arrival via event, 8s timeout
- Filter logic: `filterSessions` pure function with various filter + search combinations

### 14.2 Component tests
- `SessionCard`: renders scheduled/favorited states, fires correct callbacks, hides calendar for on-demand, shows `RegistrationPrompt` for unregistered users
- `ConflictModal`: renders two options, resolves correctly
- `Toast`: auto-dismisses, variant classes correct
- `FilterPanel`: category switching, select/deselect, apply/reset
- `RegistrationPrompt`: logged-out variant vs. logged-in-unregistered variant

### 14.3 Integration tests
- Full view rendering for each of the 4 views
- Poll-driven state update causes LiveNow section to appear/disappear
- URL param handling: `?sessions` auto-opens, `?session=<slug>` opens detail
- RF pessimistic mutation: state unchanged until RF resolves; updates on success; resets on error

---

## Phase 15 — Linting & PR Readiness

- `npm run lint:fix` passes for all new files
- `npm test` green with ≥80 % line coverage on new code
- No `console.error` — all errors via `window.lana?.log()`
- No hardcoded Milo URLs — resolved from `getConfig().miloLibs`
- All imports use `.js` extensions
- `EVENT_BLOCKS` updated in `libs.js`
- FEDS event name and attribute path confirmed against live FEDS integration before shipping
- `isRegistered` source wired (BlockMediator key or `window.feds.utilities.getEventData()`) or explicitly deferred with a `// TODO` comment
- PR description references MWPW-194331 and includes testing notes for widget and full-page surfaces

---

## Dependency Map

```
Phase 0 (Foundation)
  └─► Phase 1 (Drawer Shell)
        └─► Phase 2 (Session Cards)
              ├─► Phase 3 (Views)
              │     └─► Phase 4 (Interactions) ──► Phase 6 (Detail Overlay)
              │           └─► Phase 5 (Time/Polling)
              │                 └─► Phase 3 (feeds On Demand auto-transition)
              ├─► Phase 7 (Filter)
              ├─► Phase 8 (Search)
              └─► Phase 9 (Full Page) ──► Phase 10 (URL Deep Linking)
                    └─► Phase 11 (Brand Concierge)
Phase 12 (Analytics) ─ can be wired in alongside Phase 3–9
Phase 13 (Polish) ─ parallel to later phases
Phase 14 (Tests) ─ written alongside each phase
Phase 15 (PR Readiness) ─ final gate
```

---

## Key Risks & Mitigations

| Risk | Mitigation |
|---|---|
| FEDS event name / attribute path differs from what's documented | Confirm against live FEDS integration before shipping Phase 0.7; `getFedsToken()` timeout provides a clear failure signal |
| `isRegistered` source not yet wired | Mocked in Phase 0; explicit TODO in Phase 15 gate — all gates read `isRegistered` so wiring is a single-point swap |
| 30 s polling causes excessive re-renders | Preact's diffing handles this; ensure `useMemo` guards in list components so only changed cards re-render |
| RF pessimistic mutations feel slow | Loading state on action buttons covers perceived latency; error toast provides clear feedback on failure |
| Timezone DST edge case on multi-day events | Covered by `Intl.DateTimeFormat` which handles DST automatically |
| Large session catalogs (500+ sessions) | Implement windowed rendering (virtual list) in Phase 13 if performance degrades |
| IMS not available on page | `window.adobeIMS` check before calling; graceful no-auth fallback |
| RF API unavailable | `fetchScheduled`/`fetchFavorited` failures caught and logged via `lana`; block renders with empty scheduled/favorited sets |

---

## File Structure

```
event-libs/v1/blocks/sessions-guide/
  sessions-guide.js             # block entry (widget)
  sessions-guide-full-page.js   # block entry (full page)
  sessions-guide.css            # all styles
  PLAN.md                       # this document
  store/
    index.js                    # Preact Context + useReducer state management
  services/
    sessions-api.js             # event API — initial session fetch + normalizer
    rainfocus.js                # Rainfocus API — fetchScheduled, fetchFavorited, addSession, removeSession, toggleSessionInterest
    mobile-rider.js             # MR API — fetchLiveStatus (batch, no auth)
    poller.js                   # polling engine — startPolling, stopPolling, injectDispatch
    feds.js                     # FEDS utilities — getFedsToken()
  utils/
    time.js                     # timezone formatting helpers
    session-state.js            # deriveSessionState, isInLiveNow (pure functions)
    analytics.js                # event tracking
    ics.js                      # ICS calendar file generator
  components/
    App.jsx                     # root Preact component (mode: widget | full-page)
    DrawerShell.jsx
    DrawerHeader.jsx
    DateTabs.jsx
    ViewDropdown.jsx
    FilterPanel.jsx
    SearchField.jsx
    DownloadButton.jsx
    LiveNowSection.jsx
    FeaturedSection.jsx
    Carousel.jsx
    UpcomingSessions.jsx
    TimeSlotRow.jsx
    OnDemandSessions.jsx
    TrackSection.jsx
    SessionCard.jsx
    LiveCard.jsx
    SessionDetailOverlay.jsx
    BrandConciergeRibbon.jsx
    ConflictModal.jsx
    RegistrationPrompt.jsx
    Toast.jsx
  prototype/                    # static reference prototype (do not edit)
    index.html
    index.js
    style.css

test/unit/blocks/sessions-guide/
  sessions-guide.test.js
  store/index.test.js
  services/sessions-api.test.js
  services/rainfocus.test.js
  services/mobile-rider.test.js
  services/poller.test.js
  services/feds.test.js
  utils/time.test.js
  utils/session-state.test.js    # deriveSessionState + isInLiveNow — pure functions, easy to cover
  utils/analytics.test.js
  utils/ics.test.js
  components/SessionCard.test.js
  components/ConflictModal.test.js
  components/Toast.test.js
  components/FilterPanel.test.js
  components/RegistrationPrompt.test.js
  mocks/
    default.html
    sessions.json               # sample sessions API response
```
