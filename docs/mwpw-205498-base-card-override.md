# base-card CSS token override (MWPW-205498)

**Status:** superseded — removed. Originally implemented in
[PR #292](https://github.com/adobecom/event-libs/pull/292), stacked on
[PR #289](https://github.com/adobecom/event-libs/pull/289) /
`mwpw-205501-bento-stack-override`. Milo `main`'s own `libs/c2/blocks/base-card/base-card.css`
shipped the identical fix — the same `--s2a-color-content-heading`/`-default`/`-subtle`
tokens and the `:has(a)` hover guard described below — in
[PR #6614](https://github.com/adobecom/milo/pull/6614) on 2026-09-02, meeting this
doc's own "Opting out later" criteria. Removed on 2026-09-04: `base-card.css`,
`loadBaseCardOverride()`, and the `body.milo-site-redesign-override` marker logic in
`index.js` are gone. Kept below as a historical record of the investigation. See
[docs/mwpw-205501-bento-stack-override.md](./mwpw-205501-bento-stack-override.md) for
the bento-stack feature this was stacked on.

## Problem

`base-card` (`libs/c2/blocks/base-card/`, the card used inside `explore-card`'s media
column) renders with dark, always-black text even when authored inside a
`section-metadata` section styled `dark` — the text should turn white/light, matching
how the rest of the C2 dark-theme system behaves.

## Where this differs from bento-stack

This is a materially different case from bento-stack, not just a smaller version of it:

- **`base-card.js` is already byte-for-byte identical** between Milo `main` and
  `site-redesign-foundation` — there is nothing to vendor for the JS.
- **`base-card.css` differs by four rules**, all raw-color-token → semantic-token swaps:
  - `--s2a-color-gray-1000` → `--s2a-color-content-heading` (heading text)
  - `--s2a-color-gray-1000` → `--s2a-color-content-default` (standalone-link text)
  - `--s2a-color-transparent-black-64` → `--s2a-color-content-subtle` (body text)
  - plus an `:has(a)` guard added to the image hover-scale rule
- All three semantic tokens already ship in `libs/c2/styles/styles.css` on Milo `main` —
  this is a pure override with no missing dependency, unlike bento-stack's genuinely
  new mobile-stacking feature.

The actual light/dark switch is unrelated to any of these four rules: it comes from a
plain `.dark` class, applied via Milo's standard block-variant/section-style authoring
convention (e.g. `dark` in a `section-metadata` `style` row), which redefines
`--s2a-color-content-*` custom properties globally in `libs/c2/styles/styles.css`
(already unchanged on `main`). Custom properties inherit down the DOM regardless of
which element carries `.dark`, so `base-card`'s own rules just need to *read* the
semantic tokens instead of raw gray/black values for the theme switch to reach them —
that's the entire fix.

## Decision: vendor the CSS diff only

- `event-libs/v1/features/milo-site-redesign-override/base-card.css` — the four rules
  above, rewritten in flattened (non-nested) form since this repo doesn't run a CSS
  preprocessor.
- `index.js` loads it unconditionally, via the same `override-milo-ace1209` gate
  bento-stack uses, as soon as the feature initializes. Unlike `bento-stack.css`, this
  needs no per-section scan or `MutationObserver` — it's a plain style override with no
  measurement or initialization dependency, so it only needs to be present on the page,
  not applied at a particular moment.

## Cascade race with Milo's own base-card.css

Unlike `bento-stack.css` (which targets `.section.bento.stack-mobile`, a selector that
doesn't exist in any Milo `main` stylesheet), Milo's own `base-card.css` already ships
on `main` and defines the exact same selectors this override touches. Both stylesheets
end up on the page, and Milo's own copy loads later — during its block loader's normal
decoration, after this feature's early hook — so at equal specificity it wins the
cascade and silently reverts the override.

**Fix:** every selector in `base-card.css` is scoped under a
`body.milo-site-redesign-override` marker class, which `index.js` adds synchronously as
soon as the feature initializes — before Milo's own stylesheet is even requested. That
gives this override's rules higher specificity than Milo's on every shared selector,
independent of stylesheet load order, without needing `!important` or timing-dependent
tricks.

**Why not just take over the block entirely:** an alternative would be to mark
`.base-card` as `data-block-status="loaded"` before Milo's own block loader reaches it
(so Milo skips it), and have event-libs run its own full vendored copy of both
`base-card.js` and `base-card.css` instead. That would remove the race at its source,
but it means forking the whole block rather than the four lines that actually differ —
exactly what this feature's "vendor a flagged override, don't fork a block" decision
(see the bento-stack doc) was written to avoid. It also races against Milo's own
block-loading scan instead of a sibling stylesheet, which is a less predictable target.
Not worth it for a token-only diff.

## Opting out later

Once `site-redesign-foundation`'s `base-card.css` token rename graduates to `main` (or
if `main` adopts equivalent semantic tokens directly), remove
`event-libs/v1/features/milo-site-redesign-override/base-card.css`, the
`loadBaseCardOverride()` call and the `body.milo-site-redesign-override` marker logic
from `index.js`. No authoring changes are needed — `dark`/`light` styling continues to
work identically either way, since the underlying `.dark` mechanism was never part of
this override.

## Known risk

Low. `base-card.js` is unmodified upstream, so there's no JS drift risk. The vendored
CSS is a small, fully-understood token rename with no missing dependencies. The main
risk is the `body.milo-site-redesign-override` scoping silently becoming stale if
`index.js`'s marker class is ever renamed without updating `base-card.css` in lockstep
— both files must be kept in sync manually since there's no shared constant between a
JS class name and a CSS selector.
