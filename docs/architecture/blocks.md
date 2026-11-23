# Block catalog and usage

See [architecture and loading](overview.md) for C1/C2 selection and registration.
Source paths below are relative to the Git repository root.

Author normal blocks as DA tables with the block name and optional modifiers.
Many consume page metadata rather than all visible content coming from cells.
Configurator-link blocks consume generated `data-*` JSON attributes; an empty
table is not an equivalent configuration. See [configurators](configurators.md).

## Blocks present in both foundations

These have separate implementations under `event-libs/v1/blocks/` and
`event-libs/v1/c2/blocks/`.

| Block | Usage and foundation differences |
| --- | --- |
| `chrono-box` | Replace scheduled content with Milo fragments. Both use the shared Timing Framework; C1 additionally reapplies page theme rules after swaps. |
| `grid-column` | Load a fragment from the authored anchor into a grid column. C1 warns but continues for a non-fragment link; C2 refuses links whose URL pathname lacks `/fragments/`, preventing recursive loading of session links. |
| `mobile-rider` | Embed the MR SDK from a configuration table or recognized anchor. C1 supports concurrent-video selection/drawer; C2 supports a session information bar instead. |

## C1-only blocks (`event-libs/v1/blocks/`)

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

## C2-only blocks (`event-libs/v1/c2/blocks/`)

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

For behavior beyond the catalog, read [timing](timing-framework.md),
[players](video-players.md), or [session state](session-state.md).
