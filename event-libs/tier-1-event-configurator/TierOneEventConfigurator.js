import {
  useState, useEffect, html, Fragment,
} from '../v1/deps/htm-preact.js';
import Library from './pages/Library.js';
import ConfigEditor from './pages/ConfigEditor.js';
import { useNavigation } from './context/NavigationContext.js';
import { useConfigs } from './context/ConfigsContext.js';
import { useDA } from './context/DAContext.js';
import { decodeHomepageConfigParam } from './utils.js';
import { PAGES, HOMEPAGE_LINK_HASH_KEY } from './constants.js';

import { DAProvider as SgcDAProvider } from '../session-guide-configurator/context/DAContext.js';
import { EventEnvProvider as SgcEventEnvProvider } from '../session-guide-configurator/context/EventEnvContext.js';
import { NavigationProvider as SgcNavigationProvider } from '../session-guide-configurator/context/NavigationContext.js';
import { ConfigsProvider as SgcConfigsProvider } from '../session-guide-configurator/context/ConfigsContext.js';
import SessionGuideConfigurator from '../session-guide-configurator/SessionGuideConfigurator.js';
import { readConfigLinkPayload } from '../session-guide-configurator/utils.js';

const TOAST_TIMEOUT_MS = 6000;
const HOMEPAGE_LINK_HASH_RE = new RegExp(`[#&]${HOMEPAGE_LINK_HASH_KEY}=([A-Za-z0-9+/=%-]{20,})`);

// { message, persistent: true } skips the toast's auto-dismiss timeout.
function toastMessage(toast) {
  return typeof toast === 'object' && toast !== null ? toast.message : toast;
}

function isToastPersistent(toast) {
  return typeof toast === 'object' && toast !== null && !!toast.persistent;
}

const TABS = [
  { id: 'event', label: 'Event Config' },
  { id: 'session-guide', label: 'Session Guide Config' },
];

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

function EventConfigTab() {
  const { isLoading: isDaLoading, error: daError } = useDA();
  const { activePage, goToEditor } = useNavigation();
  const {
    toastError, clearToastError, toastSuccess, clearToastSuccess, isInitialLoading, error,
    findConfigByEventId, startEditConfig, setToastError,
  } = useConfigs();

  // sp-toast owned its own auto-dismiss timeout; a plain div needs its own.
  useEffect(() => {
    if (!toastError) return undefined;
    const timer = setTimeout(clearToastError, TOAST_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [toastError, clearToastError]);

  useEffect(() => {
    if (!toastSuccess || isToastPersistent(toastSuccess)) return undefined;
    const timer = setTimeout(clearToastSuccess, TOAST_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [toastSuccess, clearToastSuccess]);

  // Reads only location.hash — DA's iframe only forwards the hash to this app.
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
          <span class="tec-toast__message">${toastMessage(toastSuccess)}</span>
          <button type="button" class="tec-btn tec-btn--icon" onClick=${clearToastSuccess} aria-label="Dismiss">✕</button>
        </div>
      `}
    </${Fragment}>
  `;
}

export default function TierOneEventConfigurator() {
  // Opens on the session-guide tab if the hash carries a copied config link.
  const [activeTabId, setActiveTabId] = useState(
    () => (readConfigLinkPayload() ? 'session-guide' : TABS[0].id),
  );

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
    </div>
  `;
}
