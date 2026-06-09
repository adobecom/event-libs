import { LIBS, getEventConfig } from '../../utils/utils.js';
import { detectUserTimezone } from './utils/time.js';

async function loadPreact() {
  const miloLibs = getEventConfig()?.miloConfig?.miloLibs ?? LIBS;
  return import(`${miloLibs}/deps/htm-preact.js`);
}

// Default filter categories — override via block authoring table (filter-categories: JSON)
// Each entry: { id: string (maps to session property), label: string (display name) }
const DEFAULT_FILTER_CATEGORIES = [
  { id: 'track', label: 'Channel' },
  { id: 'type', label: 'Session Type' },
];

function parseConfig(el) {
  const config = {
    title: '',
    rfApiUrl: '',
    rfApiProfileId: '',
    showConflictModal: false,
    filterCategories: DEFAULT_FILTER_CATEGORIES,
    trackIcons: {},
    trackColors: {},
    manualOnDemandTransitionTime: null,
    theme: 'dark',
    mrEnv: 'dev',
  };
  [...el.querySelectorAll(':scope > div')].forEach((row) => {
    const cells = row.querySelectorAll(':scope > div');
    const key = cells[0]?.textContent?.trim().toLowerCase();
    const val = cells[1]?.textContent?.trim();
    if (!key || val === undefined) return;
    switch (key) {
      case 'event-title': config.title = val; break;
      case 'rainfocus-api-url': config.rfApiUrl = val; break;
      case 'rainfocus-api-profile-id': config.rfApiProfileId = val; break;
      case 'show-conflict-modal': config.showConflictModal = val.toLowerCase() === 'true'; break;
      case 'manual-on-demand-transition-time': config.manualOnDemandTransitionTime = val || null; break;
      case 'theme': if (val) config.theme = val; break;
      case 'mr-env': if (val) config.mrEnv = val; break;
      case 'filter-categories':
        try { config.filterCategories = JSON.parse(val); } catch {
          window.lana?.log('[sessions-guide] invalid filter-categories JSON');
        }
        break;
      case 'track-icons':
        try { config.trackIcons = JSON.parse(val); } catch {
          window.lana?.log('[sessions-guide] invalid track-icons JSON');
        }
        break;
      case 'track-colors':
        try { config.trackColors = JSON.parse(val); } catch {
          window.lana?.log('[sessions-guide] invalid track-colors JSON');
        }
        break;
      default: break;
    }
  });
  config.surface = el.classList.contains('page') ? 'page' : 'widget';
  config.userTz = detectUserTimezone();
  return config;
}

export default async function init(el) {
  const eventConfig = parseConfig(el);

  const preact = await loadPreact();

  const { render } = preact;
  const { buildStore } = await import('./store/index.js');
  const { fetchSessions } = await import('./services/sessions-api.js');
  const store = buildStore(preact);
  const { SessionGuideProvider } = store;
  const { buildApp } = await import('./components/App.js');
  const App = buildApp(preact, store);

  // Pre-fetch so the initial render already has sessions (required in stub/SSR
  // environments where useEffect is a no-op).
  const initialSessions = await fetchSessions(eventConfig.rfApiUrl).catch(() => []);

  el.innerHTML = '';

  // Lazy factory — defers App() until after SessionGuideProvider sets context.
  const appFactory = () => preact.h(App, null);

  if (eventConfig.surface === 'widget') {
    const portal = document.createElement('div');
    portal.classList.add('sg-portal');
    portal.dataset.theme = eventConfig.theme;
    document.body.appendChild(portal);
    render(
      preact.h(SessionGuideProvider, { eventConfig, initialSessions }, appFactory),
      portal,
    );
  } else {
    el.dataset.theme = eventConfig.theme;
    render(
      preact.h(SessionGuideProvider, { eventConfig, initialSessions }, appFactory),
      el,
    );
  }
}
