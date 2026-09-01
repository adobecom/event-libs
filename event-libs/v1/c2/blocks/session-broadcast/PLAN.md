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

### How analytics works here, in event-libs generally, and in Milo (researched 2026-08-31)

Two independent mechanisms, both ultimately feeding Adobe Launch/DTM (`window._satellite`):

**1. Static `daa-ll`/`daa-lh` — mostly automatic, no block code needed.** Milo's
`documentPostSectionLoading` (`milo/libs/utils/utils.js`) calls `decorateSectionAnalytics()`
(`milo/libs/martech/attributes.js`) on every section/block on every page, post-load: tags
`daa-im="true"` on `<main>`, `daa-lh` on sections/blocks, and auto-derives `daa-ll` for every
link/button from its visible text via `decorateDefaultLinkAnalytics()`. Adobe Launch reads
these attributes directly to fire tracking — neither Milo nor event-libs has a "listen for
daa-ll clicks" handler anywhere; Milo's own code only ever *writes* the attributes. Because of
this automatic pass, event-libs blocks only add explicit `daa-ll` for two exceptions (this
exact rule is independently documented in `event-libs/v1/c2/blocks/event-session-details/docs/
README.md`'s "Analytics (DAA)" section too): (a) the element is created *after* Milo's
decoration pass (any Preact/HTM component — this is why `SessionInfoPanel.js`/`EndedState.js`/
`SessionCard.js`/`LiveCard.js`/`IconButton.js` all carry `daa-ll` props), or (b) the label
mutates post-paint (favorite/schedule toggle, expand caret). `event-libs/v1/utils/decorate.js`'s
`updateAnalyticTag()` is the one shared helper for the second case, narrowly used for the RSVP
button — deliberately not reused elsewhere since it appends `|<event-title>`, which would
defeat roll-up for anything else. `event-libs/v1/blocks/daa-injection/daa-injection.js` is a
dedicated authoring-time block for hand-placing `daa-lh`/`daa-ll` via a DA table row when even
that isn't enough.

**2. Dynamic `sendAnalytics()` — for events that aren't a simple click.** Defined in
`milo/libs/blocks/modal/modal.js`: takes a real `Event` object (not a payload) and calls
`window._satellite.track('event', { data: { web: { webInteraction: { name: event.type }}}})`,
falling back to a one-time `alloy_sendEvent` listener if `_satellite` isn't loaded yet (consent/
martech still initializing). Since there's no separate payload argument, any dimension has to
travel in the event name string itself — hence `trackBroadcastEvent()`'s
`` `Broadcast-Session-Switch | ${session.id}` `` pattern. **session-broadcast is not the only
place doing this** — `event-libs/v1/blocks/events-form/events-form.js` independently does the
exact same dynamic `import('${miloLibs}/blocks/modal/modal.js')` dance for its own
`eventFormSendAnalytics()`. There is no shared event-libs wrapper for this — each block rolls
its own. Worth a future dedup if a third consumer shows up.

**Other Milo pieces worth knowing about**: `milo/libs/martech/helpers.js` (page-name helpers,
consent/Alloy orchestration — the thing that actually dispatches `alloy_sendEvent`) and
`milo/libs/martech/martech.js` (bootstraps the Launch/DTM bundle itself, fires
`_satellite.track('pageload')`). `martech/attributes.js` also exports `analyticsDecorateList`/
`analyticsGetLabel` for consistent per-list-item `daa-ll` tagging (used by gnav/footer in Milo) —
not used anywhere in event-libs today, but a candidate for any future list-heavy UI.

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

**Tablet (769–1279px) — in progress**, per `MAX26-Sessions-Broadcast_Rd3_Review_070726` node
`4975:45550`. Nav/in-person banner/footer/Session Guide FAB excluded per the user, same as
every other frame.
- Screenshotted the Also Live (`4975:45574`) and Upcoming (`4975:45634`) sections directly —
  both already match the existing mobile styling exactly (same 311px/268px card widths, same
  colors, same edge-to-edge peek behavior, confirmed the peek persists at this width despite
  Figma's own layer again showing an equal-both-sides padding value, same pattern as the
  mobile peek investigation). No CSS changes needed for either section at this breakpoint.
- `SessionInfoPanel.js`/`session-broadcast.css`: the one genuine layout difference. Collapsed
  state moves from mobile's stacked rows (title+caret, then description, then Favorite+Share)
  to title+caret and Favorite+Share sharing one row, with description below spanning full
  width — confirmed via a zoomed screenshot of node `4975:45571` that the icon-button treatment
  itself (ring on Favorite, bare Share, 16px heart icon) is unchanged from mobile, so this is a
  pure layout reflow, not a restyle.
  - Converted `.sb-info` from flex-column to CSS Grid with named areas (`row`, `actions`,
    `meta`, `desc`, `viewall`). `SessionInfoPanel.js` now renders `actions` exactly once, at a
    fixed DOM position, instead of the old two-branch `${expanded && actions}` /
    `${!expanded && actions}` split — grid-area placement doesn't care about DOM order, so one
    render site can appear in different visual spots per state/breakpoint. Added an
    `is-expanded` class on the root `.sb-info` div (new; nothing read this before) to select
    the expanded template.
  - `.sb-info:has(.sb-info__desc-wrap)` swaps in a 3-row collapsed template only when a
    description is actually present (still hidden when favorited) — avoids an empty grid row
    (and its `gap`) reserving space when collapsed+favorited hides the description.
  - `@media (min-width: 769px)` puts row+actions in one grid row (`1fr auto` columns) with
    description spanning both columns below.
  - **Expanded state at tablet is an extrapolation, not confirmed by a dedicated frame**: kept
    row+actions together on one line, then stacked meta/desc/viewall below in the same order
    mobile already uses. Revisit if a tablet-expanded frame is provided and it differs.
  - Verified live in the harness at 900px: collapsed, expanded, and favorited+collapsed
    (description correctly hidden, no leftover gap) all match the Figma screenshot; re-checked
    mobile (500px) and desktop (1400px, existing 1280px max-width rule) both still render
    correctly — this change is purely additive at 769px+, nothing shifted below it.
- **Ended state at tablet not yet covered** — no tablet frame was provided for it; currently
  still renders with mobile's stacked layout at this breakpoint (not broken, just unstyled for
  tablet specifically). Needs its own frame before a tablet-specific pass.

**Session info panel review fixes — done**, per user follow-up against node `4975:45573` plus a
zoomed screenshot of the title row. Breakpoint changed to **768px** (was 769px) per explicit
follow-up.
- **Caret not hugging the title**: `.sb-info__row`'s gap was `--s2a-spacing-sm` (12px); Figma's
  title+caret group specs `--s2a-spacing-xs` (8px). Fixed globally (harmless at mobile, where
  `.sb-info__title`'s own `flex:1` already puts far more than 12px between them regardless of
  the gap value).
- **Vertical centering, root cause**: `.sb-info__title` mobile's `flex:1` inside the narrower
  tablet grid column was forcing long titles to wrap onto 2 lines, which is what actually broke
  the alignment against the 40px-tall action buttons — `align-items:center` on the grid was
  already correct, but centering a 2-line title block still looks visibly off next to
  single-line icons. Root-caused before fixing, not patched blindly: Figma's own title node
  uses `shrink-0` + `overflow-hidden`/`whitespace-nowrap`/`text-ellipsis`, not full-width
  growth — ellipsis-truncating single-line title, not a wrapping one. Fixed by giving
  `.sb-info__title` `flex: 0 1 auto; min-width: 0;` plus the ellipsis triad, scoped to the
  768px+ media query only (mobile's own far-right-pinned caret behavior, confirmed against its
  own earlier screenshot, is a different and still-correct spec — left untouched). Also changed
  `.sb-info__row`'s `align-items` from `flex-start` to `center` (matches Figma's own
  `items-center` on that inner group) — harmless at mobile, correct at tablet.
