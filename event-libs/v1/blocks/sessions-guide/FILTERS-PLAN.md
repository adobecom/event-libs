# Sessions Guide — Filtering System Plan

**Status: DRAFT — evolving.** No final approach yet. This doc grows as decisions get
made; don't treat anything below as committed design until it's marked resolved. Do not
start implementation off this doc until an "Approach" section exists and is confirmed.

**Source of truth for requirements:** ["Filtering System" tab, MAX Re-Imagined: Session
Guide PRD](https://wiki.corp.adobe.com/pages/viewpage.action?pageId=3746198038&spaceKey=adobedotcom&title=MAX%2BRe-Imagined%2BSession%2BGuide%2BPRD)
(fetched 2026-07-13, page version 97 — re-check the live page for edits before treating
the summary below as current).

## 1. PRD requirements (Filtering System tab)

> Filtering must be fully configurable per event, as taxonomy varies significantly. The
> filter panel should also be optional, as some smaller events will not need a filter
> panel.

**Authoring capabilities called for:**
- Turn filters ON/OFF (whole panel).
- When on:
  - Add/remove filter sections.
  - Rename filter sections.
  - Add/remove values (tags) within a section.
  - Control filter section order.

**Data model note (verbatim intent):** sessions carry tags. For RainFocus-sourced events,
engineering maps RF tags → CaaS tags; for EMC-sourced events, EMC maps directly to CaaS
tags. **Authors cannot create a new tag** — but they can create a filter section/bucket
and attach/add/remove *existing* tags to/from it.

**Open question raised in the PRD itself (unanswered — ours to weigh in on):**
> Can we auto-populate filter sections based on what we know about the tag paths?

**Reference table — "Common T1 Filter Categories (Example: MAX)":**

| Category | Filter Options (example) |
|---|---|
| Type | Creativity Super Session, First Take, Keynote, Sneaks, Luminary Session, Meet the Speaker, Session |
| Format | In-person, Online |
| Technical Level | Advanced, Beginner, General Audience, Intermediate |
| Product *(changes per event)* | Acrobat, Adobe Express, Adobe Firefly, Adobe Fonts, Adobe Fresco, Adobe Stock, Adobe Workfront, After Effects, Creative Cloud, Frame.io, GenStudio, Illustrator, InDesign, Lightroom, Lightroom Classic, Lightroom on mobile, Not Product Specific, Photoshop, Photoshop Express, Premiere, Project Neo (beta), Substance 3D Painter, Substance 3D Sampler, Substance 3D Stager |
| Category *(changes per event)* | Collaborating with Your Team, Creativity in the Classroom, Cross-app Workflow, Generative AI, How To, Industry Best Practices, Inspiration, Running your Business, Thought Leadership |
| Audience *(changes per event)* | 3D, Advertiser, Art/Creative Director, Business Strategist/Owner, Content Manager, Educator, Executive, Front End Developer, Game Developer, Government, Graphic Designer, IT, Illustrator, Marketer, Motion Design, Photographer, Post-Production Professional, Print Designer, Social Media Content Creator, Web Designer |
| Region *(MAX only)* | Americas, Asia Pacific, Europe/Middle East/Africa |

## 2. Cross-check against the real ESL/ESP data we already reverse-engineered

(See the earlier ESL payload field-mapping work this session — `sessions-api.js`'s
`mapEslPayloadToRawSessions()` and its customAttribute extraction.) The PRD's filter
categories line up cleanly with real `customAttributes` we already confirmed exist:

| PRD category | Real customAttribute | Notes |
|---|---|---|
| Type | `Session Type` | Real values (`Keynote`, `Lab`, `Sneaks`, `Preconference Lab`, ...) overlap with the PRD's example list. Already mapped to mock's `type`/`isKeynote`. |
| Format | `Format` | Real values found: `In person`, `On demand, post event`, `Online` — PRD only lists 2 of these 3. Already mapped to mock's `inPerson`/`videoAvailable`. |
| Technical Level | `Technical Level` | Exact match, including `General Audience` as a real value. Already mapped to mock's `technicalLevel`. |
| Product | `Product` | Already mapped to mock's `products[]`. |
| Category | `Programming Category` | Real sample value `How To` matches the PRD table exactly — strong validation. This is the **new** `contentCategory` field we split off from `category` this session (see git history) — `category` itself is reserved for the card-icon topic (`Track` customAttribute), which the PRD does **not** list as a filter category at all. |
| Audience | `Audience` | Exact overlap (`Graphic Designer`, `Marketer`, `Photographer`, etc. all appeared in earlier real samples). Already mapped to mock's `audience[]`. |
| Region | `Region` | Not yet mapped to any mock field — **new**, not currently on the normalized session object at all. |

**Notable absence:** `Track` / `Primary Track for Agenda (Digital Agenda)` are **not**
PRD filter categories — consistent with the PM's earlier clarification that `Track`
drives the card icon/topic tag, not a filter facet. Good, no conflict there.

## 3. Current codebase state (prior art — read before designing anything new)

- **`event-libs/v1/blocks/sessions-guide/sessions-guide.js`** `parseConfig()` (lines
  8-13, 30-87) already has a real, working block-authoring mechanism for this:
  a `filter-categories` authoring row parsed as JSON into
  `config.filterCategories: [{ id, label }]`, defaulting to
  `DEFAULT_FILTER_CATEGORIES = [{id:'track',label:'Channel'},{id:'type',label:'Session Type'}]`.
  **This already covers "add/remove/rename/reorder filter sections"** — it's just JSON
  array editing. `id` must currently map 1:1 to an existing session property name.
- **`event-libs/v1/blocks/sessions-guide/components/FilterPanel.js`**: renders the panel
  UI from `eventConfig.filterCategories`. Options per category are **not** authored —
  they're derived live via `useComputed` by scanning `sessions.value` and collecting
  every distinct value found at `s[id]` (array-tolerant: handles both string and array
  session fields already, see lines 26-39). Selections are per-category `Set`s
  (`localFilters`), applied via `dispatch({ type: 'SET_FILTERS', filters })` on an
  explicit "Apply" action (not live-as-you-check).
  - `if (!filterCategories || filterCategories.length === 0) return null;` (line 68) —
    **the panel is already implicitly optional**: an empty/absent `filter-categories`
    config value = no panel rendered. This already satisfies the PRD's "turn filters
    ON/OFF" requirement functionally, just not via a single explicit boolean toggle.
- **`event-libs/v1/blocks/sessions-guide/store/index.js`**: `activeFilters` state
  (`{}` initial), `SET_FILTERS` reducer replaces it wholesale (line 62-63).
- **`event-libs/v1/blocks/sessions-guide/utils/session-filters.js`** `filterSessions()`
  (lines 86-106): generic, config-agnostic filter application — for each active category,
  keeps sessions where `s[category]` (string or array) intersects the selected value
  `Set`; AND across categories, OR within a category. `matchesSearch()` (lines 108-116)
  is separate free-text search, unrelated to category filters.
- **`event-libs/v1/blocks/sessions-hub/sessions-hub.js`** `resolveTagObjects()`/
  `resolveTagWithGroup()` (lines 68-89): a **different, already-built** system —
  hierarchical tag-path resolution (`ns:parent/child` colon/slash IDs resolved against a
  `tagsData.namespaces[ns].tags[seg]` tree) used by the *other* sessions block. This is
  potentially directly relevant to the PRD's own open question about auto-populating
  filter sections from "tag paths" — **if** sessions-guide's real data source ends up
  using the same CaaS/namespace taxonomy. Not yet confirmed whether it does.

## 4. Gaps between the PRD and what exists today

1. **No per-value curation.** PRD wants authors to "add/remove tags to each section" —
   i.e. hand-pick which specific values show up, not just show everything live data
   happens to contain. Today, `FilterPanel.js` always shows *every* distinct value found
   in the current session set for a given field — there's no way to restrict/curate that
   list via config.
2. **No explicit single ON/OFF toggle**, only the implicit empty-array behavior. Product
   may still want this — worth confirming either is acceptable or a friendlier boolean
   config key is wanted.
3. **1:1 category→field assumption.** Today a filter section's `id` must be an existing
   flat session property (`track`, `type`, `audience`, ...). The PRD's language ("create
   a filter section or bucket and attach/add/remove tags to each section") could imply
   something more flexible — an author-defined bucket that pulls together tags that don't
   all come from one underlying field. Needs a decision (see open questions).
4. **`Region` isn't on the session object at all yet** — would need to be added to
   `mapEslPayloadToRawSessions()`/`normalizeSessions()` in `sessions-api.js` if it's to be
   filterable, same pattern as the other real customAttributes already wired this session.

## 5. Open questions

Carried from the PRD, plus ones this cross-check raised. None answered yet.

1. **(PRD's own)** Can filter sections be auto-populated from tag paths? —
   `sessions-hub.js`'s namespace/tag-path resolver may be the mechanism, *if* the same
   taxonomy applies here. Needs confirmation with whoever owns the RF/EMC→CaaS tag
   mapping.
2. Is a "filter section" always exactly one customAttribute/session field (today's
   model), or can authors mix hand-picked values across different underlying attributes
   into one custom bucket? This changes the config shape materially.
3. How is per-value curation (add/remove tags within a section) actually authored — a
   JSON array of literal values in the block table, a richer DA authoring UI, something
   else? Depends on answer to #2.
4. Real customAttribute `values[].valueId` are UUIDs scoped to a specific event's Config
   entry — not portable across events. If config ever references specific tags by id
   rather than by label/value-slug, that has migration/portability implications across
   events. Worth deciding whether config should reference the stable `value` slug instead.
5. `Region` is MAX-only per the PRD table — presumably other events simply don't author a
   Region filter section; confirm there's no other hidden assumption baked in anywhere.
6. Where does `Region` actually come from data-wise for MAX specifically — is it a real
   `customAttribute` like the others, or something else? Not yet probed.

## 6. Likely surfaces to touch (once an approach is picked — not started)

- `event-libs/v1/blocks/sessions-guide/sessions-guide.js` (`parseConfig()` — config shape)
- `event-libs/v1/blocks/sessions-guide/components/FilterPanel.js` (UI)
- `event-libs/v1/blocks/sessions-guide/utils/session-filters.js` (filtering logic)
- `event-libs/v1/blocks/sessions-guide/store/index.js` (`activeFilters` state shape, if it changes)
- `event-libs/v1/services/sessions/sessions-api.js` (if new fields like `Region` need mapping)

## Changelog

- 2026-07-13: Initial draft — PRD tab summarized, cross-checked against real ESL data,
  current codebase state documented, open questions listed. No approach decided yet.
