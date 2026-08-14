# Event Marquee (C2)

Configurable marquee for the MAX 2026 Homepage. Each "moment" (keynote intro,
replay, upcoming/live promo, etc.) is authored as its own independent fragment and
rotated in/out via Milo's existing Schedule Maker/MEP manifest system — nothing in
this block handles rotation itself.

This is a **C2 block**: it only loads on a page whose metadata table has
`foundation: c2`, served from `event-libs/v1/c2/blocks/event-marquee/` instead of the
regular `event-libs/v1/blocks/` path. Add that metadata block to the page (usually at
the bottom of the doc):

```
| Metadata |    |
| -------- | -- |
| foundation | c2 |
```

## Theme

Author the block as `Event Marquee (dark)` — plain Milo block-modifier syntax,
no custom code involved. Color comes from Milo's own `.dark` class
(`libs/c2/styles/styles.css`, already loaded globally on any c2-foundation
page), which redefines the semantic `--s2a-color-content-*` tokens this
block's CSS references — same mechanism Rich Content relies on for its own
theming. There's no light-mode Figma frame yet, so `dark` should be included
on every real instance for now; omitting it renders dark text against this
block's own dark background/gradient.

## Authoring convention

Same row shape as Milo's own **classic marquee** (`libs/blocks/marquee/marquee.js`),
not Router Marquee — that's the block that actually has background image/video +
foreground text + a "side" video asset, matching the Figma "Live Promo" reference:

- **Row 1 (optional) — background.** A single cell with a full-bleed image or an
  ambient looping video. Sits behind everything, dimmed with a gradient for legibility.
  Omit this row entirely if you don't want a background.
- **Last row (required) — foreground.** Two cells: text | asset. The asset cell is
  optional — leave it out for a plain background-only Text/CTA marquee, or put an
  interactive player in it for the Video variant (see below).

Config that isn't content (favorite/share toggles, session ID) lives in a separate
**Section Metadata** block placed as a sibling of the marquee, inside the same
section — same convention Router Marquee uses for its own `starting-marquee` field:

```
| Event Marquee |  |
| --- | --- |
| ![](./background.jpg) |  |
| ## Headline<br>Body copy<br>**_[Register now](https://...)_** | [Watch live](https://...) |

| Section Metadata |  |
| --- | --- |
| session-id | s-100 |
```

At runtime, `event-marquee.js` looks up `el.parentElement.querySelector('.section-metadata')`
and reads it with Milo's own `getMetadata` helper (`c2/blocks/section-metadata/section-metadata.js`)
— the exact same lookup Router Marquee uses for `starting-marquee`. If there's no
Section Metadata block in the section, event-marquee just uses defaults (no Favorite
button, share button shown). The background row is decorated with Milo's own
`decorateBlockBg` (`utils/decorate.js`) — the same function classic marquee.js itself
calls — so responsive per-viewport backgrounds, focal point, and solid-color
fallback all work for free, no new code.

## Attaching Upcoming Sessions

To show the "Upcoming" sessions carousel overlaid on the bottom of the marquee,
author `event-marquee` with an `attach-upcoming` modifier, followed immediately
by an `upcoming-sessions` block **in the same section**:

```
| Event Marquee (attach-upcoming) |  |
| --- | --- |
| ![](./background.jpg) |  |
| ## Headline<br>Body copy | [Watch live](https://...) |

| Upcoming Sessions |  |
| --- | --- |
```

`event-marquee` must be the **immediately preceding** element before
`upcoming-sessions` in the same section — `event-marquee.js`'s own
attach-detection (`attachUpcomingSessionsWrapper`) checks `el.nextElementSibling`
for the `upcoming-sessions` class (gated on `event-marquee` itself carrying the
authored `attach-upcoming` modifier), so it only fires when the two blocks are
directly adjacent.

