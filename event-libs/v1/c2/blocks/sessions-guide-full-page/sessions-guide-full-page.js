// Full-page variant of the sessions guide block.
// Registered as 'sessions-guide-full-page' — author writes the block with class "sessions-guide-full-page".
// Identical init flow as sessions-guide.js but surface is forced to 'page'.
// Lives in its own block folder (Milo requires blocks/<name>/<name>.js) but reuses the
// shared store/components/utils that live under the sessions-guide/ block — see that
// block's PLAN.md "File Structure" section for what's shared vs. block-local.
// Preact must come from the same local vendored copy sessions-guide.js/store/index.js use
// (not Milo's own deps/htm-preact.js) — a second Preact instance breaks hooks state
// (SessionGuideProvider's useReducer) with "Cannot read properties of undefined (reading '__$f')".
import { h, render } from '../../../deps/htm-preact.js';
import { getEventApiConfig } from '../../../utils/session-store.js';
import { parseSessionsGuideConfig } from '../sessions-guide/utils/parse-config.js';
import { SessionGuideProvider } from '../sessions-guide/store/index.js';
import { App } from '../sessions-guide/components/App.js';

export default async function init(el) {
  const guideConfig = parseSessionsGuideConfig(el, { logPrefix: 'sessions-guide-full-page', forcedSurface: 'page' });
  guideConfig.registerUrl = getEventApiConfig()?.registerUrl || '/register';

  el.innerHTML = '';
  el.dataset.theme = guideConfig.theme;

  render(
    h(SessionGuideProvider, { guideConfig }, h(App, null)),
    el,
  );
}