- **Favorite/Share order reversed**: Figma has Share first, Favorite rightmost — opposite of
  mobile's own (correct, unchanged) DOM order. Fixed with `.sb-info__icon-btn--favorite {
  order: 1; }` inside the tablet media query — CSS-only, no DOM/tab-order change, no JS touched.
- **Description font-size**: `.sb-info__desc-wrap` was reading `--s2a-font-size-sm` (14px);
  Figma's tablet node explicitly specs 16px. Scoped the fix to the tablet media query only —
  mobile's own 14px wasn't contradicted by any frame and is left as-is.
- Verified all four via computed style at 900px, not just visually: `descFontSize: "16px"`,
  `titleFlex: "0 1 auto"`, `favOrder: "1"`, share `x` less than favorite `x`, and title's
  vertical center exactly equal to the favorite button's vertical center (550.25 = 550.25).
  Re-confirmed mobile (500px) renders byte-for-byte the same as before (favorite still first,
  stacked layout, no truncation).

**MPC player full-bleed width — done**. `c2-global.css`'s shared C2 foundation stylesheet caps
`.milo-video` (the wrapper class Milo's `adobetv.js` adds around the MPC iframe) at 1192px
centered, starting at its own `min-width: 1024px` breakpoint — built for typical rich-content
video embeds elsewhere on the site, not this block's intentionally full-bleed player. Its
`:root:has(meta[name="foundation"][content="c2"]) .milo-video` selector's attribute-selector
combo out-specifies a normal `.session-broadcast`-scoped override, so `!important` is used —
same precedented pattern already in `mobile-rider.css` for an equivalent foundation-style
override. Scoped to the same `1024px` breakpoint as the rule it's countering, so it's a no-op
below that width (nothing to override there anyway). Verified live by switching to a real MPC
session (`live-2`): first caught that an initial check at 900px proved nothing (both rules are
gated behind `min-width: 1024px`, so neither is even active there), then re-checked at 1260px —
past both the `1024px` activation point and the `1192px` cap itself, the width that actually
proves the override works — computed style confirmed `max-width: none` and the player's own
`getBoundingClientRect().width` at the full `1260px`, not clipped to `1192px`, with a real
Adobe TV video rendering edge-to-edge.

**Square corners at tablet — done**, per explicit follow-up: both players round to 24px above
1024px (MPC via `c2-global.css`'s `.milo-video` rule, YouTube via `event-youtube.css`'s own,
near-identical `.youtube-video-container` rule) — neither is desired for this block's
full-bleed player. Added `border-radius: 0 !important` to both inside the same `1024px`
media query already overriding `.milo-video`'s width, plus a new equivalent
`!important` override for `.youtube-video-container` (event-youtube's selector chains three
classes/`:not()`, also out-specifying a plain scoped rule). Verified at 1260px for both player
types (switching sessions to exercise each adapter for real) — `borderRadius: "0px"` on both,
square corners confirmed visually. Mobile re-confirmed unaffected (was already unrounded below
1024px, nothing to override there).

**YouTube width now matches MPC — done**, per explicit follow-up. Added the same
`max-width: none !important; margin: 0 !important;` to `.session-broadcast
.youtube-video-container`, in the same `1024px` media query, alongside its existing
`border-radius: 0 !important`. Verified at 1260px: `maxWidth: "none"`,
`getBoundingClientRect().width` at the full `1260px` (was capped to `848px` before), matching
MPC's own full-bleed behavior exactly.

**Session info panel square corners at tablet — done**, per explicit follow-up (design intent,
not tied to any single Figma frame examined pixel-by-pixel). `.sb-info` normally rounds only
its bottom corners (`0 0 16px 16px`, since the player above it already rounds its own top) —
added `border-radius: 0;` inside the existing `@media (min-width: 768px)` block (no
`!important` needed here, since this is our own component's rule, not fighting a foundation
stylesheet). Verified: `0px` at 1260px, unchanged `0px 0px 16px 16px` at mobile (500px).

**Also Live/Upcoming cards breaking at 1024px+ — done**, per explicit follow-up report ("this
might be a limitation based on the original usage coming from session guide... we don't want
to break session guide"). Root cause confirmed by direct computed-style inspection before
writing any fix, not guessed: sessions-guide.css defines its **own** desktop redesigns of both
shared card components — `.sg-live-card` at both `1024-1279px` *and* `1280px+` (two
near-identical blocks), and `.sg-card` at `1280px+` only — meant for sessions-guide's own Live
section and card grid, completely unrelated to how Broadcast reuses these same components.
Neither block is scoped behind an ancestor class the way `.sg-card`'s *base* layout is (see
the earlier `.sessions-guide`/`.sg-portal` ancestor-scoping bug in this same file) — these are
bare, unscoped selectors, so they apply to Broadcast's cards too, and several of the properties
they touch aren't ones our own scoped rules happen to override, so they slip through unopposed.
- **`.sg-live-card` (Also Live)**: switches to `flex-direction: row` with a **fixed
  425px/560px-wide image and body** — inside our own 311px-wide card, that's a body element
  alone wider than its entire parent, which is what was actually visible as "breaking": the
  image rendered, but the body (title/badge/actions) was pushed far outside the card's visible
  bounds. Also picks up a hover-to-solid-black fill with matching white text/icon colors,
  which — once the layout itself is fixed — would otherwise make text invisible against a card
  we want to stay white on hover, not black.
- **`.sg-card` (Upcoming)**: `1280px+` only (`1024-1279px` doesn't redefine `.sg-card` the way
  it does `.sg-live-card` — confirmed by grep, not assumed). Moves the channel badge into a
  bottom "footer" row, forces `.sg-card__body` to a fixed 331px (wider than this card's own
  268px), and — the actual reason icon buttons appeared to vanish rather than just misplaced —
  collapses `.sg-card__actions` to `width: 0; opacity: 0; pointer-events: none;` by default,
  only revealing it on hover/focus/scheduled/favorited. That's a deliberate hover-reveal
  pattern for sessions-guide's own desktop card; Broadcast's Upcoming cards want icon buttons
  always visible, matching every other breakpoint already shipped. The trailing time label
  (`.sg-card__actions::after`, generated from `content: attr(data-time)`) is hidden by the same
  block too, for the same reason, and needed its own explicit reset.
- Fixed by adding two new media-query blocks scoped under `.sb-carousel-section--also-live`
  (`min-width: 1024px`, no upper bound — matches both sessions-guide blocks it's countering)
  and `.sb-carousel-section--up-next` (`min-width: 1280px` only, matching the one block that
  actually affects `.sg-card`) that reset every touched property back to what each card already
  uses below 1024px — not a blanket unscoped fix, so sessions-guide's own Live section and card
  grid keep their intended desktop redesigns completely untouched everywhere else on the site.
- Verified at 1100px, 1300px, and re-confirmed unaffected at mobile (500px): both carousels'
  cards render with visible badge/title/actions/time in the correct vertical layout at every
  width tested, matching what was already shipped and verified for 768-1023px. Full test suite
  (2178 passed, only the two known pre-existing flaky tests) and lint clean.

**Aggressive comment pass — done (2026-08-30)**, per explicit follow-up request: the cleanup
above still left a lot of comment volume (Figma node IDs, multi-paragraph "why" explanations,
historical narrative). Went through every JS and CSS file in the block a second time and cut
hard — kept only what's non-obvious and load-bearing (gotchas, cross-file pointers, standards
compliance), trimmed those to 1-3 lines, and deleted everything else (restated Figma node
numbers, "confirmed via X" narrative, anything a reader could infer from the code itself).
Net -248 lines across the block. Pure comment change — no logic touched, re-verified live and
ended states render pixel-identical, full test suite/lint clean.

**Tablet: description no longer hides when favorited — done**, per explicit follow-up.
Previously `SessionInfoPanel.js` decided whether `.sb-info__desc-wrap` existed in the DOM at
all via a JS condition (`expanded || !isFavorited`) — a presence decision, not just a styling
one, so no CSS override could reach it once the JS chose not to render it. Moved that decision
into CSS instead: the description now always renders whenever `session.description` is
truthy (matching `EndedState.js`'s own simpler pattern), and a new `is-favorited` class on the
root `.sb-info` div (mirroring the existing `is-expanded` one) lets CSS decide visibility per
breakpoint:
- Mobile (default): `.sb-info.is-favorited:not(.is-expanded) .sb-info__desc-wrap { display:
  none; }`, plus a matching 2-row `grid-template-areas` override on the same selector — the
  actual reason this needs a *grid* override, not just `display:none` on the child, is to avoid
  the empty "desc" row's `gap` still reserving space that the mobile screenshot verification
  earlier (see the tablet layout work above) specifically checked was clean.
- Tablet (`768px+`): reverses both — restores the "row actions" / "desc desc" template and
  `display: -webkit-box` (the base value) so the description always shows regardless of
  favorited state.
- `SessionInfoPanel.test.js`'s "hides the description when collapsed and favorited" test
  rewritten: since favoriting no longer removes the markup (CSS does the hiding now, untestable
  in the mocked string-render harness), it now asserts the `is-favorited` class is present
  instead — the actual hiding is a live-browser check, done here at both 500px (mobile: heart
  filled, description gone, no extra gap) and 900px (tablet: heart filled, description visible)
  via direct signal manipulation, plus a check that a spurious `flow-root` computed `display`
  value (a pre-existing Chrome normalization quirk for `-webkit-box` + line-clamp, confirmed to
  affect the *unfavorited* case identically) wasn't something this change introduced.

**`.sg-section-title` tablet size (Figma node 4975:45576)**: sessions-guide's own `@media
(min-width: 768px)` rule bumps `.sg-section-title` up to `--s2a-font-size-2xl` (24px) for its own
layout — Broadcast's Also-Live/Up-Next section titles ("Currently Live," "Up Next") need to stay
at 18px at tablet, same as mobile, per the Figma spec (color/letter-spacing were already correct
via the existing mobile-scoped `--also-live`/`--up-next` rules). Added a reset in the existing
tablet `@media` block, scoped `.session-broadcast .sg-section-title` (not bare — the
sessions-guide widget/FAB is typically co-mounted on the same page and shares this class).
**Real bug caught via the user's own browser inspection**: the first attempt used the semantic
`--s2a-typography-font-size-heading-6`/`-line-height-heading-6` tokens (matching the Figma
export's own fallback values) — but those aliases are *intentionally* responsive in this
codebase's `tokens.css`, remapped to `--s2a-font-size-md` (16px) below 1280px and only becoming
18px at 1280px+, so they measured as 16px in the browser at tablet width, not 18px. Fixed by
switching to the underlying fixed-value scale tokens (`--s2a-font-size-lg`/`--s2a-font-line-height-
xs`, both = 18px, defined once before any `@media` block, never remapped) — the exact same token
`.sg-section-title`'s own base/mobile rule already uses, so this now reads as "stay the same size
as mobile" rather than routing through a breakpoint-dependent semantic role that only sometimes
coincides with the intended value. `npx stylelint` clean (only the pre-existing accepted
`-webkit-box` finding).

**Carousel nav hidden on tablet, swipe instead**: per Figma, the Also-Live/Up-Next carousel nav
arrows (`.sg-carousel__nav`) shouldn't show on tablet — cards should be swipeable instead.
Investigated before touching anything, since sessions-guide's own carousel behavior is
breakpoint-dependent in a way that made this riskier than a simple hide: at 768-1023px cards
already scroll natively (`.sg-carousel__cards` keeps `overflow-x: auto` + scroll-snap; the nav is
only a floating enhancement there), but at 1024-1279px ("Intermediate Tablet" per sessions-guide's
own naming) the strip switches to `overflow: visible` with **no native scroll at all** — it's
paged entirely by JS transform (`Carousel.js`'s `paged` state, itself derived from computed
`overflow-x`), and the nav arrows are the *only* way to reach additional cards there. Since this
block's own tablet range is documented as 768-1279px (spans both sessions-guide sub-tiers), hiding
the nav without also restoring native scroll for the 1024-1279px half would have stranded anyone
with more cards than fit on screen. Fix: one `@media (min-width: 768px) and (max-width: 1279px)`
block, scoped under both `.sb-carousel-section--also-live`/`--up-next`, that hides `.sg-carousel__
nav` and restores `.sg-carousel__cards`'s native-scroll properties (`overflow-x: auto`,
`scroll-snap-type: x mandatory`, `-webkit-overflow-scrolling: touch`, `scrollbar-width: none`) plus
`.sg-carousel__card-wrap`'s `scroll-snap-align: start` — all no-ops below 1024px (already the
native-scroll default there), and the meaningful fix at 1024-1279px. No `Carousel.js` changes
needed: it already recomputes its own `paged` state from computed `overflow-x` on measure/resize,
so restoring the CSS is enough for it to self-correct back to native-scroll mode. `npx stylelint`
clean (only the pre-existing accepted `-webkit-box` finding). Real-browser verification (swipe
actually works at both tablet sub-tiers, nav stays hidden, desktop 1280px+ unaffected) still
pending — needs the `chrome-devtools` MCP server reconnected or a manual walkthrough.

**`.sb-ended__eyebrow` ("Session ended.") tablet size (Figma node 4975:46368)**: grows to a larger
treatment on tablet. First attempt used the raw Figma-export fallback values (56px/56px-line-
height/-1.68px-letter-spacing) at face value — those turned out to be this codebase's *1280px+
desktop* tier for the shared `--s2a-typography-*-heading-2` tokens, one tier too large. **Corrected
by the user against the actual design to 48px** — the 1024-1279px tier's full, consistent set
(48px font-size/48px line-height/-1.44px letter-spacing; mobile/base is 32px/-0.96px/32px,
unrelated — matches the already-hardcoded 36px-font-size mobile rule, itself a deliberate
deviation from the semantic scale). Still deliberately not using the semantic aliases directly:
they'd correctly give 48px at 1024-1279px but wrongly drop to 32px below that, and this block's
tablet range starts at 768px. Fixed by hardcoding to the fixed-value scale tokens
(`--s2a-font-size-6xl`/`-line-height-2xl`/`-letter-spacing-xl`) pinned to the 1024-1279px tier's
values across the whole 768-1279px tablet range, scoped to tablet only — desktop's own treatment
for this element hasn't been given a frame yet, so it's deliberately left alone (still the
pre-existing hardcoded 36px). **Lesson for next time**: a Figma-exported fallback value being
internally consistent with *some* tier of this codebase's token system doesn't mean it's the
*right* tier for the breakpoint being asked about — worth a quick user confirmation on the actual
number before treating an exported fallback as ground truth, not just checking that it resolves
to *a* real value. `npx stylelint` clean (only the pre-existing accepted `-webkit-box` finding).

**`.sb-ended__title` (the session title) tablet size + truncation (Figma file "Session Broadcast
VizD R1 8.17.26", node 24:21713 — a different Figma file than the rest of this page's frames)**:
first pass trusted the raw Figma-export fallback values (24px font-size/24px line-height) and,
since the existing unconditional rule already hardcodes 24px/24px, concluded "already matches, no
change needed" — the exact same trap as the eyebrow fix above. 24px is this codebase's 1280px+
desktop tier for the shared heading-5 tokens, not tablet. **Corrected by the user against the
actual design to 20px** — the 1024-1279px tier's value (`--s2a-font-size-xl`/
`--s2a-font-line-height-sm`, both 20px; mobile/base is 18px, unrelated). Fixed by adding explicit
`font-size`/`line-height` overrides using those fixed-value tokens to the same tablet-scoped
(`768-1279px`) block. letter-spacing (-0.48px) was never at risk and needed no correction — it's a
stable, non-remapped fixed token (`--s2a-font-letter-spacing-4xl`), not a semantic alias.
Also added `overflow: hidden; white-space: nowrap; text-overflow: ellipsis;` in the same rule —
the design shows the title truncated to a single ellipsized line
(`overflow-hidden`/`text-ellipsis` in the export), which the base rule never did at all, so a long
title would otherwise wrap across multiple lines. Scoped to tablet only since no mobile frame was
referenced for this specific change. `npx stylelint` clean (only the pre-existing accepted
`-webkit-box` finding). **Same lesson as the eyebrow fix, now confirmed twice in a row**: treat a
Figma-exported fallback as a starting hypothesis to verify against `tokens.css`'s actual tier
breakdown, never as ground truth — "the base rule already hardcodes this value" is not evidence
it's correct for a *different* breakpoint than whatever it was originally hardcoded for.

**Ended-state spacing rhythm verified against Figma (same "Session Broadcast VizD R1 8.17.26"
file, node 24:21712, covering `.sb-ended__title` → `.sb-ended__meta` → `.sb-ended__desc-wrap` →
`.sb-ended__view-more` → `.sb-ended__actions`) — no changes needed.** Checked all four gaps
(title→meta 24px, meta's own internal gap 16px, meta→desc-wrap 4px, desc-wrap→view-more 4px,
meta-group→actions 24px, actions' own internal gap 12px) against the existing CSS and they match
exactly (`--s2a-spacing-lg`/`-md`/`-2xs`/`-sm`). Unlike the typography tokens above, spacing tokens
are defined once before any `@media` block in `tokens.css` and never remapped at any breakpoint —
confirmed before relying on that, given the pattern of typography aliases being unexpectedly
responsive. This spacing was evidently already built correctly from earlier project work. Note:
this design node doesn't include `.sb-ended__eyebrow`, so `.sb-ended__title`'s own top margin
(relative to the eyebrow above it) is unverified against this specific design — needs its own
frame if that gap ever needs checking.

**`.sb-ended__desc` tablet truncation switched from CSS pixel-width to a fixed 70-character count
(Figma node 24:21722, same file)**: the collapsed description was truncating "way later" than the
design calls for — the existing CSS (`white-space: nowrap` + `text-overflow: ellipsis` on
`.sb-ended__desc-wrap`) truncates based on however much text fits the container's actual rendered
pixel width, which on our real tablet layout fits noticeably more text than the design's reference
box. Confirmed the intended cutoff directly against a zoomed screenshot of the design (not assumed
from the exported code's full text content, which is the untruncated source string) — exactly 70
characters: `"Lorem ipsum dolor sit amet consectetur. Leo cursus dui fermentum
neque"`. Implemented as a fixed 70-char JS truncation (`truncateChars()`) applied only when
collapsed *and* in the tablet range, gated by a new `useIsTabletRange()` hook in `EndedState.js` —
same `matchMedia`-per-component convention already established by `FilterPanel.js`'s
`useIsMobile()`/`SessionDetailOverlay.js`'s `useIsDesktop()` (no shared hook exists in this
codebase; each component defines its own identically-shaped one). No character-count truncation
utility existed anywhere in the repo to reuse — `event-session-details/description-clamp.js`'s
`measure()` is a `scrollHeight`-based CSS-line-clamp toggle, not a character-count helper.
Expanded state and mobile/desktop are untouched — they keep the existing full-text/CSS-ellipsis
behavior; only the collapsed-and-tablet combination is affected. Tests mock `window.matchMedia`
directly (same pattern as `FilterPanel.test.js`'s "responsive layout" describe block), since the
mocked htm-preact's `useEffect` is a no-op — only the `useState` initializer's synchronous
`matchMedia` read is exercised there; the reactive resize-driven update needs a real-browser check.
136/136 session-broadcast tests pass (3 new), `npm run lint` clean.

**Also Live card image: no 1px border on tablet**: `.sg-live-card__image`'s
`border: 1px solid rgb(255 255 255 / 15%)` comes from the existing `@media (min-width: 1024px)`
reset block (originally written for desktop, with no upper bound, so it also reaches the
1024-1279px portion of tablet). Per design, tablet shouldn't have this border at all. Added a
`@media (min-width: 768px) and (max-width: 1279px)` override setting `border: none`, placed after
the 1024px+ block so it wins the cascade tie for the 1024-1279px overlap (same specificity, later
source order) while leaving the border in place at 1280px+ (desktop). 768-1023px never had the
border to begin with (the 1024px+ reset doesn't reach that low), so the override is a no-op there.
`npx stylelint` clean (only the pre-existing accepted `-webkit-box` finding).

**Ended-state background: taller bleed + darker fade on tablet, plus an optional bigger image
source.** Per design, tablet extends the background bleed to 80% of the viewport (not the fixed
480px mobile/base value) and darkens the vertical fade's 75%-stop to 90% opacity (was 75%). Used
`80vh`, not a literal `80%` — this `::before` is absolutely positioned with `.sb-app` as its
containing block, and `.sb-app` has no explicit height of its own (only `display: block`), so a
percentage height here would resolve to `auto` per the CSS spec and the bleed would collapse to
nothing; `80vh` has no such dependency.

Separately, asked whether a bigger image could be pulled in for the larger tablet+ box. Investigated
first, since this touches code that was deliberately simplified once before to fix a real bug:
`sessionEndedImageUrl` used to be authored as an embedded `<picture>`, which Milo's
`decorateImageLinks()` could silently swap for an empty `<video>` if the asset's alt text carried a
`|`-delimited convention — the fix at the time was to change authoring to a plain link instead (see
the Analytics/Phase-4 section above). Reintroducing a `<picture>` naively would have reintroduced
that same risk. Investigation found the row can naturally carry **both** at once — DA's "linked
image" authoring nests the `<picture>` inside the `<a>`, they aren't mutually exclusive — so a safe
middle path exists: keep reading the single default URL exactly as before (unchanged, still
collision-proof via the `<a href>`/`<img src>` fallback chain), and *additionally* look for a
`<picture>` in that same row purely to extract a URL string from its largest `<source>` (by parsing
`width=` out of each `srcset`) — never rendering the picture itself back into the page. If Milo's
decoration pass ever did collision-convert that picture away, this simply finds nothing and falls
back to the single default URL everywhere, identical to the behavior before this existed — it can
only ever match or improve on today's behavior, never regress it.

Implementation: `session-broadcast.js`'s `parseBroadcastConfig` gained a second field,
`sessionEndedImageUrlLarge` (via new `extractLargestPictureUrl()`); `BroadcastApp.js` sets an
additional `--sb-app-ended-bg-lg` custom property only when that field is present; the tablet CSS
block uses `var(--sb-app-ended-bg-lg, var(--sb-app-ended-bg, none))` so it prefers the bigger
source when available. 142/142 session-broadcast tests pass (6 new), `npm run lint` clean.

**Follow-up bug: desktop never referenced `--sb-app-ended-bg-lg` at all.** Reported via real
testing on a live DA page (auth-gated, so verified by reasoning through the actual authored markup
the user pasted rather than fetching it): the small (750px) image kept loading. Wrote a regression
test using that exact real HTML (a bare `<picture>` with no wrapping `<a>` — this specific asset
wasn't authored as a "linked image," unlike the assumption in the original design notes above) to
rule out an extraction bug first — `extractLargestPictureUrl()` correctly resolved to the
`width=2000` source, confirming the JS side was already right. The actual gap: only the base rule
(mobile, all breakpoints by default) and the 768-1279px tablet block existed for
`.sb-app:has(.sb-ended)::before` — nothing at 1280px+ referenced `--sb-app-ended-bg-lg` at all, so
desktop fell through to the base rule's `--sb-app-ended-bg`-only `background-image`. User confirmed
the larger image should apply at both tablet *and* desktop (mobile stays small, intentionally).
Added a `@media (min-width: 1280px)` block using the same `-lg`-preferring `background-image`
value, keeping desktop's existing 480px height and 60/60/75%-opacity gradient stops as-is — no
desktop-specific height/gradient redesign was requested, only the image resolution. 143/143
session-broadcast tests pass (1 new, using the real authored markup verbatim), `npm run lint`
clean.

**Root cause of that same report, actually found: `source.srcset` is never auto-resolved to an
absolute URL.** The desktop-rule gap above was real but not the whole story — after fixing it, the
image still didn't switch. Diagnosed by checking the live page's inline style (`--sb-app-ended-bg-
lg` was completely absent, not just unused), which ruled out a CSS cascade issue and pointed back
at the JS. The actual bug: unlike `a.href`/`img.src` (which the browser always resolves to an
absolute URL), `source.srcset` reflects the raw authored attribute string as-is — `srcset` is a
list microsyntax (comma-separated url+descriptor pairs), so there's no single URL for the browser
to resolve automatically. DA authors relative paths here (`./media_....jpg?width=2000...`), so
`extractLargestPictureUrl()` was correctly identifying the right source by width but returning a
*relative* string, which then failed `BroadcastApp.js`'s `safeUrl()` check
(`/^(https?:\/\/|\/)/`) and got silently dropped — never reaching `--sb-app-ended-bg-lg` at all.
This is exactly why the earlier "real DA-authored markup" regression test didn't catch it: that
test only asserted `.include('width=2000')`, which stayed true even for the unresolved relative
string — a genuine blind spot in the test, not just the implementation.

**Fix**: added `resolveUrl()` (`new URL(url, document.baseURI).href`, with a try/catch) and
`firstSrcsetUrl()` (extracts the URL token from one `srcset` candidate, ignoring the list/descriptor
syntax `srcset` allows, even though none of our sources use it), and resolve the picked source's
URL through them before returning it from `extractLargestPictureUrl()`. Added a new test that
asserts the *exact* resolved absolute URL (not just a substring) and matches it against
`/^https?:\/\//`, specifically to close the blind spot the previous test left open. 144/144
session-broadcast tests pass (1 new), `npm run lint` clean. Diagnosed entirely through user-supplied
evidence (the live page is auth-gated, `WebFetch` returned 401) — the exact real authored HTML,
then a direct check of the live inline style — rather than fetching the page directly.

**Up Next card: title-to-actions spacing on tablet (Figma node 4975:46423, "Session card - no
images")**: `sessions-guide.css`'s base `.sg-card__title` only carries a 2px `margin-bottom` —
clearly meant for spacing between wrapped title lines, not the gap down to the next group. The
design's own top-level layout gives every group in this card (badge row → title → actions) a
uniform 12px gap (`--s2a-spacing-sm`), the same token already used for the badge-row's own
`margin-bottom` in this file. Added a `@media (min-width: 768px) and (max-width: 1279px)` override
bumping `.sg-card__title`'s `margin-bottom` to `--s2a-spacing-sm` (12px), scoped to tablet only
since that's what was asked and mobile wasn't reported as needing a change. `npx stylelint` clean
(only the pre-existing accepted `-webkit-box` finding).

**Carousel header-to-cards gap grows to 24px on tablet**: both `.sb-carousel-section--also-live`
and `--up-next`'s base rules set `.sg-carousel__header`'s `margin-bottom` to `--s2a-spacing-sm`
(12px); tablet needs `--s2a-spacing-lg` (24px) instead. Added to the existing tablet
(`768-1279px`) block alongside the carousel-nav/swipe rules, since it applies identically to both
sections. `npx stylelint` clean (only the pre-existing accepted `-webkit-box` finding).

**Section vertical padding drops to 24px each on tablet — but only once the session has ended.**
First pass applied this unconditionally (both sections, always) — corrected by the user: the base
32px (`--s2a-spacing-xl`) top/bottom is right in general; it only shrinks to 24px
(`--s2a-spacing-lg`) on tablet specifically when these carousel sections sit below `.sb-ended`'s
marquee (not below the live player). Reworked to use the same `.sb-ended ~ .sb-carousel-section--
also-live`/`--up-next` sibling-selector pattern already established for this file's other
ended-state-only overrides (background/`.sg-section-title` color), combined with the tablet media
query. Two adjacent sections' combined gap goes from 64px (32+32) to 48px (24+24) in that state
only; left padding untouched; the normal (non-ended) tablet padding is back to unchanged 32px.
`npx stylelint` clean (only the pre-existing accepted `-webkit-box` finding).

**Copy change: "Session ended." → "Session complete."** Updated `.sb-ended__eyebrow`'s text and
the region's `aria-label` (was `"Session ended"`, no period, now `"Session complete"`) in
`EndedState.js`, plus the corresponding assertions in `EndedState.test.js`/`BroadcastBody.test.js`.
Left the "Session ended image" config-row label/tests alone — that's an unrelated authoring-field
name, not user-facing marquee copy. 144/144 session-broadcast tests pass, `npm run lint` clean.

## MPC/YouTube bucket & group scheduling (2026-08-31)

**This reverses an earlier PRD decision.** `getBroadcastSchedule`'s original "commitment, not a
preference" design (Phase 3) existed specifically because the PRD said "no sessions should auto
transition a user without their action" — auto-switching was Out of Scope. The user explicitly
asked for TV-channel-style automatic advancement instead: "We will make significant updates to
they way we manage sessions in the broadcast page... we will now also handle 2 buckets within
the broadcast. 1 bucket will be for sessions with MPC videos and the other bucket will be for
the ones with youtube videos. Each bucket will now use grouping by start time." This is an
intentional, user-directed supersession, not an oversight.

**The model**: sessions split into two independent buckets by video-source field (`mpcId` →
`'mpc'`, `youTubeId` → `'youtube'`, `getSessionBucket()`), each internally grouped by identical
start time. Automatic advancement moves forward *within* a bucket only; only a manual click can
cross buckets. MPC's "on screen until" boundary is `startTime + videoDuration` (RF's "Video
Duration" custom attribute, format `"HH:MM:SS"` — the middle field can exceed 59 in real data,
e.g. `"00:60:00"` for a 60-minute session, so `parseVideoDurationMs` sums weighted parts rather
than validating a strict range; falls back to the authored `endTimeUtc`-derived duration if
missing/unparseable). YouTube's boundary stays `endTimeUtc`, unchanged from today.

**Explicit product rule, locked into `resolveBucketSchedule`**: once a session ends, automatic
advancement must never fall back to a still-live sibling in its *own* group — only the next group
(once its start has been reached or passed) or ended state. This was caught and corrected during
review of the initial design (an early draft conflated "any live group" scanning for both the
fresh-pick case and the post-ending-transition case, which would have let a same-group sibling
rescue an ended session).

**No explicit "pending next group" bookkeeping anywhere** — `resolveBucketSchedule` recomputes
"is there a live group right now" / "has the next group's start been reached" fresh on every call,
which self-heals from any starting point (including a `sessionStorage`-restored session from a
prior visit) and produces wait-then-transition behavior for free from the existing 15s ticker.

**Randomness lives in the effect, not the pure schedule function**: `getBroadcastSchedule` returns
`pendingCandidates` (an array, or `null`) instead of picking — `Math.random()` happens exactly
once, in `BroadcastApp.js`'s generalized auto-commit `useEffect`, which now covers both the very
first pick and every later in-bucket auto-transition (they're indistinguishable in shape: the
schedule proposed a session that isn't yet the committed one). Doing the pick inside the pure,
every-render-recomputed schedule function was considered and rejected — it would either re-roll on
every render before the commit effect flushes (visible flicker risk) or require a deterministic
hash-based pick (not actually random — every viewer would get the same member for a given group).

**Cross-refresh persistence**: the `?watch=` entry param is still stripped after one read, so a
hard refresh needs another mechanism — added `sessionStorage` helpers (`persistActiveSession`/
`getPersistedSessionId`, key `sb:active-session`) to `broadcast-url.js`, mirroring the existing
try/catch-around-sessionStorage precedent in `sessions-guide/store/index.js`'s `sg:last-view` (a
new named-helper abstraction, not a literal copy — that file inlines the calls). Seeded via
`getHistorySessionId() || getPersistedSessionId()`; unlike the `?watch=` param (which must resolve
to something genuinely live right now or be discarded as fresh explicit intent), a persisted/
history-restored id is allowed to resolve to a recently-ended, pending-transition session, and the
normal ended/waiting logic takes over exactly as if the page had never refreshed.

**Cancellation handling**: the committed session's bucket is resolved against the raw (pre-
eligibility) session list, keyed only on `mpcId`/`youTubeId` — a cancelled session typically flips
`isOnline`/`hasOnDemandFormat` (dropping it out of the eligible pool) without touching its
player-id fields, so it still gets the same in-bucket ended/next-group handling as a normal ending
instead of incorrectly falling through to a cross-bucket random pick.

**Also-Live/Up-Next carousels are unaffected** — confirmed with the user before implementing: they
stay cross-bucket (mixed MPC + YouTube), which is what actually lets a viewer manually cross
buckets by clicking a card. `getUpNextSessions` is untouched.

**`isSessionLiveNow`** replaces the old exported `getLiveSessions` as the one "is this session
live right now" check (watch-param validation, `alsoLive`, group resolution) — dispatches by
session shape (`hasOnDemandFormat` → never live, mirroring `deriveSessionState`'s own precedence;
`mrStreamId` → delegates to `deriveSessionState` so MobileRider keeps its existing poll-driven
liveness untouched; everything else → the bucket-aware start/end window). `deriveSessionState`/
`session-state.js` itself is not modified — same boundary this file already draws for
`isBroadcastEligible`/`hasPlayableVideoSource`.

**Design review**: drafted, then independently pressure-tested against the real code and several
concrete timelines (back-to-back groups, gapped groups, mid-day cancellation, manual cross-bucket
switch, stale-refresh restoration) before implementation — caught several real bugs before they
became test failures: MR sessions silently dropping out of `alsoLive`, `hasOnDemandFormat` bypass,
the cancellation-bucket-lookup issue above, and `NaN`-start-time sessions collapsing into one bogus
group (now filtered out before grouping, `Date.parse` used for the group key instead of raw string
equality).

**Files changed**: `utils/broadcast-schedule.js` (core rewrite — `getSessionBucket`,
`parseVideoDurationMs`, `isSessionLiveNow`, `resolveBucketSchedule` all new/exported;
`getLiveSessions` removed), `utils/broadcast-url.js` (new sessionStorage helpers),
`components/BroadcastApp.js` (seeded state, persistence effect, generalized auto-commit effect,
watch-param effect swapped to `isSessionLiveNow`), `utils/broadcast-debug.js` (debug table now
also lists `pendingCandidates`). Tests: `broadcast-schedule.test.js` rewritten with bucket-aware
fixture helpers (`mpcSession`/`ytSession`/`minutesToDuration`) and new coverage for every rule
above, including the same-group-sibling regression test; `BroadcastBody.test.js` updated for
sessionStorage seeding/precedence and bucket-isolation (the actual pick-and-commit can't be
exercised in this mocked string-render harness — `useEffect` is a no-op there — so those tests
stick to synchronously-observable terminal states; the effect-driven transition itself is covered
at the pure-function level and needs real-browser verification).

**Verification**: `npx wtr test/unit/c2/blocks/session-broadcast/**/*.test.js` — 115/115 passed.
Full `npm test` — 2196/2197 passed (the one failure, `toast.test.js`'s mount timeout, is the
already-known environment-flakiness case, confirmed unrelated by re-running it in isolation
clean). `npm run lint` clean. Manual/real-browser verification of the actual timed transitions
is still pending — the `chrome-devtools` MCP server was disconnected for this session
(`ENOENT: npx not found`); needs either that reconnected or a manual walkthrough on
`localhost:3868` with `?serverTime=<ms>` before this ships.

### Bug found via manual `?serverTime=` testing: committed-but-not-yet-started treated as ended

Real-browser testing with `not-tracked/session-catalog-response-with-video.json` (a locally
mocked-up back-to-back YouTube chain built for exactly this kind of manual verification — see
that file for the timeline) surfaced a bug: jumping `?serverTime=` to a point *before* a session
that had previously been committed (via `sessionStorage`/`history.state` from an earlier, later
`?serverTime=` test) rendered `EndedState` for a session that hadn't even started yet.

Root cause: `resolveBucketSchedule` only checked `isSessionLiveNow` to decide "still live" vs.
"treat as ended and look for the next group" — it had no way to distinguish a session that's
*already finished* from one that simply *hasn't started*, since both fail `isSessionLiveNow`
identically. In production this is unreachable (`nowMs` only moves forward, and a session only
ever becomes committed once it's confirmed live), but local testing with `?serverTime=` jumping
non-monotonically hits it easily. **Fix**: added an explicit `committedHasStarted` check
(`Date.parse(committedSession.startTimeUtc) <= nowMs`) — if the committed session hasn't started,
treat it exactly like "nothing committed in this bucket" (offer whatever's currently live as
`pendingCandidates`) rather than searching for a "next group" and surfacing a nonsensical ended
screen. Added two regression tests in `broadcast-schedule.test.js`.

### Second bug found the same way: single-hop "next group" lookup got stuck on stale groups

Same manual `?serverTime=` testing, a different edge: loading well into the back-to-back YouTube
chain (multiple groups past the previously-committed one) rendered `EndedState` for a session that
had ended over half an hour earlier ("A.COM Adobe Live Test Session"), instead of showing the
session actually live at that moment ("Transform Static Decks into Multimedia Experiences").

Root cause: `resolveBucketSchedule`'s post-ending branch looked up exactly one group ahead of the
committed session's own group (`groups.find((g) => g.startMs > committedStartMs)`) and, if that
one group had *also* already ended by `nowMs`, gave up and returned `endedSession` — it never
considered groups further out. This is reachable in production too, not just in testing: a
backgrounded or suspended tab that resumes after more than one group's worth of time has passed
would hit the exact same thing. **Fix**: changed the lookup from "the single next group" to
"whichever later group (`startMs` strictly greater than the committed session's own — same-group
siblings are still excluded, per the rule above) is actually live right now," walking forward
through every subsequent group instead of stopping at the first one. `!liveLaterGroup` now covers
both "waiting, nothing later has started yet" and "deep-stale resume, everything later has also
already ended" — both correctly render as ended state; the only case that changed is finding a
live group beyond the immediate next one. Added a regression test with three elapsed groups
between the committed session and the one actually live now.

### First-time-visitor-on-a-gap enhancement: synthesize an ended-state anchor

Follow-up product decision, not a bug: a genuine first-time visitor (no `?watch=`, no
`history.state`, no `sessionStorage` — nothing ever committed) landing on the page while nothing
is live in either bucket previously saw a bare page — just the Up Next carousel, no player, no
`EndedState`, no "nothing live" message either (that message only shows when Up Next is *also*
empty). `EndedState` only ever rendered for a session that had actually been watched and then
ended.

**Decision**: when `resolveBucketSchedule`'s bootstrap ("nothing committed in this bucket") branch
finds nothing currently live, and there genuinely was never a prior commitment (as opposed to the
backward-time-travel "committed but hasn't started yet" case above, which already has a real,
later commitment to resume), it now looks for the most recently aired group in that bucket and
returns one of its members as `endedSession`. Any member works as the anchor — group-transition
lookups only key off the picked session's own start time, so this reuses the *exact same*
walk-forward-to-next-group logic as a real commitment, with no duplicated logic. At the top level,
`getBroadcastSchedule` combines both buckets' synthesized picks the same way it already combines
`pendingCandidates` — preferring whichever bucket's last group started more recently (likelier to
have its own next group coming up sooner) — and only proceeds to this fallback when neither bucket
has anything genuinely live right now.

The synthesized pick still has to become a *real* commitment for the ordinary auto-transition
logic to keep working correctly afterward (so it doesn't just get re-synthesized identically every
render, or worse, mismatch once time passes) — `BroadcastApp.js`'s existing "resolve the schedule's
proposal into `manualSessionId`" `useEffect` (previously only handling `pendingCandidates` and
`activeSession` mismatches) now also commits an `endedSession` mismatch the same way. Once
committed, `sessionStorage` persistence and the walk-forward next-group logic both apply exactly
as if the viewer really had been watching it.

