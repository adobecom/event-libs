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

## 4. Scope decisions from the section-by-section AC review (2026-07-28, per Daniel)

Numbered to match the original ticket's AC sections, so anyone cross-checking back
against MWPW-194336 can follow along.

1. **Entry Point & Landing Page.** No Tier 1/Tier 2 dual-CTA — Tier 2 is out of scope
   entirely (see §2), so this is a single creation flow. Searchable "Saved
   configurations" grid stays, same shape as Tier 1 Event Configurator's library.
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
5. **Filters.** Category CRUD (rename/remove/reorder) and tag-level editing stay in
   scope, but need a real rework sourced from ESP's full filter/custom-attribute data
   instead of today's live-scan-from-loaded-sessions approach. **Tracked as a separate
   handoff item** (§7) — sessions-guide's own filter mechanism needs updating
   before/alongside this configurator step.
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

## 5. Data model (early sketch — needs a real pass before implementation)

- Keyed by the row's own config ID (**not** `eventId` — an event can have multiple
  configs, see §2), in the sheet at
  `/tools/da-apps/session-guide-configurator/configs.json`. `eventId` is a reference
  field on each row, same as `backendEventTitle` is on Tier 1's rows.
- Fields, tentatively: `componentName` (author-set, distinguishes multiple configs for
  the same event), `surface`/page mode, `theme`, 4 heading strings, behavior flags
  (`enableScheduling`, `enableFavoriting`, `enableWatchNowCtas`,
  `enableBrandConciergeRibbon`), `filterCategories` (reworked per §4.5), swimlane order.
- **Not** part of this config: `allowDoubleBooking` and `featuredSessions` — read from
  the linked event's Tier 1 config at consumption time instead (see §2).
- Exact JSON shape and URL-encoding format still need real design work — follow
  Schedule Maker's `ScheduleURLUtility` (base64 JSON in a query/hash param) as
  precedent, per §3.

## 6. Explicitly out of scope / deferred

- Tier 2 support (§2, §4.1) — revisit only if actually requested later.
- Live Preview (§4.9) — v2.
- Draft/publish state (§4.11) — not doing draft states.
- Embed code snippet (§4.10) — dropped, copy-link only.
- Rainfocus connection (§4.2) — dropped entirely, ESP only.

## 7. Related follow-up work (not part of this app's own build)

- **Sessions-guide's filter mechanism** (`FilterPanel.js`/`utils/parse-config.js`) needs
  a rework to source real per-category tag data from ESP, instead of live-scanning
  whatever sessions happen to already be loaded. Needed before or alongside this
  configurator's Filters step (§4.5) can actually work end-to-end.
- **`TRACK_ATTRIBUTE_NAME` consolidation** — done 2026-07-28 (§4.6). Not itself
  build-work for this app, but directly unblocks the upcoming MAX 2026 custom-attribute
  rename with a one-line change instead of a repo-wide hunt.

## 8. Open questions / not yet designed

- Exact data model / JSON schema for the saved config (§5 is a sketch, not a spec).
- Exact URL-encoding scheme and the `decorate.js` auto-block builder implementation
  (§3's pattern is confirmed; the concrete code isn't written yet).
- App component tree / build-phase breakdown — not yet planned. Likely worth mirroring
  Tier 1 Event Configurator's phased approach once this is ready to build.
- The Filters ESP rework's own design (§7) — tracked here as a dependency, not detailed.
