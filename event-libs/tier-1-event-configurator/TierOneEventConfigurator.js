import {
  useState, useEffect, html, Fragment,
} from '../v1/deps/htm-preact.js';
import Library from './pages/Library.js';
import ConfigEditor from './pages/ConfigEditor.js';
import { useNavigation } from './context/NavigationContext.js';
import { useConfigs } from './context/ConfigsContext.js';
import { useDA } from './context/DAContext.js';
import { useEventEnv } from './context/EventEnvContext.js';
import { decodeHomepageConfigParam } from './utils.js';
import { PAGES, EVENT_SERVICE_ENV_OPTIONS, HOMEPAGE_LINK_HASH_KEY } from './constants.js';

import { DAProvider as SgcDAProvider } from '../session-guide-configurator/context/DAContext.js';
import { EventEnvProvider as SgcEventEnvProvider } from '../session-guide-configurator/context/EventEnvContext.js';
import { NavigationProvider as SgcNavigationProvider } from '../session-guide-configurator/context/NavigationContext.js';
import { ConfigsProvider as SgcConfigsProvider } from '../session-guide-configurator/context/ConfigsContext.js';
import SessionGuideConfigurator from '../session-guide-configurator/SessionGuideConfigurator.js';

import { DAProvider as SncDAProvider } from '../swan-notification-configurator/context/DAContext.js';
import { NavigationProvider as SncNavigationProvider } from '../swan-notification-configurator/context/NavigationContext.js';
import { ConfigsProvider as SncConfigsProvider } from '../swan-notification-configurator/context/ConfigsContext.js';
import SwanNotificationConfigurator from '../swan-notification-configurator/SwanNotificationConfigurator.js';

const TOAST_TIMEOUT_MS = 6000;
const HOMEPAGE_LINK_HASH_RE = new RegExp(`[#&]${HOMEPAGE_LINK_HASH_KEY}=([A-Za-z0-9+/=%-]{20,})`);

const TABS = [
  { id: 'event', label: 'Event Config' },
  { id: 'session-guide', label: 'Session Guide Config' },
  { id: 'swan', label: 'SWAN Notifications' },
];

// Mounts Session Guide Configurator's own, unmodified provider stack + component — same
// nesting order its own standalone entry point uses. No data/context sharing with the
// Tier 1 config below; this tab only co-locates the two apps under one page/URL.
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

// Unlike SessionGuideTab, this one DOES share state with the Tier 1 config below —
// eventId/eventName are passed down from the Event Config tab's own useConfigs(), since
// this app has no independent event picker of its own (a SWAN config only makes sense
// for an event that already has a Tier 1 config open).
function SwanNotificationsTab({ eventId, eventName }) {
  return html`
    <${SncDAProvider}>
      <${SncNavigationProvider}>
        <${SncConfigsProvider}>
          <${SwanNotificationConfigurator} eventId=${eventId} eventName=${eventName} />
        </${SncConfigsProvider}>
      </${SncNavigationProvider}>
    </${SncDAProvider}>
  `;
}