One deliberate boundary: if nothing has ever aired at all yet in a bucket (e.g. before the very
first session of the day/event), there's no group to synthesize from, and the bare "Up Next only"
page is still the correct, unavoidable state — there's genuinely nothing to call "ended."

Tests: `broadcast-schedule.test.js` — synthesis at both the `resolveBucketSchedule` level (surfaces
the last aired group; does nothing when nothing has aired yet; does not fire for the not-yet-
started backward-time-travel case) and the `getBroadcastSchedule` level (cross-bucket "most
recent" preference; nothing-ever-aired no-op). `BroadcastBody.test.js` — this specific synthesis is
observable in the mocked harness even without the commit effect (it happens synchronously inside
`resolveBucketSchedule`), so there's a direct test confirming a first-time visitor (no history,
no sessionStorage) sees `EndedState` for the last-aired session. Full suite: 2207/2207 passed,
`npm run lint` clean.

### Edge-case audit, two fixes applied

Asked to think through remaining gaps after the bucket/group work above. Four came up; two were
fixed, one was explained (see the "End-of-event redirect" note further down), one was explicitly
dismissed by the user (a session authored with *both* `mpcId` and `youTubeId` silently defaults to
the MPC bucket per `getSessionBucket`'s precedence — acceptable, since only one should ever be set
per session in the first place).

