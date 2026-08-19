# Session Guide Configurator — Plan

## 1. Ticket & rescoping context

Source ticket: [MWPW-194336](https://jira.corp.adobe.com/browse/MWPW-194336) — but per
Daniel this was written broadly/prematurely and needed a fresh review pass before any
real planning could start (the placeholder this file replaced said as much). That
review pass happened 2026-07-28: walked every AC section against current code and
against what this tool should actually do today, with Daniel confirming/correcting each
one. This doc records the outcome.

**Concrete sign the raw ticket needed a rewrite, not just a trim:** its Export & Embed
section (and the Figma file title) refers to a "Calendar Configurator," a "Calendar
component URL," and an embed snippet `{{<calendar-block>}}` — none of which are this
tool. That section was very likely cloned from a different tool's ticket template and
never fully re-worded for Session Guide. Treat any section that still reads oddly
generic the same way — a signal to double-check, not a spec to follow literally.

## 2. Relationship to the Tier 1 Event Configurator

- **Tier 1 Event Configurator** (MWPW-201380, `tier-1-event-configurator/PLAN.md`) owns
  page-wide, cross-surface Tier 1 settings authored once per event and consumed by any
  surface: track icons/colors, `allowDoubleBooking`, `featuredSessions` (see
  `MWPW-200314-HANDOFF.md` for how sessions-guide currently consumes these).
- **Session Guide Configurator** owns settings specific to the sessions-guide block
  instance itself: page mode, theme, headings, its own behavior flags, filters,
  swimlane order.
- **Tier 1 only, for now.** Tier 1 Event Configurator is itself scoped to Tier 1 events
  only, so a Session Guide config that links to one couldn't support Tier 2 anyway.
  Revisit if/when Tier 2 support is actually requested — don't design for it
  speculatively before then.
- **Each Session Guide config links to one specific event's existing Tier 1 config** —
  that's how it sources its event/ESP connection rather than re-authoring one, and how
  it defers to Tier-1-owned settings instead of duplicating them.
- **Many-to-one, not one-to-one: an event can have multiple Session Guide configs**
  (corrected 2026-07-28, per Daniel) — e.g. testing variants, or a widget version and a
  page version of the same event's guide. Unlike Tier 1's one-row-per-event sheet,
  Session Guide's rows are keyed by their own config ID, with `eventId` as a reference
  field, not the primary key.

## 3. Precedent — two different apps, blended

- **App shape** (UI approach, no-build-step Preact + HTM, small custom design system
  instead of Spectrum Web Components, DA-sheet-backed saved-config library): Tier 1
  Event Configurator.
- **Output/consumption model:** Schedule Maker → `chrono-box`, *not* Tier 1 Event
  Configurator's "paste JSON into a metadata row" approach. Schedule Maker's Copy Link
  encodes its data into a base64 URL param (`ScheduleURLUtility` in
  `schedule-maker/utils.js`); `decorate.js`'s `processAutoBlockLinks`/`prebuildAutoBlock`
  (`event-libs/v1/utils/decorate.js:508-587`) scans the page for `<a>` links matching a
  registered URL pattern, decodes the param, transforms it into the target block's DOM
  shape, and replaces the link with the real block element at decoration time — no
  manual block/metadata authoring at all. Session Guide Configurator will add its own
  `sessions-guide` entry to both `autoBlockIdentifiers` and `prebuildAutoBlock`'s builder
  map, following this exact pattern.
- **Saved configs sheet:** own file, sibling to Tier 1's —
  `/tools/da-apps/session-guide-configurator/configs.json` (Tier 1's is at
  `/tools/da-apps/tier-1-event-configurator/configs.json`) — not merged into it, since
  the row shapes differ.

## 3a. URL encoding + consumption (confirmed 2026-07-29, per Daniel)

**Superseded — see "Current contract" at the end of this section.**

**Encode/decode plumbing already exists and is fully generic — nothing new to build
there:**
- Decode: `parseEncodedConfig()` (`event-libs/v1/utils/utils.js:146`) — already shared,
  already used by `chrono-box`'s builder, returns `null` gracefully on bad input.
- Encode: same technique as Schedule Maker's `ScheduleURLUtility.createScheduleURL()` —
  `btoa(unescape(encodeURIComponent(JSON.stringify(configBlob))))` as a URL param on
  `https://da.live/app/{org}/{repo}/tools/da-apps/session-guide-configurator` (own param
  name, e.g. `?sgConfig=`, not `?schedule=`).
- Registration: add `'sessions-guide': { pattern: 'session-guide-configurator' }` to
  `decorate.js`'s `autoBlockIdentifiers`, plus a matching builder function in
  `prebuildAutoBlock` that decodes the URL, cross-checks `config.eventId` against the
  page's own `event-id` metadata and warns on mismatch (same pattern as
  `MWPW-200314` item 4), then builds the block element.
