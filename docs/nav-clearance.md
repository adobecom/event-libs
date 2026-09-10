# Nav clearance (`nav-offset`)

The rule lives in [`event-libs/v1/libs-styles.css`](../event-libs/v1/libs-styles.css):

```css
main > .section.nav-offset {
  padding-block-start: var(--global-height-nav, 80px);
}
```

## Why it exists

An engineering-owned vertical offset — the documented exception to
[MWPW-201396](https://jira.corp.adobe.com/browse/MWPW-201396) (vertical spacing is normally an
authoring concern), because it accounts for the global navigation rather than being design
spacing.

The global nav is a constant 80px (`--global-height-nav`) at every width. Milo's C2
`.spacing-*` scale is responsive and — since the `--s2a-section-spacing-sm` refactor that
retired `--s2a-viewport-vertical-padding-sm` — now tops out well below the nav height, so
`spacing-sm` resolves to:

| Width | Token | Value | Gap under the 80px nav |
|---|---|---|---|
| `< 1024px` | `--s2a-spacing-lg` | 24px | 56px short |
| `1024–1279px` | `--s2a-spacing-xl` | 32px | 48px short |
| `>= 1280px` | `--s2a-spacing-2xl` | 40px | 40px short |

No width clears the nav on its own anymore, so the offset applies at **every** width. The nav
is `position: sticky`, so nothing is overlapped or hidden; what would otherwise collapse is the
visual gap between the nav and the first content, which design wants to equal the nav's own
height.

## Authoring

Opt in per page by adding `nav-offset` to the **first** section's `style`. Only `padding-block-start`
is set, so the authored `spacing-*` class still owns the bottom.

Same approach as `c2/blocks/in-person-banner/in-person-banner.css`, which offsets by
`--global-height-nav`.
