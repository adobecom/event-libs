import { h, render } from '../../deps/htm-preact.js';
import { detectUserTimezone } from './utils/time.js';
import { SessionGuideProvider } from './store/index.js';
import { App } from './components/App.js';
import { getApiConfig } from '../../utils/session-store.js';

// Default filter categories — override via block authoring table (filter-categories: JSON)
// Each entry: { id: string (maps to session property), label: string (display name) }
const DEFAULT_FILTER_CATEGORIES = [
  { id: 'track', label: 'Channel' },
  { id: 'type', label: 'Session Type' },
];

// TODO: remove once featured-sessions is authored via block config. Real Adobe MAX 2025
// session ids (Oct 26-30), 3 per day (fewer on 10-26, which only has 2 real sessions).
// Skips titles marked "(FULL)" where a non-full alternative was available for that day.
const REAL_FEATURED_IDS = [
  '9de49a56-cfd9-4b72-b13d-571869471ff7', 'e5fc404a-4de1-4a05-8a8b-5254e2d9b4ec', // 10-26
  '0adf74b7-0962-4b7f-b7db-dada61bd0d48', '2becf60c-a551-4097-a55b-b76291a64582', '4721b332-490d-46af-b33c-86ea735295ff', // 10-27
  '7e2c6316-518b-45f8-a033-000ec25fd2ec', '8a9b20ec-3eac-4e52-9077-361ebc793e6d', 'e810bca1-42d0-428f-92a9-ee55cc949df0', // 10-28
  'a0807397-e7bd-4cee-a917-86381a8b7e5c', '31b386e6-2ba5-4f1d-8dda-32f421afb563', '9a52dadb-2849-431c-bafd-99687d8d6f52', // 10-29
  '15fe5cb7-3fb2-4a48-bac4-7ad47f9f450b', '37eb706b-4739-4776-a5d3-37e345fb1fc0', 'b5cce795-6656-44ac-a978-4c26053e1350', // 10-30
];

function parseConfig(el) {
  const config = {
    title: '',
    showConflictModal: false,
    filterCategories: DEFAULT_FILTER_CATEGORIES,
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
    eventConfig.featuredSessionIds = REAL_FEATURED_IDS;
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