**Fixed — MobileRider partial support.** MobileRider real playback isn't shipping for MAX26 (per
`PLAN.md`'s own "Explicitly out of scope"), but it was added as an optional future feature, not
something to actively break. Before this fix, `getBroadcastSchedule`'s composition only ever
routed a commitment through `resolveBucketSchedule` when `committedBucket` was `'mpc'` or
`'youtube'` — a bucket-less commitment (MR today; any future player type without a bucket/group
model) fell through to the "nothing committed anywhere" branch and got silently **replaced** by an
MPC/YouTube bootstrap pick, even while still live. Reachable today via a manual switch or a
`?watch=` link to a live MR session (MR sessions do validate as live — `isSessionLiveNow`'s
`mrStreamId` branch already delegates to `deriveSessionState`). **Fix**: added a branch in
`getBroadcastSchedule` — a bucket-less commitment that's still live is kept as `activeSession`
directly (no group/next-group logic applies, correctly, since there's no bucket to walk forward
within); once it stops being live, there's nothing to walk forward to either, so it falls through
to the ordinary bootstrap exactly as if nothing had been committed. New tests cover: still-live MR
commitment kept active despite a live YouTube session existing; falls through correctly once
ended.

**Fixed — stale `?watch=` link doesn't clear `sessionStorage`.** `persistActiveSession()` only
ever writes on a truthy id, so `setManualSessionId(null)` (the existing response to an invalid
watch param) never removed an *already-persisted* value. In the narrow case where nothing is live
and nothing has ever aired in either bucket yet, the old id would sit in `sessionStorage`
untouched, and a refresh right after landing on the dead link — before anything new got a chance
to commit — could resurrect the session the link was meant to invalidate. **Fix**: new
`clearPersistedSession()` in `broadcast-url.js` (a real `sessionStorage.removeItem`, not
`persistActiveSession(null)` — that would have stored the *string* `"null"`), called from the
watch-param effect's invalid-link branch. Added round-trip/overwrite/clear tests for the
persistence trio in `broadcast-url.test.js` (previously untested).

