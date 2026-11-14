# Timing Framework: scheduled fragment execution

The [Timing Framework](../../event-libs/v1/features/timing-framework/README.md)
is a worker-driven **page-content scheduler**. It swaps fragments inside
`chrono-box`; it does not create catalog records or register attendees.
Authoring belongs to [Schedule Maker](schedule-maker.md); catalog playback is a
[separate pipeline](session-state.md).

Both chrono-box implementations accept a two-column configuration table:

- `schedule`: JSON array of runtime entries.
- `schedule-id`: lookup key in page metadata `schedules`, a JSON object keyed by ID.

Inline `schedule` takes precedence. The Schedule Maker auto-block produces that
form. Its `data-schedule-id` is descriptive, not a `schedule-id` lookup row.

Runtime entries use this contract:

```json
[
  {
    "title": "Before the session",
    "pathToFragment": "/events/example/fragments/before",
    "toggleTime": 1793898000000
  },
  {
    "title": "Live session",
    "pathToFragment": "/events/example/fragments/live",
    "toggleTime": 1793901600000,
    "mobileRider": { "sessionId": "MR_MEDIA_ID" }
  },
  {
    "title": "After the session",
    "pathToFragment": "/events/example/fragments/after",
    "toggleTime": 1793905200000
  }
]
```

`toggleTime` is epoch **milliseconds**, not seconds. Keep entries chronological:
chrono-box builds a doubly linked list in supplied order; it does not sort.
For an initial pre-event view, provide a first slot whose time has already passed.
A future-only schedule can initially leave the host empty.

## Execution and plugin contracts

Chrono-box reads the schedule, assigns an instance ID, establishes the shared
per-tab `chrono-box-tab-id` in sessionStorage, and imports only needed plugins.
`mobileRider` maps to `plugins/mobile-rider/plugin.js`; `metadata` maps to
`plugins/metadata/plugin.js` under `event-libs/v1/features/timing-framework/`.

The deployed worker entry is
[worker-traditional.js](../../event-libs/v1/features/timing-framework/worker-traditional.js),
attempted as a module worker first and fetched into a Blob worker on construction
failure. [worker.js](../../event-libs/v1/features/timing-framework/worker.js)
exports the testable class;
[testing.js](../../event-libs/v1/features/timing-framework/testing.js) provides its
testing manager. Keep all three aligned: the traditional worker inlines the
testing manager because its Blob fallback cannot import ES modules.

The main thread sends `{ schedule, plugins, testing, tabId }`. Plugins are
serialized snapshots, not live Maps. Worker-side stores receive
`mobile-rider-store` and `metadata-store` BroadcastChannel updates filtered by
`tabId`. The shared `time-cache-store` channel distributes clock cache updates.
See [players](video-players.md) for the MR status/stream-end producer.

The worker positions against the best immediately available clock and validates
against `https://time.akamai.com/`. API seconds become milliseconds; cached server
time advances using `performance.now()`. It uses a five-minute base request
interval, ten-minute cache TTL, and backoff/jitter on failures, falling back to
cached/local time. Schedule ticks occur every 500-1500 ms while another slot
remains, unless testing stops polling.

Important transition semantics:

- Time-only slots advance when current time is **greater than** `toggleTime`.
- An active current MR stream holds its slot past the next scheduled time
  (overrun). An ended current MR stream can advance early (underrun).
- Inactive MR slots whose time has passed are walked past before content is
  posted. Future MR slots are not entered early solely because status is known;
  current-stream underrun is the exception.
- `metadata` is an **array** of `{ key, expectedValue }` conditions. The plugin
  resolves keys with `parseMetadataPath()`. With a metadata store present, all
  conditions must match; no expected value means a non-empty value is enough.
  This branch returns the condition result directly, rather than additionally
  enforcing the normal time gate. A next MR slot has its own earlier time check.
- Outgoing messages are deduplicated by `pathToFragment`, not title or session ID.
  Reusing one path for successive slots does not force a fragment reload.

Chrono-box loads each selected path with Milo's fragment loader, which decorates
and loads its blocks. Relative root paths receive the locale prefix. An empty
path clears content without fetching the current page. Initialization waits for
first fragment handling with a three-second timeout; the worker continues after
initialization resolves. C1 also reapplies page theme rules after swaps.

Before replacement, chrono-box emits `chrono-box:before-swap`, runs registered
outbound cleanups, removes tracked reparented content, and removes nodes marked
`data-chrono-box-teleport` for the instance. Use the exported
`registerChronoBoxOutboundCleanup()` for fragment-owned resources surviving
outside the host. Do not assume DOM replacement terminates the worker or closes
all plugin channels; the current initializer has no general worker-disposal API.

## Timing QA

| Query parameter | Behavior |
| --- | --- |
| `timing=<epoch-ms>` | Position at the supplied time and stop subsequent timer polling. |
| `serverTime=<epoch-ms>` | Start an offset clock at that time and continue advancing/polling. |
| `avoidStreamEndFlag=true` | Ignore MR overrun/stream-end rules and use timing for those transitions; MR players skip their stream-end listener. |

`timing` takes precedence over `serverTime`. These switches are not
production-environment gated. Never leave QA parameters on production links.
See [testing](testing.md): unit tests import the module worker, not the deployed
traditional entry, so parity and actual browser worker loading need attention.
