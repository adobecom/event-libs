# Working in event-libs

This repository delivers browser ES modules for Adobe event pages built with
AEM/Helix, Document Authoring (DA), and Milo. There is no bundler or build step.
The application source is inside the **inner** `event-libs/` directory; this
guide lives at the Git repository root.

Use the implementation as the source of truth. Some feature READMEs describe
older behavior; important differences are called out below.

## Commands and validation

Run commands from the Git repository root unless stated otherwise.

```sh
npm run event-libs    # AEM development server, port 3868
npm run da-apps       # Serve the inner event-libs directory, port 3000
npm test             # Web Test Runner, all unit tests with coverage, port 2000
npm run test:watch
npm run lint         # JavaScript and classic block/style CSS
npm run lint:fix
```

For a focused change, select the existing test files with WTR:

```sh
npx wtr test/unit/features/timing-framework/worker.test.js test/unit/schedule-maker/utils.test.js --node-resolve --port=2000
```

`npm run lint:css` does **not** include C2 CSS. Check changed C2 styles explicitly:

```sh
npx stylelint event-libs/v1/c2/blocks/<name>/<name>.css
```

Tests use Chai, Sinon, and HTML fixtures under `test/unit/`. Reset both body and
head between DOM tests. `web-test-runner.config.js` installs event/IMS mocks,
maps `events/scripts/` to `v1/utils/`, and flags external requests/scripts.
Mock network and player SDK interactions rather than contacting real services.
The harness substitutes a mock `htm-preact.js` by default; inspect its limitations
before treating a passing component test as proof of real hook/render behavior.
Documentation-only changes do not require the browser test suite.

## Architecture and loading

### C1 versus C2

C1 is the classic foundation and the default when page metadata is not exactly
`foundation: c2`. C2 is selected by the page's foundation metadata, **not** by a
block name, event type, or use of Preact.

| Foundation | Block source | Registration |
| --- | --- | --- |
| C1/default | `event-libs/v1/blocks/<name>/<name>.js` | `EVENT_BLOCKS` |
| C2 | `event-libs/v1/c2/blocks/<name>/<name>.js` | `EVENT_BLOCKS_C2` |

Both arrays live in [v1/libs.js](event-libs/v1/libs.js). Each currently registers
20 blocks. `chrono-box`, `grid-column`, and `mobile-rider` have separate
implementations in **both** foundations; the remaining names are foundation-specific.
Do not assume the C1 implementation is a fallback for a missing C2 block.

### Page entry and consumer integration

[scripts/scripts.js](event-libs/scripts/scripts.js) is the repository's page entry:

1. Resolve Milo through `LIBS` and read `foundation` metadata.
2. Pass the selected block array and base path to Milo's `setConfig()` through
   `externalLibs`. C1 uses `/event-libs/v1`; C2 uses `/event-libs/v1/c2`.
3. Call the local `decorateArea()` hook, which adds event styles and prioritizes
   an eager image. This hook is **not** the fuller `decorateEvent()` routine.
4. Load Milo's matching base stylesheet: `/styles/styles.css` for C1,
   `/c2/styles/styles.css` for C2.
5. Load Lana and call Milo's `loadArea()` for standard block discovery/loading.

Milo loads registered blocks on demand by their authored class/name and invokes
their default initializer. A typical block mutates its element in place; use
`export default async function init(el)` when initialization is asynchronous.
Some existing blocks are synchronous.

Consumer sites integrate through [v1/libs.js](event-libs/v1/libs.js), which exposes
configuration, decoration, auto-blocking, hydration, and delayed-action helpers.
Their own page bootstrap must wire the appropriate calls and loader configuration;
do not assume importing the barrel performs them automatically.

