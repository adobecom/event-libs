import { html } from './htm-wrapper.js';
import Schedules from './pages/Schedules.js';
import { useSchedulesUI } from './context/SchedulesContext.js';
import { useDA } from './context/DAContext.js';

export default function ScheduleMaker() {
  const { isLoading: isDaLoading, error: daError } = useDA();
  const {
    toastError,
    clearToastError,
    toastSuccess,
    clearToastSuccess,
    isInitialLoading,
    error: schedulesError,
  } = useSchedulesUI();

  if (isDaLoading) {
    return html`
      <sp-theme color="light" scale="medium">
        <div class="sm-app">
          <div class="sm-loading">
            <sp-progress-circle size="l" indeterminate label="Initializing..." />
          </div>
        </div>
      </sp-theme>
    `;
  }

  if (daError) {
    return html`
      <sp-theme color="light" scale="medium">
        <div class="sm-app">
          <div class="sm-error">
            <p>${daError}</p>
          </div>
        </div>
      </sp-theme>
    `;
  }

  return html`
    <sp-theme color="light" scale="medium">
      <div class="sm-app">
        ${isInitialLoading && html`
          <div class="sm-loading">
            <sp-progress-circle size="l" indeterminate label="Loading schedules" />
          </div>
        `}

        ${!isInitialLoading && html`
          <div class="sm-content">
            ${schedulesError && html`
              <div class="sm-access-error">
                <p>${schedulesError}</p>
              </div>
            `}
            ${!schedulesError && html`<${Schedules} />`}
          </div>
        `}

        ${toastError && html`
          <div class="sm-toast sm-toast--error">
            <sp-toast variant="negative" open onclose=${clearToastError} timeout=${6000}>
              ${toastError}
            </sp-toast>
          </div>
        `}
        ${toastSuccess && html`
          <div class="sm-toast sm-toast--success">
            <sp-toast variant="positive" open onclose=${clearToastSuccess} timeout=${6000}>
              ${toastSuccess}
            </sp-toast>
          </div>
        `}
      </div>
    </sp-theme>
  `;
}
