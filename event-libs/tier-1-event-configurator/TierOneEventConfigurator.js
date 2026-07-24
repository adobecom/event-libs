import { useEffect } from '../v1/deps/htm-preact.js';
import { html } from './htm-wrapper.js';
import Library from './pages/Library.js';
import ConfigEditor from './pages/ConfigEditor.js';
import { useNavigation } from './context/NavigationContext.js';
import { useConfigs } from './context/ConfigsContext.js';
import { useDA } from './context/DAContext.js';
import { useEventEnv } from './context/EventEnvContext.js';
import { PAGES, EVENT_SERVICE_ENV_OPTIONS } from './constants.js';

const TOAST_TIMEOUT_MS = 6000;

export default function TierOneEventConfigurator() {
  const { isLoading: isDaLoading, error: daError } = useDA();
  const { activePage } = useNavigation();
  const { envName } = useEventEnv();
  const {
    toastError, clearToastError, toastSuccess, clearToastSuccess, isInitialLoading, error,
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

  if (isDaLoading) {
    return html`
      <div class="tec-app">
        <div class="tec-loading">
          <div class="tec-spinner" role="status" aria-label="Initializing…"></div>
        </div>
      </div>
    `;
  }

  if (daError) {
    return html`
      <div class="tec-app">
        <div class="tec-error">
          <p>${daError}</p>
        </div>
      </div>
    `;
  }

  return html`
    <div class="tec-app">
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
    </div>
  `;
}
