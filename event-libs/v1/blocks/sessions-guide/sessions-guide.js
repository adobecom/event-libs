import { h, render } from '../../deps/htm-preact.js';
import { detectUserTimezone } from './utils/time.js';
import { SessionGuideProvider } from './store/index.js';
import { App } from './components/App.js';
import { MOCK_FEATURED_IDS } from '../../services/sessions/sessions-api.js';
import { getApiConfig } from '../../utils/session-store.js';

// Default filter categories — override via block authoring table (filter-categories: JSON)
// Each entry: { id: string (maps to session property), label: string (display name) }
const DEFAULT_FILTER_CATEGORIES = [
  { id: 'track', label: 'Channel' },
  { id: 'type', label: 'Session Type' },
];

// TODO: remove once category-colors is authored via block config
const MOCK_CATEGORY_COLORS = {
  'social-media': '#FF6B35',
  'design-and-illustration': '#9D50BB',
  'mainstage': '#E91E63',
  '3d': '#00BCD4',
  'photography': '#4CAF50',
  'business': '#2196F3',
  'content-creator': '#FF9800',
  'education': '#FF5722',
  'branding': '#607D8B',
  'generative-ai': '#8BC34A',
  'video': '#F44336',
};

function parseConfig(el) {
  const config = {
    title: '',
    showConflictModal: false,
    filterCategories: DEFAULT_FILTER_CATEGORIES,
    trackIcons: {},
    trackColors: {},
    categoryColors: {},
    featuredSessionIds: [],
    theme: null,
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
      case 'category-colors':
        try { config.categoryColors = JSON.parse(val); } catch {
          window.lana?.log('[sessions-guide] invalid category-colors JSON');
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
  const eventConfig = parseConfig(el);
  // TODO: remove once featured-sessions is authored via block config
  if (!eventConfig.featuredSessionIds.length) {
    eventConfig.featuredSessionIds = MOCK_FEATURED_IDS;
  }
  // TODO: remove once category-colors is authored via block config
  if (!Object.keys(eventConfig.categoryColors).length) {
    eventConfig.categoryColors = MOCK_CATEGORY_COLORS;
  }
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
