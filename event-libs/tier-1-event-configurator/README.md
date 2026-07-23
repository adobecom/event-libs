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

**ESP auth — RESOLVED as a CORS gap, not an auth problem.** Early testing
suggested `/v1/events` needed real IMS auth that this app couldn't provide
(DA's own token got `401 ErrInvalidOauthToken`; a client-side IMS bootstrap
via `client_id: 'events-milo'` got CORS-rejected from inside DA's iframe).
Deeper investigation (internal CGW docs + the actual gateway route config)
overturned that: `allowedClientIDs` (CGW's client-id allow-list) only
applies to *service* tokens, never *user* tokens — so no client-id
mismatch was ever really in play. The decisive test: the same request that
failed with CORS in the browser **worked fine as a plain `curl`** — proof
the server-side request (with real auth) succeeds; the browser is just
being blocked from *reading* the response because ESP doesn't send
`Access-Control-Allow-Origin` for this route. **Auth already works. The
actual gap is CORS on `/v1/events` specifically** — likely because no
auth-requiring ESP route has ever been called directly from a browser
before (every existing browser call goes through ESL, or hits ESP's fully
public routes like `session-catalog`).

`esp-controller.js` still uses DA-token reuse (`setEspAuthToken()`, wired
from `DAContext.js`) for now — harmless to leave in place, since the token
itself is valid, real auth (confirmed via curl); it just needs the CORS
gap closed on ESP's side to start working end-to-end. **The ESP event
picker (Phase 1d) still cannot fetch real events from the browser** until
ESP's `/v1/events` route gets CORS enabled for this app's origin(s) — a
scoped ask to the ESP/platform team, not a client-side fix. See PLAN.md §5
for the full investigation trail.

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
