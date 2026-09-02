# In-Person Banner (C2)

Generic, reusable banner block. Any author can place it on any page — not scoped to
the Homepage or any specific placement. Supports author-configured copy/links,
light/dark mode, and an optional gate on a visitor's in-person event registration
status.

This is a **C2 block**: it only loads on a page whose metadata table has
`foundation: c2`, served from `event-libs/v1/c2/blocks/in-person-banner/` instead of
the regular `event-libs/v1/blocks/` path.

## Theme

Author the block as `In-Person Banner (dark)` or `In-Person Banner (light)` — plain
Milo block-modifier syntax. `init()` reads whichever variant class Milo already added
and sets `data-theme` on the block element to match — the mechanism this repo's own
C2 token CSS (`c2/styles/tokens.css`) actually keys off (`[data-theme="dark"]`/
`[data-theme="light"]`), same pattern `sessions-guide.js` uses. Light/dark is explicit
per instance — never inherited from the page's own theme.

## Authoring

```
| In-Person Banner (dark) |  |
| --- | --- |
| banner-id | in-person-2026 |
| rf-data-check | true |
| below-nav | false |
| message | Registered for in-person MAX? Find detailed information on your [attendee dashboard](https://...). |
```

Config rows are labeled key/value pairs (label in column 1, value in column 2). The
copy itself can be authored either as an explicit `message` row (shown above) **or**
as a bare, unlabeled row with no label cell — both are supported, so authors don't
need to remember which shape to use:

- `banner-id` — **required for dismiss to work**. A stable string identifying this
  banner instance. Dismissing a banner is remembered per `banner-id` (see Dismiss
  below) — reusing the same id across multiple placements treats them as "the same
  banner" for dismiss purposes on purpose; give each independently-dismissible
  banner its own id.
- `rf-data-check` — exactly `true` (case-insensitive) to gate visibility on in-person
  registration (see below); `false` or omitted shows unconditionally to everyone.
- `below-nav` — exactly `true` (case-insensitive) when this banner is placed at the
  very top of the page: the banner overlays the sticky GNAV header (`position: fixed`,
  above it) instead of rendering as a normal block, so it's the only thing visible at
  first paint. It slides away once the visitor scrolls a small amount, revealing the
  GNAV header underneath. `false` or omitted for any other placement — see Layout
  below for why this isn't automatic.
- `message` — **required** (whether authored under this label or as a bare row).
  Rich content, same authoring conventions as any other block (links via markdown,
  bold/italic, etc.) — no new authoring paradigm.

Both `rf-data-check` and `below-nav` are parsed, not just presence-checked — writing
the row with the value `false` correctly means off, the same as omitting the row.

If `banner-id`/`rf-data-check`/`below-nav` aren't authored as a row, `init()` falls
back to page-level metadata of the same name (`getMetadata('banner-id')`, etc.), so a
page-wide default can be set once instead of repeating it on every instance.

## RF-gated visibility

When `rf-data-check` is `true`, the banner only renders for visitors registered for the
in-person event. This block does **not** make its own RainFocus call — it consumes
the registration signal already resolved by `da-events`' GNAV integration
(`da-events` PR #51, `events/scripts/registration-cache.js`), via the documented
cross-repo contract:

```js
const { isRegistered, inPersonAttendee } = await window.events.getRegistrationStatus();
```

Since this repo (`event-libs`) is a separate origin/build from `da-events`, it cannot
`import` that module directly — `window.events.*` is the only supported contract (see
`da-events`' `docs/registration-status-consumer-guide.md`).

**Fails open**, not closed: the banner shows unless the signal explicitly resolves to
"not an in-person attendee" (`isRegistered === false`, or `inPersonAttendee === false`
once known). `inPersonAttendee` can be legitimately unresolved for a moment right
after a registration redirect (a real nuance called out in the consumer guide) —
treating "not yet known" as "hide" would flicker the banner away from a visitor who
actually is registered, right as they land back from registering. If the
`window.events` global itself is unavailable (e.g. this page has no `event-code`
metadata, or `da-events`' script never loaded) or the call throws, the banner shows
rather than silently disappearing — a plain, page-wide messaging banner should not
depend on an optional, best-effort signal succeeding.

## Dismiss

Once a visitor closes a banner (clicking the `×`), that `banner-id` is written to a
`localStorage` map (`in-person-banner:dismissed`) and never rendered for that visitor
again on that browser — not just for the current page view, matching the Jira spec's
"stays dismissed across future visits" requirement. Client-only; no backend field
exists for this.

## Layout

- Desktop: single-row bar, copy centered, `×` on the trailing edge. Copy has a
  `max-width: 800px` before it line-breaks, per Figma.
- Mobile (`max-width: 767px`): copy left-aligns and the `×` sits at the top-right of a
  taller, stacked layout, matching the Figma mobile frames.
- No fixed placement — the block behaves the same regardless of where an author puts
  it on the page (mid-page, etc.), rendering as a normal in-flow block. The one
  exception: a banner placed at the very top of the page — that's what the
  `below-nav` config row opts into. It fixes the banner over the GNAV header
  (reading GNAV's own `--global-height-nav`, falling back to `80px`, for its
  minimum height so it fully covers the nav) and slides it away
  (`transform: translateY(-100%)`) once the visitor scrolls past
  `SCROLL_REVEAL_THRESHOLD` (10px, in `in-person-banner.js`), revealing GNAV — the
  same overlay-then-reveal pattern GNAV's own PromoBar uses for its promo bar over
  `header.global-navigation`. Scroll position is polled via a single passive
  `scroll` listener throttled to one check per animation frame, not per-event, to
  avoid layout thrash.
- When `below-nav` is active, `init()` reparents the block element to be a direct
  child of `<body>`. `position: fixed` only pins an element to the true viewport if
  every ancestor is a plain box — a `transform`/`filter`/`will-change: transform`
  on any ancestor between the block's original DOM position and `<body>` (common on
  animated hero/marquee sections) would otherwise make the fixed banner track that
  ancestor's box instead of overlaying the header. Reparenting removes that
  dependency on the rest of the page's CSS.
