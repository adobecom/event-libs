# Tier 1 Event Configurator

DA-hosted authoring app for Tier 1 (MAX/Summit-scale) event config: primary Digital
Agenda track icons/colors, allow-double-booking, and featured sessions — one
config per Event ID, authored once and pasted by hand into that event's page
metadata (`tier-1-event-config`).

See [PLAN.md](./PLAN.md) for the full design, decisions, and phase breakdown
([MWPW-201380](https://jira.corp.adobe.com/browse/MWPW-201380)).

## Status

Phases 1a–1d are implemented: DA SDK auth, config-library sheet CRUD, the
library list view (search/Edit/Duplicate/Delete/Copy config), and the ESP
event picker + session fetch. Phase 1e (track icon/color editor), Phase 2
(allow-double-booking), and Phase 3 (featured sessions) are still open —
their sections in the editor currently show a "coming soon" placeholder.

**Known interim gap:** the track list shown in the editor comes from a raw
`getEventSessionCatalog()` call in `event-libs/v1/utils/esp-controller.js`,
not from `sessions-api.js`'s `fetchSessions()` — that function is still
mock-only on `dev` as of this writing (its real ESP-backed rewrite lives on
the in-progress MWPW-200314 branch). Once that rewrite merges to `dev`,
`getEventSessionCatalog()`/`extractDistinctTracks()` here should be replaced
by importing the shared `fetchSessions(eventId)` instead of hitting ESP
directly a second time.

**ESP auth — blocking, unresolved:** ESP's API Gateway requires a real IMS
Bearer token on `/v1/events` and `/v1/events/:id/session-catalog` (the
route code itself has no auth check, but the gateway in front of it does).
This app has no Milo bootstrap, so it currently reuses DA's own token
(`esp-controller.js`'s `setEspAuthToken()`, wired from `DAContext.js`) as a
best-effort `Authorization` header. **Confirmed by live testing this fails**
with `401 ErrInvalidOauthToken` — DA's token is a real IMS token, just
scoped to DA's own `client_id`, which ESP's gateway doesn't accept.

An alternative was tried and reverted: bootstrapping this app's own IMS
session client-side via `client_id: 'events-milo'` (the same client real
production event-libs pages use successfully against ESP), mirroring
Milo/DA's own `imslib.min.js` mechanism. Live-tested from both `localhost`
(via `?ref=local`) and a real deployed `*.aem.live` branch — **identical
CORS rejection from IMS itself in both cases**, ruling out an origin
allow-list problem. The common factor across every failed attempt: this
app always runs inside an iframe (DA embeds it), while every known-working
use of `events-milo` is a top-level page navigation. Working theory: IMS
rejects the session check when framed, independent of origin (a common
anti-clickjacking restriction) — DA's own IMS client is presumably
configured to permit iframe embedding; `events-milo` almost certainly
isn't. This needs a properly-configured IMS client for iframe-embedded
apps (existing or newly registered), not a client-side code fix.

**Current state:** reverted to DA-token reuse rather than the `events-milo`
bootstrap, since it at least sidesteps the iframe/CORS problem (no extra
IMS network call — it just forwards the token DA's own handshake already
provided) and its failure mode (gateway rejects the token outright) is more
tractable than fighting IMS's iframe restrictions client-side. **The ESP
event picker (Phase 1d) still cannot fetch real events** until either
ESP's gateway is configured to accept a DA-issued token, or a suitable IMS
client is found/registered for this iframe-embedded context. See PLAN.md
§5 for the full writeup.

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
