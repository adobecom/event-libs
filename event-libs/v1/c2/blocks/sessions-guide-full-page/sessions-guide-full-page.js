// Full-page variant of the sessions guide block — identical init flow as sessions-guide.js
// but surface is forced to 'page'. Own block folder, shared store/components/utils; see
// PLAN.md §6 for why (Milo's folder convention, and a real Preact-instance bug it fixed).
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