- Copy Link (2026-08-04): copies a rich hyperlink, not the bare URL string — same
  technique as Schedule Maker's `ScheduleURLUtility.copyScheduleToClipboard()` (build a
  real `<a>` element, wrap its `outerHTML` in a `text/html` `Blob`, write via
  `navigator.clipboard.write([new ClipboardItem(...)])`, falling back to a plain-text
  URL copy when that API isn't available). Link text is `Session Guide: {display
  title} – {updated date}` (date omitted for an unsaved config). Pasting into DA's
  rich-text editor drops in a working link with readable text instead of a wall of
  base64 — `utils.js`'s `copySessionGuideConfigLink()`. Available from two call
  sites sharing the same logic: `ConfigEditor.js`'s action bar (the config currently
  open, saved or not) and `Library.js`'s per-row actions (any already-saved config,
  no need to open it in the editor first).

**Current contract — the link is a round trip:**
- **Payload lives in the hash**, `#sgConfig={base64}`, matching `#schedule=` and
  `#tecHomepage=`. DA's app shell (`da.live/nx/blocks/shell/shell.js`) forwards both the
  search and the hash into the iframe, so a query param would reach the app too — the hash
  just keeps a multi-KB payload out of the query string the shell reads `ref` from.
  `decorate.js` reads both, so older `?sgConfig=` links still decode.
- **Target is the consolidated Event Configurator page**, since Session Guide Config is a
  tab there rather than its own tool. `TierOneEventConfigurator.js` opens on that tab when
  the hash carries a payload; `SessionGuideConfigurator.js` opens the config and clears the
  hash so the tab isn't stuck on it.
- **Registration matches the payload key**, not the path — both link types share one path,
  so `sgConfig=` vs. `tecHomepage=` is the only thing telling them apart.
- **The link carries `configId`/`componentName`/`backendEventTitle`/`eventServiceEnv`** so
  clicking it can rebuild an editable row. A saved row with the same `configId` wins over
  the link's copy, which can be older than the row it came from. `parse-config.js` ignores
  these keys.

**The manual authoring-table experience is retired entirely, not kept as a fallback —
this was the one real design fork, and it's resolved.** `chrono-box`'s builder doesn't
reconstruct an authoring table at all; it writes a purpose-built shape (`data-schedule-
id`/`data-schedule-title` attributes + a hidden div holding raw JSON) that `chrono-
box.js` parses directly. Session Guide follows the same precedent: the built block
carries a new `data-session-guide-config="<json>"` attribute, and `sessions-guide.js`/
`sessions-guide-full-page.js`'s `init()` reads **only** that — `utils/parse-config.js`'s
`parseSessionsGuideConfig()` (the current `event-title`/`filter-categories`/etc.
authoring-table parse) is not called at all for the new flow, and is not kept as a
fallback path. **Confirmed clean, not a migration:** verified 2026-07-29 that no real
page exists today with a manually-authored sessions-guide block outside `demo.html` and
the test mocks — `sessions-guide` is registered in `libs.js`'s `EVENT_BLOCKS` but
nothing in production actually authors it the old way.

