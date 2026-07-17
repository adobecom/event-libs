import { h, render } from '../../deps/htm-preact.js';
import { SessionGuideProvider } from './store/index.js';
import { App } from './components/App.js';
import { getApiConfig } from '../../utils/session-store.js';
import { parseSessionsGuideConfig } from './utils/parse-config.js';

export default async function init(el) {
  const eventConfig = parseSessionsGuideConfig(el, { logPrefix: 'sessions-guide' });
  // registerUrl is sourced from page metadata (shared across blocks) via session-store,
  // already bootstrapped by decorateEvent before this block's init() runs.
  eventConfig.registerUrl = getApiConfig()?.registerUrl || '/register';

  el.innerHTML = '';

  if (eventConfig.surface === 'widget') {
    const portal = document.createElement('div');
    portal.classList.add('sg-portal');
    portal.dataset.theme = eventConfig.theme;
    document.body.appendChild(portal);
    render(
      h(SessionGuideProvider, { eventConfig }, h(App, null)),
      portal,
    );
  } else {
    el.dataset.theme = eventConfig.theme;
    render(
      h(SessionGuideProvider, { eventConfig }, h(App, null)),
      el,
    );
  }
}
