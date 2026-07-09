// import { useEffect, useRef } from '../../v1/deps/htm-preact.js'; // restored below without restore logic
import { useEffect } from '../../v1/deps/htm-preact.js';
import { html } from './htm-wrapper.js';
// import Home from './pages/Home.js'; // Home page bypassed — always show Schedules
import Schedules from './pages/Schedules.js';
// import { PAGES } from './constants.js';
// import { useNavigation } from './context/NavigationContext.js';
import { useSchedulesUI } from './context/SchedulesContext.js';
import { useDA } from './context/DAContext.js';

// Home page bypassed: always render Schedules (two-panel layout).
// EventPicker + Sync moved into Sidebar. To revert, restore the commented imports
// and replace <${Schedules} /> with <${PAGES_COMPONENTS[activePage.pageComponent]} />.
//
// const PAGES_COMPONENTS = {
//   [PAGES.home]: Home,
//   [PAGES.schedules]: Schedules,
// };

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

  // Home page restore logic (localStorage schedule ID) commented out — no longer needed
  // since the Sidebar is always visible and handles selection state.
  //
  // const { schedules, setActiveSchedule } = useSchedulesData();
  // const { activePage, goToEditSchedule } = useNavigation();
  // const didRestoreSchedule = useRef(false);
  // useEffect(() => {
  //   if (isInitialLoading || didRestoreSchedule.current) return;
  //   const savedId = localStorage.getItem('sm-last-schedule-id');
  //   if (!savedId) { didRestoreSchedule.current = true; return; }
  //   const schedule = schedules.find((s) => s.scheduleId === savedId);
  //   if (!schedule) return;
  //   didRestoreSchedule.current = true;
  //   setActiveSchedule(schedule);
  //   goToEditSchedule();
  // }, [isInitialLoading, schedules]);

  // suppress unused-import lint for useEffect kept for future hooks
  useEffect(() => {}, []);

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
