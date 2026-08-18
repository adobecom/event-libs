# DA Apps

Standalone DA (Document Authoring) apps used by authors from within `da.live`.

## Apps

- `tier-1-event-configurator.html`
- `schedule-maker.html`

## Running locally

From the repo root, start a static server:

```sh
npm run da-apps
```

This serves the `event-libs` package root (not this `tools/da-apps` folder
directly), because `?ref=local` proxies requests to `localhost:3000` while
keeping the full production-style path (e.g.
`/tools/da-apps/tier-1-event-configurator`, extensionless) — the server root
has to mirror that path structure. `serve` resolves the extensionless request
to the matching `.html` file automatically. Serving from the package root
also makes this file's own root-relative asset references (e.g.
`/tier-1-event-configurator/tier-1-event-configurator.js`) resolvable.
`serve.json` lives at `event-libs/serve.json` so `serve` picks it up
automatically as the served root's config.

Then open the app inside `da.live`, pointed at your local server via `?ref=local`:

```
https://da.live/app/adobecom/da-events/tools/da-apps/tier-1-event-configurator?ref=local
```

### Why not `aem up`?

These are standalone static HTML pages loaded directly by `da.live` in an
iframe — they don't go through the AEM/Helix pipeline (`fstab` resolution,
markdown rendering, block decoration) that `aem up` provides for event-libs
blocks and da-events pages. A plain static server is all they need.
