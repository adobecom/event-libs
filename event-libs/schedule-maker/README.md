# Schedule Maker

Schedule Maker is a standalone [Document Authoring (DA)](https://da.live) app for building and managing **page schedules** — named collections of timestamped content blocks that drive the [Timing Framework](../v1/features/timing-framework/README.md) on event pages. It runs full-screen inside DA (`da.live/app/{org}/{repo}/tools/da-apps/schedule-maker`), authenticates through the DA SDK, and uses a **link-first** model: all schedule data lives in the shared URL — no server-side sheets are written.

## Architecture Overview

### Technology

- **Preact + HTM** via `../../v1/deps/htm-preact.js` — components are tagged-template literals (`` html`...` ``), no JSX, no bundler.
- **Spectrum Web Components** — loaded at runtime from Milo libs (`sp-button`, `sp-textfield`, `sp-toast`, etc.).
- **DA SDK** (`https://da.live/nx/utils/sdk.js`) — supplies the auth token and the `{ org, repo }` context that scopes every instance to one content namespace.
- **admin.da.live API** — used only for `list` (folder scanning) and `source` (document read during sync). No sheets are written.

### Core Components

1. **Entry / bootstrap** ([schedule-maker.js](schedule-maker.js), [index.html](index.html))
   - `index.html` mounts `#app` and loads the module.
   - `schedule-maker.js` loads Spectrum components from `https://www.adobe.com/libs`, then renders the provider tree and root component.

2. **Context providers** (`context/`)
   - **[DAContext](context/DAContext.js)** — initializes the DA SDK, exposes `{ token, org, repo, isLoading, error }`, and pushes the token + authenticated `daFetch` into the controller.
   - **[NavigationContext](context/NavigationContext.js)** — page/mode state.
   - **[SchedulesContext](context/SchedulesContext.js)** — the app's state store: schedule list, active schedule, event folder, loading/error/toast flags, sync operations, and all local mutations. Consumed via the `useSchedulesData` / `useSchedulesOperations` / `useSchedulesUI` selector hooks.

3. **DA controller** ([scripts/da-controller.js](scripts/da-controller.js))
   - Wraps `admin.da.live` for document scanning: `listEventFolders`, `listFolder`, `syncSchedules`, and the hash-link rewrite pass.
   - Owns the concurrency machinery (bounded parallel pool, ETag-based conditional writes for the rewrite pass) and `decodeScheduleParam`. No sheet CRUD.

4. **UI** ([ScheduleMaker.js](ScheduleMaker.js) → [pages/Schedules.js](pages/Schedules.js))
   - Two-panel layout: a [Sidebar](components/Sidebar.js) (event picker, sync, schedule list with doc-reference paths) and a [ScheduleEditor](components/ScheduleEditor.js) (block editing).
   - The Home page is intentionally bypassed — the app always renders the Schedules layout.

### Data Flow

```
DA SDK ──(token, org, repo, daFetch)──▶ DAContext ──▶ da-controller
                                                          │
   UI ◀── SchedulesContext (state) ◀── sync scan ◀────────┘
                                                          │
                                            admin.da.live (list / source — read-only)
```

## Link-First Model

Every schedule is fully described by its **share link**:

```
https://da.live/app/{org}/{repo}/tools/da-apps/schedule-maker#schedule={base64}
```

The `#schedule=` hash fragment holds the entire schedule JSON (title, blocks, timestamps) encoded as base64. No server state is required to open or edit a schedule — click the link, the editor loads the schedule from the hash, you edit, you copy the new link.

### Schedule JSON Structure

```json
{
  "scheduleId": "uuid",
  "title": "string",
  "createdTime": "ISO 8601",
  "modificationTime": "ISO 8601",
  "blocks": [
    {
      "title": "string",
      "fragmentPath": "/path/to/fragment",
      "startDateTime": 1750000000000,
      "includeLiveStream": false,
      "liveStream": { "provider": "MobileRider", "streamId": "string" }
    }
  ]
}
```

`startDateTime` is stored as **epoch milliseconds**. `modificationTime` is stamped at Copy Link time. A block is "complete" when it has a `title`, `fragmentPath`, and `startDateTime` (and a `streamId` if `includeLiveStream` is set) — incomplete schedules show a warning icon in the sidebar.

> **Hash vs query param**: `?schedule=` (old ECC format) is also supported for reading. Sync detects both. New links always use `#schedule=` because DA forwards the hash fragment to the embedded iframe app, whereas query params are not forwarded.

## Deep-Link Loading

When DA opens the schedule-maker URL with a `#schedule=` fragment, the app reads and decodes the fragment on mount (`Schedules.js` `useEffect`) and opens the schedule directly in the editor. No sync or network request is needed.

Old `?schedule=` links from ECC open the app but do not auto-load; the author can use Sync to find and open them from the sidebar list.

## Sync

Sync is a **read-only scan** that discovers schedule links authored in DA documents and builds an in-memory list.

### Sync Flow ([syncSchedules](scripts/da-controller.js))

1. Recursively `list` all HTML docs under the event folder.
2. Fetch + regex-scan every doc **in parallel** (bounded at `SCAN_CONCURRENCY = 100`), collecting every `?schedule=` and `#schedule=` link found.
3. Decode each link's base64 payload using `decodeScheduleParam`.
4. Deduplicate by `scheduleId` (falling back to `title` for old no-id links). First occurrence per key wins.
5. Return `{ schedules, docRefs }` — `docRefs` maps each schedule key to the list of doc paths that reference it, shown as DA edit links in the sidebar.

No sheets are written. Sync only reads.

### Rewrite Pass (Temporary)

Until the production `decorate.js` fix ships, sync also rewrites any `#schedule=` hrefs it finds back to `?schedule=` query-param format so the production chronobox can load them. This pass uses ETag-based conditional writes with retries. It will be removed once the fix is on production.

### Sync Performance

- **`SCAN_CONCURRENCY`** (`100`) — max in-flight fetches. Watch for `429`s; `fetchText` retries with exponential backoff (0.3 s → 4 s), honoring `Retry-After`.
- **Fail loud, not silent** — a document that can't be read after retries causes sync to **abort with an error** rather than silently omit potential schedules.

## Key Features

| Feature | Component | Notes |
|---------|-----------|-------|
| **Event folder picker** | [EventPicker](components/EventPicker.js) | Lists folders via `admin.da.live/list`; last folder remembered in `localStorage`. `/` = whole repo. |
| **Fragment path browser** | [FragmentPathBrowser](components/editor/FragmentPathBrowser.js) | Column navigation over folders/HTML; defaults to `/events/events-shared/fragments`, or pre-navigates to the current path. |
| **Epoch datetime input** | [BlockEditor](components/editor/BlockEditor.js) | Local-time picker synced with an epoch-ms field. |
| **Excel import** | [SheetImporter](components/SheetImporter.js) | Imports schedules from an Excel/CSV file and creates them locally. Uses SheetJS (`v1/deps/xlsx.mjs`), vendored from `cdn.sheetjs.com/xlsx-0.20.3`. |
| **Copy Link** | [ScheduleHeader](components/editor/ScheduleHeader.js) | Copies a rich anchor (title + modification timestamp as link text, full `#schedule=` URL as href) to the clipboard for pasting into DA docs. |
| **Sync** | [da-controller.js](scripts/da-controller.js) | Scans all docs in the event folder and builds the sidebar schedule list with doc-reference paths. |
| **Discard** | [SchedulesContext](context/SchedulesContext.js) | Reverts the active schedule to the state it was in when last opened. |

## Access Control

The app contains **no custom permission logic**. It relies on DA's native repo permissions surfaced at the API level:

- User with edit access → API calls succeed.
- User without access → `admin.da.live` returns **403**, which the app catches and renders as a clear *"You do not have access to this repo"* state rather than a broken/empty UI.

## Local Development

DA proxies the app to `localhost` when you append `?ref=local` — using the **same path as production** so one URL works both ways:

```
https://da.live/app/adobecom/da-events/tools/da-apps/schedule-maker?ref=local
```

Serve from the **inner repo root** (which contains `tools/`, `schedule-maker/`, and `v1/`) so the entry path and the `../../v1/deps` imports both resolve:

```bash
cd event-libs/event-libs      # the directory that holds schedule-maker/ and v1/
npx serve . --listen 3000
```

- DA requests `/tools/da-apps/schedule-maker` → `serve` returns [tools/da-apps/schedule-maker.html](../tools/da-apps/schedule-maker.html), the local-dev entry.
- That entry loads assets via absolute paths (`/schedule-maker/...`), so its own location and the request's trailing slash don't matter.
- Milo/Spectrum is loaded from `https://www.adobe.com/libs`. To test against a different Milo build, edit the `LIBS` constant in `schedule-maker.js` directly — `?milolibs=` params on the parent DA page are not visible to the iframe.

## Deployment

- The app **code** is distributed from `adobecom/event-libs` under `schedule-maker/`.
- On aem.live it is served at `https://main--event-libs--adobecom.aem.live/event-libs/schedule-maker/…` (the repo nests content under an `event-libs/` prefix).
- Each content repo (`da-events`, `da-events-fg-pink`, …) registers its **own** entry point (e.g. `tools/da-apps/schedule-maker.html`) that loads the code from event-libs via absolute aem.live URLs and lets the DA SDK scope it to that repo. Adding a new repo requires only a new entry point — no app code changes.

## File Structure

```
event-libs/ (inner repo root — served locally)
├── tools/da-apps/schedule-maker.html   # local-dev entry (mirrors the da-events app path)
└── schedule-maker/
    ├── schedule-maker.js       # bootstrap: load Spectrum, render provider tree
    ├── schedule-maker.css      # app styles (imports component CSS)
    ├── ScheduleMaker.js        # root component (loading / error / layout)
    ├── constants.js            # DA origin, default fragment path, page config
    ├── utils.js                # schedule/block validation, (de)serialization, share URL
    ├── htm-wrapper.js          # re-exports html/h from v1 deps
    ├── context/
    │   ├── DAContext.js        # DA SDK init → token + org/repo
    │   ├── NavigationContext.js  # page/mode state
    │   └── SchedulesContext.js   # central state store + local mutations + sync
    ├── scripts/
    │   └── da-controller.js    # admin.da.live wrapper: list/scan, ETag rewrite, decoder
    ├── pages/
    │   ├── Home.js             # bypassed
    │   └── Schedules.js        # two-panel layout (Sidebar + Editor); hash deep-link on mount
    └── components/
        ├── Sidebar.js  EventPicker.js  SearchInput.js  SheetImporter.js  AddScheduleModal.js
        ├── ScheduleEditor.js  Modal.js
        └── editor/
            ├── ScheduleHeader.js  BlockEditor.js  FragmentPathBrowser.js
```

## Error Handling

- Network / API failures are logged via `window.lana` and returned as `{ ok: false, status, error }` from the controller.
- The UI surfaces errors as Spectrum toasts (`toastError` / `toastSuccess`) or, for repo-level access failures, an inline access-error panel.
- Unreadable-document aborts during sync surface actionable "please retry" messages rather than failing silently.