[decorateEvent()](event-libs/v1/utils/decorate.js) hydrates marked blocks, bootstraps
Tier 1 configuration/shared session state when `tier-1-event-config` exists, then
performs event-specific template, metadata, theme, RSVP-link, and contextual-content
work when `event-id` exists. `eventsDelayedActions()` captures profile data and
optionally initializes Meta Pixel. `initMiloSiteRedesignOverride()` has its own
`override-milo-ace1209: true` gate and is intended to be called independently of
event-specific decoration.

### Link auto-blocks and hydration

`processAutoBlockLinks(parent)` in [decorate.js](event-libs/v1/utils/decorate.js)
recognizes these authored anchors:

| Anchor marker | Result |
| --- | --- |
| `schedule-maker` | Decode schedule payload and build a `chrono-box` table. |
| `mobilerider.com` | Import and initialize `mobile-rider` directly; select the C2 copy on C2 pages. |
| `sgConfig=` | Build `sessions-guide` or, for `surface: 'page'`, `sessions-guide-full-page`. |
| `tecHomepage=` | Build `featured-sessions` for `configType: 'homepage-featured-sessions'`; otherwise `upcoming-sessions`. |

The non-self-initializing paths construct block DOM for subsequent Milo loading.
The MobileRider path self-initializes because links can live inside an already
loaded parent. `event-marquee` explicitly invokes it for an unprocessed MR link.
Consumer integration must run auto-block processing before the relevant block
scan; neither `decorateArea()` nor `decorateEvent()` implicitly calls it.

Hydration is a separate **synchronous** preprocessing step, not a loader:
[hydrate.js](event-libs/v1/hydrate/hydrate.js) processes `.hydrate` blocks, uses the
first class as the block name, and marks successful work with `data-hydrated`.
`image-links` has a built-in hydrator. Register additional synchronous functions
through `registerHydrator()`; async hydrators are rejected.

## Block catalog and usage

Author normal blocks as DA tables with the block name and optional modifiers.
Many event blocks consume page metadata rather than all of their visible content
coming from table cells. Configurator-link blocks instead consume generated
`data-*` JSON attributes; an empty table is not an equivalent configuration.

### Blocks present in both foundations

| Block | Usage and foundation differences |
| --- | --- |
| `chrono-box` | Replace scheduled content with Milo fragments. Both use the shared Timing Framework; C1 additionally reapplies page theme rules after swaps. |
| `grid-column` | Load a fragment from the authored anchor into a grid column. C1 warns but continues for a non-fragment link; C2 refuses links whose URL pathname lacks `/fragments/`, preventing recursive loading of session links. |
| `mobile-rider` | Embed the MR SDK from a configuration table or recognized anchor. C1 supports concurrent-video selection/drawer; C2 supports a session information bar instead. |

### C1-only blocks (`v1/blocks/`)

| Block | Primary use/input |
| --- | --- |
| `bento-cards` | Authored card rows/cells with icon/background images and copy; responsive carousel behavior. |
| `daa-injection` | Apply `daa-lh` and per-link `daa-ll` values to the following sibling block, then remove the configuration block. |
| `event-agenda` | Render `agenda` JSON with event timezone, optional venue image, `24h`/collapsible variants, and post-event visibility. |
| `event-map` | Render venue/address and `venue-map-image` from `venue`/`photos` metadata, with optional additional-info action. |
| `event-partners` | Sponsor logos/links from `sponsors`, gated by `show-sponsors: true`, ordered by ordinal. |
| `event-product-blades` | Alternate the orientation of nested Milo `.media` blades. |
| `event-schema` | Inject Event JSON-LD from event/venue/photo metadata and remove the visible block. |
| `event-subscription-form` | Campaign subscription form with email/consent handling and a confirmation view. |
| `events-form` | Event RSVP/registration form, profile and consent handling, errors, and registration-dependent success views. |
| `image-links` | Authored heading followed by linked-image cells; handles single/odd image layouts. |
| `preview-bar` | Dismissible event/preview/status information, shown only with `previewMode` in the query string. |
| `profile-cards` | Speaker/profile cards from `speakers` metadata or static rows; simple, blade, modal, and carousel variants. |
| `promotional-content` | Load promotional fragments from `custom-attributes`' `promotionalItems`, with legacy `promotional-items` configuration fallback. |
| `sessions-hub` | Metadata-driven session list with filters, speaker details, calendar downloads, and event/session registration actions. |
| `venue-additional-info` | Venue additional information/image, commonly used in a modal fragment; post-event metadata controls visibility. |
| `venue-map` | Style authored map/image columns; distinct from the metadata-driven `event-map`. |
| `youtube-chat` | YouTube video with optional live chat, autoplay iframe or lightweight click-to-play presentation. |

