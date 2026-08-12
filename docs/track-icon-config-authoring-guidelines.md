# Track Icon Config Authoring Guidelines

## Overview

`track-icon-config` is a single, page-wide metadata key that maps each session/content Track to an icon and a color. It's read once by `decorateEvent` (via `initTrackIconConfig`) before any block on the page runs its own `init()`, so any block — not just `sessions-guide` — can look up a Track's icon/color via `getTrackIcon(trackName)`.

This replaces the old `track-icons`, `track-colors`, and `category-colors` block-authoring-table rows that were previously (and inconsistently) read by individual `sessions-guide` block instances. If you previously authored those rows, migrate their values into this one page-level key — the old rows are no longer read.

## No Built-in Defaults

There's no curated icon/color for any Track out of the box — every Track needs an entry in `track-icon-config` to show a badge at all. A Track with no entry renders with no icon and the universal black fallback color, not a guessed default.

## Metadata (to add or override Tracks)

```html
<meta name="track-icon-config" content='{"Social Media": {"icon": "social-media", "color": "#FF6B35"}, "3D": {"icon": "3d", "color": "#00BCD4"}}'>
```

The value is a JSON object. Each key is the exact Track name as it appears elsewhere on the page/in your session data (not a slugified version), and each value is an object with:

- `icon` — an icon name (string, required)
- `color` — a CSS color, e.g. a hex value (string, optional)

If you write a slugified key instead (lowercase, hyphens, no punctuation) it will still resolve as a fallback, but using the exact Track name is recommended since it's what you already see in your session data — no extra transcription step, and no silent mismatch if the slug is typo'd.

## Icon Resolution

`icon` values resolve in two steps, with no other fallback — an icon name in neither source doesn't render:

1. **Adobe's shared federal icon CDN** — the primary source; any icon name federal hosts works directly, e.g. `chevron-right`, `close`, `play`.
2. **Milo's shared icon set** — checked only if federal doesn't have the name, e.g. for an icon still awaiting upload to federal.

A session with no Track at all (and no override) shows no badge.

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
- Malformed JSON is logged via `window.lana?.log()` and falls back to an empty authored config (no Track resolves) rather than throwing.
- Icon rendering itself goes through `event-libs/v1/features/icons/icon-resolver.js` (framework-agnostic core, used directly by vanilla blocks) and `event-libs/v1/features/icons/Icon.js` (a thin Preact wrapper for Preact-based blocks like `sessions-guide`).
