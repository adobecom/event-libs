# MWPW-194336 handoff — consuming-side work this app's output requires

This app (Session Guide Configurator) is authoring/export-only: it produces
a config blob, base64-encodes it into a `#sgConfig=` URL, and `decorate.js`'s
`prebuildAutoBlock` decodes that at page-decoration time into the
`sessions-guide`/`sessions-guide-full-page` block's own
`data-session-guide-config` attribute. `utils/parse-config.js` reads that
attribute and puts `eventId`, `headings`, `behaviorFlags`, `swimlaneOrder`,
and `filterCategories` onto `guideConfig` — all four now actually drive
rendering (items 1-4 below), completed across MWPW-200314's item 12. See
`PLAN.md` §7 for the fuller narrative behind the filters design; this doc is
the consolidated, trackable checklist (same role as
`tier-1-event-configurator/MWPW-200314-HANDOFF.md` for that app).

## 1. Filters — wire `authoredFilterCategories` into `FilterPanel.js` — done (MWPW-200314 item 12)

`parse-config.js` now maps authored `filterCategories`
(`{attributeId, label, displayName, enabled}[]`) directly to `{id, label}`
(`id` = `attributeId`), enabled-filtered, in authored order — no authored
config (or every entry disabled) yields `[]`, which `FilterPanel.js` already
renders as no panel. `session-filters.js`'s `getFilterValue()` resolves a
category's session value via a generic `customAttributeValues` map
(`sessions-api.js`'s `mapEslPayloadToRawSessions()`, built from raw
`customAttributes[]` at fetch time rather than called live per-render), with
a flat-field fallback kept for defensiveness. `DEFAULT_FILTER_CATEGORIES` and
the `authoredFilterCategories`/`filterCategories` split are both retired, as
planned. FilterPanel.js's own markup/UI is unchanged — pending Figma.

## 2. Headings — wire `headings` into `DrawerHeader.js` — done (MWPW-200314 item 12)

`resolveDrawerTitle(headings, { isLoggedIn, userFirstName, isPost })` in
`DrawerHeader.js` selects the right of the four authored strings by
`(isLoggedIn, isPost)`; `isPost` comes from the same `isPostEvent()` used
elsewhere (see item 4's status note), not a separately-built signal. Original
spec below, kept for context:

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
`event-libs/v1/c2/blocks/sessions-guide/PLAN.md` §16.3's correction note. Original spec
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

## 4. Behavior flags — wire into their respective gating points — done (MWPW-200314 item 12)

`isBehaviorEnabled(guideConfig, flag)` (new `utils/behavior-flags.js`) gates
all three flags at the points identified below, in `LiveCard.js`/
`SessionCard.js`/`SessionDetailOverlay.js`. Post-event state itself (`isPost`,
also used by item 2's headings) is now driven by the Tier 1 Event
Configurator's `eventEndDateTime` via `isPostEvent()`, not the old
`manualCutoff` metadata. Original spec below, kept for context:

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