### C2-only blocks (`v1/c2/blocks/`)

| Block | Primary use/input |
| --- | --- |
| `event-card` | Media/text/CTA card with layout variants; optional session dataset drives time/status-dependent CTA behavior. |
| `event-carousel` | Heading/controls around an adjacent `.carousel-track` or consecutive sibling `event-card` blocks. |
| `featured-sessions` | Curated entries from `data-featured-sessions-config`; composes `event-card` and `event-carousel`. |
| `upcoming-sessions` | Entries from `data-upcoming-sessions-config`, removing past sessions and synchronizing favorite/schedule actions. |
| `event-marquee` | Optional background row plus final foreground text/asset row; section metadata configures video title/countdown. `attach-upcoming` requires an immediately following `upcoming-sessions` block. Rotation belongs to the surrounding schedule, not the marquee. |
| `sessions-guide` | Configurator-driven session discovery, filters, favorites, attendee schedule, and detail views. Widget mode mounts a body portal; configuration is `data-session-guide-config`. |
| `sessions-guide-full-page` | Dedicated full-page entry forcing `surface: 'page'`, reusing guide components/store. |
| `session-broadcast` | Catalog-driven live/simulive player page with current/up-next choices, ended state, and same-page session switching. |
| `session-video-player` | Session-detail playback for DVR-buffer/on-demand phases, using `session-id`, `session-times`, and video custom attributes. |
| `session-video-playlist` | Related on-demand sessions, playback progress, favorites, and Play all navigation; coordinates the player layout. |
| `in-person-banner` | Authored message gated for all, signed-in, or in-person attendees; optional navigation overlay. |
| `event-session-details` | Session heading, state/primary CTA, favorite/share, description, quick facts, caption/legal copy from page metadata. |
| `event-featured-products` | Product custom attributes mapped through Tier 1 configuration to product icons/links, with overflow expansion. |
| `event-speakers` | Speaker metadata ordered for the session, with avatars and overflow expansion. |
| `event-session-resources` | Published `material-list` and Dropbox/CC Library attributes; resource links with download authorization handling. |
| `event-youtube` | C2 YouTube video/chat presentation with shared analytics and player-scroll guard. |
| `session-state-demo` | Developer reference for reading shared signals and invoking session actions; not a production event-page surface. |

## Timing Framework: scheduled fragment execution

The [Timing Framework](event-libs/v1/features/timing-framework/README.md) is a
worker-driven **page-content scheduler**. It swaps fragments inside `chrono-box`;
it does not create event catalog records or register attendees for sessions.

Both chrono-box implementations accept a two-column configuration table:

- `schedule`: JSON array of runtime schedule entries.
- `schedule-id`: lookup key in page metadata `schedules`, a JSON object keyed by ID.

An inline `schedule` takes precedence over the lookup. The Schedule Maker
auto-block produces the inline form. Its `data-schedule-id` is descriptive and
is not itself a `schedule-id` lookup row.

Runtime entries use this contract:

```json
[
  {
    "title": "Before the session",
    "pathToFragment": "/events/example/fragments/before",
    "toggleTime": 1793898000000
  },
  {
    "title": "Live session",
    "pathToFragment": "/events/example/fragments/live",
    "toggleTime": 1793901600000,
    "mobileRider": { "sessionId": "MR_MEDIA_ID" }
  },
  {
    "title": "After the session",
    "pathToFragment": "/events/example/fragments/after",
    "toggleTime": 1793905200000
  }
]
```

