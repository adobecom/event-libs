# Upcoming Sessions Marquee Rotation — Design Doc

## Status

Design discussion complete, not yet implemented. Captured so work can continue in a
new session.

## Overview

The hero marquee (e.g. Adobe MAX "Featured content" hero) includes an "Upcoming"
sessions rail showing up to N cards (**authorable, defaults to 9 — not a
hardcoded value**), each linking to an individual session page. The list must
continuously reflect "what's upcoming" as sessions start and end, without
harming the hero's LCP (the hero image/video is the LCP element) and without
visible glitches when cards rotate out.

Throughout this doc, "9" refers to the default/example value of this authorable
limit (`N`); all sizing (initial fetch, buffer depth) should derive from `N`,
not assume it.

## Goals

- Never block or contend with hero LCP.
- Always show exactly `N` upcoming/in-progress session cards, where `N` is an
  authorable limit (default 9).
- Rotate cards out at the exact moment a session ends, with an animation, with no
  network dependency at the moment of the swap (no fetch-then-render glitch).
- Avoid polling — session start/end times are known in advance, so use
  event-driven timers, not interval-based re-checks.
- Minimize payload size per request — never fetch more than needed.

## Non-goals

- Reusing the `agenda` block or its data — this page does not use the agenda
  block, so there is no shared in-memory session payload to reuse.
- Full-fragment content swapping via `chrono-box` — evaluated and rejected (see
  "Why not chrono-box" below).

## Architecture

### 1. LCP isolation

The hero image is the confirmed LCP candidate (full-viewport). The sessions rail
must not fetch or render before/during hero LCP resolution.

- Defer the first sessions fetch until after the hero's `load` event (or the
  completion callback of hero image decoration in `decorate.js`), or fall back to
  a flat delay (~2-3s) if no clean hook exists.
- Do not gate the fetch behind `requestIdleCallback` alone — it can fire
  unpredictably late on a busy main thread. Prefer an explicit load-event hook or
  fixed delay.
- Render skeleton/placeholder cards in the `N` slots immediately on decoration
  so layout is reserved (no CLS) while the deferred fetch resolves.

### 2. Initial fetch — sliding window buffer

- First fetch requests sessions sorted by `startTime`, buffered as **N + 1**
  sessions (`N` visible + 1 buffered ahead) rather than fetching in batches of
  `N` repeatedly. `N` is read from the block's authored config, not hardcoded.
- Data should come from an ESP/ESL endpoint that supports cursor-based
  pagination (`after: <sessionId>` or `startTime >`) so subsequent fetches can
  request "just the next one," not a redundant re-fetch of an overlapping page.
  Confirm with ESP/ESL whether cursor pagination exists; offset-based fallback
  works but is less clean (`offset = initialFetchCount + swapsSoFar`).

### 3. Rotation — event-driven timer, not polling

Session end times are known upfront, so timing should be driven by a single
scheduled wakeup per swap, not a recurring interval:

- Compute `firstCard.endTime - Date.now()` and schedule a single timer for
  exactly that moment.
- On fire: play the swap-out animation for the expiring card, promote the next
  buffered session into the visible `N`, then schedule the next timer for the
  new first card's `endTime`.