**Explained, not changed — end-of-event redirect gap.** `BroadcastApp.js`'s redirect-to-on-demand
effect guards on `schedule.activeSession || schedule.alsoLive.length || schedule.upNext.length`
and doesn't know about the new synthesized `endedSession`. Low practical risk — `getUpNextSessions`
has no time-window cutoff (only the 15-item cap), so `upNext` being genuinely empty mid-event is
unlikely — but structurally, if it ever were, the redirect could fire in the same tick a
legitimately-showing `EndedState` appeared. Left as-is per discussion; worth a one-line fix
(`&& !schedule.endedSession`) if it ever proves to matter in practice.

Full suite after both fixes: 2212/2212 passed (2 unrelated, already-known-flaky failures recur
independently across runs — `toast.test.js`'s mount timeout and `broadcast-url.test.js`'s
`history.length`-based test, both confirmed to pass cleanly in isolation; the flakiness is
environment/global-state contention under a full run, not a regression). `npm run lint` clean.

### Third fix, found via real manual testing: deep-stale resume didn't catch up either

Manually testing `1794350000000` against a real prior commitment (not a first-time visitor)
surfaced an inconsistency between two code paths that are conceptually the same situation.
`resolveBucketSchedule`'s "committed exists, walk forward" branch, when no later group was
currently live, always fell back to `endedSession: committedSession` — the *original* committed
session — regardless of how many later groups had already both started and ended in the meantime.
That's correct for "just ended, waiting for the very next group," but wrong for a genuine
deep-stale resume: it would perpetually re-show a stale anchor no matter how far time moved on,
while the sibling "first-time visitor" bootstrap path (added earlier this session) *does* catch up
to the most recently aired group in the same situation. **Fix**: before falling back to the
original committed session, check whether any later group has already started (`startMs <= nowMs`,
regardless of whether it's still live); if so, use the most recent such group's session as the
ended anchor instead — unifying with the bootstrap path's behavior. Verified against the real
catalog data (not just synthetic fixtures) via a standalone script importing the actual updated
`resolveBucketSchedule` — confirmed `endedSession` correctly resolves to "AI-Powered Tools to
Comprehend, Collaborate, and Create" instead of the stale "Craft in the Age of AI." New regression
test added; 133/133 session-broadcast tests pass, lint clean.

## Desktop visual redesign — players (2026-09-01)

User: "We are in a good place to start with desktop. FYI we will have 2 desktop 1280px-1440px
and the xl desktop is going to be +1440px. Lets start with the players." Two frames provided
from "Session Broadcast VizD R1 8.17.26" (`wCEc6vE23plJU9a3njdtG1`): the overall desktop page
(`24:22726`) and the session-info-panel-plus-player combo specifically (`24:22744`, containing
`HP_Player` at `24:22745` and the info panel wrapper at `24:22746`).

**Player**: Figma shows the player at `1192px` wide, `24px`-rounded corners — a *contained*
treatment, not this block's tablet-only full-bleed/square-corner one. Tracing the existing
`@media (min-width: 1024px)` override in `session-broadcast.css` (added in Phase 6 for tablet)
showed it had no upper bound, so it was also suppressing the foundation's own default player
styling at desktop widths. That foundation default — `c2-global.css`'s `.milo-video` rule and
`event-youtube.css`'s `.youtube-video-container` rule, both keyed off the same responsive
`--s2a-layout-rich-media-content-measure-wide` token (`tokens.css`: 848px at 1024-1279px, 1192px
at 1280-1440px, 1480px at 1441px+) — already produces exactly the Figma-specified 1192px/24px
treatment at the desktop tier, and will automatically grow to 1480px at xl-desktop too, with zero
new code. **Fix**: bounded the existing override to `(min-width: 1024px) and (max-width:
1279px)` (tablet only) instead of adding a new desktop-specific rule — letting the pre-existing
foundation cascade handle both new tiers for free.

**Info panel**: Figma's `24:22746` shows the panel sitting flush under the player with only its
bottom corners rounded (`32px`) — paired with the player's now-restored all-4-corner rounding,
the two read as one merged card. The existing tablet rule (`@media (min-width: 768px)`,
unbounded) sets `.sb-info`'s `border-radius: 0`; added a `.sb-info { border-radius: 0 0 32px
32px; }` inside the existing `@media (min-width: 1280px)` block (which already caps `.sb-info`/
`.sb-carousel-section` at `1192px`) to re-round from desktop onward.

**Known deliberate gap**: `.sb-info`/`.sb-carousel-section`'s `max-width: 1192px` stays flat even
at 1441px+, while the player above grows to 1480px there via the foundation token — no
xl-desktop frame has been reviewed for the info panel yet, so this mismatch is left as-is
pending that frame, per this file's own convention of not speculatively extending styling beyond
a reviewed spec.

Verified: `npx stylelint` on the file clean (only the pre-existing `-webkit-box` finding);
144/144 session-broadcast unit tests pass unchanged (no behavior touched, CSS-only).

### Also Live / Upcoming sections go dark at desktop, unconditionally (2026-09-01)

User: "The new designs has a black background all across the broadcast page," pointing at the
live-state desktop frame (node `24:22727`). Mobile/tablet's Also Live/Upcoming sections are
light (light-gray `#f8f8f8`/white, per the mobile Figma frames Phase 6 was built from) — this
frame shows both staying dark at desktop instead, matching the player/info panel above: Also
Live's section background is a dark gray (Figma's own "maxcolor/darkgrey" variable, `#262626`,
no equivalent `--s2a-*` scale token — closest, gray-800, is `#292929`), Upcoming's is black
(`var(--s2a-color-gray-1000, #000)`). The cards inside stay exactly as they were (still light,
per the screenshot) — only the section background and the "More live sessions"/"Upcoming
sessions" title color (flipped to `var(--s2a-color-content-inverse, #fff)`, otherwise illegible
dark-on-dark) change.

Added as a new, unconditional `@media (min-width: 1280px)` rule — deliberately NOT merged into
the existing `.sb-ended ~ .sb-carousel-section--*` sibling rules (which handle the ended-state
photo-bleed transparency), since this frame shows State 1 (live), not ended. The two don't
conflict: the sibling selectors are more specific and still win when a session has ended at
desktop width, keeping the transparent-photo-bleed treatment intact there.

