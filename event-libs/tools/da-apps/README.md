# DA Apps

Standalone DA (Document Authoring) apps used by authors from within `da.live`.

## Apps

- `tier-1-event-configurator.html`
- `schedule-maker.html`

## Running locally

From this directory (`event-libs/tools/da-apps`), start a static server:

```sh
npx serve . -p 3000 -c serve.json
```

Then open the app inside `da.live`, pointed at your local server via `?ref=local`:

```
https://da.live/app/adobecom/da-events/tools/da-apps/tier-1-event-configurator?ref=local
```