**Follow-up implied by this, tracked in §7:** `demo.html`, `mocks/default.html`, and any
tests that construct a sessions-guide block via authoring-table markup will need
updating to the new attribute-based shape once this ships — parse-config.js's own
mechanism can most likely be deleted outright rather than left as dead code, but that's
a call for whoever actually implements this.

## 4. Scope decisions from the section-by-section AC review (2026-07-28, per Daniel)

Numbered to match the original ticket's AC sections, so anyone cross-checking back
against MWPW-194336 can follow along.

1. **Entry Point & Landing Page.** No Tier 1/Tier 2 dual-CTA — Tier 2 is out of scope
   entirely (see §2), so this is a single creation flow. Searchable "Saved
   configurations" grid stays, same shape as Tier 1 Event Configurator's library.
   **New requirement (2026-07-29, from a PM follow-up conversation): Duplicate.** Not in
   the original ticket at all. Each row gets a Duplicate action that clones all of its
   settings as-is **onto the same event** — no event re-picking step, unlike Tier 1
   Event Configurator's cross-event Duplicate (which exists because that tool is
   one-row-per-event; this one isn't, see §2). The only thing that must change on the
   copy is its **Component name**, so it's distinguishable from the original in the
   list. Primary use cases: creating a widget-version + full-page-version pair for the
   same event, and testing variants.
2. **Data Source.** No Rainfocus connection step (Event ID + API Key + Test Connection)
   — dropped entirely. If Rainfocus is ever needed again, that's a global Tier 1
   concern, not this tool's. Data source is **ESP**, via the same `EventPicker`/
   `ManualEventLookup` pattern already built for Tier 1 Event Configurator (reuses DA's
   own SDK token — no separate connection step needed).
3. **Configuration — Component & Event Info.** Reduced to **Page mode**, **Theme**, and
   **Component name**. Event name, date range, and timezone are dropped — deferred to
   the linked Tier 1 config/ESP data. Component name is back in scope, though
   (corrected 2026-07-28, alongside the many-configs-per-event correction in §2): since
   an event can have multiple Session Guide configs, an author-set label is needed to
   tell them apart in the saved-configs list — the linked event's own title alone isn't
   unique per row anymore.
4. **Headings.** Stays as-is: 4 variants — logged-out/live, logged-in/live,
   logged-out/post-event, logged-in/post-event.
5. **Filters. Designed 2026-07-29 — see §7 for the full field-level design.** No
   per-value CRUD (values are always live-derived, never authored — confirmed
   2026-07-29). Category-level select/unselect/rename/reorder is real work for this
   app's own build, sourced from ESP's full custom-attribute data — **not** the old
   Rainfocus assumption, and **not** a dedicated `/session-facets` call either (derived
   from the session catalog already being fetched, see §7). Only the *consuming* side
   (sessions-guide actually rendering these filters) is the handoff item — the
   configurator-side design and build are in scope here, not deferred.
6. **Swimlane Sorting (On-Demand).** Stays as-is: drag-and-drop reorder only: no
   rename/remove (channel names/icons/colors are managed globally, outside this tool).
   Driven by ESP's `Primary Track for Agenda (Digital Agenda)` custom attribute, which
   is expected to be renamed for the MAX 2026 event. **Done 2026-07-28 as prep work:**
   consolidated the duplicate hardcoded attribute-name string into one exported
   `TRACK_ATTRIBUTE_NAME` constant in `sessions-api.js` (previously also duplicated,
   with a stale "consolidate once MWPW-200314 lands" TODO, in
   `tier-1-event-configurator/utils.js`) — makes the upcoming rename a one-line swap
   instead of a multi-file hunt.
