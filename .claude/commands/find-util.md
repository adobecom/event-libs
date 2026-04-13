Before writing new code, search the existing utilities and features for something that already does "$ARGUMENTS".

Search in this order:

1. **`event-libs/v1/utils/`** — core utilities (utils.js, data-utils.js, date-time-helper.js, decorate.js, esp-controller.js, profile.js, dictionary-manager.js, constances.js)
2. **`event-libs/v1/features/`** — carousel, timing-framework, indexer-widget
3. **`event-libs/v1/deps/`** — vendored dependencies (block-mediator)

Use Grep to search for relevant function names, then Read any promising files to understand what they actually do.

Report:
- **Found**: function/export name, file path, what it does, how to import and call it
- **Not found**: confirm the gap is real and suggest where new code should live (utils.js for generic helpers, a new feature directory for larger standalone features, or inline in the block)

The goal is to avoid reimplementing what already exists.
