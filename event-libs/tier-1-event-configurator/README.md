# Tier 1 Event Configurator

DA-hosted authoring app for Tier 1 (MAX/Summit-scale) event config: primary Digital
Agenda track icons/colors, allow-double-booking, and featured sessions — one
config per Event ID, authored once and pasted by hand into that event's page
metadata (`tier-1-event-config`).

See [PLAN.md](./PLAN.md) for the full design, decisions, and phase breakdown
([MWPW-201380](https://jira.corp.adobe.com/browse/MWPW-201380)). See
[MWPW-200314-HANDOFF.md](./MWPW-200314-HANDOFF.md) for the consolidated
consuming-side task list this app's output requires — separate ticket,
separate branch.

## Status

Phases 1a–1e, Phase 2, Phase 3 (app side), and Phase 4 are all implemented:
DA SDK auth, config-library sheet CRUD, the library list view (search/Edit/
Duplicate/Delete/Copy config, with an Event ID collision guard routing to
Edit instead of duplicating a row), the ESP event picker + session fetch
(the default flow again as of 2026-07-24 — see the CORS status below for
why, and the automatic fallback to manual entry if it fails), the track
icon/color editor (with save-blocking
validation — a track can't be saved with only an icon or only a color set),
and the allow-double-booking toggle. All consuming-side wiring (MWPW-200314,
separate branch/PR) is still open — see
[MWPW-200314-HANDOFF.md](./MWPW-200314-HANDOFF.md) for the consolidated task
list.

**No Global-level featured/recommended-sessions picker.** That concept moved
to session-guide-configurator's own "Recommended Sessions" — Session Guide's
carousel is its own app's concern, not this event-wide config's. `FeaturedSessionsEditor.js`
(the picker/reorder component) still exists in this app, but only for the
Homepage config types below.

**Phase 2 scope note:** this app only adds the `allowDoubleBooking` boolean
to the form/Config JSON. The consuming-side wiring (renaming
`track-icon-config.js` to a broader singleton, wiring `toggleScheduleAction`'s
`showConflictModal` param, retiring sessions-guide's per-block
`show-conflict-modal` table row) is explicitly MWPW-200314's territory, per
PLAN.md §6 — not built here.

**Track icon editor implementation note:** no built-in default icon/color map —
authors pick both explicitly for every track (`default-track-icons.js` re-exports
`DEFAULT_ICON_COLOR`, the one universal fallback color, from the real
`event-libs/v1/utils/tier-1-event-config.js` rather than carrying its own copy).
`IconPicker.js` (a searchable combobox, since a native `<select>` can't render
an icon + name per option) renders each option through the real, shared
`event-libs/v1/features/icons/Icon.js`/`icon-resolver.js` — the same
federal-CDN-first, then-Milo-as-backup chain session-guide's live badges use
(no other fallback — an icon in neither source doesn't render) — so the
picker and the live page never drift. Its option list itself comes from
`useIconSlugOptions()` (`IconPicker.js`), sourced entirely from federal's live
`icons.json` inventory, so newly-uploaded federal icons appear with no code change.

**Known interim gap:** the track list shown in the editor comes from a raw
`getEventSessionCatalog()` call in `event-libs/v1/utils/esp-controller.js`,
not from `sessions-api.js`'s `fetchSessions()` — that function is still
mock-only on `dev` as of this writing (its real ESP-backed rewrite lives on
the in-progress MWPW-200314 branch). Once that rewrite merges to `dev`,
`getEventSessionCatalog()`/`extractDistinctTracks()` here should be replaced
by importing the shared `fetchSessions(eventId)` instead of hitting ESP
directly a second time.

**ESP auth is confirmed working — the CORS gap is now closed on Dev, and a separate token/environment issue is fixed too.** `setEspAuthToken()` (wired from `DAContext.js`, reusing DA's own token) is proven correct against prod: a `curl` replaying the app's exact request, including its `Authorization` header, against **prod** ESP returned real data.

**CORS: resolved 2026-07-24.** [MWPW-201634](https://jira.corp.adobe.com/browse/MWPW-201634) (superseding the earlier [MWPW-200897](https://jira.corp.adobe.com/browse/MWPW-200897) ask) merged `events-service-platform-deploy@52b2631`, whitelisting this branch's exact da-events origin on Dev. Verified live by temporarily flipping `EVENT_BROWSE_ENABLED` to `true` and testing via the real DA preview — the request reached the server (a real `401`, not a CORS error), confirming the whitelist works. Prod already whitelists `main--da-events--adobecom.aem.page`/`.live` (pre-existing), so once this app's `da-events` loader (PR #41) is on `main`, CORS should already work there too with no further platform-team action.

**Auth: a real bug found and fixed 2026-07-24 — non-prod ESP tiers reject DA's token outright, even on routes that don't require auth.** DA only ever authenticates against **prod** IMS, but `constructRequestOptions()` was unconditionally attaching that token to every ESP call. Dev's gateway validates any token that's present, doesn't recognize a prod-issued one, and rejects it as `ErrInvalidOauthToken` (invalid, not missing) — breaking `getEspEvent()`/`getEventSessionCatalog()`, both of which are genuinely public routes that would've succeeded fine with *no* token at all. Fixed by adding a `skipAuth` flag to `constructRequestOptions()` (default `false`) and setting it `true` for those two calls specifically. `listEvents()`/`listAllEvents()` are unaffected by this fix — that route genuinely requires a valid token (confirmed: no token produces a different error, `ErrMissingOauthToken`), so it has no client-side workaround for Dev-tier testing; it's expected to work once running for real against prod.

See PLAN.md §5 for the full investigation trail and sourcing.

**Full catalog picker is the default flow again (2026-07-24, per Daniel), with manual entry as the automatic fallback.** New Config/Duplicate use `EventPicker.js` (browse/search the full ESP catalog, `constants.js`'s `EVENT_BROWSE_ENABLED = true`) by default. If `listAllEvents()` fails at runtime for any reason — CORS, an env-specific auth issue (see below), a real outage — `EventPicker` fires an `onError` callback; `Library.js` catches it and swaps to `ManualEventLookup.js` (manual Event ID entry, `getEspEvent()`, plus its own environment picker) for the rest of the page session, sticky per load rather than per open so a persistent failure doesn't force a doomed re-attempt on every click. `EventPicker`/`ManualEventLookup` are both kept fully intact either way — flipping `EVENT_BROWSE_ENABLED` back to `false` disables browse outright if ever needed, but the fallback already handles ordinary runtime failures without that.

## Architecture

Same shape as the [Schedule Maker](../schedule-maker/README.md) precedent:
Preact + HTM, no build step (no Spectrum Web Components — see PLAN.md's
app-shape section for why), DA SDK auth via `context/DAContext.js` (ported
unchanged).

- `tier-1-event-configurator.js` — entry point; mounts the app.
- `TierOneEventConfigurator.js` — root shell (loading/error/toast states, page routing).
- `context/DAContext.js` — DA SDK auth (org/repo/token).
- `context/NavigationContext.js` — library ↔ editor page state.
- `context/ConfigsContext.js` — config-library list state, CRUD actions, toasts.
- `context/EventEnvContext.js` — reactive wrapper around
  `setEventServiceEnvOverride()`; backs `ManualEventLookup.js`'s environment
  picker and the app-wide non-prod banner.
- `scripts/da-controller.js` — `readSheet`/`writeSheet`/`mutateSheet` (ETag optimistic
  locking, ported from Schedule Maker's pre-link-first-pivot implementation) plus
  `getConfigs`/`upsertConfig`/`deleteConfig` on top.
- `pages/Library.js` — searchable list of every authored config; New/Edit/Duplicate/
  Delete/Copy config actions.
- `pages/ConfigEditor.js` — per-event editor; fetches that event's session catalog on
  open, shows the resulting `Config` JSON and a copy-to-clipboard action.
- `components/EventPicker.js` — ESP event picker (search + published/draft filter),
  the default flow for New config and Duplicate; fails over to
  `ManualEventLookup` via an `onError` callback if `listAllEvents()` fails
  at runtime (see the CORS status below).
- `components/ManualEventLookup.js` — manual Event ID entry + lookup, with
  its own environment picker; the automatic fallback above, and how you'd
  target a non-prod tier for testing.
- `components/TrackIconEditor.js` — per-track icon/color pickers.
- `components/ProductIconEditor.js` — per-product icon picker (no color — products
  already have their own colored SVGs) plus a product page URL field.
- `components/IconPicker.js` — the shared searchable icon combobox TrackIconEditor and
  OverrideTrackIconEditor render per row (a native `<select>` can't show an icon + name
  per option); also hosts `useIconSlugOptions()`, sourced entirely from federal's live
  `icons.json` inventory.
- `components/FeaturedSessionsEditor.js` — session picker: search + track filter
  over the already-fetched session catalog, add/remove, ↑/↓ reorder into a flat
  ordered array. Homepage config types only — see "Data model" below.
- `components/Modal.js`, `components/SearchInput.js` — generic, ported from Schedule Maker.

## Data model

One shared DA sheet per content-repo at
`/tools/da-apps/tier-1-event-configurator/configs.json`, one row per Event ID:

```json
{
  "eventId": "...",
  "backendEventTitle": "...",
  "eventServiceEnv": "dev",
  "config": {
    "eventId": "...",
    "backendEventTitle": "...",
    "eventTitle": "...",
    "updated": "2026-07-22T21:30:00.000Z",
    "trackIcons": { "Track Name": { "icon": "icon-slug", "color": "#RRGGBB" } },
    "products": { "Product Name": { "icon": "icon-slug", "pageUrl": "https://..." } },
    "allowDoubleBooking": true,
    "rfApiUrl": "https://www.adobe.com/max-api/",
    "rfProfileId": "..."
  },
  "updated": "2026-07-22T21:30:00.000Z"
}
```

**Two different kinds of title, added 2026-07-24 (per Daniel).** `backendEventTitle` is the real ESP/backend title (`event.enTitle`) — app-stamped at both the row and `config` level, exactly like `eventId`/`updated`, never author-editable. `config.eventTitle` is the opposite: an optional author-set alternative display name, authored only inside `config` (no row-level column), defaulting to blank. `getDisplayTitle(row)` (`utils.js`) resolves which one to actually show: the authored `eventTitle` if set, else `backendEventTitle`, else the raw Event ID — used everywhere a row's title is shown (library list, toasts, the editor header). Rows saved under the old single-`eventTitle` schema are migrated on read (`da-controller.js`'s `migrateLegacyTitle`), not rewritten in place — the old value becomes `backendEventTitle`, and the new `eventTitle` starts blank rather than inheriting it.

**`eventServiceEnv`, added 2026-07-24 (bug fix, per Daniel).** Row-level only — never stamped into `config`, since it's an authoring-time detail (which ESP tier this event's data came from), irrelevant to the live page that eventually reads `config`. Captured from the active environment picker selection when a row is created (`Library.js` reads it off `EventEnvContext`), and restored via `setEnv()` whenever that row is reopened for Edit. Fixes a real bug: without this, a full page reload reset the env override to its default (prod), so editing a Dev-authored row after a reload silently refetched its session catalog from Prod instead.

**`config.rfApiUrl`/`config.rfProfileId`, added for [MWPW-200311](https://jira.corp.adobe.com/browse/MWPW-200311).** Nested in `config` like `trackIcons`/`allowDoubleBooking` — one JSON payload, not extra metadata rows. `event-libs/v1/utils/session-store.js` reads both straight off the parsed `tier-1-event-config` metadata, falling back to `DEFAULT_RF_API_URL`/`DEFAULT_RF_PROFILE_ID` (`event-libs/v1/services/sessions/rainfocus.js`) when either is blank. Never carried over on Duplicate — reusing another event's RF profile id would misroute this event's live schedule/favorites calls.

**`config.overrideTrackIcons` is one field, not two.** Shape: `{ default: {icon,color} | null, byText: { "override text": {icon,color} } }` — `byText` maps a specific Override Primary Event Site Track text to its own icon/color, `default` is the event-wide fallback for any text not mapped there. `getOverrideTrackIcon()` (`v1/utils/tier-1-event-config.js`) checks `byText` first, then `default`. Previously two separate top-level fields (`overrideTrackIcon`/`overrideTrackIcons`); merged so there's nowhere for the two to drift apart, without using a reserved sentinel key inside the map (which could collide with real author-typed override text).

**`config.homepageFeaturedSessions`/`config.homepageFeaturedSessionsMeta` only exist on a Homepage-Featured-Sessions row** — feed the card-c2 Featured Sessions homepage block, and are never read from `tier-1-event-config` metadata directly, only copy-pasted out via "Copy Featured Sessions JSON" into that block's own section-metadata. There's no Global-level equivalent — Session Guide's own recommended-sessions carousel is authored in session-guide-configurator instead (see that app's README).

`config` is the exact value an author copies into their event page's own
`tier-1-event-config` metadata row — this app never touches the page itself.

## Loader

`tools/da-apps/tier-1-event-configurator.html` in `da-events` (separate PR)
mounts this app via ES module import, branch-driven by the DA SDK's
`context.ref` — same pattern as Schedule Maker's loader.

## Local development

DA proxies the app to `localhost:3000` when you append `?ref=local` to the
production tool URL — same pattern as Schedule Maker:

```
https://da.live/app/adobecom/da-events/tools/da-apps/tier-1-event-configurator?ref=local
```

Serve from the **inner repo root** (the directory that holds
`tier-1-event-configurator/`, `tools/`, and `v1/`):

```bash
cd event-libs   # the inner event-libs/ folder, not the git repo root
npx serve . --listen 3000
```

- DA requests `/tools/da-apps/tier-1-event-configurator` → `serve` returns
  [tools/da-apps/tier-1-event-configurator.html](../tools/da-apps/tier-1-event-configurator.html),
  the local-dev entry (root-relative asset paths, so it's independent of the
  request's trailing slash).
- This route gets a real DA SDK handshake (real `org`/`repo`/`token`), so
  it's the only way to test the sheet CRUD (readSheet/writeSheet/mutateSheet)
  against a real `admin.da.live` sheet — a mocked DA SDK can validate the UI
  wiring and real ESP calls, but not real DA auth/writes.
- Requires being signed in to da.live in the browser you open that URL in.

### Switching ESP env

`?espenv=`/`?eccEnv=` on the parent `da.live/app/...` URL **do** reach this app:
DA's shell (`da.live/nx/blocks/shell/shell.js`) appends both the parent's search
and hash to the iframe src, and `getEventServiceEnv()` reads `espenv`/`eccEnv`
off `window.location.search`. An earlier version of this section claimed the
opposite — that only `context.ref` crosses the handshake — which is wrong, and
may date from before the shell forwarded the search.

**Prefer the app's own environment picker anyway (2026-07-24, per Daniel) —**
it persists for the session and shows a loud banner whenever it isn't prod,
where a query param silently forces the same env with no visible indication.
Its home is `ManualEventLookup.js`'s **Environment** dropdown, next to the
Event ID field. Since `EventPicker` (the full browse/search catalog) is the
default flow for New config/Duplicate, reach it via the automatic
fallback — `EventPicker`'s `listAllEvents()` call needs to fail first
(e.g. testing against a non-prod tier where that call doesn't
authenticate, see the CORS/auth section below), which swaps the picker to
`ManualEventLookup` for the rest of the session. Backed by `setEventServiceEnvOverride()`
(`event-libs/v1/utils/utils.js`) — a module-level override
`getEventServiceEnv()` checks first, ahead of the query-param/meta-tag/prod
chain — this persists for the rest of the session (every later ESP call,
not just that one lookup), and the app shows a loud banner across the top
of every page any time it's not targeting prod, so there's no ambiguity
about which tier is live. Valid values are the `ENV_MAP` keys in
`event-libs/v1/utils/constances.js`: `prod`, `stage`, `stage02`, `dev`,
`dev02` (the picker excludes `local` — that's specifically for the
localhost-serving dev harness below, and targets the same endpoints as
`dev` anyway).

This supersedes hardcoding the `event-service-env` `<meta>` tag in
[tools/da-apps/tier-1-event-configurator.html](../tools/da-apps/tier-1-event-configurator.html)
— that tag forced the same env for everyone with no visible indication it
was active, and is now commented out by default. It's still supported as a
lower-priority fallback in `getEventServiceEnv()` for a scenario the in-app
picker can't reach (e.g. before the app itself has mounted), but shouldn't
be needed in normal use.
