# Tier 1 Event Configurator

DA-hosted authoring app for Tier 1 (MAX/Summit-scale) event config: primary Digital
Agenda track icons/colors, allow-double-booking, and featured sessions — one
config per Event ID, authored once and pasted by hand into that event's page
metadata (`tier-1-event-config`).

See [PLAN.md](./PLAN.md) for the full design, decisions, and phase breakdown
([MWPW-201380](https://jira.corp.adobe.com/browse/MWPW-201380)).

## Status

Phases 1a–1e and Phase 2 are implemented: DA SDK auth, config-library sheet
CRUD, the library list view (search/Edit/Duplicate/Delete/Copy config), the
ESP event picker + session fetch (currently gated off in favor of a manual
Event ID entry fallback — see the CORS status below), the track icon/color
editor, and the allow-double-booking toggle. Phase 3 (featured sessions) is
still open — its section in the editor currently shows a "coming soon"
placeholder.

**Phase 2 scope note:** this app only adds the `allowDoubleBooking` boolean
to the form/Config JSON. The consuming-side wiring (renaming
`track-icon-config.js` to a broader singleton, wiring `scheduleAction`'s
`showConflictModal` param, retiring sessions-guide's per-block
`show-conflict-modal` table row) is explicitly MWPW-200314's territory, per
PLAN.md §6 — not built here.

**Track icon editor implementation note:** `event-libs/v1/utils/track-icon-config.js`
(the real `DEFAULT_TRACK_ICON_CONFIG`/`getTrackIcon()`) and
`event-libs/v1/features/icons/` (`Icon.js`/`icon-resolver.js`/`track-icons.svg`)
don't exist on `dev` — like `fetchSessions()`, they're part of the
in-progress MWPW-200314 branch. `default-track-icons.js` and
`track-icon-sprite.js` here are temporary, self-contained copies of that
data/sprite (not the shared utility itself, to avoid duplicating the actual
resolution logic) — consolidate back onto the real ones once that branch
merges. Also note: Chrome doesn't support cross-document
`<use href="external.svg#id">` (only Firefox does) — `track-icon-sprite.js`
fetches and inlines the sprite's `<symbol>` markup instead, same technique
the real `icon-resolver.js` uses, for the same reason.

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

**Auth: a real bug found and fixed 2026-07-24 — non-prod ESP tiers reject DA's token outright, even on routes that don't require auth.** DA only ever authenticates against **prod** IMS, but `constructRequestOptions()` was unconditionally attaching that token to every ESP call. Dev's gateway validates any token that's present, doesn't recognize a prod-issued one, and rejects it as `ErrInvalidOauthToken` (invalid, not missing) — breaking `getEspEvent()`/`getEventSessionCatalog()`, both of which are genuinely public routes that would've succeeded fine with *no* token at all. Fixed by adding an `includeAuth` flag to `constructRequestOptions()` (default `true`) and setting it `false` for those two calls specifically. `listEvents()`/`listAllEvents()` are unaffected by this fix — that route genuinely requires a valid token (confirmed: no token produces a different error, `ErrMissingOauthToken`), so it has no client-side workaround for Dev-tier testing; it's expected to work once running for real against prod.

See PLAN.md §5 for the full investigation trail and sourcing.

**Manual Event ID entry (active fallback) vs. the full catalog picker (built, but disabled by default).** New Config/Duplicate currently use `ManualEventLookup.js` (author types a known Event ID, `getEspEvent()` looks it up for real) rather than `EventPicker.js`'s full browse/search UI, gated by `constants.js`'s `EVENT_BROWSE_ENABLED = false`. `EventPicker`/`listEvents`/`listAllEvents` are kept fully intact, not deleted — flipping that flag re-enables the full picker.

**The fallback is now automatic, not just a static flag (2026-07-24).** Even with `EVENT_BROWSE_ENABLED` set to `true`, if `EventPicker`'s `listAllEvents()` call fails at runtime for any reason, it fires an `onError` callback; `Library.js` catches it and swaps to `ManualEventLookup` for the rest of the page session (sticky per load, not per open, to avoid a doomed re-attempt on every click). This is the app's permanent safety net for any full-picker failure, not just a pre-CORS-fix stopgap.

## Architecture

Same shape as the [Schedule Maker](../schedule-maker/README.md) precedent:
Preact + HTM + Spectrum Web Components, no build step, DA SDK auth via
`context/DAContext.js` (ported unchanged).

- `tier-1-event-configurator.js` — entry point; loads Spectrum components, mounts the app.
- `TierOneEventConfigurator.js` — root shell (loading/error/toast states, page routing).
- `context/DAContext.js` — DA SDK auth (org/repo/token).
- `context/NavigationContext.js` — library ↔ editor page state.
- `context/ConfigsContext.js` — config-library list state, CRUD actions, toasts.
- `scripts/da-controller.js` — `readSheet`/`writeSheet`/`mutateSheet` (ETag optimistic
  locking, ported from Schedule Maker's pre-link-first-pivot implementation) plus
  `getConfigs`/`upsertConfig`/`deleteConfig` on top.
- `pages/Library.js` — searchable list of every authored config; New/Edit/Duplicate/
  Delete/Copy config actions.
- `pages/ConfigEditor.js` — per-event editor; fetches that event's session catalog on
  open, shows the resulting `Config` JSON and a copy-to-clipboard action.
- `components/EventPicker.js` — ESP event picker (search + published/draft filter),
  used by both New config and Duplicate.
- `components/Modal.js`, `components/SearchInput.js` — generic, ported from Schedule Maker.

## Data model

One shared DA sheet per content-repo at
`/tools/da-apps/tier-1-event-configurator/configs.json`, one row per Event ID:

```json
{
  "eventId": "...",
  "eventTitle": "...",
  "config": {
    "eventId": "...",
    "eventTitle": "...",
    "updated": "2026-07-22T21:30:00.000Z",
    "trackIcons": { "Track Name": { "icon": "icon-slug", "color": "#RRGGBB" } },
    "allowDoubleBooking": true,
    "featuredSessions": ["sessionId1", "sessionId2"]
  },
  "updated": "2026-07-22T21:30:00.000Z"
}
```

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

### Switching ESP env locally

`?espenv=`/`?eccEnv=` query params **don't work** through the DA-proxied
route above — DA's SDK only forwards `context.ref` through the iframe
handshake, so a query param on the parent `da.live/app/...` URL never
reaches this app (same limitation Schedule Maker documents for
`?milolibs=`). Instead, uncomment and edit the `event-service-env` `<meta>`
tag already present in
[tools/da-apps/tier-1-event-configurator.html](../tools/da-apps/tier-1-event-configurator.html):

```html
<meta name="event-service-env" content="stage" />
```

`getEventServiceEnv()` (`event-libs/v1/utils/utils.js`) reads this tag
directly from the iframe's own `document.head`, independent of the parent
page — verified locally: with `content="stage"` set, `listEvents()`'s
fetch resolved to `events-service-platform-stage.adobe.io` instead of the
`prod` default. Valid values are the `ENV_MAP` keys in
`event-libs/v1/utils/constances.js`: `dev`, `dev02`, `stage`, `stage02`,
`prod`, `local`.
