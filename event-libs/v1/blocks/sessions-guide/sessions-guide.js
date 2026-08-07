import { h, render } from '../../deps/htm-preact.js';
import { SessionGuideProvider } from './store/index.js';
import { App } from './components/App.js';
import { getApiConfig } from '../../utils/session-store.js';
import { parseSessionsGuideConfig } from './utils/parse-config.js';

export default async function init(el) {
  const guideConfig = parseSessionsGuideConfig(el, { logPrefix: 'sessions-guide' });
  // registerUrl is sourced from page metadata (shared across blocks) via session-store,
  // already bootstrapped by decorateEvent before this block's init() runs.
  guideConfig.registerUrl = getApiConfig()?.registerUrl || '/register';

  el.innerHTML = '';

  if (guideConfig.surface === 'widget') {
    const portal = document.createElement('div');
    portal.classList.add('sg-portal');
    portal.dataset.theme = guideConfig.theme;
    document.body.appendChild(portal);
    render(
      h(SessionGuideProvider, { guideConfig }, h(App, null)),
      portal,
    );
  } else {
    el.dataset.theme = guideConfig.theme;
    render(
      h(SessionGuideProvider, { guideConfig }, h(App, null)),
      el,
    );
  }
}