Left unbounded above 1280px (applies to xl-desktop too) — no xl-desktop frame contradicts it,
and a black page background reverting to light at a wider breakpoint has no support in anything
reviewed so far; flagged as an assumption, not silently guessed.

Verified: lint clean, 144/144 tests pass unchanged (CSS-only, no behavior touched).

### Correction: Also Live's dark background is unconditional, not desktop-only (2026-09-01)

User: "'Also live' background theme in the broadcast page has changed to #262626," pointing at
node `24:20683` ("Session Broadcast/Also Live Section") — a frame with no breakpoint constraint,
using the same fixed 311px card width this block already uses unconditionally at every
breakpoint. That, plus the `.sb-app` base rule already carrying a permanent black background
(added directly to the file, not by this session — the whole page's theme has moved to
always-dark), means Also Live's `#262626` background is NOT desktop-only the way the entry
above assumed — it's the section's new base color at every width, superseding the original
mobile light-gray it was built from (node 9931:12217).

**Moved the `background: #262626`/white-title rule out of the `@media (min-width: 1280px)`
block and into `.sb-carousel-section--also-live`'s own base rule** (removing it from the
desktop block, which now only handles Upcoming — no frame has shown Upcoming going dark below
1280px, so that half stays desktop-scoped as originally implemented).

**User's live follow-up, same message**: "That applies when the player is up. on session ended
background is transparent again for that section" — confirming the *existing*
`.sb-ended ~ .sb-carousel-section--also-live { background: transparent; }` sibling rule (added
in Phase 6, for the ended-state photo bleed) is exactly right and needs no change: it's a
higher-specificity selector than the new plain base rule, so it already wins once `.sb-ended` is
present, regardless of viewport width. Verified by re-reading the cascade, not by guessing.

Verified: lint clean, 144/144 tests pass unchanged (CSS-only, no behavior touched).

### Also Live "Watch now" button reverted to #292929 on Favorite click (2026-09-01)

User: updated `.sb-carousel-section--also-live .sg-live-card__btn--watch` to `background: #000`,
but clicking the adjacent Favorite button made it flash back to `#292929` — traced to
sessions-guide.css's own unconditional (no breakpoint gate) rule,
`.sg-live-card:is(:hover, :focus-within) .sg-live-card__btn--watch { background: #292929; }`.
Clicking Favorite gives it focus, which satisfies `:focus-within` on the whole `.sg-live-card`
ancestor, not just literal mouse-hover on Watch itself. That selector has 3 selector segments
vs. the broadcast override's 2, so it out-specifies the plain black rule the moment focus-within
fires, regardless of viewport width.

**Fix**: added a matching `.sb-carousel-section--also-live .sg-live-card:is(:hover,
:focus-within) .sg-live-card__btn--watch { background: #000; }` right after the plain rule, at
the same specificity as sessions-guide's version. Placed *before* the existing `@media
(min-width: 1024px)` block's own hover rule (which deliberately sets `#292929` for its own,
different desktop hover-card treatment) — same specificity there too, so source order decides
and the desktop block (later in the file) still wins unchanged above 1024px. Below 1024px, only
the new rule applies, so Watch now stays black through hover and Favorite-click alike.

**Left untouched**: desktop's (1024px+) own resting-state Watch button is already `#292929` (a
pre-existing, separate rule, not part of this fix) — not changed here since the user's report
and fix were scoped to the black-background behavior below that breakpoint; flag if desktop
should also go black at rest.

Verified: lint clean, 144/144 tests pass unchanged (CSS-only, no behavior touched).

### Also Live / Up Next card gap: 16px, not sessions-guide's 8px default (2026-09-01)

User: "The gap for 'also live' and 'upcoming' cards within session broadcast mobile and tablet
should be 16px in contrast with the current 8px we use in the session guide." sessions-guide.css's
own `.sg-carousel__cards` base rule (unconditional, not breakpoint-gated) sets `gap:
var(--s2a-spacing-xs)` (8px). Also Live already had its own override to `var(--s2a-spacing-md)`
(16px) — added earlier in Phase 6, unconditional, so it was already correct at every breakpoint.
Up Next had no equivalent override at all, so it was silently inheriting sessions-guide's 8px.

**Fix**: added `.sb-carousel-section--up-next .sg-carousel__cards { gap: var(--s2a-spacing-md,
16px); }`, mirroring Also Live's existing rule exactly (same token, same unconditional scope —
not media-gated, since Also Live's own working rule isn't either and the user's ask covers both
mobile and tablet with no indication desktop should differ).

Verified: lint clean, 144/144 tests pass unchanged (CSS-only, no behavior touched).

### Tablet info panel updated to match desktop's merged-card treatment (2026-09-01)

User: "There has been an update to the styling of session info panel when in tablet mode," per
node `24:20749` ("Session Broadcast Page"). This frame turned out to be visually identical to
the desktop info panel (node `24:22746`) implemented earlier this session — same bottom-only
32px rounding, same 24px/24px/-0.48px title treatment — just now confirmed to extend down into
tablet (768-1279px) too, not desktop-only as originally scoped.

Two changes, both to the existing `@media (min-width: 768px)` tablet block for `.sb-info`:
- **Corner rounding**: was `border-radius: 0` (square, per the original tablet frame); changed
  to `0 0 var(--s2a-border-radius-lg, 32px) var(--s2a-border-radius-lg, 32px)`, matching
  desktop's merged-card look under the player. Removed the now-redundant duplicate rule from
  the desktop-only `@media (min-width: 1280px)` block below, since this is unbounded from 768px
  and already covers desktop.