Once detected, `attachUpcomingSessionsWrapper` wraps the two blocks together in
a new `.event-marquee-upcoming-wrapper` div (moving both out of the section and
into it) and makes *that* wrapper the positioned ancestor for
`upcoming-sessions.css`'s `.upcoming-sessions--attached` `position: absolute`
overlay — not the section itself. This was a real bug in an earlier version of
this doc/implementation: anchoring to `.section` only lined up correctly by
coincidence, when the section's own rendered box happened to exactly match the
marquee's box. Real pages set section styles like `container`/`wide` directly
on `.section` (Milo's `.container { width: var(--grid-container-width);
margin: 0 auto; }`), narrowing and centering the section independently of the
marquee's own 100%-width box — which visibly detached the overlay from the
marquee's actual edges. The wrapper has no width or padding of its own, so its
box is always exactly the marquee's box regardless of whatever styling the
section has. You can now safely author other content in the same section
without breaking the overlay's alignment — it no longer depends on the
marquee being the section's only child.

This wrapper is intentionally owned by `event-marquee.js`, not
`upcoming-sessions.js` — `upcoming-sessions.js` is untouched by this and still
just checks `el.previousElementSibling` for the `attach-upcoming` class to add
its own `upcoming-sessions--attached`/`attach-upcoming--has-overlay` styling
hooks, which works regardless of which of the two blocks' `init()` runs first
or whether the wrapper exists yet at that point — wrapping two already-adjacent
siblings preserves their relative order either way.

If you need other content near the marquee, put it in a **separate section**
below this one — not in the same section as the marquee/upcoming-sessions pair.

## Full-bleed

The marquee is full-bleed at every breakpoint — mobile, tablet, and desktop —
and manages its own responsive inset (padding-inline on
`.event-marquee-foreground`) instead of relying on an ambient `.container`.

Don't add `container`/`wide` styling to the section's own **Section
Metadata** for a section holding this block — that pads/narrows `.section`
itself (Milo's own grid classes) independently of the marquee's own padding,
and fights with it. Leave the section's `style` field unset.

## Variants

There is no explicit "variant" field to author. Two things are auto-detected
independently from what's in the foreground's asset cell — the same content-presence
approach Milo's own marquee blocks use:

- **Layout** — no asset cell at all → **Text/CTA**: headline, body copy, up to 2
  CTAs, text pinned to the bottom of the full-bleed background. Any asset cell at
  all (a decorative image, an ambient video, *or* an interactive player) →
  **split layout**: the asset bleeds to one edge on desktop instead of covering the
  whole marquee ("Split Marquee" in Figma) — it sits *in front of* the background,
  not instead of it.
- **Favorite/share** — shown only when the asset is specifically a recognized
  interactive player (Mobile Rider, YouTube, or MPC/Adobe TV). A decorative image or
  an ambient video gets the split layout but no Favorite/share, since there's no
  session to favorite.

## The Event Marquee block itself

**Background row (optional, first row)** — one cell:

| Want | Paste this |
|---|---|
| Static background image | A normal image |
| Ambient looping background video | A link to an `.mp4` ending in `#autoplay`, e.g. `https://.../loop.mp4#autoplay` |

**Foreground row (required, last row)** — text cell, then an optional asset cell:

Text cell:

| Content | How to author it |
|---|---|
| Headline | **H1** for the Figma-specified size (heading-1). H2/H3 also work but render smaller — Milo's own C2 stylesheet sizes headings per-tag (h1/h2/h3 → heading-1/2/3), this block doesn't override that. |
| Body copy | Plain paragraph(s) |
| Primary CTA | Bold *and* italic the link text: `**_[Register now](https://...)_**` |
| Secondary CTA | Italic the link text: `_[Learn more](https://...)_` |

Up to 2 CTAs, same `<em>`/`<em><strong>` convention Milo uses everywhere else.

Asset cell (optional) — presence of anything here switches to the split layout;
only a recognized player also gets Favorite/share:

| Want | Paste this |
|---|---|
| No asset — text over the background only, no split | Leave the cell out entirely |
| Decorative image, split layout, no Favorite/share | A normal image |
| Ambient/decorative looping video, split layout, no Favorite/share | A link to an `.mp4` ending in `#autoplay` — Milo's generic AUTO_BLOCK decorates it, including the play/pause button (already C2-tokenized on `foundation:c2` pages, for free) |
| Mobile Rider live/on-demand player — split layout + Favorite/share | A `mobilerider.com` embed link, e.g. `https://www.mobilerider.com/embed?videoId=abc123&skinId=default&autoplay=true` |
| YouTube player — split layout + Favorite/share | A normal `youtube.com/watch?v=...` or `youtu.be/...` link |
| MPC / Adobe TV player — split layout + Favorite/share | A `tv.adobe.com/...` link |

## Section Metadata — properties reference

Add a `Section Metadata` block below the marquee, in the same section, to set any of
these. All are optional.

| Property | Values | Required | Default | Notes |
|---|---|---|---|---|
| `event-title` | free text | No | `''` | Only used for the Favorite CTA's "Registration for *{title}* required" toast copy — not displayed in the marquee |
| `session-id` | a real session ID, e.g. `s-100` | Only if you want a Favorite button | `''` (no Favorite button) | Must match an ID from the fetched session list. **Independent** of whatever ID is inside the player link (MR's `videoId`, etc.) — no inference between them, on purpose |
| `favorite-enabled` | `true` / `false` | No | shows automatically when Video variant + `session-id` is set | Explicit override — set `false` to force-hide it |
| `share-enabled` | `true` / `false` | No | `true` (Video variant only) | Explicit override — set `false` to hide the share icon |
| `video-title` | free text | No | `''` (no title shown) | Rendered directly under the player, bold label-style text. Only shown when the asset is a recognized interactive player — same gating as Favorite/share |
| `countdown-end-time` | an ISO 8601 datetime string, e.g. `2026-08-20T18:00:00Z` | No | none (no countdown shown) | Renders a "Session starts in:" label and a live HH:MM:SS clock counting down to this fixed instant, appended to the text column below the headline/body/CTAs. Same instant for every visitor regardless of their local timezone — no conversion applied. Freezes at `00:00:00` once passed; doesn't trigger any transition itself (Schedule Maker's own schedule handles swapping to the next fragment, independently authored) |

