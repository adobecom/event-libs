# Acceptance Criteria — event-libs

Load this reference at the start of Phase 2 and keep it open through Phase 4.

---

## JS rules

- Export exactly `export default async function init(el)` — no other named
  exports unless they are pure utilities needed by tests.
- Use `createTag(tag, attrs, html)` from `../../utils/utils.js` for all DOM
  creation — never `document.createElement`.
- Import Milo utilities dynamically via `LIBS`:
  `const { decorateButtons } = await import(\`${miloLibs}/utils/decorate.js\`)`
- Never hardcode Milo URLs — resolve via `getEventConfig()?.miloConfig?.miloLibs ?? LIBS`.
- Use `window.lana?.log()` for all error logging — never `console.error`.
- Use `async/await` only — no `.then()` chains.
- Use `import`/`export` ES modules with `.js` extensions on all imports.
- **Media parity across breakpoints**: cross-check the element inventory from
  Phase 3.  If an image or media element appears in the Figma frame for every
  provided breakpoint, the implementation must render that media at every
  breakpoint.  Do not hide media via CSS (`display: none`) at larger breakpoints
  unless the Figma frame explicitly omits it.
- Keep `init()` lean.  Extract helpers for complex logic but keep the public
  surface to `export default function init(el)`.
- No self-initialisation.  `init` is called externally by the Milo framework.

## JS quality checklist

- Cache DOM queries — never query inside loops.
- Use event delegation on the block root, not per-child listeners.
- No synchronous layout thrashing: batch DOM reads before DOM writes.
  Never interleave `offsetHeight`/`getBoundingClientRect` reads with style
  writes in the same loop.
- ESLint (Airbnb) must pass: `npm run lint:fix && npm run lint`.

---

## CSS rules

- **Mobile-first**: base styles target mobile (< 768 px).
- Use `@media screen and (min-width: Npx)` syntax (event-libs convention):
  ```css
  @media screen and (min-width: 768px)  { /* tablet */ }
  @media screen and (min-width: 1200px) { /* desktop */ }
  ```
- Only include breakpoints for which a Figma frame was provided.
- Use design tokens from `references/design-tokens.md` for all colours,
  spacing, and typography.  Always include a fallback value:
  `var(--color-accent, #1473e6)`.
- Scope block-level custom properties with a block-name prefix:
  `--my-block-gap`, `--my-block-card-height`.

## CSS quality checklist

- No `!important`.
- No inline styles.
- No bare/unqualified tag selectors (`p`, `div`, `img`) — always scope under
  the block class: `.my-block p { ... }`.
- Selector chain depth ≤ 3.
- No magic numbers — every numeric value maps to a token or has a comment.
- No hardcoded colours — always use `var(--color-*)` tokens.
- Stylelint must pass: `npm run lint:fix && npm run lint`.

---

## Block registration checklist

- [ ] `event-libs/v1/blocks/<name>/<name>.js` created
- [ ] `event-libs/v1/blocks/<name>/<name>.css` created
- [ ] Block name added to `EVENT_BLOCKS` array in `event-libs/v1/libs.js`
- [ ] WTR test file created at `test/unit/blocks/<name>/<name>.test.js`
- [ ] Mock fixture created at `test/unit/blocks/<name>/mocks/default.html`
- [ ] `npm run lint` passes with zero errors
- [ ] `npx wtr test/unit/blocks/<name>/<name>.test.js --node-resolve --port=2000` passes