- **Title size**: `.sb-info__title` had never actually picked up 24px at any breakpoint —
  desktop's own pass (node `24:22746`) only touched `.sb-info`'s max-width/rounding, not the
  title text itself, so it was still rendering at the base 18px (`--s2a-font-size-lg`,
  mobile's own spec) everywhere. Added `font-size: var(--s2a-font-size-2xl, 24px); line-height:
  var(--s2a-font-line-height-md, 24px); letter-spacing: var(--s2a-font-letter-spacing-4xl,
  -0.48px);` to the tablet block's existing title rule. Deliberately the fixed-value scale
  tokens, not the semantic `--s2a-typography-*-heading-5` aliases — those resolve to 20px across
  most of this block's own 768-1279px range (only hitting 24px at 1280px+ per tokens.css's own
  tiering), the same semantic-alias trap documented multiple times earlier in this file. Left
  unbounded from 768px, fixing desktop's title size as a side effect (it needed the identical
  value and had no override of its own yet).

Verified: lint clean, 144/144 tests pass unchanged (CSS-only, no behavior touched).

### Correction: info panel corners are square again, not rounded (2026-09-01)

User: "Session info panel should have square corners not rounded" — reverses the merged-card
bottom-32px rounding added just above (base rule's original 16px mobile rounding included).
Given no breakpoint qualifier, treated as universal: `.sb-info`'s base `border-radius` changed
from `0 0 var(--s2a-border-radius-md, 16px) var(--s2a-border-radius-md, 16px)` to `0`; removed
the now-redundant tablet-block override entirely (it only set the 32px rounding, nothing else
unique to it). Player above keeps its own independent rounding (24px, all corners) — unaffected,
that's a separate element.

Verified: lint clean, 144/144 tests pass unchanged (CSS-only, no behavior touched).

### Info panel loses its background at tablet only (2026-09-01)

User: "sb-info should not have background color at tablet breakpoint" — unlike the square-
corners fix just above (left unqualified, applied universally), this one names "tablet"
specifically, so scoped to exactly this file's own tablet range, `(min-width: 768px) and
(max-width: 1279px)`, as its own new block — mobile and desktop both keep the dark background
from `.sb-info`'s base rule. At tablet the panel now sits directly on `.sb-app`'s black
background instead of painting its own, reading as part of the page rather than a distinct
card. Box-shadow was left untouched — only background was named.

Verified: lint clean, 144/144 tests pass unchanged (CSS-only, no behavior touched).

### Correction: title is 20px at tablet, 24px stays desktop-only (2026-09-01)

User: "At tablet endpoint sb-info__title should have font size 20px not 24px like now." Both
reviewed Figma frames (24:20749 tablet, 24:22746 desktop) exported the same literal 24px
fallback, which is why the earlier pass pinned 24px unbounded from 768px — same category of
mistake as the ended-state eyebrow/title fixes: a raw Figma-export fallback isn't ground truth
for a given breakpoint, only a hypothesis to verify. 20px/20px is this codebase's own
1024-1279px tier value for the semantic heading-5 alias (`--s2a-font-size-xl`/
`--s2a-font-line-height-sm`), pinned as fixed tokens across the whole 768-1279px tablet range —
same "one value for the whole tablet bucket" precedent used elsewhere in this file.

Split the title's font-size/line-height out of the unbounded 768px+ block into two
breakpoint-scoped rules: 20px/20px added to the existing tablet-only (768-1279px) block (next to
the no-background rule above), 24px/24px added to the existing desktop `@media (min-width:
1280px)` block. Letter-spacing (`-0.48px`, identical at both breakpoints per both frames) stays
on the original unbounded 768px+ title rule, now holding only that one property plus the
existing ellipsis/truncation layout.

Verified: lint clean, 144/144 tests pass unchanged (CSS-only, no behavior touched).

### Also Live "Watch now" is black at desktop too, resolving an earlier flagged gap (2026-09-01)

User: "sg-live-card__btn sg-live-card__btn--watch in the broadcast page should always be black
instead of #292929" — resolves the gap explicitly flagged in the earlier hover/focus-within fix
("desktop's own resting-state Watch button is already #292929 ... flag if desktop should also
go black at rest"). Changed the desktop (1024px+) block's `.sg-live-card__btn--watch` rule
(covering both its resting and hover/focus-within states, comma-listed together) from `#292929`
to `#000`, matching the plain/hover rules already black below that breakpoint. Favorite's own
`#292929` border/color (a separate button, not named in this request) was left untouched.

Verified: lint clean, 144/144 tests pass unchanged (CSS-only, no behavior touched).

### Also Live cards: audited every sessions-guide hover effect across the tablet range (2026-09-01)

User: "sg-live-card inside broadcast should not inherit any of the hover effects it uses in
the session guide during the tablet breakpoints." Rather than guessing at one property, read
every `.sg-live-card:is(:hover, :focus-within)` rule in sessions-guide.css (base/unconditional,
768px+, and the "Intermediate Tablet" 1024-1279px block) and checked each against what
session-broadcast.css already resets:

- Card background/border-color hover fill (`#fff→#fff` at rest, `#000` at 1024-1279): already
  neutralized by the existing unbounded `@media (min-width: 1024px)` reset. At 768-1023, sessions-
  guide's own resting and hover values are identical anyway (`#fff` both ways, `border: none`) —
  no leak there to begin with.
- Track/time color flip to white at 1024-1279: already neutralized (existing rule forces
  `var(--s2a-color-content-default)` on both states).
- Category badge icon color flip: already neutralized (`color: inherit`).
- Description color flip: moot — `.sg-live-card__desc` is hidden entirely under broadcast.
- Watch/Favorite button hover recolor: already neutralized (Watch by the all-widths black fix a
  few requests ago; Favorite by the existing unbounded 1024px+ block). Neither has a
  hover-specific rule in sessions-guide below 1024px, so no gap there either.
- **Gap found**: `.sg-live-card__title` hover color (flips to white at 1024-1279px, node
  `sessions-guide.css:1941`) had no counterpart in session-broadcast.css at all — this one
  actually leaked through. Fixed by adding it to the same existing unbounded 1024px+ reset
  block, forcing `var(--s2a-color-content-default)` on hover, next to the track/time rules it
  mirrors.

**Side effect, flagged not silently fixed**: this same title-hover-color rule also exists in
sessions-guide.css's desktop (1280px+) block (`sessions-guide.css:2411`) and is fixed too, since
the reset block is unbounded from 1024px — the user only asked about tablet, so this wasn't
independently verified against a desktop frame, just noted as a natural consequence of using
the same shared block.

Verified: lint clean, 144/144 tests pass unchanged (CSS-only, no behavior touched).

### Correction: badge icon color fix used the wrong value (`inherit`) (2026-09-01)

User: "the badge is still changing to white on hover" — the fix in the audit above
(`.sg-category-badge__icon-color { color: inherit; }`) was itself wrong, not just missing.
`inherit` takes the *computed* color from the immediate parent (`.sg-category-badge`, which
sets no `color` of its own), so it climbs further up to whatever ambient text color the card
resolves to — not the badge's own per-track color. `CategoryBadge.js` sets `--sg-badge-icon-color`
inline per track, and sessions-guide.css's own base rule reads it via `color: var(--sg-badge-
icon-color, currentcolor)`. Fixed by restoring that exact fallback chain instead of `inherit`,
so the icon keeps its actual per-track color through hover rather than drifting to an unrelated
ambient value.

Verified: lint clean, 144/144 tests pass unchanged (CSS-only, no behavior touched).

### Badge label was still turning white — traced to the row, not the label itself (2026-09-01)

User: "sg-category-badge__label still changing to white on hover on tablet." Unlike the icon
(which reads its own `--sg-badge-icon-color` custom property), `.sg-category-badge__label`'s
CSS is just `color: currentcolor` — it has no color of its own, so it inherits whatever its
ancestor resolves to. That ancestor is `.sg-live-card__track-row` (CategoryBadge's actual parent
per `LiveCard.js`, not `.sg-live-card__track`, a sibling class), and sessions-guide.css's
"Intermediate Tablet" tier explicitly flips `.sg-live-card__track-row`/`__track-extra` to white
on hover — a rule this file had never reset at all, so the label kept picking it up even after
the icon's own color was fixed last request.

Added a matching reset for `.sg-live-card__track-row`/`__track-extra`'s hover color, forcing
`var(--s2a-color-content-default)`, same pattern as the existing `__track`/`__time`/`__title`
resets right next to it.

Verified: lint clean, 144/144 tests pass unchanged (CSS-only, no behavior touched).

### No-background extended from tablet to desktop too (2026-09-01)

User: ".sb-info should also not have background color on desktop" — widens the earlier
tablet-only (768-1279px) transparent-background fix. Split it out of the bounded 768-1279px
block into its own unbounded `@media (min-width: 768px)` rule (mobile below 768px still keeps
the dark background from the base rule), since that bounded block's *other* rule — the
tablet-only 20px title size — must stay capped at 1279px and not also leak into desktop.

Verified: lint clean, 144/144 tests pass unchanged (CSS-only, no behavior touched).

### Also Live: full-bleed section + desktop "long card" (Figma node 24:22750) (2026-09-01)

User: "On desktop sb-carousel-section sb-carousel-section--also-live container and background
should extend all the way to the edge of the page, while its content should still align 1192
used for content. We should also start using the long cards use for desktop."

**Container split**: the shared `@media (min-width: 1280px) { .sb-info, .sb-carousel-section {
max-width: 1192px; margin: 0 auto; } }` rule capped the section's own element directly (its
outer wrapper carries both `.sb-carousel-section` and `.sb-carousel-section--also-live` per
`AlsoLiveCarousel.js`), which is what was constraining the #262626 background along with the
content. Excluded Also Live via `:not(.sb-carousel-section--also-live)` on that rule, then
capped `.sg-carousel` (the header+cards wrapper *inside* the section, per `Carousel.js`) at
1192px/auto-margin instead — background now spans edge to edge, content stays aligned with
everything else.

**Long card**: read sessions-guide.css's own native 1280px+ "Desktop" block for `.sg-live-card`
and found it already very close to Figma's "Events calendar card - large - v3" spec (560x316
image and 1104px card max-width match exactly) — it had been getting suppressed entirely by
this file's own unconditional base rules (311px width, aspect-ratio image, top-positioned
progress bar, 16px title) and the 1024px+ reset block, both more specific than sessions-guide's
bare selectors. Restructured in two parts:
- Split the old unbounded `@media (min-width: 1024px)` reset block in two: the purely
  *structural* resets (flex-direction, image/body sizing, meta gaps, hiding the description)
  are now bounded to 1024-1279px only, so they stop suppressing the native desktop shape;
  the *color/hover-state* corrections (track/time/title/track-row/badge-icon/watch/favorite —
  all the bug fixes from the last several requests) stay unbounded from 1024px, since
  sessions-guide's own desktop block has the identical white-on-hover behavior for the same
  properties and needs the same fix.
- Added a new `@media (min-width: 1280px)` block providing the few corrections Figma's card
  needs beyond what sessions-guide's native rule already gives for free: `border`/`border-radius`
  (32px, no border — native gives a 4px white border/20px radius), `width`/`max-width` (this
  file's own unconditional 311px override otherwise wins even at 1280px+), the image's fixed
  560x316 (this file's own unconditional aspect-ratio box otherwise wins), progress-row back to
  the image's bottom edge (this file's own unconditional rule moves it to the top, a narrow-card-
  only design choice), title size (32px, `--s2a-font-size-3xl`, matching sessions-guide's own
  native value — this file's own unconditional 16px override otherwise wins), showing the
  description (hidden by the narrow card's own base rule), and hiding the narrow card's trailing
  `__actions-time` label (not part of this design). Watch button already renders its play icon
  via `LiveCard.js` — no JS changes needed.

**Approximated, not independently re-verified against a zoomed screenshot**: button padding/
height (`24px`/`40px`, read from the literal Figma export and sessions-guide's own matching
native values) and the meta row's flex-start/12px-gap layout (matches sessions-guide's native
rule, closer to Figma's packed icon+label+divider+time look than this file's own
justify-content:space-between). Also left untouched: the exact card-to-card carousel gap
(currently 16px from an earlier request, vs. Figma's 55px) — not part of what was asked this
time; flag if it looks off once viewed.

Verified: lint clean, 144/144 tests pass unchanged (CSS-only, no behavior touched).

### Carousel nav: 24px clearance to cards, top aligned with the section title (2026-09-01)

User: "in desktop between sg-carousel__nav and the cards we should have 24px of spacing. Also
the top sg-carousel__nav should match the top of sg-section-title." sessions-guide.css's own
1280px+ rule takes the nav out of flow (`position: absolute; top: 0; right: 0;`, anchored to
`.sg-carousel`) so it sits beside the title instead of beside the cards — but nothing sizes
`.sg-carousel__header` to actually match the nav's own fixed 40px button height
(`.sg-carousel__arrow`), so `top: 0` only lines up with the title's own (much shorter) line box,
and the gap to the cards below is whatever's left over from the title's height alone, not a
deliberate value.

Fixed by giving `.sg-carousel__header` a `min-height: 40px` (matching the nav buttons exactly)
plus `margin-bottom: var(--s2a-spacing-lg, 24px)`, applied to both Also Live and Up Next (nav
positioning is shared/generic, not specific to Also Live's long-card work). With the header now
a real 40px box, its top genuinely aligns with the nav's own 40px `top: 0` (re-asserted
explicitly rather than relying on it staying correct in sessions-guide.css unreviewed), and the
24px clearance to the cards becomes a plain margin rather than depending on which title token
happens to be in effect.

Verified: lint clean, 144/144 tests pass unchanged (CSS-only, no behavior touched).

### Regression from the long-card restructuring: card hover-fill fix lost at desktop (2026-09-01)

User: "title, category badge and 'watch now' button are not very legible on hover currently on
desktop." Self-caused regression from the long-card restructuring a few requests ago: when the
old unbounded `@media (min-width: 1024px)` reset block was split into a *structural* half
(bounded to 1024-1279px) and a *color/hover* half (kept unbounded), the card's own hover
background/border-color fix (`.sg-live-card:is(:hover, :focus-within) { background: #fff;
border-color: transparent; }`) was miscategorized into the bounded structural half — it reads
like a structural rule but is actually the root fix everything else in the color/hover half
depends on. Left bounded, it stopped applying at 1280px+, so sessions-guide's native desktop
rule (`background: #000`) took over uncountered: the title/track/badge/time colors (all pinned
dark, via `var(--s2a-color-content-default)`) were then landing on a black hover background —
illegible, exactly as reported. Watch now's own black button was technically still legible on
its own terms, but read as blending into the now-black card around it.

Moved the rule into the unbounded color/hover block, at the top with a comment flagging it as
the dependency the rest of the block relies on, so this doesn't get miscategorized again.

Verified: lint clean, 144/144 tests pass unchanged (CSS-only, no behavior touched).

### Correction: desktop hover should match sessions-guide natively, not fight it (2026-09-01)

User: "Not fixed. upon hover we should display the card background as black like we do on
session guide and the content inside the cards should changes to white." This reverses the
previous fix's premise — the goal isn't to keep the card light and force text dark on hover at
desktop, it's to let sessions-guide's own native "card fill goes black, content turns white"
long-card hover treatment through *unfought*, matching the rest of that card's borrowed styling.

Two changes:
- Reverted the previous entry's "unbounding" of the color/hover-state neutralization block back
  to tablet-only (`min-width: 1024px` **and** `max-width: 1279px`) — at 1280px+, sessions-guide's
  native hover rules (background→black, title/track/time/badge→white) now apply cleanly. The
  plain/resting Watch-is-black rule is untouched (a separate, always-unconditional rule earlier
  in the file) — that one's about the resting button, not the hover fill.
- Found a second, previously-untouched offender: a standalone, unconditional (no media query at
  all) rule forcing Watch's *hover* state to stay black at every width — added several requests
  ago to counter sessions-guide's own hover override, before the desktop long card existed. Left
  as-is, it would have made the button invisible against the now-black hover fill at desktop.
  Bounded it to `max-width: 1279px` so 1280px+ falls through to sessions-guide's own native hover
  inversion (white background, dark text) instead — same treatment as the rest of the card's
  content, staying visible against the black fill.

Verified: lint clean, 144/144 tests pass unchanged (CSS-only, no behavior touched).

### Also Live: peeking card now bleeds to the true viewport edge, not .sg-carousel's edge (2026-09-01)

User: "The peeking cards is currently being cut off my margin or something else. The peeking
cards should show completely all the way to the right edge of the screen." Root cause: capping
`.sg-carousel` at 1192px (the earlier full-bleed-background fix) also caps the cards row inside
it — the peek could only reach *that* box's edge, not the actual screen edge.
`.sg-carousel__track`'s own sessions-guide.css bleed (`margin-right: -20px`) is a small fixed
value sized for a different, non-full-bleed section, and `.sg-carousel__cards`'s own 16px
`padding-right` ate further into whatever bleed there was.

Two changes, both in the existing desktop long-card block:
- Cleared `.sb-carousel-section--also-live`'s own left padding at 1280px+ (kept top/bottom).
  The base rule's 32px-left/0-right padding is a mobile/tablet peek-to-edge convention that,
  left in place, would offset `.sg-carousel`'s `margin: 0 auto` centering asymmetrically —
  clearing it lets `.sg-carousel` center symmetrically in the *full* viewport width, which the
  next fix depends on being true.