Favorite/share only ever appear when the asset is a recognized interactive player —
they don't render for the no-asset Text/CTA layout, or for a decorative image/ambient
video asset, regardless of what's in Section Metadata. `video-title` follows the same
gating.

Note: Milo's `getMetadata` helper lowercases its `.text` values, which is why
`event-title`/`session-id` are read from `.content` instead (preserving the original
casing) — `favorite-enabled`/`share-enabled` are read from `.text` since `true`/`false`
comparisons are case-insensitive anyway.

## Sample sections

**1. Text/CTA — background image, 2 CTAs, no asset (no Section Metadata needed)**
```
| Event Marquee |  |
| --- | --- |
| ![](./background.jpg) |  |
| ## Upcoming: Keynote Replay<br>Catch the highlights from today's mainstage session.<br>**_[Register now](https://www.adobe.com/register)_**<br>_[Learn more](https://www.adobe.com/learn-more)_ |  |
```

**2. Text/CTA — 1 CTA, ambient looping background video**
```
| Event Marquee |  |
| --- | --- |
| [background loop](./background-loop.mp4#autoplay) |  |
| ## Day 2 starts tomorrow<br>Set a reminder so you don't miss the opening session.<br>**_[Remind me](https://www.adobe.com/remind-me)_** |  |
```

**3. Text/CTA — no background row at all**
```
| Event Marquee |  |
| --- | --- |
| ## Plain announcement<br>No background authored — just text on the block's own default color. |  |
```

**4. Video — Mobile Rider, with background + Favorite CTA**
```
| Event Marquee |  |
| --- | --- |
| ![](./background.jpg) |  |
| ## Live now: Mainstage<br>Join the keynote as it happens. | [Watch live](https://www.mobilerider.com/embed?videoId=demo-live-123&skinId=default&autoplay=true) |

| Section Metadata |  |
| --- | --- |
| session-id | s-100 |
```

**5. Video — YouTube replay**
```
| Event Marquee |  |
| --- | --- |
| ![](./background.jpg) |  |
| ## Replay: Design Systems at Scale<br>Missed it live? Watch the full session now. | [Watch replay](https://www.youtube.com/watch?v=abc123XYZ) |

| Section Metadata |  |
| --- | --- |
| session-id | s-201 |
```

**6. Video — MPC / Adobe TV replay**
```
| Event Marquee |  |
| --- | --- |
| ![](./background.jpg) |  |
| ## Replay: What's New in Creative Cloud<br>The full session, on demand. | [Watch replay](https://tv.adobe.com/watch/abc-123) |

| Section Metadata |  |
| --- | --- |
| session-id | s-202 |
```

**7. Video — Favorite explicitly disabled (e.g. sponsor content)**
```
| Event Marquee |  |
| --- | --- |
| ![](./background.jpg) |  |
| ## Sponsor spotlight<br>No favoriting on sponsor content. | [Watch](https://tv.adobe.com/watch/sponsor-1) |

| Section Metadata |  |
| --- | --- |
| session-id | s-100 |
| favorite-enabled | false |
```

**8. Video — share explicitly disabled (internal preview)**
```
| Event Marquee |  |
| --- | --- |
| ![](./background.jpg) |  |
| ## Internal preview<br>Not meant to be shared externally. | [Watch](https://tv.adobe.com/watch/preview-1) |

| Section Metadata |  |
| --- | --- |
| session-id | s-100 |
| share-enabled | false |
```

**9. Text/CTA — countdown timer to a pre-launch moment**
```
| Event Marquee |  |
| --- | --- |
| ![](./background.jpg) |  |
| ## Featured content headline<br>Lorem ipsum dolor sit amet consectetur. |  |

| Section Metadata |  |
| --- | --- |
| countdown-end-time | 2026-08-20T18:00:00Z |
```

## Dev preview

Preview against the real AEM dev server (`npm run event-libs`) with a page authored
with `foundation: c2` metadata — YouTube/MPC/ambient-video decoration and real Mobile
Rider playback depend on Milo's real `AUTO_BLOCKS` pipeline, so they only work there.
