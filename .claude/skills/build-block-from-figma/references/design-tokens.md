# Design Tokens — event-libs

Load this reference at the start of Phase 2 (Read existing patterns).

These are the CSS custom properties used across `event-libs/v1/blocks/`.
Always prefer a token over a hardcoded value. When no matching token exists,
use the hardcoded value with a comment explaining why.

---

## Colour tokens

| Token | Usage |
|-------|-------|
| `--color-black` | Default text colour |
| `--color-white` | White backgrounds, reversed text |
| `--color-accent` | Accent / link colour (default: `#1473e6`) |
| `--color-gray-100` | Lightest grey background (default: `#f5f5f5`) |
| `--color-gray-200` | Light border / divider grey (default: `#e1e1e1`) |
| `--color-gray-400` | Medium grey |
| `--color-gray-500` | Muted text (default: `#6e6e6e`) |
| `--color-gray-600` | Dark muted text (default: `#555`) |
| `--color-gray-700` | Near-black text (default: `#444`) |
| `--color-font-grey` | Body copy grey |
| `--bg-color-grey` | Section background grey |
| `--text-color` | Inherited text colour (from Milo) |
| `--link-color` | Link colour (from Milo) |

---

## Spacing tokens

| Token | Approximate size |
|-------|-----------------|
| `--spacing-xxxs` | ~4 px |
| `--spacing-xxs` | ~8 px |
| `--spacing-xs` | ~12 px |
| `--spacing-s` | ~16 px |
| `--spacing-m` | ~24 px |
| `--spacing-l` | ~32 px |
| `--spacing-xl` | ~48 px |

---

## Typography tokens

| Token | Usage |
|-------|-------|
| `--type-heading-xl-size` | Extra-large heading font size |
| `--type-heading-l-size` | Large heading font size |
| `--type-heading-m-size` | Medium heading font size |
| `--type-heading-s-size` | Small heading font size |
| `--type-heading-s-lh` | Small heading line height |
| `--type-body-l-size` | Large body font size |
| `--type-body-l-lh` | Large body line height |
| `--type-body-m-size` | Medium body font size |
| `--type-body-s-size` | Small body font size |
| `--type-body-s-lh` | Small body line height |
| `--type-body-xs-size` | Extra-small body font size |
| `--type-body-xs-lh` | Extra-small body line height |
| `--type-body-xxs-size` | Micro body font size |
| `--type-body-xxs-lh` | Micro body line height |
| `--body-font-family` | Body font stack |

---

## Layout tokens

| Token | Usage |
|-------|-------|
| `--grid-container-width` | Max page content width |
| `--card-border-radius-l` | Large card border radius |
| `--input-border-radius` | Form input border radius |
| `--image-filter-drop-shadow-small` | Small drop shadow filter |

---

## Token usage rules

- Always include a CSS fallback value for tokens that may not be defined
  in all page contexts: `var(--color-accent, #1473e6)`.
- Scope block-level custom properties with a block-name prefix:
  `--my-block-gap`, `--my-block-card-height`.
- When no matching token exists for a Figma value, use the hardcoded value
  with a comment explaining it has no current token equivalent.