`toggleTime` is epoch **milliseconds**, not seconds. Keep entries chronological:
chrono-box builds a doubly linked list in supplied order; it does not sort it.
For an initial pre-event view, provide a first slot whose time has already passed.
A future-only schedule can initially leave the host empty.

### Execution and plugin contracts

Chrono-box reads the schedule, assigns an instance ID, establishes a shared
per-tab `chrono-box-tab-id` in sessionStorage, and imports only needed plugins.
`mobileRider` maps to `plugins/mobile-rider/plugin.js`; `metadata` maps to
`plugins/metadata/plugin.js`.

The actual deployed worker entry is
[worker-traditional.js](event-libs/v1/features/timing-framework/worker-traditional.js),
attempted as a module worker first and fetched into a Blob worker on construction
failure. [worker.js](event-libs/v1/features/timing-framework/worker.js) exports the
testable class; [testing.js](event-libs/v1/features/timing-framework/testing.js)
provides its testing manager. Keep all three aligned: the traditional worker
inlines the testing manager because its Blob fallback cannot import ES modules.

The main thread sends `{ schedule, plugins, testing, tabId }`. Plugins are
serialized snapshots, not live Map objects. Worker-side stores then receive
`mobile-rider-store` and `metadata-store` BroadcastChannel updates filtered by
`tabId`. The shared `time-cache-store` channel distributes clock cache updates.

The worker positions against the best immediately available clock and validates
against `https://time.akamai.com/`. API seconds are converted to milliseconds;
cached server time advances using `performance.now()`. It uses a five-minute
base request interval, ten-minute cache TTL, and backoff/jitter on failures,
falling back to cached/local time. Schedule ticks occur every 500-1500 ms while
another slot remains, unless testing stops polling.

Important transition semantics:

- Time-only slots advance when current time is **greater than** `toggleTime`.
- An active current MR stream holds its slot past the next scheduled time
  (overrun). An ended current MR stream can advance early (underrun).
- Inactive MR slots whose time has passed are walked past before content is
  posted. Future MR slots are not entered early solely because their status is
  known; current-stream underrun is the exception.
- `metadata` is an **array** of `{ key, expectedValue }` conditions. The metadata
  plugin resolves keys with `parseMetadataPath()`. With a metadata store present,
  all conditions must match; no expected value means a non-empty value is enough.
  This branch returns the condition result directly, rather than additionally
  enforcing the normal time gate. A next MR slot has its own earlier time check.
- Outgoing messages are deduplicated by `pathToFragment`, not title or session ID.
  Reusing one path for successive slots does not force a fragment reload.

Chrono-box loads each selected path using Milo's fragment loader, which in turn
decorates/loads the fragment's blocks. Relative root paths receive the locale
prefix. An empty fragment path clears content without fetching the current page.
Initialization waits for first fragment handling with a three-second timeout;
the worker continues after initialization resolves.

Before replacement, chrono-box emits `chrono-box:before-swap`, runs registered
outbound cleanups, removes tracked reparented content, and removes nodes marked
`data-chrono-box-teleport` for that instance. Use the exported
`registerChronoBoxOutboundCleanup()` for fragment-owned resources that survive
outside the host. Do not assume DOM replacement terminates the worker or closes
all plugin channels; the current initializer has no general worker-disposal API.

### Timing QA

| Query parameter | Behavior |
| --- | --- |
| `timing=<epoch-ms>` | Position at the supplied time and stop subsequent timer polling. |
| `serverTime=<epoch-ms>` | Start an offset clock at that time and continue advancing/polling. |
| `avoidStreamEndFlag=true` | Ignore MR overrun/stream-end rules and use timing for those transitions; MR players skip their stream-end listener. |

