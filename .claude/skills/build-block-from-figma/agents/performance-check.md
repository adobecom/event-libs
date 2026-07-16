# Performance Check Subagent

This script is delegated from Phase 7 of the main SKILL.md.
Run **only after** the visual comparison loop (Phase 5) and the
accessibility audit (Phase 6) are complete.

---

## Target thresholds

| Metric | Target | Why it matters |
|--------|--------|----------------|
| **Overall score** | ≥ 90 | Composite performance health |
| **LCP** | ≤ 2.5 s | Perceived load speed |
| **CLS** | ≤ 0.1 | Layout stability |
| **INP** | ≤ 200 ms | Responsiveness |
| **TBT** | ≤ 200 ms | Main-thread availability |

---

## Tool

Uses the `lighthouse` CLI executed via shell commands.

---

## Procedure

1. **Run Lighthouse** against the preview URL:
   ```bash
   npx lighthouse <preview-url> \
     --output=json \
     --output-path=/tmp/lighthouse-report.json \
     --chrome-flags="--headless --no-sandbox" \
     --only-categories=performance
   ```
2. **Parse** the JSON output and extract:
   - `categories.performance.score` × 100
   - `audits['largest-contentful-paint'].numericValue` (ms)
   - `audits['cumulative-layout-shift'].numericValue`
   - `audits['total-blocking-time'].numericValue` (ms)
   - `audits['interaction-to-next-paint'].numericValue` (ms, if available)
3. **Assess** each metric against the target thresholds.

---

## LCP-specific assessment

1. **Identify the LCP element** from the Lighthouse report:
   `audits['largest-contentful-paint'].details`.
2. **Check if the LCP element is inside the new block.**
   - If yes, the block directly impacts LCP — assess whether block CSS or
     JS is delaying the paint.
   - If no, verify the block doesn't add blocking resources.
3. **Common LCP pitfalls**:
   - Synchronous JS running before block content is visible.
   - CSS hiding content on initial load then revealing it with a transition.
   - Large un-optimised images loaded eagerly above the fold (use
     `createOptimizedPicture` from Milo instead of bare `<img>` tags).
   - Web fonts blocking text rendering.

---

## What to check beyond Lighthouse

Using Playwright MCP, also verify:

1. **No render-blocking resources** — the block's CSS is loaded
   asynchronously by the EDS framework (verify, don't assume).
   The block's JS must not introduce synchronous `<script>` tags.
2. **No excessive DOM size** — the block should not generate more DOM
   nodes than necessary.
3. **No unnecessary reflows** — if the block's JS modifies layout
   properties, it must batch reads and writes.

---

## Regression detection

If any metric is worse than the target threshold:

1. Determine if the block is the cause — temporarily hide the block
   (`display: none`) and re-run Lighthouse to get a baseline.
2. If the block is the cause, identify the specific resource or code path.
3. **Suggest fixes** but do not apply them automatically — performance
   fixes may require architectural decisions.  Surface them to the user.

---

## Output format

```
Performance Report
──────────────────
Overall score:  XX / 100   [PASS/FAIL]
LCP:            X.Xs       [PASS/FAIL]
CLS:            X.XX       [PASS/FAIL]
INP:            XXX ms     [PASS/FAIL] (or N/A)
TBT:            XXX ms     [PASS/FAIL]

LCP element:    <element description>
LCP in block:   Yes / No
```

---

## Obstacles Encountered

Compile and surface back to the main skill:

- Metrics that failed thresholds, with root cause analysis.
- Whether the new block is the cause of any regression.
- Suggested fixes for any performance issues.
- Any measurement limitations (e.g. INP requires interaction, localhost
  vs production differences).
