# Upcoming Sessions — Jira fit-criteria gap analysis

Audit of the current `upcoming-sessions` block (`upcoming-sessions.js`/`.css`) against
the Jira description's resolved requirements and fit criteria. Superseded/removed
items from the Jira description (Live state, Watch URL routing, conflict modal) are
skipped — the block correctly never implements them.

## Done

- **Real-time removal on session start, no reload** — `scheduleStateTimers()` +
  `startMobileRiderPolling()` drop a card the instant its start time passes (or MR
  confirms start), no Live state shown, remaining cards reflow (`removeCard()` +
  `slideIntoPlace()` FLIP animation).
- **Click → Session Guide modal, opened to session detail** — `routeCardClick()` calls
  `openSessionGuideDetail(sessionId)` (`session-store.js`), matching PR #211's shared
  mechanism.
- **Add to Schedule / Favorite, three-state auth model** — `handleSchedule`/
  `handleFavorite` → `scheduleWithFeedback`/`favoriteWithFeedback`
  (`services/sessions/action-feedback.js`) already implement all three states:
  logged-in+registered completes the action, logged-out shows a sign-in toast,
  logged-in-not-registered shows a register toast. Reused as-is, no changes needed.
- **No conflict modal** — `scheduleWithFeedback` passes `showConflictModal:
  !getAllowDoubleBooking()`; this event's tier-1 config has double-booking allowed, so
  the conflict path never triggers. Correct per the resolved requirement.
- **Category/track badge** — `buildCategoryBadge()` now uses the self-serve
  `getTrackIcon()`/`resolveIcon()` mechanism (PR #213), always falls back to a
  mainstage badge so one always renders.
- **Icons/button markup match Session Guide** — `sg-icon-btn`, `sg-card`, category
  badge classes ported directly from `SessionCard.js`/`CategoryBadge.js`.
- **Show/hide is manual authoring, no max-card auto-hide logic** — the block has no
  runtime auto-hide based on remaining card count; it only removes itself if the
  authored array is empty or unparsable. Matches "author/ops toggles it off, not the
  system."
- **One instance per page, placed in marquee** — enforced by authoring convention
  (single section-metadata-fed block), not a runtime constraint, which matches the
  story's scope.
- **Desktop scroll controls, mobile swipe** — `buildCarouselControls()` renders
  prev/next arrows; `data-few-sessions` hides them when ≤3 cards (recomputed as
  sessions are dropped, not just at initial decoration); CSS scrolls the
  `.upcoming-sessions-track` natively on touch (swipeable) with arrows desktop-only
  (`@media (min-width: 1280px)`).
- **Row bleeds past right edge of container** — existing `carousel clip-end` block
  convention (`el.className` includes `clip-end`), same pattern used elsewhere.

## Not done / diverges from the fit criteria

1. **Desktop hover-reveal of description + CTAs is NOT implemented — CTAs are always
   visible instead.** `upcoming-sessions.css` (lines 186–192) documents this as a
   deliberate prior divergence: hiding buttons until hover makes them unreachable via
   touch/keyboard unless a session is already scheduled/favorited. The Jira fit
   criteria explicitly wants: default view = Title/Track/Time only, description + CTAs
   appear on hover, and CTA(s) persist post-schedule/favorite without hovering. This
   needs a product call — either keep the accessibility-driven always-visible
   treatment (deviation, needs sign-off) or implement hover-reveal with a
   keyboard-accessible equivalent (e.g. reveal on `:focus-within` too, which the
   current CSS does not do).
2. **No description field anywhere in the card** — neither the authored session shape
   nor `buildCard()` includes a description/summary. Both mobile (always-shown) and
   desktop (hover-shown) fit criteria require one. Needs: (a) a `description` field
   added to the authored session JSON shape and `build-author-data.mjs`, (b) markup +
   CSS for it in `buildCard()`.
3. **No speaker avatar(s) on the card.** Fit criteria under "Card content & states"
   lists speaker avatar(s) as required card content; current card has none. Needs a
   `speakers` field (name + avatar URL) in the authored shape and avatar markup/CSS.
4. **Max card count is not configurable by the author.** Currently the block renders
   every session in the authored JSON array with no cap — authors must self-limit by
   only including up to N sessions in the array. The story wants an authored "max
   count" setting (recommended default 9) enforced by the block itself, so an author
   listing more than the max still only shows the configured number. Needs a new
   section-metadata key (e.g. `upcoming-sessions-max`) read in `decorate()` and applied
   as `sessions = sessions.slice(0, max)`.
5. **Channel/tag-based session selection is not implemented.** Per Jira, "exact filter
   mechanics [are] pending further design/data details" — current authoring is a fully
   manual, hand-picked JSON array (via `build-author-data.mjs` + manual edits), which
   satisfies the story's stated authoring approach ("cards are manually authored...
   Claude used to help generate that JSON") but not a live channel/tag filter. No
   action needed unless/until design finalizes filter mechanics — flag as explicitly
   out of scope for now, matching the story's own "pending" language.
6. **Analytics attribution is an open question in the story itself** — no
   component-specific analytics events currently exist in `upcoming-sessions.js` (no
   click/schedule/favorite tracking distinguishing this component's actions from
   Session Guide's). Needs stakeholder input per the story before this can be scoped;
   flagging here so it isn't silently missed.
7. **Upcoming-sessions video support is an explicit open question in the story** — not
   implemented, scope itself is undefined pending engineering clarification. No action
   possible until scoped.

## Recommended next steps (in priority order)

1. Get a product decision on item 1 (hover-reveal vs. always-visible CTAs) — this is
   the biggest structural gap since it affects card markup/CSS broadly, not an
   additive field.
2. Add `description` and `speakers` fields to the authored data shape
   (`build-author-data.mjs` + block JSON) and render them in `buildCard()` (items 2–3).
3. Add author-configurable max card count (item 4) — smallest, self-contained change.
4. Leave items 5–7 as explicitly out of scope until the story's own open questions are
   resolved by stakeholders/design.
