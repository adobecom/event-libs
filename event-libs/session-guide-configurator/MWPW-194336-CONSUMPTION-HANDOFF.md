# MWPW-194336 handoff — consuming-side work this app's output requires

This app (Session Guide Configurator) is authoring/export-only: it produces
a config blob, base64-encodes it into a `?sgConfig=` URL, and `decorate.js`'s
`prebuildAutoBlock` decodes that at page-decoration time into the
`sessions-guide`/`sessions-guide-full-page` block's own
`data-session-guide-config` attribute. `utils/parse-config.js` reads that
attribute and puts `eventId`, `headings`, `behaviorFlags`, `swimlaneOrder`,
and `authoredFilterCategories` onto `guideConfig` — but as of the Phase 7
plumbing pass (2026-08-03), nothing downstream actually *reads* those four
fields yet. `filterCategories` itself is deliberately left pointing at
`FilterPanel.js`'s pre-existing legacy default, not the new authored shape —
see item 1 for why. Everything below is what needs to change to make each
field actually affect rendering. See `PLAN.md` §7 for the fuller narrative
behind the filters design; this doc is the consolidated, trackable checklist
(same role as `tier-1-event-configurator/MWPW-200314-HANDOFF.md` for that
app).

## 1. Filters — wire `authoredFilterCategories` into `FilterPanel.js` (not started)

`FilterPanel.js` currently reads `guideConfig.filterCategories` (shape
`{id, label}[]`, hardcoded to `track`/`type`) and derives each category's
options by indexing sessions directly — `sessions.value.forEach((s) => s[id])`.
That mechanism needs replacing, not extending:

- Run the same `deriveFacetableAttributes()` (already shared, in
  `v1/services/sessions/sessions-api.js`) over the block's own already-fetched
  session catalog.
- Filter/order the result through `guideConfig.authoredFilterCategories`
  (shape `{attributeId, label, displayName, enabled}[]` — `label` is the
  original ESP label, unused at render time but kept so the configurator's
  own editor can show it) — keep only `enabled` entries, in authored order.
- Render `displayName` (not `label`) as the category tab text.
- Look up each session's value for a category by `attributeId` against its
  `customAttributes[]` (same shape `getSessionTrack()` already reads for
  swimlanes — see item 3), not `s[id]` — sessions don't have flat
  `track`/`type` properties; that was always the legacy authoring format's
  own simplification, not a real session field.
- Once this is live, delete `parse-config.js`'s `DEFAULT_FILTER_CATEGORIES`
  fallback and the `filterCategories`/`authoredFilterCategories` split
  entirely — `authoredFilterCategories` only exists as a separate field to
  avoid breaking `FilterPanel.js` mid-migration; it shouldn't outlive this
  item.

## 2. Headings — wire `headings` into `DrawerHeader.js` (not started)

`DrawerHeader.js` currently shows a single hardcoded fallback title
(`"See what's happening at MAX"`) when the viewer isn't logged in, or a
personalized `"{firstName}, see what's happening"` when they are —
`guideConfig.title` was the old (now-removed) authoring-table override point
for the logged-out case, and is no longer set by `parse-config.js` at all.

The new config carries four heading strings —
`headings: { loggedOut, loggedIn, loggedOutPostEvent, loggedInPostEvent }` —
selected by both the viewer's auth state *and* whether the event has ended.
Needs:
- A post-event signal available to `DrawerHeader.js` — check whether one
  already exists on `state` (e.g. via the on-demand/live-view transition
  logic in `store/index.js`'s `checkAutoTransition`) before building a new
  one.
- Select the right one of the four strings by `(isLoggedIn, isPostEvent)`,
  falling back to the current hardcoded copy only if the authored string for
  that combination is blank.

## 3. Swimlane order + visibility — wire `swimlaneOrder` into `OnDemandView.js` (resolved 2026-08-11)

`OnDemandView.js` was already passing `guideConfig?.swimlaneOrder` into `groupByTrack`
by the time this was revisited — but `groupByTrack`'s sort logic hadn't been updated for
the `[{track,displayName,enabled}]` shape described below, so ordering silently had zero
effect, `enabled` was never applied, and `displayName` never reached the rendered label.
Also extended to cover override-lane names, not just tracks. Full fix + root cause in
`event-libs/v1/blocks/sessions-guide/PLAN.md` §16.3's correction note. Original spec
below, kept for context:

`OnDemandView.js`'s `groupByTrack(available)` (in `utils/session-filters.js`)
currently returns tracks in whatever order it derives them in, labeled with
the raw track value — there's no authored ordering, hiding, or renaming
applied today. `guideConfig.swimlaneOrder` is `[{ track, displayName, enabled }]`
(2026-08-04 — was a plain track-name array before disable/rename support was
added in the configurator; `track` is the immutable original value used to
match sessions, `displayName` is the author's editable override). Needs:
- `groupByTrack` (or a new wrapper) to accept `guideConfig.swimlaneOrder`,
  **drop any track whose entry has `enabled: false` entirely** (not just push
  it to the end — those sessions shouldn't render in this guide at all, same
  as an author fully deselecting a filter category), and sort the remaining
  tracks to match the enabled entries' order.
- Render each swimlane's header using `displayName`, not the raw `track`
  value.
- Decide the fallback for any track present in the session data but *not*
  in `swimlaneOrder` at all (e.g. a new track added at ESP after this config
  was last authored/seeded) — likely append at the end in whatever order
  `groupByTrack` would otherwise produce, rather than dropping it (dropping
  is only correct for a track the author explicitly disabled).

## 4. Behavior flags — wire into their respective gating points (not started)

`behaviorFlags: { enableScheduling, enableFavoriting, enableWatchNowCtas }`
— none of these are read anywhere yet. Concrete gating points found by
inspection:

- **`enableScheduling`** → the "Add to schedule"/"Scheduled" buttons in
  `LiveCard.js`, `SessionCard.js`, and `SessionDetailOverlay.js` (all call
  `handleSchedule`/`toggleScheduleWithFeedback`). When disabled, hide the button
  (or the whole schedule affordance) rather than disabling it — TBD with
  design.
- **`enableFavoriting`** → the favorite/heart buttons in the same three
  files (`handleFavorite`/`toggleFavoriteWithFeedback`).
- **`enableWatchNowCtas`** → the "Watch now" button in `LiveCard.js` (and
  `SessionDetailOverlay.js`'s live/on-demand variant of the same CTA).

`enableBrandConciergeRibbon` was removed (2026-08-13) — the ribbon is out of
scope for the next event and never had a corresponding component in the
codebase.

## Test-plan items relevant to the consuming side

- [ ] A session guide config with a non-default `filterCategories`
      selection (some categories disabled, one renamed, reordered) actually
      changes what `FilterPanel.js` shows and in what order.
- [ ] Each of the four `headings` strings renders in the right
      auth-state/post-event combination; a blank authored string falls back
      to the existing hardcoded copy.
- [ ] `OnDemandView.js` renders track swimlanes in `swimlaneOrder`'s order,
      headed by each entry's `displayName` (not the raw `track` value); a
      disabled track (`enabled: false`) doesn't render at all; a track missing
      from `swimlaneOrder` entirely still renders (doesn't silently disappear).
- [ ] Each `behaviorFlags` toggle set to `false` actually removes/disables
      the corresponding affordance across all three card/detail surfaces
      consistently (not just one of them).
