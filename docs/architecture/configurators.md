# Configurators: event-wide versus component configuration

The **Event Configurator** is one DA-hosted tool with two tabs, not two unrelated
production tools:

```text
https://da.live/app/{org}/{repo}/tools/da-apps/tier-1-event-configurator
  Event Config         -> event-libs/tier-1-event-configurator/
  Session Guide Config -> event-libs/session-guide-configurator/
```

[TierOneEventConfigurator.js](../../event-libs/tier-1-event-configurator/TierOneEventConfigurator.js)
mounts the guide app with its own DA, environment, navigation, and config providers.
The local HTML entry loads both apps' styles. Use `npm run da-apps` with the
consolidated tool URL and `?ref=local`; do not invent a separate production
session-guide-configurator route just because that source folder exists.
These apps use vendored Preact/HTM and DA SDK authentication, not event-page block
loading. DA's `{ org, repo }` context scopes their libraries to the content repo.

## Persistence and shared infrastructure

Unlike [Schedule Maker's link-only model](schedule-maker.md), both configurators
save reusable library rows to DA JSON sheets:

| Configurator | Library path in the content repo | Identity/storage |
| --- | --- | --- |
| Tier 1 | `/tools/da-apps/tier-1-event-configurator/configs.json` | Global rows in named sheet `data`; Upcoming/Featured rows in `homepage`. Rows use unique `configId`, allowing multiple configs for one event. |
| Session Guide | `/tools/da-apps/session-guide-configurator/configs.json` | Rows keyed by `configId`, with a required `componentName` for saving; multiple widget/page configs can target one event. |

Their controllers reuse
[da-sheet-controller.js](../../event-libs/v1/utils/da-sheet-controller.js) for
authenticated read-modify-write operations. ETags/conditional writes and bounded
conflict retries protect concurrent edits. Tier 1 writes preserve the other named
sheet; pass the known sheet names when extending this multi-sheet contract.
Tier 1 library reads can also persist repairs for missing/duplicate config IDs,
so they are not necessarily read-only.

`eventServiceEnv` is authoring context stored on a library row, restored before
catalog requests; it is not a live-page environment override in the copied Global
JSON. Both apps have ESP browse/manual lookup paths (`EVENT_BROWSE_ENABLED = true`
in their constants), with manual fallback after browse failure. The guide's
default event picker first lists existing **Global Tier 1 configs** and can switch
to those alternative paths. Choosing that row supplies event identity/environment;
it does not automatically publish its Global JSON onto the event page.

## Tier 1 Event Config: Global output

Global configs define event-wide policy and mappings, consumed from the page's
`tier-1-event-config` metadata. Important fields are:

| Fields | Runtime role |
| --- | --- |
| `eventId`, `backendEventTitle`, `eventTitle` | Event identity/backend title plus optional author display title. Save stamps identity and update time; `configName` labels the library variant. |
| `eventStartDateTime`, `eventEndDateTime` | Event-wide epoch-ms boundaries, independent of individual session times. The authoring datetime picker uses America/Los_Angeles; the epoch field supports other events directly. |
| `trackIcons`, `overrideTrackIcons.byText` | Track/override-label icon and color mappings read by `getTrackIcon()`/`getOverrideTrackIcon()`. Unmapped entries have no icon; the shared fallback color is `#000000`. |
| `products` | Exact product-name mappings to `{ icon, pageUrl }`, consumed by product surfaces. |
| `allowDoubleBooking` | Event-wide overlap policy, default false. `toggleScheduleWithFeedback()` passes `showConflictModal: !getAllowDoubleBooking()`; this is not a guide-local behavior flag. |
| `rfApiUrl`, `rfProfileId`, `registerUrl` | Shared attendee API and registration-action settings read by `session-store.js`. |
| `homepagePath`, `broadcastPath` | Event-specific watch destinations read through the Tier 1 singleton/routing helpers. |

The editor discovers tracks, override labels, products, and sessions from
`getEventSessionCatalog()` and shared `sessions-api.js` extraction helpers.
Duplicate resets event-specific API settings, dates, and destinations rather than
blindly copying another event's attendee configuration.

**Copy config exports minified JSON**, not the whole sheet row. Paste it into a
single `tier-1-event-config` metadata value and publish each consuming page.
Pretty-printed multi-line JSON can be corrupted by DA's metadata-cell joining.
Saving the library alone does not alter page metadata.

[tier-1-event-config.js](../../event-libs/v1/utils/tier-1-event-config.js) provides
the page-level singleton; `decorateEvent()` initializes it and `session-store.js`
ahead of blocks when metadata is present. Blocks also call the idempotent
initializers where needed. These consumers are already wired in current code,
despite older README/handoff text calling the consuming-side work still open.
Event-ID mismatch warnings are authoring diagnostics, not validation that blocks
execution: keep copied Global and component configs matched to the page's event.

## Tier 1 Event Config: Homepage outputs

The Event Config tab also authors `homepage-upcoming-sessions` and
`homepage-featured-sessions` configs. Their selected session IDs and per-session
metadata live in `upcomingSessions`/`upcomingSessionsMeta` or
`homepageFeaturedSessions`/`homepageFeaturedSessionsMeta`, respectively.
These are **not** the Session Guide's Recommended Sessions settings.

Copy Link resolves selected catalog records into entries containing session
identity/title/URL, track data, matching session times, and authored overrides
such as `mrStreamId` or image/watch destination. It exports a UTF-8/base64
`#tecHomepage=` payload with `eventId`, `configType`, `entries`, generation time,
and optional heading/CTA labels. Paste that anchor into the page body:
`processAutoBlockLinks()` creates the corresponding C2 block and its
`data-upcoming-sessions-config` or `data-featured-sessions-config`.
Do not paste these entries into the Global metadata or rely on a section-metadata
JSON workflow described in the older README.

Those links are page-content snapshots, not live sheet references; library edits
require copying/replacing/publishing a new link. The current Homepage editor
reopens links by the first matching `eventId` + `configType`, not an exact
`configId`, so a link does not uniquely select among multiple same-type rows.

## Session Guide Config: component output

The guide editor configures presentation and capabilities for one guide instance:

- `surface`: `widget` or `page`; `theme`: `dark` or `light`. New configs start
  widget/dark. Runtime omission defaults to widget/dark or page/light.
- `headings`: logged-in/out copy, with separate post-event variants.
- `behaviorFlags`: `enableScheduling`, `enableFavoriting`, and
  `enableWatchNowCtas`. All default enabled; only boolean `false` disables a
  capability in `isBehaviorEnabled()`. They control UI, not authorization.
- `filterCategories`: ordered `{ attributeId, label, displayName, enabled }`
  entries discovered from facetable catalog attributes. Runtime removes disabled
  entries and derives URL-filter slugs, disambiguating collisions.
- `swimlaneOrder`: ordered `{ track, displayName, enabled }` entries seeded from
  primary tracks and override-lane labels.
- `recommendedSessions`: curated session IDs/order, used by the guide's
  Live/Recommended and on-demand views, not Homepage featured cards.

Save writes the library; Copy Link can also export the current unsaved edits.
[utils.js](../../event-libs/session-guide-configurator/utils.js) builds the
consolidated app's `#sgConfig=` URL from config plus editor identity/context fields.
`processAutoBlockLinks()` decodes it into `data-session-guide-config`, selecting
`sessions-guide-full-page` when `surface` is `page`.
[parse-config.js](../../event-libs/v1/c2/blocks/sessions-guide/utils/parse-config.js)
whitelists runtime fields; editor-only fields do not configure the block.
The dedicated full-page initializer forces page mode.

Reopening a guide link accepts hash or legacy query payloads, waits for the
library, and prefers its saved row with the same `configId` over stale link
content. If no row exists, it rebuilds an editable row from the payload.
The **published page**, however, renders the payload pasted into its document,
not the current saved row. Replace/publish links after changing a saved config.

Guide-local Context owns drawer/view/filter state, while catalog, authentication,
favorites, and attendee schedule come from [shared session state](session-state.md).
A guide link's `eventId` is not a substitute for matching Global
`tier-1-event-config` needed to bootstrap that store. Preserve both producer and
consumer contracts when adding a setting: configurator defaults/editor,
serialization, auto-block attribute, runtime parser, and actual UI/service
consumer. A field in a link is not necessarily implemented at runtime.

See [testing](testing.md) for configurator checks and the existing
[Session Guide implementation notes](../sessions-guide-implementation-notes.md)
for additional component detail.
