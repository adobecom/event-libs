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
- **Second defensive filter, added later** (user request): an otherwise-eligible session with no player ID configured has nothing to actually play — added `hasPlayableVideoSource(session)` to `broadcast-schedule.js` (checks `youTubeId`/`mpcId`/`mrStreamId`, so MobileRider sessions start showing for free once that adapter ships), filtered alongside `isBroadcastEligible`. Verified against the real, unenhanced catalog snapshot — where all 34 eligible sessions genuinely lack a video id — that `getLiveSessions`/`getUpNextSessions` now correctly return zero.

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

### Phase 3 — States 2 & 3 (session ended) + on-demand transition — ✅ DONE
- **Real bug caught mid-design, fixed here**: `getBroadcastSchedule`'s original fallback silently picked a *different* live session as primary whenever the committed one ended — violating the PRD's explicit "no sessions should auto transition a user without their action" (Out of Scope). Redesigned: `activeSessionId` is now a commitment, not a preference. The only automatic pick is the one-time initial-load default; once committed, an ended session returns `activeSession: null` + `endedSession: <that session>` instead of silently swapping. `alsoLive` becomes every currently-live session in that case. Tests updated/added.
- `EndedState.js` — one shared "Session ended." marquee (title, description, Watch on demand, Favorite) for both State 2 and State 3, per the Figma review's higher-fidelity layout — the Also Live/Up Next carousels rendered below it are what "join a live"/"see what's upcoming" actually are.
- `BroadcastApp.js` — added the one-time initial-default-commit effect, and the end-of-event redirect using the already-existing `isPostEvent()` (same function sessions-guide's own auto-transition uses). Added `getSessionGuidePath()` to `tier-1-event-config.js` (mirrors `getHomepagePath()`/`getBroadcastPath()`).
- Up Next's cap stays 15 (Phase 0's constant) — still pending the PM follow-up on 15 vs 30, not a blocker.

**Real-browser verification**: forced a committed session to be already-ended while others stayed live — confirmed `EndedState` renders with no auto-switch, and clicking "Watch Live" on an Also Live card correctly exits ended state. Separately forced every session on-demand via the console and confirmed a real redirect fired to `/max/2026/sessions.html`.

**Exit criteria — met**: forcing the last session to end triggers State 2/3 → redirect; the redirect gate (nothing live/also-live/upcoming) naturally never fires while any future session exists, so day-to-day rollover needs no separate code path.

