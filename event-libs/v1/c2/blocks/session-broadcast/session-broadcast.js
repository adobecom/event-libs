import { h, render } from '../../../deps/htm-preact.js';
import { readBlockConfig } from '../../../utils/utils.js';
import { BroadcastApp } from './components/BroadcastApp.js';

const CONFIG_KEYS = {
  'also-live-title': 'alsoLiveTitle',
  'upcoming-title': 'upcomingTitle',
  'view-all-details-label': 'viewAllDetailsLabel',
  'session-ended-image': 'sessionEndedImageHtml',
};

const DEFAULTS = {
  alsoLiveTitle: 'Currently Live',
  upcomingTitle: 'Upcoming',
  viewAllDetailsLabel: 'View all details',
  sessionEndedImageHtml: '',
};

// Authored as plain block-content rows (readBlockConfig), not a Configurator-app JSON blob
// like sessions-guide — see the plan's Authoring decision. sessionEndedImageHtml is carried
// through unparsed (raw picture markup) for Phase 3's ended-state background; unused until then.
export function parseBroadcastConfig(el) {
  const raw = readBlockConfig(el);
  const config = { ...DEFAULTS };
  Object.entries(CONFIG_KEYS).forEach(([rowKey, configKey]) => {
    if (raw[rowKey]) config[configKey] = raw[rowKey];
  });
  return config;
}

export default async function init(el) {
  const config = parseBroadcastConfig(el);
  el.innerHTML = '';
  el.classList.add('session-broadcast');
  render(h(BroadcastApp, { config }), el);
}
