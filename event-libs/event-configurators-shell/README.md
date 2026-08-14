# Event Configurators Shell

A thin tabbed wrapper that co-locates the Tier 1 Event Configurator and the
Session Guide Configurator under one page. It doesn't merge their config
models, data, or editors — each tab mounts that app's own, unmodified
provider stack (`DAContext`/`EventEnvContext`/`NavigationContext`/
`ConfigsContext`) and top-level component exactly as its own standalone
entry point does. Only the active tab's tree is mounted; switching tabs
unmounts the previous one rather than hiding it, since each app assumes it
owns the whole page (its own toasts, its own full-height layout).

Neither existing app was changed to support this — `EventConfiguratorsShell.js`
imports each app's provider/component modules directly from their own
directories.

## Loader

`tools/da-apps/event-configurators.html` in `da-events` (separate PR) mounts
this app via ES module import, branch-driven by the DA SDK's `context.ref` —
same pattern as the Tier 1 Event Configurator and Session Guide Configurator's
own loaders.

## Local development

Same pattern as the other two apps:

```
https://da.live/app/adobecom/da-events/tools/da-apps/event-configurators?ref=local
```

```bash
cd event-libs   # the inner event-libs/ folder, not the git repo root
npx serve . --listen 3000
```

DA requests `/tools/da-apps/event-configurators` → `serve` returns
[tools/da-apps/event-configurators.html](../tools/da-apps/event-configurators.html).
Requires being signed in to da.live in the browser you open that URL in —
each tab gets its own real DA SDK handshake when you switch to it.
