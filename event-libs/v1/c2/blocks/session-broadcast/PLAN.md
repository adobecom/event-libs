# Session Broadcast Block — Implementation Plan

**Ticket:** [MWPW-198725](https://jira.corp.adobe.com/browse/MWPW-198725) · **Epic:** MWPW-195286
**Assignee:** Daniel Oliva
**Stack:** Preact · Preact Signals (shared session state) · ES Modules · Milo (`adobetv.js` for MPC, Phase 2)

> **Status (last updated during Phase 1):** Phases 0 and 1 done — see below for what shipped and how it was verified in a real browser. An earlier version of this plan extracted a `SessionDetailPanel` component out of sessions-guide's `SessionDetailOverlay`; that was reverted once we confirmed Broadcast should instead trigger the *real*, already-mounted Session Guide widget via the existing `openSessionGuideDetail(sessionId)` mechanism (see Architecture decisions). The `?session=` URL param collision that surfaced from that decision is resolved (Broadcast's entry param renamed to `?watch=`) — no PM decision needed. Phase 1 did require two small, backward-compatible additions to sessions-guide's own `LiveCard.js`/`Carousel.js` (`onCardClick`/`onWatchSamePage` optional props) — see Phase 1 below for why.

---

## Context

[MWPW-198725](https://jira.corp.adobe.com/browse/MWPW-198725) ("[T1 on DA][FE] Session Broadcast") asks for a TV-channel-style live page for MAX 2026: a primary video player, an "Also Live" carousel of concurrent live sessions, an "Up Next" carousel of upcoming sessions, and a session detail modal, all driven purely by schedule timing — no manual refresh, no page reloads except when the player type changes. It is the **only** story under its epic, so there is no separate backend/analytics ticket; this FE story owns the client-side scheduling/state-transition logic, built against the already-live ESP session-catalog API.

Architectural questions resolved before writing this plan:
- **Backend scope**: FE builds the timing/state logic itself (no separate RF backend service beyond ESP).
- **Timing engine**: build on the existing lightweight `session-state-ticker.js`/`session-state.js`, not the heavier Chronobox Timing Framework (Web Worker + BroadcastChannel + plugin system), which was built for a different use case.
- **MPC player**: Milo already renders `video.tv.adobe.com` links via its `adobetv` auto-block — resolves what was otherwise a hard blocker (no MPC embed code existed anywhere in event-libs).
- **Scope/phasing**: ship extension points only for MobileRider (future) and personalization ("My Schedule" prioritization); do not build them now.
- **Delivery shape**: work is split into sequential phases below, each landing as its own PR against `dev` on one feature branch (not split into Jira sub-tasks) — smaller, independently reviewable diffs instead of one large PR.

Everything below assumes an event-libs-only, buildless, Preact/HTM implementation, mirroring `sessions-guide-full-page`'s "one block on an otherwise bare DA page" model, per this repo's CLAUDE.md conventions (ES modules, `createTag`/Milo imports, `async/await`, `lana` logging, mobile-first CSS with no hardcoded vertical spacing).

### Figma review — corrections to the ticket text

The Figma file (`MAX-2026-UX-SSOT`, branch `f3wtXH32KwrStRx5VbCzed`, section "Sessions Broadcast Rd3") covers the full page across Mobile/Tablet/Desktop and Logged-in/out, not just the player/carousel logic described in the ticket text:

- **The page keeps the standard Adobe MAX GNAV header and a MAX-specific footer** (newsletter signup, social links, legal, giant "Adobe MAX" wordmark). The ticket's "not in GNAV" means the page isn't *linked from* nav, not that it renders without one. Header/footer are page-level authored content, not something `session-broadcast` builds.
- A dismissible "Registered for in-person MAX? Find detailed information on your attendee dashboard." banner appears above the player — this is the existing `in-person-banner` block, also page-level authored content.
- **Click target on Also Live / Up Next cards is the whole card body** (excluding the CTA buttons themselves) — clicking anywhere on a card opens the session detail modal.
- The Also Live carousel header includes a **"View all sessions" button** (calendar icon) in addition to the persistent Session Guide FAB — a second entry point into the full Session Guide.
- **A contradiction that turned out not to be one**: the ticket's AC says "redirect to the on-demand session guide after last livestream airs," and a Figma annotation says "EOD state... disabled when there are no more upcoming sessions for the entire event." Resolved by the PRD review below — "EOD" means end-of-*day*, not end-of-event.

### PRD review (wiki page, v27)

- **Resolves the end-of-event "contradiction"**: sessions roll seamlessly day-to-day; the redirect to on-demand Session Guide only fires once *all* sessions for the *entire event* have aired. Ticket, PRD, and Figma all agree once read correctly.
- **Confirms** the toast-and-default-session design for stale URLs: the PRD explicitly defers any redirect-on-expired-session-URL as out of scope (CDN-level work, causes a page flash).
- **Discrepancy — Up Next cap**: ticket says 15, PRD says 30. **Decision: ship with 15** (named constant, trivial to change), confirm the real number with PM later.
- **Discrepancy — Authoring Configurator scope**: the PRD describes a full authoring app (RainFocus auto-connect, player config, exportable embed link) as a Must Have deliverable. **Decision: DA block-content rows for this iteration** (time-constrained delivery); a full configurator may come later. Keep authored-field shapes consistent with existing `tier-1-event-config.js`/session-store conventions so a future configurator has a natural target, but build no configurator UI now.
- **Interaction detail**: Add/Remove-from-Schedule is disabled once a session goes live — only Favorite remains available for an in-progress session (info panel + both carousel card types).
- **Copy note**: PRD renames "Track" to "Channel" in user-facing copy — internal naming can stay as-is, only the rendered label changes.
- Analytics: PRD says MPC/video-ID tracking "builds on existing infrastructure, no new instrumentation required" — reduces urgency on hand-rolling MPC watch-time tracking, but doesn't remove the need for `daa-ll`/`sendAnalytics` on Broadcast-specific interactions.

## Architecture decisions

| Area | Decision | Why |
|---|---|---|
| Block type | New Tier 1 C2 Preact block `session-broadcast`, registered in `EVENT_BLOCKS_C2` (`event-libs/v1/libs.js`) | Matches `sessions-guide-full-page`'s precedent — only existing "full custom page" pattern in this codebase |
| Config hook-in | Page metadata `event-id` + `tier-1-event-config` (existing T1 Event Configurator output) | `tier-1-event-config.js`/`session-store.js` already parse this in `decorateEvent()`; `getBroadcastPath()` already exists, so this route was anticipated |
| Shared state | Import `session-store.js` signals + `session-state.js`/`session-state-ticker.js` + `session-actions.js`/`action-feedback.js` directly — **no new BlockMediator keys** | Already page-level, framework-agnostic singletons designed for exactly this kind of cross-block reuse |
| Timing engine | Extend `session-state-ticker.js`, do not touch Chronobox | Avoids the plugin-system/worker overhead Broadcast doesn't need |
| YouTube player | **Reversed from an earlier draft** — use event-libs' own `event-youtube.js` (`YouTubeChat` class, autoplay path only), not Milo's `LiteYTEmbed` | Milo's `LiteYTEmbed` is always click-to-play by design — no supported way to autoplay on load without hacking around it. `event-youtube.js`'s `insertAutoplayIframe()` already does exactly what Broadcast needs: a real `<iframe autoplay=1&mute=1>` inserted immediately, already built and tested. `YouTubeChat` exposes public `config`/`videoId` fields (its own tests set them directly), so Broadcast constructs an instance, sets those two fields, and calls `buildStream()` — no dynamic cross-repo import from Milo. `chatenabled` stays off. |
| MPC player | Reuse Milo's `libs/blocks/adobetv/adobetv.js` embed logic via a synthetic anchor, not a new hand-rolled iframe | Milo already handles `video.tv.adobe.com` MPC URLs; `init(a)` isn't cleanly exported for programmatic use, so Broadcast constructs a real anchor and calls `init()` on it |
| Session detail modal | **Trigger the real, already-mounted Session Guide widget** via `openSessionGuideDetail(sessionId)` (`event-libs/v1/utils/session-store.js`) — Broadcast renders no modal of its own | Existing, already-used cross-block pattern (`upcoming-sessions.js`, `mobile-rider.js`, `session-state-demo.js` all call it today); `DrawerShell.js` already opens straight to that session's detail view. The ticket already requires the FAB persistently mounted, so the widget is guaranteed to be on the page. **Requires the `sessions-guide` widget block to be authored on every Broadcast page.** See the param-naming note below (resolved, not a blocker). |
| URL strategy | History API, but the **visible URL never carries a persistent param** — `history.pushState({session}, '', <unchanged clean URL>)` for in-page switches; the one-time entry `?watch=` param (named to avoid colliding with sessions-guide's own `?session=`/`?sessions=` — see below) is read once then stripped via `replaceState` | Satisfies both "manual selection updates the URL" and "URL remains clean" ACs simultaneously; extends the existing `sessions-guide/utils/url.js` + `popstate` pattern |
| Authoring | New copy (carousel titles, "view all details" CTA copy, session-ended background image) authored as ordinary block-content rows in the DA doc, not new T1 Configurator app fields | Matches eng-sync decision to keep the configurator minimal for this iteration |

### ✅ URL param collision — resolved by renaming, no PM decision needed

Session Guide's own convention (`sessions-guide/utils/url.js` + `DrawerShell.js`) already owns `?session=<slug>` (detail overlay open) and `?sessions=` (guide open) — written whenever `openSessionGuideDetail(sessionId)` fires, exactly how Broadcast opens the detail modal. Broadcast's own ticket-described entry param used the same name, `?session=<code>`, for something unrelated: "autoplay this on load."

This first looked like a product-behavior conflict needing a PM call. It isn't: **Broadcast's entry param is read exactly once on mount and stripped immediately** — it's never simultaneously present alongside anything else Broadcast writes to the visible URL (in-page switches only ever touch `history.state`, never the query string). There's no shared runtime state to reconcile. **Resolution: renamed Broadcast's entry param from `session` to `watch`** (`ENTRY_PARAM` in `broadcast-url.js`, done in Phase 0). `?watch=<code>` means "autoplay this"; Session Guide's `?session=`/`?sessions=` behavior is untouched, including through Broadcast's own strip step (covered by a test).

Only remaining action, not a blocker: let Analytics (Charlie, building a dimension for "the broadcast param") and anyone else assuming the entry param is named `session` know it's `watch` instead.

## Delivery phases (each = one PR against `dev`, same feature branch)

### Phase 0 — Shared foundation (low risk, no new UI) — ✅ DONE
- ~~Extract `SessionDetailPanel.js` out of `SessionDetailOverlay.js`~~ — built, then reverted as unnecessary once `openSessionGuideDetail` was identified as the right mechanism. `SessionDetailOverlay.js` is back to its original, unmodified state.
- `session-broadcast/utils/broadcast-schedule.js` — pure aggregation over `session-state-ticker.js` output (concurrent live set, capped/sorted Up Next list). **Done**, 14 tests.
- `session-broadcast/utils/broadcast-url.js` — state-only `pushState`/`replaceState` helpers; entry param named `watch` (see param-naming note above). **Done**, 14 tests.
- Block scaffolding + `EVENT_BLOCKS_C2` registration. **Done.**
- Confirmed for free: the in-person banner and footer newsletter signup are existing blocks (`in-person-banner`, `event-subscription-form`), not this story's concern.
- **Fixed post-Phase-1** (user caught this): the session pool had no eligibility filter — a live mainstage/keynote session could have played in Broadcast, though keynotes belong on the homepage only (ticket: Out of Scope). Added `isBroadcastEligible(session)` to `event-libs/v1/utils/session-state.js` (`!isLivestreamed && isOnline` — the same fields `getWatchDestination()` already keys off), filtered through it in `broadcast-schedule.js`'s `isLive`/`isUpcoming`. Verified with keynote fixtures in the preview harness that never appear anywhere on the page.

**Exit criteria — met**: existing sessions-guide tests still pass; new unit tests cover schedule aggregation and URL helpers against fixture data (0 live, 1 live, 6 concurrent live, upcoming backfill, mainstage/keynote exclusion). Full suite green (2070 passed), lint clean.

### Phase 1 — Core page shell, State 1, YouTube only — ✅ DONE
- `BroadcastApp.js` (root, mounts on `initSessionState()`, derives active/alsoLive/upNext via `getBroadcastSchedule()`) + `BroadcastBody` exported alongside for direct testability.
- `PlayerHost.js` + `players/YouTubePlayerAdapter.js` (`event-youtube.js`'s `YouTubeChat` autoplay path). Keyed on `session.id` for a clean remount every switch. Confirmed autoplaying for real in a browser, no click needed.
- `AlsoLiveCarousel.js` / `UpNextCarousel.js` wrapping sessions-guide's `Carousel.js` + `LiveCard.js`. Required two small, backward-compatible additions to shared code: `onCardClick`/`onWatchSamePage` optional props on both `LiveCard.js` and `Carousel.js` — LiveCard is Context-coupled with no existing "open detail" path for a non-widget surface, and its built-in same-page "close the drawer" handling would have corrupted Broadcast's own `history.state` tracking if reused as-is. Full sessions-guide suite re-verified green after the change (435 tests), plus new tests for the additions. **Deferred**: the "View all sessions" header button (Figma finding) — no page-level "open the guide's default view" signal exists yet, only the session-specific `openSessionGuideDetail`; not worth new cross-block API surface for a secondary entry point the persistent FAB already covers.
- `SessionInfoPanel.js` — collapsed (title, truncated description, duration, Favorite), caret-expandable to the full description plus the authored "view all details" CTA. No Add-to-Schedule — the active session is always already live.
- Full URL behavior: entry `?watch=`, strip-on-load, stale-session toast fallback, in-page switch via state-only `pushState`, `popstate` for back/forward.
- Session Guide FAB: not built by this block — it's the separate `sessions-guide` widget, authored alongside `session-broadcast` (confirmed on the user's real DA test page).
- `SessionGuideProvider` wraps the tree with a minimal synthetic `guideConfig` purely because LiveCard/Carousel require `useSessionGuide()` to exist — no drawer/filter/day-tab state is ever used.

**Real-browser verification** (preview harness + chrome-devtools MCP): YouTube autoplays with no click; video fills a properly rounded 16:9 box (required reusing `event-youtube.css` too, since its rules are scoped under `.event-youtube` and JS reuse alone doesn't carry CSS); both carousels render correct data/CTAs; clicking "Watch now" on an Also Live card switches the primary player in place with zero reload, moves the previous session back into the carousel, updates `history.state`, and never touches the visible URL; the browser back button correctly reverts via `popstate`; the info panel's expand toggle and "View all details" CTA work; the logged-out Favorite click shows the correct "Login to Adobe" toast.

**Exit criteria — met**: a user can load the page, see the correct default session autoplay, switch between concurrent YouTube sessions via the Also Live carousel, and the URL/back-button behavior holds up — all without a page reload.

### Phase 2 — MPC player adapter + player-type switching — ✅ DONE
- **Spike done first**: tested `video.tv.adobe.com/v/<mpcId>` with vs without `?autoplay=true` directly in a browser, using a real MPC ID (`3458902`) from the real catalog snapshot. **Confirmed it autoplays** (unmuted, actively progressing) — no "tap to play" fallback needed.
- `players/MpcPlayerAdapter.js`: synthetic-anchor + Milo `adobetv.js` `init()` reuse, exactly as planned. Also injects Milo's `adobetv.css` once via a dynamic `<link>` (same pattern event-libs' own `scripts.js` uses for the C2 foundation stylesheet) — reusing the JS alone doesn't carry Milo's `.milo-video` sizing CSS, same lesson as Phase 1's YouTube/event-youtube.css fix.
- `PlayerHost.js`: added the `mpcId` branch. No extra teardown logic needed — a different adapter component for a different player type is itself a full unmount/remount, on top of the existing per-session `key` remount from Phase 1.
- Mixed-type validation: verified with two genuinely concurrent live sessions of different player types (one YouTube, one real MPC video) in the preview harness, rather than synthetic timing-only fixtures.

**Real-browser verification**: clicked "Watch Live" on an MPC also-live card while YouTube was playing — primary player swapped to the real MPC video (confirmed via iframe `src` + a live screenshot showing real playback), info panel updated, the previous session moved back into Also Live, zero console errors. Repeated in reverse (MPC → YouTube) with the same clean result — no reload either direction.

**Exit criteria — met**: switching from a live MPC session to a live YouTube session (and back) works via full section remount; concurrent mixed-type live sets render correctly.

### Phase 3 — States 2 & 3 (session ended) + on-demand transition
- `EndedState.js` covering State 2 (other live sessions active) and State 3 (upcoming only). Confirmed: sessions roll day-over-day with no interruption; only once there are zero upcoming sessions left for the entire event does the page redirect (real navigation) to on-demand Session Guide.
- Up Next's cap is a single named constant — confirm real value (15 vs 30) before this phase locks in QA fixtures.

**Exit criteria**: forcing (via `?serverTime=`) the last session to end triggers State 2 → State 3 → redirect; forcing an end-of-*day* boundary confirms the page keeps rolling instead of redirecting.

### Phase 4 — Analytics, accessibility, authoring polish
- `daa-ll` tagging on all button CTAs, same pattern as `SessionCard.js`
- Imperative `sendAnalytics` (via `${miloLibs}/blocks/modal/modal.js`) for page view, session switch, play/watch-time, panel expansion, modal open
- Auto-generated alt text `[session name] + decorative img`
- Full `expectAccessible()` pass; mobile-first CSS anchored to the existing `1279px` breakpoint convention
- Wire authored block-content rows (carousel titles, expanded-CTA copy, session-ended background image)

**Exit criteria**: axe-core clean on all rendered states; all "Required events" firing (not yet Analytics-team-signed-off).

### Phase 5 — QA hardening
- Full WTR suite for the new block + regression run of sessions-guide's suite
- Playwright + axe-core + Lighthouse pass once Figma frames are available
- Cross-browser/timezone verification of Upcoming card start/end time display
- Manual verification of all 3 URL scenarios (fresh load w/ valid param, fresh load w/ stale param, in-page switch)

## File/component plan

```
session-broadcast.js                           # init(el): mounts BroadcastApp, calls initSessionState()
components/BroadcastApp.js                     # Phase 1
components/PlayerHost.js                       # Phase 1 (YouTube), extended Phase 2 (MPC)
components/players/YouTubePlayerAdapter.js     # Phase 1
components/players/MpcPlayerAdapter.js         # Phase 2 — done
components/players/MobileRiderPlayerAdapter.js # Phase 1 stub only — seam for a future ticket
components/AlsoLiveCarousel.js                 # Phase 1
components/UpNextCarousel.js                   # Phase 1
components/SessionInfoPanel.js                 # Phase 1
components/EndedState.js                       # Phase 3
utils/broadcast-url.js                         # Phase 0 — done
utils/broadcast-schedule.js                    # Phase 0 — done
utils/broadcast-debug.js                       # dev-only, not ticket scope — console.table of the on-page schedule behind ?debug; delete before this ships
session-broadcast.css                          # mobile-first, built up across phases
```

No changes to sessions-guide's own code are needed — Broadcast consumes it only through `openSessionGuideDetail(sessionId)`, the same way `upcoming-sessions.js`/`mobile-rider.js` already do.

Tests mirror source under `test/unit/c2/blocks/session-broadcast/**`, following the existing pattern (`buildX` component builders, mocked `htm-preact.js`, real signals from `session-store.js`, `expectAccessible` from `test/unit/helpers/a11y.js`, fixtures using `Date.now() ± N`).

## State & data reuse map

- `event-libs/v1/utils/session-store.js` — `initSessionState()`, `sessions`/`favorited`/`scheduled`/`auth`/`liveStreamActiveIds` signals, `getEventApiConfig()`, and **`openSessionGuideDetail(sessionId)`**
- `event-libs/v1/utils/session-state.js` — `getNowMs()`, `deriveSessionState()`, `getWatchDestination()`, `isBroadcastEligible()`
- `event-libs/v1/services/sessions/session-state-ticker.js` — `startSessionStateTicker()`
- `event-libs/v1/services/sessions/session-actions.js` + `action-feedback.js` — `toggleScheduleWithFeedback`, `toggleFavoriteWithFeedback`
- `event-libs/v1/utils/tier-1-event-config.js` — `getTrackIcon()`, `getProduct()`, `getBroadcastPath()`
- `event-libs/v1/features/toast/toast.js` — `showToast()`
- `event-libs/v1/services/sessions/poller.js`'s ref-counted interval pattern — model for future MobileRider polling
- `event-libs/v1/c2/blocks/sessions-guide/components/Carousel.js` and `LiveCard.js`'s `computeProgressPct`/`PROGRESS_REFRESH_MS`

## Player abstraction (Phases 1-2)

`PlayerHost.js` owns a single mounted adapter at a time, keyed by which video-source field is populated (`youTubeId` / `mpcId` / `mrStreamId` — mutually exclusive). Switching player type unmounts and remounts the whole adapter, never swaps just `src`.

**YouTube adapter**: import `YouTubeChat` from `event-libs/v1/c2/blocks/event-youtube/event-youtube.js` (local, no dynamic Milo import). Per-switch, construct a fresh `new YouTubeChat()` (its `init()`/`buildStream()` isn't meant to be re-run on the same instance — fine, since `PlayerHost` already remounts a fresh adapter on every switch), set `instance.config = { autoplay: 'true' }` and `instance.videoId = <youTubeId>` directly (the same seam its own tests use), call `instance.buildStream()`, append the result. Hits `insertAutoplayIframe()` — a real autoplaying iframe, no click-to-play facade. Leave `chatenabled` unset. **Phase 4 addition**: no YT IFrame JS API events out of the box — append `enablejsapi=1` and promote the iframe into a `new window.YT.Player(iframeEl, { events: {...} })` after insertion for `onStateChange`-driven watch-time analytics.

**MPC adapter — done**: builds a real (temporarily attached) `<a href="https://video.tv.adobe.com/v/<mpcId>?autoplay=true">`, dynamically imports `${miloLibs}/blocks/adobetv/adobetv.js`, calls `init(a)`. **Autoplay confirmed working** via a live spike. Also injects `adobetv.css` once via a dynamic `<link>`. The `postMessage` `{ state: 'play'|'pause' }` events `adobetv.js` itself listens for remain available for Phase 4 analytics — not wired up yet.

**MobileRider adapter**: stub that logs via `lana` and no-ops; seam for a future ticket, modeled on `mobile-rider.js`'s `injectPlayer()`.

## URL & navigation design (Phase 1)

- On mount: read `?watch=<rfCode>` once (named `watch`, not `session`, to avoid colliding with sessions-guide's own `?session=`/`?sessions=`). If it matches a live session, load it and `history.replaceState({ session: id }, '', <url without the param>)`. If not, `showToast()` and fall back to the default session, still stripping the param.
- On manual switch: `history.pushState({ session: id }, '', <same clean URL>)` — visible URL never changes, back/forward works via `popstate` reading `event.state.session`.
- In-page "share" CTA copies `session.sessionPageUrl`, not the broadcast URL.

## Analytics (Phase 4)

- `daa-ll` + Milo's `decorateDefaultLinkAnalytics` for button-like CTAs.
- `sendAnalytics` (from `${miloLibs}/blocks/modal/modal.js`) for page view, session switch, play/watch-time, panel expansion, modal open.
- Video play/watch-time: YouTube via `YT.Player.onStateChange`; MPC via the `postMessage` play/pause listener.
- Event taxonomy/schema explicitly unresolved per the ticket/PRD — build against the "Required events" list, expect rework once Analytics confirms.

## Accessibility & responsiveness (Phase 4-5)

- Mobile-first CSS, no hardcoded vertical spacing.
- Reuse the `matchMedia`-per-component pattern from sessions-guide; anchor to the existing `1279px` breakpoint.
- Session Guide FAB is the existing widget block; confirm placement during Phase 1.

## Explicitly out of scope (fast-follow)

- MobileRider real playback (stub adapter only)
- "My Schedule" personalization/reordering (extension point left in `broadcast-schedule.js`, not wired up)

## Open risks to relay back to PM

- ~~`?session=` URL param collision~~ — **resolved by renaming**: Broadcast's entry param is `?watch=`, not `?session=` (see write-up above). No PM decision needed. Only action item: let Analytics (Charlie, building a dimension for "the broadcast param") know the entry param is named `watch`.
- ESP session-catalog rows for MAX26 are still `published: false` in test data — needs to flip before real concurrent-live testing.
- ~~MPC `?autoplay=true` support unverified~~ — **resolved in Phase 2**: confirmed working via a live spike against a real MPC video asset.
- Analytics event schema unresolved per the ticket/PRD itself — expect rework once Analytics confirms.
- Up Next cap: decided at 15 for this iteration, confirm real number (15 vs 30) with PM later.
- Authoring Configurator scope: decided — DA block-content rows for this iteration, full configurator may come later as separate effort.

## Verification

- `npm run lint` / `npm run lint:fix` before every PR.
- `npx wtr test/unit/c2/blocks/session-broadcast/**/*.test.js --node-resolve --port=2000` during iteration; full `npm test` before each phase's PR.
- Manual verification on `localhost:3868` against a DA draft page with `tier-1-event-config` + `event-id` metadata, using `?serverTime=<ms>` to time-travel through state transitions.
- Playwright + axe-core + Lighthouse pass (Phase 5) once Figma frames are available.