7. **Behavior Flags.** `Enable scheduling`, `Enable favoriting`, `Enable Watch Now CTAs`,
   and `Enable Brand Concierge Ribbon` stay as this tool's own toggles. `Enable
   scheduling conflicting sessions` drops — inherited from the linked Tier 1 config's
   `allowDoubleBooking` instead, not a Session Guide setting.
8. **Featured Sessions.** Dropped entirely — fully owned by Tier 1 Event Configurator's
   `featuredSessions` (page-wide by design, not session-guide-specific; see
   `MWPW-200314-HANDOFF.md` item 3).
9. **Preview.** **Deferred to v2.** Live rendering, viewport switching, "Refresh data,"
   and the session detail view are a lot of work and need their own design pass — not
   attempting this alongside the initial build.
10. **Export & Embed.** The "Calendar component"/`{{<calendar-block>}}` language was
    copy-paste drift (see §1) — corrected to Session Guide throughout. No separate
    "Embed code" option. Single **"Copy link"** action, available directly from the
    config editor (not gated on Preview, since that's deferred) — encodes the config
    into a URL per §3's auto-block pattern.
11. **Save & Draft State.** No draft/publish distinction — save-as-you-go, same model as
    Tier 1 Event Configurator (a row is just saved or not).
12. **General / Non-Functional.** Admin access: DA's own access control is sufficient,
    no extra in-app permission gating needed. Rainfocus failure-handling bullet: moot
    (§2). Required-field validation: stays in scope. Empty state for no saved configs:
    stays in scope. Filter CRUD inline edit/confirm/delete pattern: stays (this tool's
    own concern); the equivalent featured-session bullet is moot (§8, Tier 1's now).

## 5. Data model (confirmed 2026-07-29, per Daniel — two distinct shapes)

**Key architectural point this rests on:** sessions-guide's real session-fetching
already depends on the *page itself* carrying an `event-id` meta tag (`decorate.js`'s
outer gate — the same dependency Tier 1 Event Configurator's whole system already
relies on). Any page with a sessions-guide block is already an "event page" with that
tag present, from normal event-page setup — not something this tool needs to
establish. So `eventId` here is mainly an **authoring-time** concern (picking the
event, fetching its ESP data, looking up its linked Tier 1 config for reference); the
page rendering the block doesn't strictly need the URL to carry it for anything to
function. It's still carried in the URL payload anyway, purely to mirror
`MWPW-200314` item 4's `eventId` mismatch check (catches "pasted the wrong Session
Guide link onto the wrong event page" the same way item 4 catches a mispasted Tier 1
`Config`).

**1. Sheet row** (`/tools/da-apps/session-guide-configurator/configs.json` — the
authoring library, full fidelity):
```
{
  configId,          // primary key — own generated ID, not eventId (§2: many-per-event)
  componentName,     // author-set label — distinguishes rows for the same event (§4.1, Duplicate)
  eventId,           // reference to the linked event
  backendEventTitle, // real ESP title, for list display/context
  eventServiceEnv,   // which ESP tier this was authored against (mirrors Tier 1's row-level env fix)
  updated,
  config: { ...below },
}
```

**2. The `config` blob** (also what gets URL-encoded for the copy-link, §4.10):
```
{
  eventId,           // carried for the mismatch-check pattern above, not fetching
  surface,           // 'widget' | 'page'
  theme,             // 'light' | 'dark'
  headings: {
    loggedOut, loggedIn, loggedOutPostEvent, loggedInPostEvent,
  },
  behaviorFlags: {
    enableScheduling, enableFavoriting, enableWatchNowCtas, enableBrandConciergeRibbon,
  },
  filterCategories,  // [{ attributeId, label, displayName, enabled, order }] — see §7, no
                      // values/counts persisted. `label` is the immutable original ESP
                      // label (2026-08-04: kept alongside `displayName` so the editor can
                      // always show what's being overridden, even after a rename).
  swimlaneOrder,     // [{ track, displayName, enabled }] — author-chosen order + per-track
                      // show/hide/rename. `track` is the immutable original value (also
                      // used to match sessions to swimlanes); `displayName` defaults to it
                      // and is author-editable, same rename pattern as filterCategories
                      // (2026-08-04: added `enabled` so authors can drop a track from the
                      // guide entirely, not just reorder it, then added `displayName` for
                      // the same rename capability filterCategories already had).
}
```

**Explicitly not part of this config at all** — inherited live from the page's own
`tier-1-event-config` metadata at render time, same as today: track icons/colors,
`allowDoubleBooking`, `featuredSessions` (see §2).

(URL-encoding format is resolved — see §3a. `filterCategories`'s shape is resolved —
see §7.)

## 5a. App shape & build phases (confirmed 2026-07-29, per Daniel)

**Component tree**, adapted from Tier 1 Event Configurator's file structure:
```
session-guide-configurator/
  session-guide-configurator.js     # DA app entry
  SessionGuideConfigurator.js       # root component, routes Library <-> ConfigEditor
  constants.js
  utils.js
  context/
    ConfigsContext.js               # sheet CRUD + active config state (keyed by configId, not eventId)
    DAContext.js                    # DA SDK auth
    EventEnvContext.js              # ESP tier picker
    NavigationContext.js
  components/
    EventPicker.js / ManualEventLookup.js
    HeadingsEditor.js               # new -- 4 heading fields
    SwimlaneOrderEditor.js          # new -- drag-and-drop reorder, mirrors FeaturedSessionsEditor.js's pattern
    Modal.js / SearchInput.js / LoadingInline.js
  pages/
    Library.js                      # list + search + Duplicate (clones in-place, no event re-pick)
    ConfigEditor.js                 # Page mode, Theme, Component name, Headings, Behavior Flags, Swimlanes, Copy Link
  scripts/
    da-controller.js                # own sheet CRUD + a read-only lookup into Tier 1's sheet by eventId
