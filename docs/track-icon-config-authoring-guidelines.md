# Track Icon Config Authoring Guidelines

## Overview

`track-icon-config` is a single, page-wide metadata key that maps each session/content Track to an icon and a color. It's read once by `decorateEvent` (via `initTrackIconConfig`) before any block on the page runs its own `init()`, so any block — not just `sessions-guide` — can look up a Track's icon/color via `getTrackIcon(trackName)`.

This replaces the old `track-icons`, `track-colors`, and `category-colors` block-authoring-table rows that were previously (and inconsistently) read by individual `sessions-guide` block instances. If you previously authored those rows, migrate their values into this one page-level key — the old rows are no longer read.

## Built-in Defaults

16 known Tracks already resolve to a curated icon/color out of the box, with no metadata required — this is the same set previously hardcoded in `CategoryBadge.js`'s `BADGE_MAP`/`MOCK_CATEGORY_COLORS`:

`social-media`, `design-and-illustration`, `mainstage`, `3d`, `photography`, `business`, `content-creator`, `education`, `branding`, `generative-ai`, `video`, `video-audio-and-motion`, `social-media-and-marketing`, `graphic-design-and-illustration`, `creator`, `creativity-and-marketing-in-business`

`track-icon-config` is only required for Tracks **not** in this list, or to override the default icon/color for one that is. Authored entries always take precedence over the built-in default for the same Track.

## Optional Metadata (to add or override Tracks)

```html
<meta name="track-icon-config" content='{"Social Media": {"icon": "social-media", "color": "#FF6B35"}, "3D": {"icon": "3d", "color": "#00BCD4"}}'>
```

The value is a JSON object. Each key is the exact Track name as it appears elsewhere on the page/in your session data (not a slugified version), and each value is an object with:

- `icon` — an icon name (string, required)
- `color` — a CSS color, e.g. a hex value (string, optional)

If you write a slugified key instead (lowercase, hyphens, no punctuation) it will still resolve as a fallback, but using the exact Track name is recommended since it's what you already see in your session data — no extra transcription step, and no silent mismatch if the slug is typo'd.

## Icon Resolution

`icon` values resolve in two steps:

1. **Milo's shared icon set** — any icon name already in Milo's icon sprite (`libs/img/icons/icons.svg`) works directly, e.g. `chevron-right`, `close`, `play`.
2. **event-libs' track icon set** — for Track-specific icons not in Milo's set, event-libs ships its own sprite (`event-libs/v1/features/icons/track-icons.svg`) with the following icon names, ported from the previous hardcoded badge set:

    `social-media`, `design-and-illustration`, `mainstage`, `3d`, `photography`, `business`, `content-creator`, `education`, `branding`, `generative-ai`, `video`, `video-audio-and-motion`, `social-media-and-marketing`, `graphic-design-and-illustration`, `creator`, `creativity-and-marketing-in-business`

A Track with no matching entry in either the authored `track-icon-config` or the built-in defaults (or a session with no Track at all) falls back to the `mainstage` icon/color.

## Example Implementation

```html
<!DOCTYPE html>
<html>
<head>
    <meta name="event-id" content="example-event-123">
    <meta name="track-icon-config" content='{
      "Social Media": {"icon": "social-media", "color": "#FF6B35"},
      "Design & Illustration": {"icon": "design-and-illustration", "color": "#9D50BB"},
      "Mainstage": {"icon": "mainstage", "color": "#E91E63"}
    }'>
</head>
<body>
    <!-- Any block that calls getTrackIcon("Social Media") on this page
         resolves to { icon: "social-media", color: "#FF6B35" } -->
</body>
</html>
```

## Technical Notes

- Bootstrapped via `initTrackIconConfig()` in `event-libs/v1/utils/track-icon-config.js`, called from `decorateEvent` alongside the existing `initSessionState()` bootstrap, but not gated behind `tier-1-event-state-enabled` — it's available on every page with an `event-id`.
- Malformed JSON is logged via `window.lana?.log()` and falls back to an empty authored config (only built-in defaults resolve) rather than throwing.
- Icon rendering itself goes through `event-libs/v1/features/icons/icon-resolver.js` (framework-agnostic core, used directly by vanilla blocks) and `event-libs/v1/features/icons/Icon.js` (a thin Preact wrapper for Preact-based blocks like `sessions-guide`).