// Everything TierOneEventConfigurator rendered before the tab bar existed — unchanged,
// just extracted so it can live inside a tab instead of owning the whole page.
function EventConfigTab() {
  const { isLoading: isDaLoading, error: daError } = useDA();
  const { activePage, goToEditor } = useNavigation();
  const { envName } = useEventEnv();
  const {
    toastError, clearToastError, toastSuccess, clearToastSuccess, isInitialLoading, error,
    findConfigByEventId, startEditConfig, setToastError,
  } = useConfigs();

  const envLabel = EVENT_SERVICE_ENV_OPTIONS.find((opt) => opt.value === envName)?.label || envName;

  // sp-toast owned its own auto-dismiss timeout; a plain div needs its own.
  useEffect(() => {
    if (!toastError) return undefined;
    const timer = setTimeout(clearToastError, TOAST_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [toastError, clearToastError]);

  useEffect(() => {
    if (!toastSuccess) return undefined;
    const timer = setTimeout(clearToastSuccess, TOAST_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [toastSuccess, clearToastSuccess]);

  // Deep-link back into a Homepage config from a "Copy Link" URL (see ConfigEditor.js's
  // handleCopyHomepageLink) — only once the config library has actually loaded, so
  // findConfigByEventId isn't run against an empty, not-yet-fetched configs array. Reads only
  // window.location.hash, never .search — DA's iframe only forwards the hash through to this
  // app (same constraint Schedule Maker documents for its own `schedule=` links).
  useEffect(() => {
    if (isInitialLoading || error) return;
    const match = window.location.hash.match(HOMEPAGE_LINK_HASH_RE);
    if (!match) return;
    const decoded = decodeHomepageConfigParam(match[1]);
    if (!decoded) return;
    const row = findConfigByEventId(decoded.eventId, decoded.configType);
    if (!row) {
      setToastError('Config not found for this link — it may have been deleted.');
      return;
    }
    startEditConfig(row);
    goToEditor();
  }, [isInitialLoading, error]);

  if (isDaLoading) {
    return html`
      <div class="tec-loading">
        <div class="tec-spinner" role="status" aria-label="Initializing…"></div>
      </div>
    `;
  }

  if (daError) {
    return html`
      <div class="tec-error">
        <p>${daError}</p>
      </div>
    `;
  }

  return html`
    <${Fragment}>
      ${envName !== 'prod' && html`
        <div class="tec-env-banner" role="status">
          <strong>Non-production environment: ${envLabel}.</strong>
          ESP/ESL calls are targeting ${envName}, not prod — set via the manual Event ID lookup's environment picker.
        </div>
      `}

      ${isInitialLoading && html`
        <div class="tec-loading">
          <div class="tec-spinner" role="status" aria-label="Loading config library…"></div>
        </div>
      `}

      ${!isInitialLoading && html`
        <div class="tec-content">
          ${error && html`
            <div class="tec-access-error">
              <p>${error}</p>
            </div>
          `}
          ${!error && activePage === PAGES.library && html`<${Library} />`}
          ${!error && activePage === PAGES.editor && html`<${ConfigEditor} />`}
        </div>
      `}

      ${toastError && html`
        <div class="tec-toast tec-toast--error" role="alert">
          <span class="tec-toast__message">${toastError}</span>
          <button type="button" class="tec-btn tec-btn--icon" onClick=${clearToastError} aria-label="Dismiss">✕</button>
        </div>
      `}
      ${toastSuccess && html`
        <div class="tec-toast tec-toast--success" role="status">
          <span class="tec-toast__message">${toastSuccess}</span>
          <button type="button" class="tec-btn tec-btn--icon" onClick=${clearToastSuccess} aria-label="Dismiss">✕</button>
        </div>
      `}
    </${Fragment}>
  `;
}

export default function TierOneEventConfigurator() {
  const [activeTabId, setActiveTabId] = useState(TABS[0].id);
  // Same ConfigsContext EventConfigTab already reads (this component renders inside
  // the same top-level ConfigsProvider) — read here too so the SWAN tab can inherit
  // eventId/eventName instead of needing its own event picker.
  const { activeConfig } = useConfigs();

  return html`
    <div class="tec-app">
      <nav class="tec-app-tabs" role="tablist" aria-label="Event configurators">
        ${TABS.map((tab) => html`
          <button
            type="button"
            role="tab"
            class=${'tec-app-tab' + (activeTabId === tab.id ? ' tec-app-tab--active' : '')}
            aria-selected=${String(activeTabId === tab.id)}
            onClick=${() => setActiveTabId(tab.id)}
            key=${tab.id}
          >${tab.label}</button>
        `)}
      </nav>
      ${activeTabId === 'event' && html`<${EventConfigTab} />`}
      ${activeTabId === 'session-guide' && html`<${SessionGuideTab} />`}
      ${activeTabId === 'swan' && html`
        <${SwanNotificationsTab} eventId=${activeConfig?.eventId} eventName=${activeConfig?.backendEventTitle} />
      `}
    </div>
  `;
}
