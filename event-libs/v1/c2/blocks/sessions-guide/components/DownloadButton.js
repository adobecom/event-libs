import { html } from '../../../../deps/htm-preact.js';
import { sessions, scheduled } from '../../../../utils/session-store.js';
import { downloadICS } from '../utils/ics.js';
import { showToast } from '../../../../features/toast/toast.js';
import { IconDownload } from './icons.js';

// Exported for testability: the test-time htm-preact mock drops function props, so clicks can't be simulated.
export function downloadSchedule(sessionList, scheduledIds) {
  const scheduledSessions = sessionList.filter((s) => scheduledIds.has(s.id));
  if (!downloadICS(scheduledSessions)) {
    showToast({ message: 'Something went wrong downloading your schedule. Please try again.', variant: 'negative' });
  }
}

export function DownloadButton() {
  const isEmpty = !sessions.value.some((s) => scheduled.value.has(s.id));

  // No `title` attribute: it would pop a second, native tooltip on top of this custom one.
  return html`
    <span class="sg-download-btn-wrap">
      <button
        class="sg-download-btn"
        onclick=${() => downloadSchedule(sessions.value, scheduled.value)}
        aria-label="Download schedule as .ics calendar file"
        disabled=${isEmpty}
        daa-ll="Download-Schedule"
        type="button"
      ><${IconDownload} /></button>
      <span class="sg-download-btn__tooltip" aria-hidden="true">
        <span class="sg-download-btn__tooltip-label">Download</span>
        <span class="sg-download-btn__tooltip-tip"></span>
      </span>
    </span>
  `;
}
