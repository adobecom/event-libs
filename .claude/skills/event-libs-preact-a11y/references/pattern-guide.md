# Preact Pattern Guide (event-libs)

Use these patterns with the repo's HTM syntax and bundled Preact surface. Prefer existing shared
components and utilities when they already implement the correct behavior.

## HTM attributes and events

- Use `class`, not `className`, on native HTM elements. A component prop may still be named
  `className` when that is its declared API, as with the shared `Icon` component.
- Follow the existing lowercase native event convention: `onclick=${handler}`.
- Add `type="button"` to non-submit buttons.
- Pass native boolean properties as booleans or `undefined`. Keep ARIA states stable and explicit,
  commonly with `String(value)`.
- Do not imperatively set attributes that Preact owns; bind them to the source state in the template.

## Reusable icon controls

- Prefer `IconButton` for session-guide icon-only actions and always provide its required `label`.
- Change the label with the action: "Add to favorites" → "Remove from favorites".
- Use `pressed` only for true toggle buttons. Do not add `aria-pressed` to ordinary actions.
- The shared `Icon` component emits a decorative, `aria-hidden` span. Put meaning on the containing
  control or adjacent text rather than the icon.

## Signals, Context, and reducer state

- Shared session/auth/action state lives in Signals; session-guide chrome lives in Context/reducer
  state. Trace both before changing a component.
- Read the same state source for the visual modifier, accessible label, and ARIA state.
- Clean up every Signal `.subscribe()` call returned from an effect.
- Avoid mirroring a Signal into local state unless a distinct draft state is required, such as a
  filter panel whose choices are applied only after confirmation.

## Dialogs, drawers, and nested overlays

- Use `role="dialog"`, `aria-modal="true"`, and an accessible label/title for modal surfaces.
- Activate focus management in an effect after the ref is populated and return the trap cleanup.
- Restore the previously focused trigger on cleanup.
- A filter dialog opened inside the sessions drawer is a separate modal layer. Its close must return
  focus within the drawer, not behind the entire widget.
- Portal-based widgets appended to `document.body` must manage background interaction and cleanup,
  including body overflow and the portal node itself when the block unmounts/reinitializes.

## Tabs

- A complete tab pattern connects each `role="tab"` with a `role="tabpanel"` through ids,
  `aria-controls`, and `aria-labelledby`.
- Use a roving `tabindex`: selected tab `0`, other enabled tabs `-1`.
- Support Left/Right (or Up/Down for vertical tabs), Home, and End. Decide whether selection follows
  focus or requires Enter/Space, then implement consistently.
- If controls merely filter content and do not expose tab panels, use pressed buttons or native
  radios instead of incomplete tab semantics.

## Filters and multi-select choices

- Use native checkboxes when the interaction is conceptually a form selection. Toggle buttons with
  `aria-pressed` are acceptable when they represent independent on/off filter pills.
- Name option groups from visible category text where possible, not raw internal ids.
- Preserve a draft selection separately from applied state only when the Apply action is meaningful.
- Reset/apply actions must update visible selection and accessible pressed/checked state together.

## Carousels and dynamic rows

- Name previous/next controls and disable them natively when no movement is possible.
- Use stable session ids as list keys so focus and component identity survive data updates.
- Announce user-initiated slide changes politely if the changed content is not otherwise apparent.
- Do not announce background polling or every Signal refresh.
- Pause automatic movement for focus, hover, and reduced-motion preferences.

## Loading, pending actions, and toasts

- Keep `role="status"` containers mounted where practical and update their content.
- Bind `aria-busy` to the region being updated, not indiscriminately to the whole application.
- Native `disabled` prevents repeat activation; provide status text when the pending result is not
  otherwise understandable.
- Use `role="alert"` only for errors that require immediate attention.

## Unit and integration tests

- The shared HTM mock is suitable for assertions such as `out.includes('aria-pressed=true')`.
- Its `useEffect` is a no-op and event functions are omitted from output, so it cannot verify an
  effect-installed focus trap or an `onclick` handler.
- Test pure state reducers and imperative utilities directly.
- Use real Preact in a browser/integration surface for rerender-driven ARIA and end-to-end keyboard
  behavior; state clearly when that layer was not run.