`timing` takes precedence over `serverTime`. These switches are not
production-environment gated. Never leave QA parameters on production links.

## Schedule Maker: authoring the input

[Schedule Maker](event-libs/schedule-maker/README.md) is a standalone DA app at:

```text
https://da.live/app/{org}/{repo}/tools/da-apps/schedule-maker
```

Code lives in `event-libs/schedule-maker/`; the local entry is
[tools/da-apps/schedule-maker.html](event-libs/tools/da-apps/schedule-maker.html).
It uses vendored Preact/HTM, runtime Spectrum components, DA SDK authentication,
and context providers for DA scope, navigation, and local schedule state.
For local DA development, run `npm run da-apps` and open the app with `?ref=local`.

### Author-to-runtime handoff

1. Author and publish the fragments for pre-session, live, and post-session
   moments. A live fragment must contain the actual video block/link.
2. Create a named schedule manually or import spreadsheet/CSV rows. For each
   entry set `title`, `fragmentPath`, and `startDateTime` in epoch milliseconds.
   The editor's local datetime input and epoch field update the same value.
3. For MR-controlled moments, enable `includeLiveStream` and set
   `liveStream: { provider: 'MobileRider', streamId: 'MR_MEDIA_ID' }`.
   That media ID must match the video embedded by the fragment; it is **not**
   the Events/RainFocus session ID.
4. Copy Link. `prepareScheduleForServer()` stamps `modificationTime`, sorts
   entries by `startDateTime`, and removes editor/sync-only fields. The JSON is
   UTF-8/base64 encoded into the canonical DA-app `#schedule=` URL.
5. Paste the copied anchor into the event page and publish that content.
   `processAutoBlockLinks()` decodes the href and builds `chrono-box`.
6. The mapper converts `fragmentPath -> pathToFragment` and
   `startDateTime -> toggleTime`, retaining the title. Only enabled live streams
   with provider exactly `MobileRider` and a non-empty `streamId` become
   `mobileRider: { sessionId: streamId }`. The resulting inline schedule runs
   through the worker and fragment loader described above.

Schedule Maker stores a **page schedule**, not the session catalog or a video
embed configuration. Marking a slot live does not create its player, upload a
video, or configure `skinid`. Set those in the fragment separately.

Completeness indicators require a title, fragment path, start time, and, for an
enabled stream, a stream ID. Do not confuse those indicators with the narrower
`validateSchedule()` checks. Export correct, complete data even if the UI permits
an incomplete state.

### Link persistence and Sync

The schedule JSON, including `scheduleId`, lives in the authored link; there is
no schedule-sheet backend write. Editing/copying a link does **not** update every
document containing an older copy: replace and publish each intended reference.
Drag order is editor-only; Copy Link restores chronological order.

The app's mount-time loader reads `window.location.hash` only. Runtime auto-block
decoding also accepts old `?schedule=` links and checks the query payload before
the hash. Do not rely on the old app query format for automatic editor opening.

`syncSchedules()` scans DA HTML documents under the selected folder with bounded
concurrency, decodes schedule links, and returns an in-memory list with document
references. Identical ID/content combinations are deduplicated; different content
under one ID remains separate and is flagged as conflicting versions. Unreadable
documents abort the scan rather than yielding an incomplete success.

**Current default:** `ENABLE_LEGACY_LINK_MIGRATION = false` in
[constants.js](event-libs/schedule-maker/constants.js). Normal Sync is read-only.
If enabled, the controller can rewrite non-canonical schedule hrefs via DA source
POSTs with ETag/`If-Match` protection and retries. This is a link-format migration,
not propagation of newly edited schedule content. The README's unconditional
rewrite description and ID-only deduplication description are outdated.

## Video players and the separate session-data pipeline

### MobileRider

The C1/C2 `mobile-rider` blocks load the MR player SDK from production or integration
assets according to `getEventConfig().miloConfig.env.name` (default `prod`).
They call `window.mobilerider.embed()` with media/skin IDs and Adobe analytics;
the SDK exposes the player through `window.__mr_player`.