- With that guaranteed, the exact gap from `.sg-carousel`'s right edge to the true viewport edge
  is `(100vw - 1192px) / 2` — pulled `.sg-carousel__track` out by exactly that via a calculated
  negative `margin-right`, and zeroed `.sg-carousel__cards`'s own `padding-right` so nothing
  eats back into the bleed. The peek now reaches the actual screen edge.

Verified: lint clean, 144/144 tests pass unchanged (CSS-only, no behavior touched).

### Also Live card-to-card gap: 24px at desktop (2026-09-01)

User: "at desktop the gap between cards in .sb-carousel-section--also-live .sg-carousel__cards
should be 24px." The base rule (unconditional, set earlier this session) uses `var(--s2a-
spacing-md)` (16px), correct for mobile/tablet. Added `gap: var(--s2a-spacing-lg, 24px)` to the
existing desktop long-card block, alongside the bleed-to-edge fix already there.

Verified: lint clean, 144/144 tests pass unchanged (CSS-only, no behavior touched).

### Upcoming section: desktop card sizing + full-bleed container (Figma node 24:22751) (2026-09-01)

User: "Lets move forward with upcoming session desktop now... spacing is very similar between
nav and cards ... to what we already did with 'also live' section. Let keep title maximum to
2 lines."

The nav/header-to-cards spacing fix from the earlier Also Live work was already shared between
both sections (`.sb-carousel-section--also-live .sg-carousel__header, .sb-carousel-section--up-
next .sg-carousel__header { min-height: 40px; margin-bottom: 24px; }`), so nothing new was
needed there — confirmed it already covers Up Next. New work, extending the existing desktop
dark-background block for Up Next (added a few requests ago):

- **Full-bleed container, matching Also Live**: the Figma frame shows the section's black
  background spanning the true viewport edge to edge, not boxed at 1192px — but Up Next wasn't
  excluded from the shared `.sb-info, .sb-carousel-section { max-width: 1192px; margin: 0 auto; }`
  rule the way Also Live was, so its background was rendering as a centered rectangle with
  visible gutters. Excluded it too (`:not(.sb-carousel-section--up-next)`), then capped
  `.sg-carousel` at 1192px/auto-margin instead, same split as Also Live. This is scope beyond
  the literal ask (only nav spacing + title clamp were named) but directly matches what the
  Figma frame's own screenshot shows, and mirrors an already-established pattern — flagging it
  rather than silently doing it.
- **Asymmetric vertical padding**: 32px top / 64px bottom (was symmetric 32px/32px below this
  width) — read directly from the frame's `pt-32/pb-64` values.
- **Peek bleeds to the true viewport edge**: same fix as Also Live's own — with `.sg-carousel`
  confirmed centered in the (now unpadded) full viewport, pulled `.sg-carousel__track` out by
  `(100vw - 1192px) / 2` and zeroed `.sg-carousel__cards`'s padding-right.
- **Card width/padding**: grew from 268px/16px (mobile/tablet) to a fixed 375px/24px, matching
  the frame's literal 327px inner-column width plus 24px padding each side (border-box).
- **Title 2-line clamp**: already sessions-guide.css's own base-rule default
  (`-webkit-line-clamp: 2`) and nothing removes it, so nothing was actually broken — asserted it
  explicitly anyway per the follow-up, so a future width/layout change can't silently drop it.
- **Card-to-card gap**: already 16px (set in an earlier request) and matches this frame's own
  `gap-[16px]` exactly at desktop too — no change needed, unlike Also Live which needed a
  different (24px) desktop-specific value.

Verified: lint clean, 144/144 tests pass unchanged (CSS-only, no behavior touched).

### Upcoming card hover/focus: matched sessions-guide's own upcoming card (2026-09-01)

User: three more Figma frames (24:22986/24:22987/24:22988) as "source of truth for spacing and
general guidance," but the explicit ask was behavioral: "I want the same hover and focus effects
you see in upcoming session guide," referencing `sg-time-row__card-wrap` specifically.

The 3 frames turned out to be 3 *content* variants of the same static card (with/without a
favorite button, short vs. 2-line-truncated title) — not resting/hover/focus states; they
confirmed the spacing already implemented (24px padding, 327px column, 16px internal gap, 16px
radius, `#f8f8f8` background) matches exactly, no changes needed there.

For the actual hover/focus behavior, traced `sg-time-row__card-wrap` and found it's a **pure
layout wrapper** with no interactive styling of its own (`sessions-guide.css:1188-1199` — just
`flex-shrink`/`width`/a collapse-animation transition). The real effect lives on the child
`.sg-card`, gated behind `:is(.sessions-guide, .sg-portal) .sg-card:is(:hover, :focus-within)`
(`sessions-guide.css:2569-2612`) — a selector this file's DOM never matches, since broadcast
never carries a `.sessions-guide`/`.sg-portal` ancestor class (same reason this file already
replicates `.sg-card`'s base styling directly, per the comment on that rule). Native effect:
width grows 379px→427px (+48px), `box-shadow: 0 6px 24px rgb(0 0 0 / 18%)` appears, `z-index: 2`,
all via a `0.32s cubic-bezier(0.22, 1, 0.36, 1)` transition — background does NOT change on
plain hover (that only happens combined with `is-scheduled`/`is-favorited`, a separate state).

Replicated directly under `.sb-carousel-section--up-next .sg-card`, scaled from this card's own
375px baseline (→ 423px on hover/focus, same +48px delta) with the identical shadow/z-index/
transition timing.

Verified: lint clean, 144/144 tests pass unchanged (CSS-only, no behavior touched).

### Correction: adopt sessions-guide's full desktop .sg-card behavior, not just hover (2026-09-01)

User: "Still not there. go with upcoming card styling and behavior from session guide." Then,
mid-turn, clarified scope: "I am referring to the card itself and at desktop. The current
carrousel works well" — i.e. this is about `.sg-card` specifically, not carousel-level
mechanics (nav, gap, bleed), which stay untouched.

A full audit of sessions-guide.css's `@media (min-width: 1280px)` `.sg-card` rules found the
previous attempt was only half right: it replicated the container's hover-growth delta, but
left in place an OLD, load-bearing reset block (originally from an earlier phase, predating
this session) that actively fights sessions-guide's own native desktop redesign — forcing the
badge row to stay visible, the footer hidden, actions always-visible (not hover-gated), and the
trailing time label shown. Critically, every one of those descendant rules
(`.sg-card__body`/`__badge-row`/`__footer`/`__track--footer`/`__footer-badge`/`__actions`/
`__actions::after`, plus `__title`/`__time`'s hover-color flips) is a **bare** selector in
sessions-guide.css — not gated behind the `.sessions-guide`/`.sg-portal` ancestor class this
file's DOM lacks — so they were already silently trying to apply; only that old reset was
blocking them.

**Removed the reset block entirely** — badge/footer swap, hover-gated actions reveal, and
title/time hover-to-white now all come from sessions-guide.css natively, verbatim, zero code of
our own needed.

**Expanded the container-level replica** (the one half that *is* ancestor-gated and genuinely
needs its own copy) to match sessions-guide's exact values instead of the earlier pass's
Figma-derived approximation: width 379px→427px (was 375→423, a guess scaled off the static
content-only Figma frames from two requests ago — those frames never showed an interactive
state, so treating their literal 327px/24px math as the hover-behavior source was itself the
mistake), min-height 124px→150px (new), background gray-50→gray-900 on hover (new — this is
what makes the now-native white title/time hover-colors actually legible, previously missing),
plus the `.is-scheduled`/`.is-favorited` pre-widened combined states, matching sessions-guide's
own rule set one-for-one.

Verified: lint clean, 144/144 tests pass unchanged (CSS-only, no behavior touched).

### Correction: actions column was at the bottom, not the side (2026-09-01)

User posted a screenshot: "Not quite there. the upcoming actions are showing at the bottom
instead of on the side like they do on session guide." Root cause: the container-level replica
copied width/min-height/padding/background/box-shadow/transition from sessions-guide.css's own
`.sg-card` rule but missed `flex-direction: row` (and `align-items: stretch`), also part of
that same rule. Without it, the card stayed the base rule's `flex-direction: column`, stacking
`.sg-card__actions` *below* `.sg-card__body` instead of beside it — confirmed via
`SessionCard.js:171-187` that body and actions are direct siblings under `.sg-card`, so the
parent's own flex-direction is what actually decides their arrangement. Added the missing
properties; the hover-revealed actions column now slides in from the right, next to the text.

Verified: lint clean, 144/144 tests pass unchanged (CSS-only, no behavior touched).

### Correction: Up Next header margin-bottom source-order bug (2026-09-01)

User: "sg-carousel__header is still using margin bottom var(--s2a-spacing-sm); instead of lg."
Both the shared desktop nav-alignment rule (`.sb-carousel-section--up-next .sg-carousel__header
{ margin-bottom: var(--s2a-spacing-lg) }`, gated `@media (min-width: 1280px)`) and Up Next's own
unconditional base rule (`{ margin-bottom: var(--s2a-spacing-sm) }`, 12px) target the identical
selector at identical specificity — a tie CSS breaks by source order, last-in-file wins,
*regardless* of the media query. Also Live's equivalent base rule sits early in the file (line
624), before the desktop block, so it was never a problem there — but Up Next's whole base
section happened to land physically after the shared desktop block (an ordering artifact from
when that block was first added), so its unconditional 12px rule was silently winning the tie
at every width, including 1280px+, undoing the intended 24px.

Moved the whole nav-alignment block down, to just after both sections' own base rules (right
before the shared max-width block), so it's now textually last for both selectors — matching
Also Live's own already-correct ordering. Left a comment explaining the source-order dependency
so this doesn't regress if something gets inserted between them again.

Verified: lint clean, 144/144 tests pass unchanged (CSS-only, no behavior touched).

### Scheduled/favorited icon disappears on hover — pre-existing bug, surfaced by dark hover (2026-09-01)

User posted a screenshot: "The hover effect is inverting the scheduled icon and not keeping it
white so we can see it like it does in the session guide," then, mid-turn: "The same is
happening with the favorited icon FYI." Traced via a full-repo icon-color audit: the checkmark/
heart icons are inline SVGs with `fill="currentColor"` (`icons.js`), and this file's own
existing `.is-scheduled`/`.is-favorited` rule (`session-broadcast.css:968-973`, predates this
session — a "frosted/outlined" look for the confirmed state) makes the button fully
`background: transparent` without ever setting its own `color`. That's not a bug on its own —
sessions-guide's native card never hits this because its scheduled/favorited buttons keep an
opaque white circle behind the icon regardless of card state — but it became one the moment
this session's work made the card itself darken on hover: the icon's inherited black
`currentColor` now disappears into that same-color transparent button over a near-black card.

First attempt added `color: #fff` on the icon itself — wrong fix. User followed up with a
screenshot of the desired result: a solid opaque white circle with the icon staying **dark**,
not a white icon on a transparent button — exactly sessions-guide's own approach (opaque circle
at every state, icon color untouched). Corrected to `background: #fff` on the same
`.sg-card.is-scheduled:is(:hover, :focus-within) .sg-card__btn--schedule` selector (and the
`.is-favorited`/`--favorite` equivalent), restoring the opaque backdrop specifically for the
hover case while leaving the resting-state transparent/outlined look and its dark border
untouched.

Verified: lint clean, 144/144 tests pass unchanged (CSS-only, no behavior touched).

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
