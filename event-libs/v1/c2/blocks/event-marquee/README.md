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

Same convention as Milo's own C2 blocks (Router Marquee, Rich Content): the block
itself is **pure content** — no config rows inside it. Any config that isn't itself
content (Router Marquee's `starting-marquee`, this block's `session-id` etc.) lives in
a **Section Metadata** block placed as a sibling of the marquee, inside the same
section:

```
| Event Marquee |  |
| --- | --- |
| ## Headline<br>Body copy<br>**_[Register now](https://...)_** | ![](./background.jpg) |

| Section Metadata |  |
| --- | --- |
| session-id | s-100 |
```

At runtime, `event-marquee.js` looks up `el.parentElement.querySelector('.section-metadata')`
and reads it with Milo's own `getMetadata` helper (`c2/blocks/section-metadata/section-metadata.js`)
— the exact same lookup Router Marquee uses for `starting-marquee`. If there's no
Section Metadata block in the section, event-marquee just uses defaults (no Favorite
button, share button shown).

## Variants

There is no explicit "variant" field to author. The variant is auto-detected from
what's authored in the media column — the same content-presence approach Milo's own
C2 Router Marquee uses:

- **Text/CTA variant** — media column has a background image and/or an ambient
  looping video, but no interactive player. Headline, body copy, up to 2 CTAs.
- **Video variant** — media column contains an interactive player (Mobile Rider,
  YouTube, or MPC/Adobe TV). Adds a Favorite button and a share icon.

## The Event Marquee block itself

One row, two cells — same shape as Router Marquee's own `decorateSlide` (text column |
media column).

**Left cell (text column):**

| Content | How to author it |
|---|---|
| Headline | Any heading (H1–H3) |
| Body copy | Plain paragraph(s) |
| Primary CTA | Bold *and* italic the link text: `**_[Register now](https://...)_**` |
| Secondary CTA | Italic the link text: `_[Learn more](https://...)_` |

Up to 2 CTAs, same `<em>`/`<em><strong>` convention Milo uses everywhere else.

**Right cell (media column)** — this is what auto-detects the variant:

| Want | Paste this |
|---|---|
| Background image only (→ Text/CTA variant) | A normal image |
| Ambient looping background video (→ still Text/CTA — this alone doesn't add a player) | A link to an `.mp4` ending in `#autoplay`, e.g. `https://.../loop.mp4#autoplay` |
| Mobile Rider live/on-demand player (→ Video variant) | A `mobilerider.com` embed link, e.g. `https://www.mobilerider.com/embed?videoId=abc123&skinId=default&autoplay=true` |
| YouTube player (→ Video variant) | A normal `youtube.com/watch?v=...` or `youtu.be/...` link |
| MPC / Adobe TV player (→ Video variant) | A `tv.adobe.com/...` link |

A background image/video and a player link can both be pasted into the same cell —
that gives a background treatment plus the embedded player.

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

**1. Text/CTA — background image, 2 CTAs (no Section Metadata needed)**
```
| Event Marquee |  |
| --- | --- |
| ## Upcoming: Keynote Replay<br>Catch the highlights from today's mainstage session.<br>**_[Register now](https://www.adobe.com/register)_**<br>_[Learn more](https://www.adobe.com/learn-more)_ | ![](./background.jpg) |
```

**2. Text/CTA — 1 CTA, ambient looping background video**
```
| Event Marquee |  |
| --- | --- |
| ## Day 2 starts tomorrow<br>Set a reminder so you don't miss the opening session.<br>**_[Remind me](https://www.adobe.com/remind-me)_** | [background loop](./background-loop.mp4#autoplay) |
```

**3. Video — Mobile Rider, with Favorite CTA**
```
| Event Marquee |  |
| --- | --- |
| ## Live now: Mainstage<br>Join the keynote as it happens. | [Watch live](https://www.mobilerider.com/embed?videoId=demo-live-123&skinId=default&autoplay=true) |

| Section Metadata |  |
| --- | --- |
| session-id | s-100 |
```

**4. Video — YouTube replay**
```
| Event Marquee |  |
| --- | --- |
| ## Replay: Design Systems at Scale<br>Missed it live? Watch the full session now. | [Watch replay](https://www.youtube.com/watch?v=abc123XYZ) |

| Section Metadata |  |
| --- | --- |
| session-id | s-201 |
```

**5. Video — MPC / Adobe TV replay**
```
| Event Marquee |  |
| --- | --- |
| ## Replay: What's New in Creative Cloud<br>The full session, on demand. | [Watch replay](https://tv.adobe.com/watch/abc-123) |

| Section Metadata |  |
| --- | --- |
| session-id | s-202 |
```

**6. Video — Favorite explicitly disabled (e.g. sponsor content)**
```
| Event Marquee |  |
| --- | --- |
| ## Sponsor spotlight<br>No favoriting on sponsor content. | [Watch](https://tv.adobe.com/watch/sponsor-1) |

| Section Metadata |  |
| --- | --- |
| session-id | s-100 |
| favorite-enabled | false |
```

**7. Video — share explicitly disabled (internal preview)**
```
| Event Marquee |  |
| --- | --- |
| ## Internal preview<br>Not meant to be shared externally. | [Watch](https://tv.adobe.com/watch/preview-1) |

| Section Metadata |  |
| --- | --- |
| session-id | s-100 |
| share-enabled | false |
```

**8. Video with a background image *and* the player together**
```
| Event Marquee |  |
| --- | --- |
| ## Live now: Mainstage | ![](./background.jpg)<br>[Watch live](https://www.mobilerider.com/embed?videoId=demo-live-123&skinId=default&autoplay=true) |

| Section Metadata |  |
| --- | --- |
| session-id | s-100 |
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
