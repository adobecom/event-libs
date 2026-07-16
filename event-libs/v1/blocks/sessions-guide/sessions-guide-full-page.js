// Full-page variant of the sessions guide block.
// Registered as 'sessions-guide-full-page' — author writes the block with class "sessions-guide-full-page".
// Identical init flow as sessions-guide.js but surface is forced to 'page'.
import { LIBS, getEventConfig } from '../../utils/utils.js';
import { getApiConfig } from '../../utils/session-store.js';
import { detectUserTimezone } from './utils/time.js';

async function loadPreact() {
  const miloLibs = getEventConfig()?.miloConfig?.miloLibs ?? LIBS;
  return import(`${miloLibs}/deps/htm-preact.js`);
}

// Default filter categories — override via block authoring table (filter-categories: JSON)
const DEFAULT_FILTER_CATEGORIES = [
  { id: 'track', label: 'Channel' },
  { id: 'type', label: 'Session Type' },
];

function parseConfig(el) {
  const config = {
    title: '',
    showConflictModal: false,
    filterCategories: DEFAULT_FILTER_CATEGORIES,
    trackIcons: {},
    trackColors: {},
    theme: 'light',
    surface: 'page', // always page for this block
  };
  [...el.querySelectorAll(':scope > div')].forEach((row) => {
    const cells = row.querySelectorAll(':scope > div');
    const key = cells[0]?.textContent?.trim().toLowerCase();
    const val = cells[1]?.textContent?.trim();
    if (!key || val === undefined) return;
    switch (key) {
      case 'event-title': config.title = val; break;
      case 'show-conflict-modal': config.showConflictModal = val.toLowerCase() === 'true'; break;
      case 'theme': if (val) config.theme = val; break;
      case 'filter-categories':
        try { config.filterCategories = JSON.parse(val); } catch {
          window.lana?.log('[sessions-guide-full-page] invalid filter-categories JSON');
        }
        break;
      case 'track-icons':
        try { config.trackIcons = JSON.parse(val); } catch {
          window.lana?.log('[sessions-guide-full-page] invalid track-icons JSON');
        }
        break;
      case 'track-colors':
        try { config.trackColors = JSON.parse(val); } catch {
          window.lana?.log('[sessions-guide-full-page] invalid track-colors JSON');
        }
        break;
      default: break;
    }
  });
  config.userTz = detectUserTimezone();
  return config;
}

export default async function init(el) {
  const eventConfig = parseConfig(el);
  eventConfig.registerUrl = getApiConfig()?.registerUrl || '/register';

  const preact = await loadPreact();
  const { render } = preact;

  const { SessionGuideProvider } = await import('./store/index.js');
  const { App } = await import('./components/App.js');

  el.innerHTML = '';
  el.dataset.theme = eventConfig.theme;

  render(
    preact.h(SessionGuideProvider, { eventConfig }, preact.h(App, null)),
    el,
  );
}
