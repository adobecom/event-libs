import { h, render } from '../../deps/htm-preact.js';
import { detectUserTimezone } from './utils/time.js';
import { SessionGuideProvider } from './store/index.js';
import { App } from './components/App.js';
import { fetchSessions, MOCK_FEATURED_IDS } from './services/sessions-api.js';
import { setupDevUser, seedDevStorage } from './services/dev-mock.js';

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
    registerUrl: '/register',
    showConflictModal: false,
    filterCategories: DEFAULT_FILTER_CATEGORIES,
    trackIcons: {},
    trackColors: {},
    manualOnDemandTransitionTime: null,
    featuredSessionIds: [],
    theme: null,
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
      case 'register-url': if (val) config.registerUrl = val; break;
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
      case 'featured-sessions':
        try { config.featuredSessionIds = JSON.parse(val); } catch {
          window.lana?.log('[sessions-guide] invalid featured-sessions JSON');
        }
        break;
      default: break;
    }
  });
  config.surface = el.classList.contains('page') ? 'page' : 'widget';
  config.userTz = detectUserTimezone();
  // Default theme by surface when not explicitly authored:
  // widget → dark (overlaid drawer sits on any host page background)
  // page   → light (full-page layout; dark tokens cascade into all rendered content)
  if (!config.theme) {
    config.theme = config.surface === 'page' ? 'light' : 'dark';
  }
  return config;
}

export default async function init(el) {
  // TODO: remove once real IMS/Rainfocus auth is wired up.
  setupDevUser();
  seedDevStorage();

  const eventConfig = parseConfig(el);
  // TODO: remove once featured-sessions is authored via block config
  if (!eventConfig.featuredSessionIds.length) {
    eventConfig.featuredSessionIds = MOCK_FEATURED_IDS;
  }
  const initialSessions = await fetchSessions(eventConfig.rfApiUrl).catch(() => []);

  el.innerHTML = '';

  // appFactory defers App() until after SessionGuideProvider sets _current,
  // so useContext works when App is called directly inside the provider function.
  const appFactory = () => h(App, null);

  if (eventConfig.surface === 'widget') {
    const portal = document.createElement('div');
    portal.classList.add('sg-portal');
    portal.dataset.theme = eventConfig.theme;
    document.body.appendChild(portal);
    render(
      h(SessionGuideProvider, { eventConfig, initialSessions }, appFactory),
      portal,
    );
  } else {
    el.dataset.theme = eventConfig.theme;
    render(
      h(SessionGuideProvider, { eventConfig, initialSessions }, appFactory),
      el,
    );
  }
}
