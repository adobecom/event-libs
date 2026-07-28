// Full-page variant of the sessions guide block.
// Registered as 'sessions-guide-full-page' — author writes the block with class "sessions-guide-full-page".
// Identical init flow as sessions-guide.js but surface is forced to 'page'.
import { LIBS, getEventConfig } from '../../utils/utils.js';
import { getApiConfig } from '../../utils/session-store.js';
import { parseSessionsGuideConfig } from './utils/parse-config.js';

async function loadPreact() {
  const miloLibs = getEventConfig()?.miloConfig?.miloLibs ?? LIBS;
  return import(`${miloLibs}/deps/htm-preact.js`);
}

export default async function init(el) {
  const guideConfig = parseSessionsGuideConfig(el, { logPrefix: 'sessions-guide-full-page', forcedSurface: 'page' });
  guideConfig.registerUrl = getApiConfig()?.registerUrl || '/register';

  const preact = await loadPreact();
  const { render } = preact;

  const { SessionGuideProvider } = await import('./store/index.js');
  const { App } = await import('./components/App.js');

  el.innerHTML = '';
  el.dataset.theme = guideConfig.theme;

  render(
    preact.h(SessionGuideProvider, { guideConfig }, preact.h(App, null)),
    el,
  );
}
