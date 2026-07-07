Review the changes on the current branch against `dev` for correctness, vanilla JS best practices, and performance. Focus on what the code does, whether it does it efficiently, and flag anything that would hurt the reader or the runtime.

## 1. Collect the diff

```bash
git diff dev...HEAD
```

Read every changed source file in full (not just the diff lines) so you have complete context.

## 2. For each changed file, produce a section

Use this structure per file:

### `path/to/file.js`

**What changed** — one paragraph. Describe the intent of the change in plain English (e.g. "Adds a helper that strips HTML tags and decodes entities before using a string as modal ARIA label text, so screen readers receive clean text instead of raw markup.").

**Concrete example** — show a before/after pair that makes the change tangible:

```
Before: aria-label="<strong>VP, Engineering</strong>"
After:  aria-label="VP, Engineering"
```

**Issues found** — one bullet per issue, with severity (`critical` / `warn` / `nit`) and the exact line or pattern:

- `[warn] line 42` — description + a corrected snippet

If there are no issues, write `No issues found.`

## 3. Review criteria

Apply every check below. Quote the offending code for any failure.

### Correctness
- Does the logic handle `null`, `undefined`, and empty strings without throwing?
- Are all edge cases covered (empty arrays, missing DOM nodes, async races)?
- Are regular expressions anchored or guarded correctly — no catastrophic backtracking, no runaway `.+` on untrusted input?

### Vanilla JS best practices
- No unnecessary `innerHTML` assignments where `textContent` suffices (avoids XSS, faster parse)
- Prefer `el.textContent = value` over `el.innerHTML = value` when the value is plain text
- Use `document.createDocumentFragment()` or a single `append()` call when inserting multiple nodes — avoid repeated DOM mutations in a loop
- Use `const` / `let`; never `var`
- Arrow functions for closures; named `function` declarations for top-level exports
- Destructuring and default parameters where they simplify without obscuring
- No `==` — use `===` for all comparisons
- Avoid `try/catch` inside hot loops; guard with a conditional check before entering
- No dead code, no commented-out blocks left in

### Performance & optimisation
- **DOM reads/writes**: never interleave reads and writes in a loop (causes layout thrashing). Batch all reads, then all writes.
- **Regex**: compile once at module scope (`const RE = /pattern/`) rather than inside a called function if the regex is invariant
- **String building**: prefer a single `replace` chain on a string rather than splitting into an array, mapping, and rejoining when the operation is purely substitution
- **Event listeners**: confirm `removeEventListener` or `AbortController` is used if listeners are attached inside `init()` — leaks on re-init
- **Selector cost**: `querySelector` is fine; avoid `querySelectorAll` + `forEach` when a targeted `querySelector` on a known container is possible
- **Lazy work**: heavy computation (entity decoding, full DOM traversal) should be guarded so it only runs when the input actually needs it — not on every call

### Code size & readability
- No abstraction that is only used once and is no simpler than its inline equivalent
- Helper names should say *what* they return, not *how* (e.g. `plainText(title)` not `processAndCleanTitle`)
- Functions longer than ~30 lines should be split unless the logic is a single clear pipeline
- No multi-line comment blocks; inline comments only for non-obvious invariants

## 4. Summary table

End with a compact table:

| File | Critical | Warn | Nit |
|------|----------|------|-----|
| path/to/file.js | 0 | 2 | 1 |

If all counts are 0, say **"Ready to merge — no issues found."**
If any `critical` issues exist, say **"Block on critical issues before merging."**
If only `warn`/`nit`, say **"Good to merge after addressing warnings."**
