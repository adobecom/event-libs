import { useEffect, html } from '../v1/deps/htm-preact.js';
import Library from './pages/Library.js';
import ConfigEditor from './pages/ConfigEditor.js';
import { useNavigation } from './context/NavigationContext.js';
import { useConfigs } from './context/ConfigsContext.js';
import { useDA } from './context/DAContext.js';
import { PAGES } from './constants.js';

const TOAST_TIMEOUT_MS = 6000;

// eventId/eventName are inherited from the parent Tier 1 tab's already-open config —
// this app has no independent event picker of its own (see constants.js).
export default function SwanNotificationConfigurator({ eventId, eventName }) {
  const { isLoading: isDaLoading, error: daError } = useDA();
  const { activePage } = useNavigation();
  const {
    toastError, clearToastError, toastSuccess, clearToastSuccess, isInitialLoading, error,
  } = useConfigs();

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

  if (isDaLoading) {
    return html`
      <div class="snc-app">
        <div class="snc-loading">
          <div class="snc-spinner" role="status" aria-label="Initializing…"></div>
        </div>
      </div>
    `;
  }

  if (daError) {
    return html`
      <div class="snc-app">
        <div class="snc-error">
          <p>${daError}</p>
        </div>
      </div>
    `;
  }

  return html`
    <div class="snc-app">
      ${isInitialLoading && html`
        <div class="snc-loading">
          <div class="snc-spinner" role="status" aria-label="Loading config library…"></div>
        </div>
      `}

      ${!isInitialLoading && html`
        <div class="snc-content">
          ${error && html`
            <div class="snc-access-error">
              <p>${error}</p>
            </div>
          `}
          ${!error && activePage === PAGES.library && html`<${Library} eventId=${eventId} eventName=${eventName} />`}
          ${!error && activePage === PAGES.editor && html`<${ConfigEditor} />`}
        </div>
      `}

      ${toastError && html`
        <div class="snc-toast snc-toast--error" role="alert">
          <span class="snc-toast__message">${toastError}</span>
          <button type="button" class="snc-btn snc-btn--icon" onClick=${clearToastError} aria-label="Dismiss">✕</button>
        </div>
      `}
      ${toastSuccess && html`
        <div class="snc-toast snc-toast--success" role="status">
          <span class="snc-toast__message">${toastSuccess}</span>
          <button type="button" class="snc-btn snc-btn--icon" onClick=${clearToastSuccess} aria-label="Dismiss">✕</button>
        </div>
      `}
    </div>
  `;
}