```

**Shared components, not a third copy-paste.** `EventPicker.js`, `ManualEventLookup.js`,
`Modal.js`, `SearchInput.js`, and `LoadingInline.js` already exist verbatim in Tier 1
Event Configurator. Rather than duplicating them again, promote them to a shared
location both apps import from. This isn't a hypothetical risk — the
`TRACK_ATTRIBUTE_NAME` fix (§4.6) was exactly this failure mode (two independently-
drifting copies of the same thing) caught and fixed after the fact; doing it right the
first time here avoids a repeat.

**Build phases:**
1. **Scaffold** — DA app entry, contexts, sheet CRUD skeleton, empty Library/ConfigEditor
   shells.
2. **Event linkage** — `EventPicker`/`ManualEventLookup` (shared), ESP session fetch,
   read-only lookup + display of the linked Tier 1 config.
3. **Core config fields** — Page mode, Theme, Component name, Headings, Behavior Flags.
4. **Filters (design finalized 2026-07-29, see §7)** — the shared
   `deriveFacetableAttributes()` utility, and the configurator's own Filters step
   (select/unselect/rename/reorder over its output). **In scope for this build**, not
   deferred — only the sessions-guide block actually *rendering* these filters is the
   handoff item (§7).
5. **Swimlane ordering** — drag-and-drop, sourced from ESP track data
   (`TRACK_ATTRIBUTE_NAME`).
6. **Duplicate + Delete + validation** — mirrors Tier 1 Event Configurator's own Phase 4
   precedent.
7. **Export** — the URL-encoding util, Copy Link action, the `decorate.js` auto-block
   builder, and the `sessions-guide.js` consumption-side change (§3a) — this is the
   general plumbing so *any* field reaches the page at all, distinct from the
   filters-specific rendering handoff item above.

**Preview isn't in this list at all** — v2 (§6).

**Phase 7 plumbing, implemented (2026-08-03, per Daniel — "Lets make that separate
work"):** `decorate.js`'s `prebuildAutoBlock` gained a `sessions-guide` builder —
decodes `?sgConfig=` via the shared `parseEncodedConfig()`, cross-checks
`config.eventId` against the page's `event-id` metadata (logs on mismatch, doesn't
block), and picks `sessions-guide` vs. `sessions-guide-full-page` block class from
`config.surface`. `utils/parse-config.js` was rewritten to read
`data-session-guide-config` instead of parsing an authoring table — no fallback to the
old table format, per the earlier "skip manual authoring altogether" decision (§3a).

Only `surface`/`theme`/`userTz`/`registerUrl` are actually consumed by the render tree
today. `eventId`, `headings`, `behaviorFlags`, `swimlaneOrder`, and
`authoredFilterCategories` (see naming-collision note below) are new fields carried
straight onto `guideConfig`, present but not read by anything yet. Full checklist for
wiring each one up: `MWPW-194336-CONSUMPTION-HANDOFF.md`.

**Naming-collision guard:** the incoming authored `filterCategories` shape
(`{attributeId, label, displayName, enabled}`, §7) does *not* overwrite `guideConfig.filterCategories`
— that key is left as `FilterPanel.js`'s existing legacy default
(`[{id: 'track', label: 'Channel'}, {id: 'type', label: 'Session Type'}]`), since
`FilterPanel.js` still indexes sessions directly by `id` and would silently render empty
option lists if handed ESP `attributeId`s instead. The new authored shape is carried
under `guideConfig.authoredFilterCategories` until the consuming-side handoff (item 1)
rewires `FilterPanel.js` to read from it (and at that point the legacy key/default can
be deleted outright, not kept as a fallback).

## 6. Explicitly out of scope / deferred

- Tier 2 support (§2, §4.1) — revisit only if actually requested later.
- Live Preview (§4.9) — v2.
- Draft/publish state (§4.11) — not doing draft states.
- Embed code snippet (§4.10) — dropped, copy-link only.
- Rainfocus connection (§4.2) — dropped entirely, ESP only.

## 7. Filters — field-level design (confirmed 2026-07-29, per Daniel)

**Scope split, decided explicitly:** the shared aggregation utility and the
configurator's own Filters step (select/unselect/rename/reorder) are real work for
*this* app's build (Phase 4, §5a) — not deferred. Only the *consuming* side —
sessions-guide's `FilterPanel.js` actually rendering filters built from this data — is
tracked as a separate handoff item, since that's a rework of existing block code, not
new configurator build.

**No per-value CRUD.** Filter *values* (e.g. "Design," "Video," "Photography" within a
"Track" category) are never authored — always derived live, matching the "just sorting
the filters, not the options within it" requirement. If per-value ordering is ever
requested later, that's one new optional field on the category object (e.g.
`valueOrder`), not a restructure.

**Real ESP contract, verified against the `events-service-platform` repo's actual route
code and `tier-1-event-configurator/ESP-SESSION-ENDPOINTS.md`'s existing findings:** every
session's resolved `customAttributes[]` already carries `attributeId`, `name`, `label`,
`inputType`, `enabled`, and `values: [{ valueId, label, value, ordinal }]` — the same
data `/session-facets` returns, just at the session level. Free-text attributes have no
`valueId` and are never facetable. On a real sample event, only 14 of 28 raw custom
attributes were actually facetable (`enabled !== false` + `single-select`/
`multi-select` + has a `valueId`) — the rest are internal/technical fields (`MPC ID`,
`SkinID`, SEO fields, etc.) that shouldn't be shown as filter candidates at all.

**Decided: derive from the already-fetched session catalog, skip the dedicated
`/session-facets` call entirely.** Both consumers (the configurator's Phase 2 event-
linkage fetch, and the sessions-guide block's own render-time fetch) already have the
full session catalog in memory for other reasons, so a separate facets call would be a
genuinely unnecessary round-trip with no fidelity gain — label, ordinal, and the
enabled-attribute gate are already present per-session via the same
`resolveCustomAttributes()` logic ESP's own facets endpoint reads from.

**New shared utility** (one function, imported by both this app and sessions-guide —
not duplicated, per the `TRACK_ATTRIBUTE_NAME` lesson in §5a):
```js
// Derives facetable custom attributes + their distinct values from an already-fetched
// session catalog. Mirrors the same enabled/inputType/valueId gate ESP's own
// /session-facets applies server-side, so results match it field-for-field, without
// the extra network round-trip.
export function deriveFacetableAttributes(sessions) {
  const attributeMap = new Map(); // attributeId -> { attributeId, label, values: Map<valueId, {...}> }
  for (const session of sessions) {
    for (const attr of session.customAttributes || []) {
      if (attr.enabled === false) continue;
      if (!['single-select', 'multi-select'].includes(attr.inputType)) continue;
      if (!attributeMap.has(attr.attributeId)) {
        attributeMap.set(attr.attributeId, { attributeId: attr.attributeId, label: attr.label, values: new Map() });
      }
      const group = attributeMap.get(attr.attributeId);
      for (const v of attr.values || []) {
        if (!v.valueId) continue; // free-text values aren't indexable
        if (!group.values.has(v.valueId)) {
          group.values.set(v.valueId, { valueId: v.valueId, label: v.label, ordinal: v.ordinal, count: 0 });
        }
        group.values.get(v.valueId).count += 1;
      }
    }
  }
  return [...attributeMap.values()].map((g) => ({
    attributeId: g.attributeId,
    label: g.label,
    values: [...g.values.values()].sort((a, b) => a.ordinal - b.ordinal),
  }));
}
```

**Configurator's Filters step (Phase 4):** runs this over the session list already
fetched in Phase 2, shows every result as a pre-enabled candidate (the "starting
point"), lets the author unselect / set a **display name** (defaulting to `label`,
author-editable) / reorder. Saves only the decisions —
`filterCategories: [{ attributeId, label, displayName, enabled, order }]` (§5, `label`
added 2026-08-04 so the editor UI can always show the original name next to the
editable one) — no values, no counts; those are never persisted, only ever derived
live. Same rename + "show the original alongside it" treatment was extended to
`swimlaneOrder` the same day, so both editors behave consistently (§5a).

**Consuming side (tracked in `MWPW-194336-CONSUMPTION-HANDOFF.md` item 1):** the sessions-guide block already fetches the
full session catalog to render itself. It would run the *same*
`deriveFacetableAttributes()`, filter/order the result through the config's saved
`filterCategories`, substitute `displayName` for `label`, and render the panel — same
function, same data, no extra call, on both sides. `FilterPanel.js`/
`utils/parse-config.js`'s current mechanism (authored `[{id, label}]` + live-scanning
loaded sessions by property name) gets replaced by this, not extended.

**Also unblocked by this same investigation:** confirmed `attributeId` is stable and
distinct from `name`/`label` on the real ESP contract — meaning keying
`filterCategories` by `attributeId` (not name) makes this mechanism naturally immune to
the upcoming MAX 2026 rename of "Primary Track for Agenda," the same way the
`TRACK_ATTRIBUTE_NAME` fix (§4.6) protects the swimlane/track-icon code that's
necessarily still name-keyed (ESP's raw attribute lookup has no ID-based path there
today). Worth this filters mechanism being ID-keyed from the start rather than
retrofitted later.

- **`TRACK_ATTRIBUTE_NAME` consolidation** — done 2026-07-28 (§4.6). Not itself
  build-work for this app, but directly unblocks the upcoming MAX 2026 custom-attribute
  rename with a one-line change instead of a repo-wide hunt.

## 8. Open questions / not yet designed

- The actual promotion of shared components (§5a) into a common location both apps
  import from — the decision is made, the concrete target location isn't picked yet.
- The sessions-guide consuming-side handoff itself — data shapes and aggregation logic
  are fully specified, but none of `FilterPanel.js`/`DrawerHeader.js`/`OnDemandView.js`/
  the behavior-flag gating points are scheduled or designed as their own piece of work
  yet. Full checklist: `MWPW-194336-CONSUMPTION-HANDOFF.md`.