Table configuration includes `videoid`, `skinid`, optional `aslid`, and
`autoplay`/`controls`/`muted` overrides (defaults are all true). Link auto-blocking
extracts `videoId`, `id`, or the final path segment, plus `skinId`/autoplay details.
C1 concurrent options use `concurrentenabled` and indexed `concurrentvideoidN`,
title/description/thumbnail/ASL fields; selection can use one-based `?video=N`.
C2 instead supports `show-info-bar: true` with a block/section `session-id` for
catalog-backed session information and actions.

Inside chrono-box, the player imports the Timing Framework's `mobileRiderStore`.
The plugin initially requests unique media statuses in batches of up to 50 IDs,
handling unknown-ID 404s with bounded retries/per-ID fallback. Non-successful
statuses are initialized inactive. This plugin does **not** continually poll:
subsequent player `streamend` events mark the tracked media inactive and
broadcast it to the worker. Preserve that read/write connection when changing
player embedding, ASL replacement, or concurrent-video selection.

### Other player surfaces

| Surface | Player and scheduling ownership |
| --- | --- |
| C1 `youtube-chat` | `youtube-nocookie.com` video embed plus optional YouTube chat. Authored `videoid`, `chatenabled`, autoplay/mute/control options. No MR timing-plugin connection. |
| C2 `event-youtube` | YouTube embed/chat with lightweight or autoplay path and shared YouTube tracking. Broadcast reuses its `YouTubeChat` class. |
| Milo video assets | Marquee background decoration and already-decorated `.milo-video` assets remain Milo-owned; do not reimplement Milo's video blocks. |
| C2 `session-video-player` | On-demand uses `mpc`/`youtube` entries from `session-times`, then catalog-shaped metadata fallback. DVR-buffer uses `mrDvrVideoId` through the C2 MR block. It does not embed the watch-live/simulive phases. |
| C2 `session-broadcast` | `PlayerHost` mounts YouTube or MPC adapters. MPC imports Milo's `adobetv`; YouTube uses `event-youtube`. MobileRider currently renders an unsupported-player message, not an implemented adapter. |

`session-video-player` saves progress under
`session-video-playlist:progress`. MPC uses origin-checked `mpcStatus` messages;
YouTube uses its iframe API. Progress/state/playability events update the
playlist, whose Play all behavior navigates to the next session page after
completion. `videoLayoutDecision` and `videoPlayable` in BlockMediator coordinate
the full-width versus playlist player containers. Keep producer/consumer
announcements consistent so players do not wait forever or mount twice.

### Catalog, playback phases, and attendee schedules

[session-store.js](event-libs/v1/utils/session-store.js) is a page-level signal
store, initialized idempotently from `tier-1-event-config` metadata. It fetches
the Events session catalog, starts the shared MR poller/session-state ticker,
bridges IMS profile updates, and fetches attendee data through RainFocus.
Unlike the timing plugin's one-time status fetch, this shared MR service polls.

The catalog/configuration pipeline is separate from Schedule Maker:

```text
Tier 1 metadata -> session-store -> Events session catalog + MR poller
                               -> RainFocus attendee favorites/schedule
                               -> C2 guide/cards/details/broadcast/playlist

Schedule Maker link -> auto-block mapper -> chrono-box -> timing worker
                                                    -> published fragments
                                                    -> embedded MR streamend
```

Shared catalog records use `startTimeUtc`/`endTimeUtc` ISO dates and provider
fields such as `mrStreamId`, `mpcId`, `youTubeId`, `mrDvrVideoId`, and
`dvrDelayHours`. Page-level `session-times` uses `startTimeMillis`/
`endTimeMillis` and video entries. These are different shapes from Schedule
Maker's `startDateTime`/`fragmentPath`; do not interchange them.

