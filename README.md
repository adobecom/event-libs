# Event is now a library
Use this library to power your EMC generated pages. (or event static pages, if you prefer manual authoring)

## Steps

-- Event Library importation guide comming soon.

For your newly created project

Follow the instructions detailed here to set up your AEM Sidekick:
https://www.aem.live/docs/sidekick

## Developing
1. Install the AEM CLI: sudo npm install -g @adobe/aem-cli
1. Run `aem up` this repo's folder. (opens your browser at `http://localhost:3000`)
1. Open this repo's folder in your favorite editor and start coding.

## Testing
```sh
npm run test
```
or:
```sh
npm run test:watch
```
This will give you several options to debug tests. Note: coverage may not be accurate.

## LANA logging

Use the helpers in `event-libs/v1/utils/lana-log.js`. They pass LANA's native
`severity` option, which populates Splunk's `l_severity` field for the existing
Rundeck jobs. Do not pass `l_severity` as a custom option or encode severity in
scope tags. The `[scope]` message prefix identifies the module and operation
for triage; alert routing does not require a list of module tags.

Rundeck groups by the exact `l_message`. The shared logger therefore does not
append user agent, viewport, language, or environment to messages. ESP registration
failures and RainFocus failures use a fixed operation scope plus an HTTP status
or a fixed failure category. They omit event/attendee/session/campaign IDs,
request URLs, raw response bodies, and arbitrary exception text. For example:

```text
[esp-controller,create-attendee] Request failed: http-status=503
[esp-controller,get-attendee] Invalid JSON response
[rainfocus,addSession] Unexpected business response
```

Use `logRegistrationFailure(scope, response)` for failed registration HTTP
responses and `logRegistrationError(scope, error)` for caught registration request
exceptions. Keep scopes constant; do not interpolate identities or request data.
JSON parse errors are logged without body fragments. Original error details
remain in API results or thrown exceptions for callers; they are not sent as
additional diagnostic logs. The deployed LANA client does not support a separate
arbitrary diagnostic-data field, so do not invent custom options to carry them.
Other callers can still include dynamic data; removing browser context does not
normalize every legacy message.

`critical` is reserved for service failures (5xx, HTTP 408 timeouts, and HTTP 429
throttling), network failures, or unexpected runtime failures that block
event/session registration, cancellation, attendee creation/update, or
RSVP-token validation. This includes event/attendee prerequisite lookups made
during an active RSVP submission, but not background lookups. These logs use
100% sampling. Successful attendee responses missing the required attendee ID
are unexpected registration-blocking failures; submission stops and logs one
critical error instead of sending an invalid registration request.
Other registration HTTP 4xx rejections, including validation errors,
full-session conflicts, and stale tokens
at submit time, are `warning`, not outage signals. Known unusable RSVP tokens
(401/404/409/410) during the load-time validation check remain `info`.
An unreadable failure body preserves the original HTTP status and logs a warning,
without emitting a second critical failure.

RainFocus add/remove/swap schedule calls use the same transport classification.
Unreadable successful responses and unexpected business response codes are
critical for those mutations. Expected conflicts (code 13), access rejections
(code 27), and already-scheduled results (code 15) are not critical. Read-only
RainFocus calls and favorites do not receive critical severity. RainFocus logs
exclude response URLs and raw response bodies because URLs carry auth tokens
and bodies can contain attendee information.

Other shared-helper errors remain `error` with 10% sampling. `debug`, `info`,
and `warning` use LANA's default sampling. The deferred hydration logger also
moves scope tags into the message prefix, retaining its existing severity,
sampling options, and startup retry behavior. `cso` is not a supported LANA
severity; do not use it without a coordinated client and monitoring change.

### Monitoring limits

Events is already included in the existing Rundeck jobs. Gary's 2026-10-05
guidance lists these thresholds per exact message, using observed LANA counts:

| Severity | Window | Count |
| --- | --- | --- |
| critical | 24 hours | 1,500 |
| error | 24 hours | 3,000 |
| warning | 7 days | 20,000 |
| other | 7 days | 20,000 |

Confirm whether the critical job is active; more frequent critical processing
and automatic CSO creation are planned, not established by this frontend change.
Stable messages help aggregation but do not guarantee a threshold will be met.
At 10% sampling, 3,000 observed error logs represent roughly 30,000 underlying
occurrences; critical logs request 100% sampling. These jobs detect high-volume
issues, not necessarily real-time or low-volume registration outages. A separate
short-window registration alert, activation, routing, and end-to-end
Splunk/Rundeck verification must be agreed with the monitoring owners.
