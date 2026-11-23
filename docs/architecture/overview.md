# Architecture and loading

event-libs delivers browser ES modules for Adobe event pages built with
AEM/Helix, Document Authoring (DA), and Milo. There is no bundler or build step.
Application source lives inside the inner `event-libs/` directory.
Paths in code spans below are relative to the Git repository root.

## C1 versus C2

C1 is the classic foundation and the default when page metadata is not exactly
`foundation: c2`. C2 is selected by the page's foundation metadata, **not** by a
block name, event type, or use of Preact.

| Foundation | Block source | Registration |
| --- | --- | --- |
| C1/default | `event-libs/v1/blocks/<name>/<name>.js` | `EVENT_BLOCKS` |
| C2 | `event-libs/v1/c2/blocks/<name>/<name>.js` | `EVENT_BLOCKS_C2` |

Both arrays live in [v1/libs.js](../../event-libs/v1/libs.js). Each currently
registers 20 blocks. `chrono-box`, `grid-column`, and `mobile-rider` have separate
implementations in **both** foundations; remaining names are foundation-specific.
Do not assume C1 is a fallback for a missing C2 block. See the
[block catalog](blocks.md) for individual purposes and authoring inputs.

## Page entry and consumer integration

[scripts/scripts.js](../../event-libs/scripts/scripts.js) is this repository's page entry:

1. Resolve Milo through `LIBS` and read `foundation` metadata.
2. Pass the selected block array and base path to Milo's `setConfig()` through
   `externalLibs`. C1 uses `/event-libs/v1`; C2 uses `/event-libs/v1/c2`.
3. Call the local `decorateArea()` hook, which adds event styles and prioritizes
   an eager image. This hook is **not** the fuller `decorateEvent()` routine.
4. Load Milo's matching base stylesheet: `/styles/styles.css` for C1,
   `/c2/styles/styles.css` for C2.
5. Load Lana and call Milo's `loadArea()` for standard block discovery/loading.

Milo loads registered blocks on demand by authored class/name and invokes their
default initializer. Blocks mutate their elements in place; asynchronous blocks
normally use `export default async function init(el)`. Some existing blocks are
synchronous.

Consumer sites integrate through [v1/libs.js](../../event-libs/v1/libs.js), which
exposes configuration, decoration, auto-blocking, hydration, and delayed-action
helpers. Their own bootstrap must wire those calls and loader configuration;
importing the barrel does not perform them automatically.

[decorateEvent()](../../event-libs/v1/utils/decorate.js) hydrates marked blocks,
bootstraps Tier 1 configuration/shared session state when `tier-1-event-config`
exists, then performs event-specific template, metadata, theme, RSVP-link, and
contextual-content work when `event-id` exists.
`eventsDelayedActions()` captures profile data and optionally initializes Meta
Pixel. `initMiloSiteRedesignOverride()` has its own `override-milo-ace1209: true`
gate and is intended to be called independently of event-specific decoration.

## Link auto-blocks and hydration

`processAutoBlockLinks(parent)` in
[decorate.js](../../event-libs/v1/utils/decorate.js) recognizes these anchors:

| Anchor marker | Result |
| --- | --- |
| `schedule-maker` | Decode schedule payload and build a `chrono-box` table. |
| `mobilerider.com` | Import and initialize `mobile-rider` directly; select the C2 copy on C2 pages. |
| `sgConfig=` | Build `sessions-guide` or, for `surface: 'page'`, `sessions-guide-full-page`. |
| `tecHomepage=` | Build `featured-sessions` for `configType: 'homepage-featured-sessions'`; otherwise `upcoming-sessions`. |

Non-self-initializing paths construct DOM for subsequent Milo loading. The MR
path self-initializes because links can live inside an already loaded parent.
`event-marquee` explicitly invokes it for an unprocessed MR link.
Consumer integration must run auto-block processing before the relevant block
scan; neither `decorateArea()` nor `decorateEvent()` implicitly calls it.
Payload contracts belong to [Schedule Maker](schedule-maker.md) and
[configurators](configurators.md).

Hydration is separate **synchronous** preprocessing, not a loader:
[hydrate.js](../../event-libs/v1/hydrate/hydrate.js) processes `.hydrate` blocks,
uses the first class as the name, and marks success with `data-hydrated`.
`image-links` has a built-in hydrator. Register additional synchronous functions
through `registerHydrator()`; async hydrators are rejected.
See the existing [hydration guide](../block-hydration.md) for more detail.

## Configuration and environments

Resolve Milo through `LIBS` or configured `miloLibs`, not hard-coded URLs.
`?milolibs=local` selects `http://localhost:6456/libs` on non-production hosts.
Event-service selection is runtime override, then `espenv`/`eccEnv`, then
`event-service-env` metadata, then `prod`. This is distinct from Milo's page
environment, which the MR SDK/controller use for production/integration.
See [video players](video-players.md) and [shared session state](session-state.md)
before changing these integration boundaries.