[video-session.js](event-libs/v1/c2/utils/video-session.js) classifies LIVE,
IPOD, and SIMULIVE playback and derives pre-event, simulive, watch-live,
DVR-buffer, or on-demand phases. MR activity and DVR timing affect the result;
simulive has a five-minute pre-roll. `session-video-playlist` renders only for
on-demand, not DVR-buffer. `session-broadcast` has its own catalog schedule
resolver and five-second refresh; automatic advancement remains within a
provider bucket, with manual switching between buckets. Neither is driven by
the Schedule Maker worker.

Attendee `scheduled` and `favorited` signals describe RainFocus user actions,
not page fragment schedules. Use `action-feedback.js`/`session-actions.js`
for authorization and mutations rather than writing Sets or calling RF directly.

## Contributor rules and change checklist

- Use ES modules, `.js` import extensions, two spaces, single quotes, and
  semicolons. Prefer async/await for new asynchronous code.
- Reuse shared utilities and Milo helpers. Resolve Milo through `LIBS` or the
  configured `miloLibs`; use `createTag()` for new vanilla DOM components.
  `?milolibs=local` selects `http://localhost:6456/libs` on non-production hosts.
- Event-service selection is runtime override, then `espenv`/`eccEnv`, then
  `event-service-env` metadata, then `prod`. It is distinct from Milo's page
  environment, which the MR SDK/controller use for production/integration.
- Use `utils/lana-log.js` for errors/warnings; do not introduce silent
  success-shaped failures. Parse authored JSON with explicit error handling.
- C1 commonly uses BlockMediator (`imsProfile`, `rsvpData`, `eventData`);
  C2 catalog surfaces share signals from `session-store.js`. Preact consumers
  read `.value`; vanilla consumers subscribe. Replace Sets when mutating signals.
- Keep author-owned top/bottom spacing flexible rather than hard-coding vertical
  block spacing. Document any essential engineering-owned offsets.
- Preserve accessible names, keyboard interactions, reactive ARIA state, and
  focus restoration. Dispose listeners, subscriptions, timers, observers, and
  out-of-host DOM when fragment content is replaced.
- For a new block, create the matching foundation folder and JS/CSS, register it
  in the correct array in `v1/libs.js`, and add focused tests/fixtures. If it is
  link-driven, update auto-block mapping and its tests as well.
- For timing changes, keep C1/C2 chrono-box integration, `worker.js`,
  `worker-traditional.js`, and testing-manager behavior consistent. Check both
  time-only and MR overrun/underrun/late-arrival behavior.

Relevant test entry points include:

| Change area | Existing tests |
| --- | --- |
| Auto-block mapping and event decoration | `test/unit/scripts/decorate.test.js` |
| Chrono-box fragment/theme/cleanup | `test/unit/blocks/chrono-box/chrono-box.test.js` |
| Worker scheduling | `test/unit/features/timing-framework/worker.test.js` (imports `worker.js`, not the deployed traditional worker) |
| MR timing plugin | `test/unit/features/timing-framework/plugins/mobile-rider/plugin.test.js` |
| Schedule serialization/Sync | `test/unit/schedule-maker/utils.test.js`, `test/unit/schedule-maker/da-controller.test.js` |
| MR/YouTube presentation | `test/unit/blocks/mobile-rider/`, `test/unit/blocks/youtube-chat/`, `test/unit/blocks/event-youtube/` |
| C2 players, broadcast, and guide | `test/unit/c2/blocks/session-video-player/`, `session-video-playlist/`, `session-broadcast/`, `sessions-guide/` |
| Shared catalog/state/playback | `test/unit/services/sessions/`, `test/unit/utils/`, `test/unit/c2/utils/` |

Use targeted tests and relevant lint for code changes. Player SDK behavior,
actual worker loading/CSP, real Preact lifecycle, DA-link authoring, and fragment
swaps also need browser verification on a configured preview page; unit mocks
alone do not validate those integrations.
