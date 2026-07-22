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

## Variants

There is no explicit "variant" field to author. The variant is auto-detected from
what's in the foreground's asset cell — the same content-presence approach Milo's own
marquee blocks use for their own auto-detection:

- **Text/CTA variant** — no asset cell, or an asset that isn't a recognized
  interactive player. Headline, body copy, up to 2 CTAs, over the background.
- **Video variant** — asset cell contains an interactive player (Mobile Rider,
  YouTube, or MPC/Adobe TV). Adds a Favorite button and a share icon. The player
  bleeds to one edge on desktop rather than covering the whole marquee ("Split
  Marquee" in Figma) — it sits *in front of* the background, not instead of it.

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
| Headline | Any heading (H1–H3) |
| Body copy | Plain paragraph(s) |
| Primary CTA | Bold *and* italic the link text: `**_[Register now](https://...)_**` |
| Secondary CTA | Italic the link text: `_[Learn more](https://...)_` |

Up to 2 CTAs, same `<em>`/`<em><strong>` convention Milo uses everywhere else.

Asset cell (optional) — presence/type of a real player here is what flips the
variant to Video:

| Want | Paste this |
|---|---|
| No asset — text over the background only (Text/CTA variant) | Leave the cell out entirely |
| Mobile Rider live/on-demand player (→ Video variant) | A `mobilerider.com` embed link, e.g. `https://www.mobilerider.com/embed?videoId=abc123&skinId=default&autoplay=true` |
| YouTube player (→ Video variant) | A normal `youtube.com/watch?v=...` or `youtu.be/...` link |
| MPC / Adobe TV player (→ Video variant) | A `tv.adobe.com/...` link |

## Section Metadata — properties reference

Add a `Section Metadata` block below the marquee, in the same section, to set any of
these. All are optional.

| Property | Values | Required | Default | Notes |
|---|---|---|---|---|
| `event-title` | free text | No | `''` | Only used for the Favorite CTA's "Registration for *{title}* required" toast copy — not displayed in the marquee |
| `session-id` | a real session ID, e.g. `s-100` | Only if you want a Favorite button | `''` (no Favorite button) | Must match an ID from the fetched session list. **Independent** of whatever ID is inside the player link (MR's `videoId`, etc.) — no inference between them, on purpose |
| `favorite-enabled` | `true` / `false` | No | shows automatically when Video variant + `session-id` is set | Explicit override — set `false` to force-hide it |
| `share-enabled` | `true` / `false` | No | `true` (Video variant only) | Explicit override — set `false` to hide the share icon |

Favorite/share only ever appear in the Video variant — they don't render at all in
Text/CTA, regardless of what's in Section Metadata.

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

## Dev preview

`demo.html` in this folder is a standalone, no-Milo/no-AEM preview covering all of the
variations above (plus edge cases like an unmatched `session-id`). Serve it via:

```
npx serve .
```

then open `http://localhost:3000/event-libs/v1/c2/blocks/event-marquee/demo.html`.

True YouTube/MPC/ambient-video decoration and real Mobile Rider playback can't be
exercised in that standalone demo (they depend on Milo's real `AUTO_BLOCKS`
pipeline) — test those against the real AEM dev server (`npm run event-libs`) with a
page authored with `foundation: c2` metadata.
