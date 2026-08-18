# DA Apps

Standalone DA (Document Authoring) apps used by authors from within `da.live`.

## Apps

- `tier-1-event-configurator.html`
- `schedule-maker.html`

## Running locally

From the repo root, start a static server:

```sh
npx serve event-libs/tools/da-apps -p 3000 -c serve.json
```

Then open the app inside `da.live`, pointed at your local server via `?ref=local`:

```
https://da.live/app/adobecom/da-events/tools/da-apps/tier-1-event-configurator?ref=local
```

### Why not `aem up`?

These are standalone static HTML pages loaded directly by `da.live` in an
iframe — they don't go through the AEM/Helix pipeline (`fstab` resolution,
markdown rendering, block decoration) that `aem up` provides for event-libs
blocks and da-events pages. A plain static server is all they need.