- Because the buffer already holds the next session (see #2), the swap never
  waits on a network call — this is what makes the rotation glitch-free.

**Timer implementation — mirror `chrono-box`'s worker pattern, don't reuse the
block itself.** `chrono-box` (`event-libs/v1/blocks/chrono-box/chrono-box.js`)
already solves "precise wakeup at a scheduled time" via a Web Worker
(`worker-traditional.js` holding a schedule as a linked list) — this avoids
`setTimeout` throttling in backgrounded tabs. However, chrono-box's worker tick
result is a **full fragment swap** (`loadFragment` replacing the entire block's
DOM from pre-authored HTML keyed to a static schedule). That model doesn't fit
here because:
- Our schedule is live, paginated ESP/ESL data, not a static DA-authored
  `schedule` metadata JSON.
- We need to patch a single card in/out of a 9-card carousel with an animation,
  not replace the whole block's markup.

**Recommendation:** build a small dedicated Worker (same pattern as
`worker-traditional.js`) that holds just the sorted end-times of buffered
sessions and posts a message back when the next boundary passes. Do the actual
card swap + DOM diff + buffer refill in the `onmessage` handler on the main
thread.

### 4. Buffer refill — sliding window, not periodic batch fetch

- Each swap retires exactly one card and promotes exactly one buffered session,
  so refill should request exactly the next one session past the end of the
  current buffer — not a fresh batch of `N`.
- Trigger the refill request after a swap completes (e.g. via
  `requestIdleCallback`, with a `setTimeout(0)` fallback), not on the same timer
  driving the swap itself. This decouples "when we render" from "when we
  fetch," so the network call happens in idle time, ahead of when it's actually
  needed.
- Maintain a constant buffer depth (visible `N` + 1 buffered ahead).

### 5. Correctness / drift safeguards

- **Background-tab throttling:** browsers clamp timers in inactive tabs. On
  `visibilitychange` (tab refocus), recompute the swap state against
  `Date.now()` directly and correct the visible card set / reschedule the next
  timer rather than trusting an already-fired (but delayed) timer.
- **Upstream schedule changes:** since this design is event-driven rather than
  polling, add one low-frequency revalidation (e.g. on tab refocus, or a single
  background check every 5-10 min) to catch session reschedules/cancellations
  in ESP that the buffer doesn't yet reflect. This is a correctness check, not
  the primary rotation mechanism.

### 6. Authoring — C2 style guidelines

This block should be authored following the **C2 design system** conventions
(per `build-content-from-figma` skill), not the general event-libs/EDS defaults:

- Authored DOM must include a `metadata` section with `foundation: c2` in the
  same DA document — required for the EDS block loader to resolve the block
  from `libs/c2/blocks/` and load its JS/CSS. Without it, the block won't load.
- Block markup follows the standard C2 authoring table: a header row
  `<p>upcoming-sessions (variant1, variant2)</p>` (variants comma-separated,
  parentheses omitted if none), with `section-metadata` in the same section
  (`style: container, wide`), no `---` separator between them.
- **CSS breakpoints use the modern C2 syntax** `@media (width >= Npx)`, *not*
  the legacy event-libs `@media screen and (min-width: Npx)` convention used
  elsewhere in this repo (e.g. `chrono-box.css`). This is a deliberate
  divergence for this block — confirm during implementation review since it's
  easy to default to the surrounding repo's older pattern.
- CSS selectors still scoped under the block root class (`.upcoming-sessions`),
  consistent with both C2 and general event-libs conventions.
- Assets (if any per-card static images/icons are authored rather than
  API-driven) follow the C2 pipeline: downloaded from Figma, uploaded directly
  to the DA admin API — not committed as repo-local static assets.

### 7. Individual session pages — calendar action

Each card links to an individual session page. Scope any "add to calendar"
affordance (`.ics` generation from the session's known start/end time) to the
**session page itself**, not the marquee card — keeps the hero rail lightweight
and avoids adding interaction surface to a component that's already animating on
a timer.

## Open questions for implementation

- Does the ESP/ESL sessions endpoint support cursor-based pagination
  (`after:`), or is it offset/limit only? Determines refill request shape.
- What hook exists (if any) in `decorate.js` / hero block for "hero image fully
  decorated," to anchor the deferred first fetch on, vs. falling back to a flat
  delay?
- Confirm whether ESP/ESL response for a single "next session" is cheap enough
  standalone, or whether it's more efficient to always request a small page
  (e.g. 2-3) even for incremental refills.

## Summary of key decisions

| Decision | Choice | Why |
|---|---|---|
| First fetch timing | Deferred after hero LCP (load event or ~2-3s delay) | Hero image is LCP; sessions fetch must not contend |
| Card limit | Authorable `N` (default 9), not hardcoded | Editors control rail size per page/block config |
| First fetch size | N + 1 sessions (N visible + 1 buffered) | Enables glitch-free first swap without immediate refetch |
| Rotation trigger | Single scheduled timer per swap, keyed to next `endTime` | Times are known in advance; polling wastes cycles and adds latency |
| Timer implementation | Dedicated Worker, modeled on chrono-box's `worker-traditional.js` | Avoids background-tab `setTimeout` throttling; proven pattern in repo |
| Full chrono-box block reuse | Rejected | Built for static schedule + full-fragment swap, not live paginated data + single-card patch |
| Buffer refill size | Exactly 1 session per swap | Sliding window — no need to re-fetch a full batch |
| Refill trigger | Post-swap, via idle callback, decoupled from swap timer | Keeps fetch ahead of need without blocking the swap itself |
| Calendar/chrono action | Session page only | Keeps hero rail lightweight |