### Phase 4 — Analytics, accessibility, authoring polish — ✅ DONE
- **`daa-ll` tagging — found already done**: `Favorite`/`View-All-Details`/`Watch-On-Demand` were already tagged on `SessionInfoPanel.js`/`EndedState.js` back in Phase 1/3, and `Watch-Now`/`Add-to-Schedule`/`Add-to-Favorites` come for free from reusing `LiveCard.js` in both carousels — nothing left to add.
- New `utils/broadcast-analytics.js`: `trackBroadcastEvent(name)` dynamically imports `sendAnalytics` from `${miloLibs}/blocks/modal/modal.js` (same path `events-form.js` already uses) and fires `sendAnalytics(new Event(name))` — `sendAnalytics` takes no separate payload, so any dimension travels in the event name itself, matching `eventFormSendAnalytics`'s own string-concatenation pattern. `getEntryPoint()` classifies `document.referrer` into `direct`/`external`/`session-guide`/`homepage` — no CTA-tagged entry param exists to read instead, and the ticket's AC doesn't name one.
- Wired: page view (mount, with entry-point dimension), session switch (`handleSwitchSession`), panel expansion (`SessionInfoPanel`'s caret, fires only on expand not collapse), session-detail-modal open (all three `openSessionGuideDetail` call sites — `SessionInfoPanel`, `AlsoLiveCarousel`, `UpNextCarousel`). Carousel interactions and Add-to-Schedule/Favorite are already covered by the reused `daa-ll` tags above — no separate imperative event for those.
- **Play/watch-time — intentionally asymmetric, documented in code**: MPC gets real play/pause fidelity for free, since `adobetv.js` already listens on `window` for `postMessage({state, id})` from `video.tv.adobe.com` as a public contract — `MpcPlayerAdapter.js` adds a second listener for the same messages. YouTube gets a single best-effort "started watching" event on mount instead of true `onStateChange` fidelity: `event-youtube.js`'s `buildEmbedUrl()` has no passthrough param for `enablejsapi=1`, and hand-building the iframe ourselves to add one would mean duplicating `buildStream()`'s CSS-dependent markup — not worth it for an analytics nice-to-have. Flagged as a known gap, not silently dropped.
- `EndedState.js` now accepts `sessionEndedImageUrl` (the one previously-parsed-but-unused authored field) and renders it as a plain, decorative (`alt=""`) `<img>` background layer.
- **Real bug found during actual DA-page testing, not caught by any harness — two rounds**:
  - **Round 1**: the field was originally authored as an *embedded picture* and read via `readBlockConfig`'s raw-`innerHTML` fallback branch, then rendered via `sanitizedRichText` + `dangerouslySetInnerHTML` (mirroring `SessionDetailOverlay.js`'s pattern for authored rich text). This looked correct in the preview harness but silently failed on the real page: Milo's site-wide `decorateImageLinks()` (`libs/utils/utils.js`) runs over *every* `<img>` on the page as part of `decorateSection()` — before any block's own `init()` gets a chance to read its config rows — and converts any `<img alt*="|">` whose pre-`|` segment resolves to an `.mp4` URL into an autoplay background `<video>` (a real, useful convention elsewhere for hero/marquee background video). Many Adobe asset-library images carry that `|`-delimited alt-text convention as stored metadata regardless of which block's config row they're embedded in — happened with two different asset picks in a row.
  - **First fix attempt (too narrow)**: changed the *authoring convention* to "link the row's text to the image's URL" instead of embedding a picture — sidesteps the Milo collision by construction (no `<img>` for that pass to find), but required an unusual DA authoring pattern. **Round 2**: the user re-authored the row as a normal embedded picture again (the natural DA flow — pasting/inserting an image always produces a `<picture>`), this time with plain `alt=""` (no Milo collision), yet the background still didn't render — because the code no longer had any path for extracting a URL out of an embedded picture at all; `readBlockConfig`'s generic fallback would've returned the raw (relative, unresolved) picture markup as one long HTML string, which fails `safeUrl()`'s `^(https?:\/\/|\/)` check outright.
  - **Actual fix**: `session-broadcast.js` now has its own `extractSessionEndedImageUrl(el)`, run directly against the live block DOM (not through `readBlockConfig`'s generic path), which accepts *either* authoring style — a linked `<a href>` (`.href`, already absolute) or an embedded picture's fallback `<img>` (`.src`, read as a live DOM **property**, which the browser has already resolved to an absolute URL, unlike reading the raw attribute out of a serialized HTML string). This makes the natural "just embed an image" DA flow work correctly (as long as that asset's alt text doesn't independently trigger the Milo collision), while the link convention remains available as a fully collision-immune fallback if a future asset pick reintroduces the `|`-alt issue. `EndedState.js` is unchanged from the prior fix — it only ever sees a resolved URL string either way.
- **Alt text — found already covered**: `LiveCard.js` already sets `alt=${session.title}` on every thumbnail it renders (Also Live/Up Next inherit this for free); the only new image surface Phase 4 added, the ended-state background, is decorative and given `alt=""` (the standard treatment for a purely decorative `<img>`), not a wrapping `aria-hidden`.
- New `components/a11y.test.js`: `expectAccessible()` over `SessionInfoPanel`, `EndedState` (with and without the background image), `PlayerHost`'s unsupported-type branch, and both carousels' wrapping section markup — mirrors sessions-guide's own `a11y.test.js` pattern. Player adapters themselves aren't scanned here (they mount real third-party iframes only in a real browser, per the existing YouTubePlayerAdapter.test.js/MpcPlayerAdapter.test.js notes).
- CSS: the one existing breakpoint (`min-width: 1024px`) renamed to `1280px` to match the "wide" threshold already used elsewhere in sessions-guide (`FilterPanel.js`/`SessionDetailOverlay.js`/`DrawerShell.js`), rather than being a Broadcast-specific number. A full Figma-frame-accurate pixel pass is still Phase 5's job, once those frames are available — this was a consistency fix, not a redesign.

**Real-browser verification**: initial pass (embedded-picture authoring) looked correct in the preview harness but failed on the actual DA test page (see the bug write-up above) — caught and fixed via the user's own real-page testing, not the harness. Re-verified post-fix in the harness with the new linked-URL authoring convention: background image renders correctly behind the marquee text, decorative and non-interactive, no console errors. Clicked Watch Now on an Also Live card (session-switch) and the info-panel caret (panel-expand) — both existing flows work unchanged, no new console errors from the analytics calls (the dynamic `sendAnalytics` import fails harmlessly against localhost, caught and logged via `lana`, exactly as designed).

**Exit criteria — met**: `npm test` 2107 passed/0 failed (full suite, including the new `broadcast-analytics.test.js` and `a11y.test.js`); `npm run lint` clean. axe-core clean on every scanned state. All ticket "Required events" fire except true YouTube watch-time granularity (documented gap above) — not yet Analytics-team-signed-off, per the ticket's own acknowledged-unresolved taxonomy.

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
components/EndedState.js                       # Phase 3 — done
utils/broadcast-url.js                         # Phase 0 — done
utils/broadcast-schedule.js                    # Phase 0 — done
utils/broadcast-analytics.js                   # Phase 4 — done
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
- `event-libs/v1/utils/tier-1-event-config.js` — `getTrackIcon()`, `getProduct()`, `getBroadcastPath()`, `getSessionGuidePath()`
- `session-broadcast/utils/broadcast-schedule.js` — also exports `hasPlayableVideoSource(session)`, the authoring-gap protection above
- `event-libs/v1/utils/session-state.js` — also `isPostEvent()`, the same function sessions-guide's own auto-transition uses
- `event-libs/v1/features/toast/toast.js` — `showToast()`
- `event-libs/v1/services/sessions/poller.js`'s ref-counted interval pattern — model for future MobileRider polling
- `event-libs/v1/c2/blocks/sessions-guide/components/Carousel.js` and `LiveCard.js`'s `computeProgressPct`/`PROGRESS_REFRESH_MS`

## Player abstraction (Phases 1-2)

`PlayerHost.js` owns a single mounted adapter at a time, keyed by which video-source field is populated (`youTubeId` / `mpcId` / `mrStreamId` — mutually exclusive). Switching player type unmounts and remounts the whole adapter, never swaps just `src`.

**YouTube adapter**: import `YouTubeChat` from `event-libs/v1/c2/blocks/event-youtube/event-youtube.js` (local, no dynamic Milo import). Per-switch, construct a fresh `new YouTubeChat()` (its `init()`/`buildStream()` isn't meant to be re-run on the same instance — fine, since `PlayerHost` already remounts a fresh adapter on every switch), set `instance.config = { autoplay: 'true' }` and `instance.videoId = <youTubeId>` directly (the same seam its own tests use), call `instance.buildStream()`, append the result. Hits `insertAutoplayIframe()` — a real autoplaying iframe, no click-to-play facade. Leave `chatenabled` unset. **Phase 4 decision, not built**: promoting the iframe to a real `YT.Player` for `onStateChange` fidelity was evaluated and rejected — `buildEmbedUrl()` has no passthrough param for `enablejsapi=1`, and hand-building the iframe to add one would duplicate `buildStream()`'s CSS-dependent markup. Ships with a single best-effort "started watching" event on mount instead (`broadcast-analytics.js`).

**MPC adapter — done**: builds a real (temporarily attached) `<a href="https://video.tv.adobe.com/v/<mpcId>?autoplay=true">`, dynamically imports `${miloLibs}/blocks/adobetv/adobetv.js`, calls `init(a)`. **Autoplay confirmed working** via a live spike. Also injects `adobetv.css` once via a dynamic `<link>`. **Phase 4**: the `postMessage` `{ state: 'play'|'pause' }` events `adobetv.js` itself listens for are now also observed by a second listener in `MpcPlayerAdapter.js`, giving MPC real play/pause analytics fidelity — YouTube's asymmetric best-effort treatment above is the deliberate tradeoff, not an oversight.

**MobileRider adapter**: stub that logs via `lana` and no-ops; seam for a future ticket, modeled on `mobile-rider.js`'s `injectPlayer()`.

## URL & navigation design (Phase 1)

- On mount: read `?watch=<rfCode>` once (named `watch`, not `session`, to avoid colliding with sessions-guide's own `?session=`/`?sessions=`). If it matches a live session, load it and `history.replaceState({ session: id }, '', <url without the param>)`. If not, `showToast()` and fall back to the default session, still stripping the param.
- On manual switch: `history.pushState({ session: id }, '', <same clean URL>)` — visible URL never changes, back/forward works via `popstate` reading `event.state.session`.
- In-page "share" CTA copies `session.sessionPageUrl`, not the broadcast URL.

## Analytics (Phase 4 — done)

- `daa-ll` + Milo's `decorateDefaultLinkAnalytics` for button-like CTAs — already present from Phase 1/3, plus whatever `LiveCard.js` already tags.
- `trackBroadcastEvent()` (`utils/broadcast-analytics.js`, dynamically imports `sendAnalytics` from `${miloLibs}/blocks/modal/modal.js`) for page view, session switch, panel expansion, modal open.
- Video play/watch-time: MPC via the real `postMessage` play/pause listener (full fidelity, free); YouTube via a single best-effort "started watching" event on mount (`YT.Player.onStateChange` fidelity was evaluated and rejected — see the Player abstraction section above for why).
- Event taxonomy/schema explicitly unresolved per the ticket/PRD — built against the "Required events" list, expect rework once Analytics confirms. `getEntryPoint()`'s referrer-based heuristic is a best guess for the same reason — no concrete entry-point mechanism is named anywhere in the ticket/PRD.

## Accessibility & responsiveness (Phase 4 — done; Phase 5 pending)

- Mobile-first CSS, no hardcoded vertical spacing.
- The one existing breakpoint renamed `1024px` → `1280px` to match the "wide" threshold already used elsewhere in sessions-guide; a full Figma-frame-accurate pass is still Phase 5's job once frames are available.
- `expectAccessible()` coverage added for `SessionInfoPanel`, `EndedState` (with/without background image), `PlayerHost`'s unsupported branch, and both carousels' section wrapper — axe-core clean on all of them.
- Session Guide FAB is the existing widget block; confirmed placement during Phase 1.

## Phase 6 — Visual redesign from real Figma frames (in progress)

The prior phases shipped functionally-correct-but-visually-rough UI (gray placeholder boxes,
default HTML controls). The user is now sending real Figma frames screen-by-screen (mobile
first, then wider breakpoints) to bring the UI to spec. Nav/FAB/footer are excluded — out of
scope, page-level authored content per earlier decisions.

**Mobile "live" state — done**, per `MAX26-Sessions-Broadcast_Rd3_Review_070726` node
`4975:45510` (page) / `2325:29821` + `2325:29820` (info-panel collapsed/expanded variants):
- `SessionInfoPanel.js` rebuilt to match exactly: collapsed shows title+caret, clamped
  description, Favorite+Share actions; expanding reorders content — actions move directly
  under the title, followed by a channel badge (`CategoryBadge`, reused) + start-time row, the
  full description, and a "View all details" link (unchanged behavior — opens the real Session
  Guide detail view via `openSessionGuideDetail`, no local modal). The prior "duration" label
  is gone; the design uses a start-time instead, shown only when expanded.
- Two new icons added to `sessions-guide/components/icons.js` from real Figma SVG exports
  (never hand-drawn, per the design-to-code skill's rule): `IconShare` (node 37:96614) and
  `IconChevronRight` (node 8873:23273, rotated via CSS for the up/down caret).
- New `handleShare`: copies `session.sessionPageUrl` to the clipboard (not a sessions-guide
  `?session=` deep link — that param belongs to the widget's own convention), same
  success/failure handling as `SessionDetailOverlay.js`'s own Share action.
- **Real bug caught during this pass**: the panel's dark background was built with the plain
  `--s2a-color-background-default`/`-content-default`/etc. tokens, which are *theme-relative*
  (flip between a light and a `[data-theme="dark"]` value in tokens.css) — on a light-themed
  page this rendered white-on-white, invisible. Fixed by locally overriding those same token
  names on `.sb-info` to fixed dark values, mirroring the exact pattern sessions-guide's own
  `.sessions-guide[data-theme="dark"]` already uses for its dark surfaces — every descendant
  (including the reused `CategoryBadge`) now inherits the fixed dark palette automatically.
- Player container given the Figma border treatment (`1px solid rgb(255 255 255 / 15%)`) —
  **removed later per user feedback**: on mobile it read as an unwanted faint white outline
  around the video rather than a subtle frame. `.sb-player__mount`/`.sb-player__unsupported`
  no longer set a border at all.
- **The white outline persisted even after that removal** — traced to the `<iframe>`'s own
  browser default border. Milo's `adobetv.css` already resets this for its MPC iframe
  (`.milo-video iframe { border: 0 }`), but `event-youtube.css` never resets it for the
  YouTube iframe. Fixed with `.sb-player__mount iframe { border: none }`, scoped to this
  block's own player mount rather than editing `event-youtube.css` itself (also used by the
  standalone `event-youtube` block outside session-broadcast). Verified via computed style:
  the iframe's border is `0px none`.
- **Correction after a follow-up user review**: `.sb-info__icon-btn` (Favorite/Share) was
  originally built as a frosted-glass chip, copying sessions-guide's `.sg-card__btn` pattern by
  analogy without checking this specific button's own tokens. The user pointed at the two real
  Figma states (unfavorited node `4975:45501`, favorited node `4975:45494`); `get_variable_defs`
  on the canonical instance confirmed both resolve
  `--s2a-color-iconbutton-background-primary-outlined-default` to white at 0% alpha (fully
  transparent) with a solid white border/icon — a transparent outline ring, not a solid chip.
  Only the icon glyph (outline vs filled heart) differs between the two states; the button
  chrome itself is identical. Fixed to `background: transparent; border: 1px solid #fff;`.
- **Second follow-up correction**: collapsed actually has two of its own Figma variants —
  node `9935:12816` (not favorited: title, caret, clamped description, actions) vs node
  `4975:45446` (favorited: title, caret, actions — description hidden entirely). Expanded
  always shows the description regardless of favorited state; only collapsed's visibility
  depends on it. `SessionInfoPanel.js`'s description block now renders when
  `expanded || !isFavorited`, matching this exactly. Verified in the browser toggling
  `favorited` directly: collapsed+favorited hides the description, expanded still shows it
  even while favorited.
- **Third follow-up correction, per node `4975:45473`**: expanded's meta row showed a start
  time ("9:15AM") instead of duration ("2h") — switched `formatShortTime` for
  `formatDuration(..., { short: true })`, and dropped the now-unused `useSessionGuide()`/
  `userTz` plumbing entirely (duration formatting needs no timezone). The channel-badge icon
  in that row also needed to render white regardless of the session's own track accent color —
  `CategoryBadge` sets `--sg-badge-icon-color` inline per-track, so a scoped
  `.sb-info__meta .sg-category-badge__icon-color { color: #fff; }` overrides the `color`
  property directly (a more specific selector, not fighting the custom property) — the same
  mechanism sessions-guide's own hover states already use for this, no `!important` needed.
  "View all details" was rendering center-aligned (a bare `<button>`'s UA-default text
  alignment) instead of flush-left with the description above it — fixed with
  `align-self: flex-start; text-align: left;`.

**Also-Live cards — done**: confirmed with the user that the trailing stat next to Watch
Now/Favorite is the session's duration (e.g. "30m"), not a time range — the Figma sample data
was just inconsistent between the two example cards. Added `sg-live-card__actions-time`,
rendered only for `variant === 'live'`, pushed to the row's far end via its own
`margin-left: auto` rather than `justify-content: space-between` on the shared row, so every
other `LiveCard` consumer (no such element ever renders for them) is unaffected.

**Also-Live section spacing/dimensions — done**, per node `9931:12217` (section) / `4975:45415`
(card): the section sits on `--s2a-color-background-subtle` (#f8f8f8) with white cards inside
it — the inverse of Upcoming's white-section/gray-card relationship — plus a materially
different card spec than `LiveCard.js`'s shared default (311px fixed width not a 300px cap,
~195px aspect-ratio image not a fixed 168px, progress bar pinned to the image's top edge not
bottom, 16px title at Bold/700 not 20px at Black/900, 12px channel-badge label not 14px, 32px
Watch-now/Favorite buttons not 40px, 16px card gap not 8px). Every one of these is a
**CSS-only override scoped under `.sb-carousel-section--also-live`**, added in
`session-broadcast.css` — nothing in the shared `sessions-guide.css` selectors themselves
(`.sg-live-card`, `.sg-section-title`, `.sg-carousel__cards`, etc.) was touched, since those
already carry the correct, different spec for sessions-guide's own Live section. Since
`.sb-carousel-section--also-live` only ever exists in `AlsoLiveCarousel.js`'s own DOM, there's
no path for these rules to ever match sessions-guide's markup — confirmed by grep, not just by
inspection. Verified in the browser: card matches the reference closely; no dev-server
sessions-guide regression check was needed since the scoping makes a leak structurally
impossible, not just unlikely.

**Follow-up polish, same scoped block**: the `margin: 0` on the title override above was too
aggressive — it also zeroed the gap between the channel-badge row and the title, which Figma's
own 16px inter-child gap ("Session tiles V2") requires; restored as `margin: var(--s2a-spacing-md) 0 0`.
Also added `font-family: var(--body-font-family)` to the same title rule (Figma's Also-Live
title uses the body typeface, not the heading-display one `.sg-live-card__title`'s shared
default carries), and tightened `.sg-live-card__btn--watch`'s side padding from the shared 24px
to Figma's 16px for this card specifically.

**Real bug found and fixed**: `.sg-live-card__actions-time` (the trailing duration) wasn't
actually right-aligned on real mobile widths — `.sg-live-card__body` (shared) sets
`align-items: flex-start`, so `.sg-live-card__actions` never stretches to the card's own
width, leaving the time span's `margin-left: auto` with no free space to push into. Fixed by
stretching just that row to full width, scoped the same way as everything else here
(`.sb-carousel-section--also-live .sg-live-card__actions { width: 100% }`) rather than
touching the shared `align-items: flex-start` other children still rely on. Verified by
measuring bounding rects directly (screenshot-based verification wasn't reliable at this
viewport size): the time span's right edge lands exactly on the actions row's own right edge,
with real separation from the Favorite button on the left.

**Info panel favorite icon size — done**, per node `4975:45492`/`4975:45501`: the heart icon's
native SVG size (20px, shared with `LiveCard`/`SessionCard`'s own favorite buttons elsewhere)
was bigger than this specific button's Figma spec (16px) — Share sits in the same row at its
own correct 20px, so only `.sb-info__icon-btn--favorite svg` was resized, not the whole
`.sb-info__icon-btn` class shared by both buttons. Verified via bounding rect: favorite icon
renders at 16px, share stays at 20px.

**Upcoming cards — done**: switched to `SessionCard.js` instead of `LiveCard.js`'s
`recommended` variant, per the visual comparison confirming `.sg-card`'s "no image" styling is
the closer match. This needed three small, backward-compatible additions to shared code:
- `Carousel.js` gained a `CardComponent` prop (defaults to `LiveCard` — every existing caller
  unaffected) and now forwards `timeDisplay` through to whichever card it renders.
- `SessionCard.js` gained an optional `onCardClick` override on its `surface === 'page'`
  branch (same escape hatch `LiveCard.js` already had) — without it, Broadcast's Upcoming
  cards would navigate straight to the session page instead of opening the detail overlay.
- `SessionCard.js` gained a `timeDisplay="range"` option (start–end, e.g. "9:15AM - 9:45AM"),
  alongside the existing `'duration'`/plain-time options — none of the three prior modes
  produced a range.
- `UpNextCarousel.js` now passes `CardComponent=${SessionCard}` + `timeDisplay="range"`.

New/updated tests: `SessionCard.test.js` (range formatting, `onCardClick`'s daa-ll swap),
`LiveCard.test.js` (`actions-time` present only for `live`), `Carousel.test.js`
(`CardComponent` override, render-contract only — same nested-template mock limitation as the
existing `onCardClick`/`onWatchSamePage` tests).

**Real-browser verification**: full-page screenshot at 375px confirms the whole mobile "live"
state (player, info panel collapsed/expanded, Also Live cards with the new duration stat,
Upcoming cards with icon-only actions + time range) now matches the Figma frame closely.

**Upcoming section spacing/dimensions/states — done**, per node `9931:12218` (section) /
`4975:45376` (default) / `4975:45389` (favorited) / `4975:45402` (scheduled). Same scoping
convention as Also Live, under `.sb-carousel-section--up-next`:
- Section: white background (inverse of Also Live's gray-section/white-card relationship),
  `32px 24px` padding, section title corrected to black/-0.2px letter-spacing (same
  `.sg-section-title` fix as Also Live), header-to-cards gap tightened to 12px. Card-to-card
  gap needed no change — the shared 8px default already matches this section's own spec.
- **A real, previously-undetected bug found and fixed**: `.sg-card`'s own base layout
  (width, background, padding, border-radius, `flex-direction: column`) in
  `sessions-guide.css` is entirely gated behind a `:is(.sessions-guide, .sg-portal)` ancestor
  requirement — a class session-broadcast's DOM never carries. Every Upcoming card had been
  silently rendering as an unstyled, content-sized, transparent, row-direction box the whole
  time; nothing before this looked wrong enough in a screenshot to catch it, since both the
  missing gray card background and the white section background looked identical. Confirmed
  via computed style before the fix (`background: transparent`, `padding: 0px`,
  `border-radius: 0px`, `flex-direction: row`) and after (268px/gray-50/16px/16px/column,
  matching Figma exactly). Fixed by replicating `.sg-card`'s properties under
  `.sb-carousel-section--up-next .sg-card` with this card's own Figma values, rather than
  adding `.sessions-guide`/`.sg-portal` to session-broadcast's own root (which would pull in
  every *other* rule scoped that way too, not just this one).
- Title, badge row, actions row, and the `data-time`-driven trailing time text were all
  already unscoped and correctly styled — the bug above was specific to the outer `.sg-card`
  container, nothing nested inside it.
- **Icon button states**: `SessionCard.js`'s shared `IconButton` hardcodes
  `variant="solid" context="on-dark"` for both the schedule and favorite buttons regardless of
  toggle state — correct for sessions-guide's own dark card contexts, but this card is light
  (gray-50) and Figma's spec calls for two distinct treatments: frosted-glass
  (`.sg-icon-btn--solid.sg-icon-btn--on-light`'s own values) when untoggled, and a
  transparent/black-border chip (`.sg-icon-btn--outlined.sg-icon-btn--on-light`'s own values)
  once scheduled/favorited. Replicated both via scoped rules keyed off the card's existing
  `.is-scheduled`/`.is-favorited` classes and the `.sg-card__btn--schedule`/`--favorite`
  extra-class hooks — no JS change, `SessionCard.js`'s `context` prop is untouched so
  sessions-guide's own cards keep their current look. The icon glyph swap (calendar-plus →
  checkmark, heart-outline → heart-filled) already worked correctly beforehand; only the chip
  chrome was missing. `.sg-icon-btn--md`'s existing 32px/16px-icon sizing already matched
  Figma exactly — no icon-size fix needed here, unlike the Also-Live/info-panel buttons.
- Verified in the browser: default state matches Figma (gray card, frosted-glass buttons,
  black title, gray time range); toggling `scheduled`/`favorited` directly confirmed both the
  checkmark/filled-heart glyph swap and the black-border chip swap render correctly together.

Desktop/tablet frames not yet provided — mobile only so far.

**Carousel edge-to-edge peek fix — done (2026-08-30)**: both `.sb-carousel-section--also-live`
and `.sb-carousel-section--up-next` had a uniform horizontal `padding` (left and right equal),
matching Figma's own authored section-layer inset. But Figma's *rendering* of both carousels
still shows the scrollable card row's trailing card peeking all the way to the true screen
edge, underneath that layer's own right inset — a real right-padding value would instead clip
that peek. Fixed by switching both rules from the 2-value `padding: xl lg;` shorthand to a
4-value form with `0` on the right (`padding: xl 0 xl lg;`), matching the same pattern
sessions-guide's own `.sg-carousel-section` already uses for its own carousels. Verified via
computed style (`paddingRight: 0px` on both sections, section width stretching to the full
viewport) and a live screenshot at a narrow viewport confirming the last card in each row now
bleeds past the right edge instead of stopping short of it.

**Session-ended background unification — done (2026-08-30)**, per node `4975:46052`. Also
Live/Upcoming cards themselves are unchanged, per the user's explicit instruction — only the
section chrome behind them needed to change:
- `.sb-ended` gained a `background: #000` base plus a new `::after` scrim
  (`linear-gradient(180deg, transparent 23%, rgba(0,0,0,.8) 58%)` layered with a flat
  `rgba(0,0,0,.85)` tint, matching the two gradients in the Figma node) so the hero's photo
  fades to solid black by the bottom of its own box, instead of the previous plain
  `object-fit: cover` image with no darkening at all.
- `.sb-app:has(.sb-ended)` sets the whole app background to black, so that flat black
  continues seamlessly underneath Also Live/Upcoming once their own section backgrounds are
  removed below — picked over a JS-authored state class since `:has()` only ever needs to be
  true exactly when `EndedState` is actually in the DOM (same `:has()` pattern already used in
  `event-marquee.css`/`mobile-rider.css`).
- `.sb-ended ~ .sb-carousel-section--also-live` / `--up-next`: `background: transparent`
  (previously gray-50 / white) plus their `.sg-section-title`s flipped to white — both selected
  via the general sibling combinator off `.sb-ended` rather than a new modifier class, so this
  only ever applies when the ended state actually rendered a sibling `.sb-ended` before them.
  `.sg-card`/`.sg-live-card`'s own backgrounds are untouched, so the cards read correctly
  against the new black section background exactly as Figma shows.
- Verified via computed style in the harness (`?forceEnded=already-ended`) — `.sb-app`
  background black, both sections' background `rgba(0,0,0,0)`, both titles `rgb(255,255,255)`
  — and confirmed the live (non-ended) state is completely unaffected (sections keep their
  existing gray-50/white backgrounds, `.sb-ended` absent from the DOM). The rest of the ended
  hero's own content styling (heading-4 title, clamped description + "View more", pill/icon
  button treatment) is a separate, not-yet-done pass — this fix was scoped to the background
  continuity the user specifically flagged.

**Session-ended hero content redesign — done (2026-08-30)**, per node `4975:46072`. Confirmed
via `tokens.css` exactly why the user's "black on black" report was real, not a perception
issue: `.sb-ended`'s text previously read plain `--s2a-color-content-default`/`-content-subtle`/
`-border-default` token names, which resolve to near-black values in the page's default (light)
theme (`content-default` → gray-1000/#000, `content-subtle` → black at 64%, `border-default` →
gray-800) — every one of them rendered as near-invisible dark text on `.sb-ended`'s own black
background. Fixed the same way `.sb-info` already fixes this for the now-playing panel: three
local custom-property overrides scoped to `.sb-ended` (content-default → `#fff`, content-subtle
→ `rgb(255 255 255 / 64%)`, border-default → `var(--s2a-color-gray-300, #dadada)`, matching the
literal fallback colors in Figma's own extracted code) — every descendant that reads those
standard token names, including `CategoryBadge`'s inline badge-color override, now resolves
correctly with no per-element color overrides needed elsewhere.
- Added the previously-missing content to `EndedState.js`: a channel-badge + duration meta row
  (reusing sessions-guide's own `CategoryBadge`, same component `SessionInfoPanel` already
  uses), a single-line-truncated description with a "View more"/"View less" toggle (local
  `useState`, same pattern as `SessionInfoPanel`'s caret), and a Share icon button alongside
  the existing Favorite one (same copy-to-clipboard handler as `SessionInfoPanel`'s own Share).
- Typography brought up to the Figma spec: eyebrow ("Session ended.") now the actual
  heading-4 scale (36px/900 weight) instead of a small subtle line; session title now
  heading-5-ish (24px/900/-0.48px) instead of the old plain `--s2a-font-size-lg` with no color
  set at all (previously fully invisible — inherited black from the page default, not just
  low-contrast).
- Icon buttons: initially read a zoomed screenshot of node `4975:46089` as showing a ring on
  both Favorite and Share — corrected per the user's explicit follow-up: only Favorite keeps
  the white outline ring (matching `.sb-info__icon-btn--favorite`'s already-verified
  treatment); Share (`.sb-ended__icon-btn` with no modifier) is a bare icon, no ring, `border:
  0`, same "share is unadorned" convention as `.sb-info__icon-btn` itself. Renamed
  `.sb-ended__favorite` → `.sb-ended__icon-btn`/`.sb-ended__icon-btn--favorite` (shared base
  class with the new Share button) to match.
- Mobile type sizes locked to literal px values per explicit follow-up (not the responsive
  `--s2a-typography-font-size-heading-4` token, which resolves smaller than 36px at some
  breakpoints): eyebrow 36px, title 24px (already matched), "View more" 16px (previously
  unset, inheriting the page's own default size).
- `.sb-ended__meta`'s own 16px font-size didn't reach `CategoryBadge`'s label — found via
  follow-up report: `.sg-category-badge__label` sets a literal 14px in `sessions-guide.css`,
  which wins over the inherited 16px by specificity. Fixed with the same scoped-override
  pattern already used two lines above for the badge's icon color:
  `.sb-ended__meta .sg-category-badge__label { font-size: 16px; }`.
- Same gap found in `.sb-info__meta` (the now-playing panel's own channel/duration row, per
  node `4975:45473`): `.sg-category-badge__label`'s literal 14px also beat `.sb-info__meta`'s
  own size there. Fixed with the identical scoped override (font-size/line-height/weight tuned
  afterward by the user directly in a follow-up pass, current values: 16px/20px/400).
- CategoryBadge's icon-to-label gap fixed the same day: sessions-guide.css's own
  `.sg-category-badge` default (8px) read too wide in every context this block reuses it
  (info panel, ended state, Also Live/Upcoming cards). One rule at the `.session-broadcast`
  root instead of repeating it per section: `.session-broadcast .sg-category-badge { gap:
  var(--s2a-spacing-2xs, 4px); }` — so it stays correct if CategoryBadge shows up somewhere
  new later too. (First attempt used `--s2a-spacing-3xs`, which is actually 2px per
  tokens.css's scale — `--s2a-spacing-2xs` is the real 4px token; caught via computed-style
  verification, not assumed.) Also fixed a real gap in the preview harness itself: its mount
  root never carried the `session-broadcast` class the real DA/Milo block element gets, so
  block-root-scoped rules like this one were silently inert in that harness until now.
- Large top padding (64px) on `.sb-ended` is this hero's own intentional, documented spacing
  exception per CLAUDE.md's vertical-spacing rule (same category as Hero's own top-spacing
  exception) — matches node `4975:46052`'s authored `pt-64/px-24/pb-32`.
- New tests: meta-row/duration presence, Share `daa-ll`, collapsed-by-default "View more"
  toggle presence (expand itself untestable in the mocked-`useState` string-render harness,
  same documented limitation as `SessionInfoPanel.test.js`'s own caret), and no
  desc-wrap/toggle when a session has no description. `a11y.test.js`'s existing `EndedState`
  cases mount real Preact (not the string-render mock), so they exercise the real
  `CategoryBadge`/`useState` path and still pass clean.
- Verified live in the harness (`?forceEnded=already-ended`): eyebrow/title/meta/description
  all legible white/light-gray against the dark background, "View more" toggle switches to
  "View less" and un-clamps the description (confirmed via `is-expanded` class + button text
  after the click, since screenshots alone can't prove a state change), Favorite correctly
  shows the logged-out toast (same gate as every other favorite button), Share copies the link
  and shows "Link copied!". Live (non-ended) state re-verified unaffected — `SessionInfoPanel`/
  carousels render exactly as before.

**Ended-state background bleed into Also Live — done (2026-08-30)**, per user follow-up: the
photo was confined to `.sb-ended`'s own (short) box, not visually reaching into the space
Figma's own version bleeds into (that frame sizes the photo against the *combined*
hero+carousels frame, not just the hero's own content height). Moved the photo + darkening
scrim off of `EndedState.js` entirely and onto a real CSS background:
- `EndedState.js` no longer accepts `sessionEndedImageUrl` or renders any `<img>` — the prop
  and the `bgImageUrl`/`safeUrl(sessionEndedImageUrl)` line are gone.
- `BroadcastApp.js`'s `BroadcastBody` now computes `endedBgUrl` (`safeUrl(config.
  sessionEndedImageUrl)`, only when ended) and sets it as an inline `--sb-app-ended-bg` custom
  property on `.sb-app` itself — the one place that has both the authored config and renders
  that element.
- `session-broadcast.css`'s `.sb-app:has(.sb-ended)::before` renders the photo + gradient,
  sized independently of `.sb-ended`'s own height (`height: 480px`, a fixed, Figma-approximated
  value — the source frame's 48.81% is relative to a dynamic combined-height frame with no
  direct CSS equivalent) so it can visually extend past the hero into Also Live below.
- **Why a pseudo-element instead of a JS-rendered `<img>` inside `.sb-ended`** (the first
  attempt, immediately reverted after this real finding): CSS paints a `position:absolute`
  descendant with `z-index:auto`/`0` *after* plain in-flow siblings within the same stacking
  context, regardless of DOM order. An `<img>` sized taller than `.sb-ended` and confined
  inside it would therefore still paint *on top of*, not behind, the Also Live/Upcoming
  sections that follow it in the DOM — hiding their cards, not just their background. Only a
  *negative* z-index reliably moves a layer behind sibling content; that only works cleanly on
  a shared ancestor of everything it needs to sit behind (`.sb-app`), not inside one of the
  siblings itself.
- **Second real bug caught only via live-browser verification, not code review**: with only
  `position: relative` on `.sb-app:has(.sb-ended)` (no explicit `z-index`), the element doesn't
  establish its own CSS stacking context (per spec, `position` alone without a non-auto
  `z-index` doesn't create one) — so the `::before`'s `z-index: -1` escaped to compete in a
  *higher* ancestor's stacking context instead of reliably painting behind just `.sb-app`'s own
  background. Symptom: the photo was completely invisible, fully hidden behind `.sb-app`'s own
  flat black fill, even though every computed-style property on the pseudo looked correct
  (background-image, height, z-index all present) — only caught by actually looking at a
  screenshot, not by inspecting computed styles alone. Fixed by adding `isolation: isolate` to
  `.sb-app:has(.sb-ended)`, which forces a real stacking context with no other side effects.
- Test coverage moved with the responsibility: `EndedState.test.js`'s three background-image
  tests (present/omitted/unsafe-URL) and `a11y.test.js`'s "marks the authored background image
  decorative" case are gone (nothing left in `EndedState.js` to test); `BroadcastBody.test.js`
  gained an equivalent "ended-state background image (--sb-app-ended-bg)" suite covering all
  four cases (authored, unauthored, unsafe URL, and — the one case that didn't exist before —
  confirming the property is absent while a session is still live, not just when ended).
- Verified live in the harness: the photo now visibly extends from the hero down through the
  meta/description area before fading to solid black well before "Currently Live" begins;
  Also Live/Upcoming's own cards render unchanged on top of it; live (non-ended) state
  re-confirmed to carry no stray inline style or background at all.

**Ended-state photo too bright — fixed same day**: the bleed fix above only carried the
vertical fade gradient forward (0% opacity at the very top, ramping darker further down),
dropping the flat, uniform 85% black tint the original single-box version always had layered
on top regardless of vertical position — so the top of the photo (right behind "Session
ended."/the title) read too bright/undertinted, hurting text contrast. Restored it as a third
`background-image` layer (with a matching third `background-size` entry) alongside the vertical
fade and the photo itself: `linear-gradient(0deg, rgb(0 0 0 / 85%), rgb(0 0 0 / 85%))`. The
vertical fade still does its own job on top of that — feathering the combined darkness to fully
solid black by where Also Live begins — it just no longer has to carry the *entire* darkening
job on its own at every point in between.

**Brighter + later fade — tuned same day per explicit follow-up**: dialed back from that fix,
which read a bit too dark/opaque overall. Flat tint 85%→60%; vertical fade's own start pushed
from 0%→20% (mid-stop 55%→65%, solid-black stop 85%→90%) — so more of the photo is visible near
the very top before darkening begins, while it still reaches fully solid black at roughly the
same point (just before Also Live) as before. Verified visually in the harness: the photo is
noticeably more visible/recognizable near the top, text is still fully legible, and the
transition to solid black by "Currently Live" is unchanged.

**Cleanup pass before tablet — done (2026-08-30)**, per explicit request, ahead of starting the
tablet breakpoint. Pure review/cleanup — no visual change (re-verified live in the harness for
both live and ended states after every edit). Net -58 lines.
- **Dead code removed**: `getDefaultLiveSession`/`getAlsoLiveSessions` in
  `broadcast-schedule.js` — confirmed unused outside their own unit tests (superseded by
  `getBroadcastSchedule`'s own inline "commitment, not preference" logic since the Phase 3
  redesign; nothing in `BroadcastApp.js` has called either since). Their describe blocks in
  `broadcast-schedule.test.js` removed too — `getBroadcastSchedule`'s own tests already cover
  the same default-pick/exclusion behavior end to end.
- **Duplicated logic extracted**: `AlsoLiveCarousel.js` and `UpNextCarousel.js` each had an
  identical `handleCardClick` (open the Session Guide detail view + track the analytics event)
  — pulled into one `openSessionDetail(session)` in `broadcast-analytics.js`, used by both.
- **Two stale comments fixed** (both confirmed against current code before editing, not just
  reworded): `session-broadcast.js`'s `extractSessionEndedImageUrl` doc said `safeUrl()` lives
  in `EndedState.js` — it moved to `BroadcastApp.js` in the background-bleed refactor and the
  comment never got updated. `EndedState.js`'s own header said "elsewhere in this file" about
  the frosted-glass chip pattern that's actually defined in `session-broadcast.css`, not in the
  JS file at all.
- **CSS reorganized**: the ended-state background-bleed rules (`.sb-app:has(.sb-ended)`,
  `::before`, and the two sibling-combinator overrides) had ended up tacked onto the end of the
  Upcoming section purely because that's where `no-descending-specificity` forced the two
  sibling-combinator rules to live. Split it: the two rules with no ordering dependency
  (`.sb-app:has(.sb-ended)` and its `::before`) now live in their own labeled "Ended-state
  background bleed" section directly after Ended State, where they conceptually belong; only
  the two sibling-combinator rules that must stay after the base carousel-section rules
  (for specificity ordering) stayed put, now with a comment explaining why they're separated
  from the rest of the feature they're part of.
- **Comment consolidation**: the `::before` rule's comment had grown into a running diary
  across three separate tuning passes (background-bleed refactor → too-bright fix → later-fade
  fix), each addendum quoting the specific before/after numbers of that pass. Condensed into
  one explanation of the current design (three-layer background-image: flat tint + vertical
  fade + photo) with a pointer to this PLAN.md file for the tuning history, rather than
  carrying that history in the shipped CSS itself — this is a buildless project, so
  everything in source ships straight to visitors with no build step to strip comments.
  `BroadcastApp.js`'s own copy of the paint-order/stacking-context reasoning (now stated fully,
  once, in the CSS file) was trimmed to a two-line pointer for the same reason.
- **Formatting nits**: two rules had a trailing space after their opening `{` from an editor
  autocomplete artifact (`.sb-info__meta .sg-category-badge__label`, `.sb-ended__desc`) — fixed.
- **Considered, not done**: `.sb-info__icon-btn`/`--favorite` and `.sb-ended__icon-btn`/
  `--favorite` are near-identical (40px circle, transparent, white ring on favorite, bare icon
  for share) but scoped to two different, mutually-exclusive states. Left unmerged on purpose —
  tablet's own spec for these two contexts isn't known yet, and merging now risks fighting that
  work rather than helping it; revisit after tablet if they're still identical then.

**Aggressive comment pass — done (2026-08-30)**, per explicit follow-up request: the cleanup
above still left a lot of comment volume (Figma node IDs, multi-paragraph "why" explanations,
historical narrative). Went through every JS and CSS file in the block a second time and cut
hard — kept only what's non-obvious and load-bearing (gotchas, cross-file pointers, standards
compliance), trimmed those to 1-3 lines, and deleted everything else (restated Figma node
numbers, "confirmed via X" narrative, anything a reader could infer from the code itself).
Net -248 lines across the block. Pure comment change — no logic touched, re-verified live and
ended states render pixel-identical, full test suite/lint clean.

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
