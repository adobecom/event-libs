import { html } from './htm-wrapper.js';
import Library from './pages/Library.js';
import ConfigEditor from './pages/ConfigEditor.js';
import { useNavigation } from './context/NavigationContext.js';
import { useConfigs } from './context/ConfigsContext.js';
import { useDA } from './context/DAContext.js';
import { PAGES } from './constants.js';

export default function TierOneEventConfigurator() {
  const { isLoading: isDaLoading, error: daError } = useDA();
  const { activePage } = useNavigation();
  const {
    toastError, clearToastError, toastSuccess, clearToastSuccess, isInitialLoading, error,
  } = useConfigs();

  if (isDaLoading) {
    return html`
      <sp-theme color="light" scale="medium">
        <div class="tec-app">
          <div class="tec-loading">
            <sp-progress-circle size="l" indeterminate label="Initializing..." />
          </div>
        </div>
      </sp-theme>
    `;
  }

  if (daError) {
    return html`
      <sp-theme color="light" scale="medium">
        <div class="tec-app">
          <div class="tec-error">
            <p>${daError}</p>
          </div>
        </div>
      </sp-theme>
    `;
  }

  return html`
    <sp-theme color="light" scale="medium">
      <div class="tec-app">
        ${isInitialLoading && html`
          <div class="tec-loading">
            <sp-progress-circle size="l" indeterminate label="Loading config library" />
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
          <div class="tec-toast tec-toast--error">
            <sp-toast variant="negative" open onclose=${clearToastError} timeout=${6000}>
              ${toastError}
            </sp-toast>
          </div>
        `}
        ${toastSuccess && html`
          <div class="tec-toast tec-toast--success">
            <sp-toast variant="positive" open onclose=${clearToastSuccess} timeout=${6000}>
              ${toastSuccess}
            </sp-toast>
          </div>
        `}
      </div>
    </sp-theme>
  `;
}
