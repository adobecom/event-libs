import { useState, html } from '../v1/deps/htm-preact.js';

import { DAProvider as TecDAProvider } from '../tier-1-event-configurator/context/DAContext.js';
import { EventEnvProvider as TecEventEnvProvider } from '../tier-1-event-configurator/context/EventEnvContext.js';
import { NavigationProvider as TecNavigationProvider } from '../tier-1-event-configurator/context/NavigationContext.js';
import { ConfigsProvider as TecConfigsProvider } from '../tier-1-event-configurator/context/ConfigsContext.js';
import TierOneEventConfigurator from '../tier-1-event-configurator/TierOneEventConfigurator.js';

import { DAProvider as SgcDAProvider } from '../session-guide-configurator/context/DAContext.js';
import { EventEnvProvider as SgcEventEnvProvider } from '../session-guide-configurator/context/EventEnvContext.js';
import { NavigationProvider as SgcNavigationProvider } from '../session-guide-configurator/context/NavigationContext.js';
import { ConfigsProvider as SgcConfigsProvider } from '../session-guide-configurator/context/ConfigsContext.js';
import SessionGuideConfigurator from '../session-guide-configurator/SessionGuideConfigurator.js';

// Each tab mounts an existing app's own, unmodified provider stack — same nesting order
// each app's own <name>.js entry point already uses standalone. No data/context sharing
// between the two: this shell only co-locates them, it doesn't merge their config models.
function TierOneTab() {
  return html`
    <${TecDAProvider}>
      <${TecEventEnvProvider}>
        <${TecNavigationProvider}>
          <${TecConfigsProvider}>
            <${TierOneEventConfigurator} />
          </${TecConfigsProvider}>
        </${TecNavigationProvider}>
      </${TecEventEnvProvider}>
    </${TecDAProvider}>
  `;
}

function SessionGuideTab() {
  return html`
    <${SgcDAProvider}>
      <${SgcEventEnvProvider}>
        <${SgcNavigationProvider}>
          <${SgcConfigsProvider}>
            <${SessionGuideConfigurator} />
          </${SgcConfigsProvider}>
        </${SgcNavigationProvider}>
      </${SgcEventEnvProvider}>
    </${SgcDAProvider}>
  `;
}

const TABS = [
  { id: 'event', label: 'Event Config' },
  { id: 'session-guide', label: 'Session Guide Config' },
];

// Only the active tab's tree is ever mounted (not just hidden) — each app assumes it
// owns the whole page (own toasts, own full-height layout), so keeping an inactive one
// mounted would double up on those rather than actually coexisting cleanly.
export default function EventConfiguratorsShell() {
  const [activeTabId, setActiveTabId] = useState(TABS[0].id);

  return html`
    <div class="ecs-shell">
      <nav class="ecs-tabs" role="tablist" aria-label="Event configurators">
        ${TABS.map((tab) => html`
          <button
            type="button"
            role="tab"
            class=${'ecs-tab' + (activeTabId === tab.id ? ' ecs-tab--active' : '')}
            aria-selected=${String(activeTabId === tab.id)}
            onClick=${() => setActiveTabId(tab.id)}
            key=${tab.id}
          >${tab.label}</button>
        `)}
      </nav>
      <div class="ecs-panel">
        ${activeTabId === 'event' && html`<${TierOneTab} />`}
        ${activeTabId === 'session-guide' && html`<${SessionGuideTab} />`}
      </div>
    </div>
  `;
}
