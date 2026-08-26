import { html } from '../../../../deps/htm-preact.js';
import { sessions, scheduled } from '../../../../utils/session-store.js';
import { downloadICS } from '../utils/ics.js';
import { showToast } from '../../../../features/toast/toast.js';

// Exported so this is directly unit-testable: the test-time htm-preact mock drops
// function props entirely (`onclick=${fn}` renders nothing), so a real click can't be
// simulated against the rendered markup.
export function downloadSchedule(sessionList, scheduledIds) {
  const scheduledSessions = sessionList.filter((s) => scheduledIds.has(s.id));
  if (!downloadICS(scheduledSessions)) {
    showToast({ message: 'Something went wrong downloading your schedule. Please try again.', variant: 'negative' });
  }
}

export function DownloadButton() {
  const isEmpty = !sessions.value.some((s) => scheduled.value.has(s.id));

  return html`
    <button
      class="sg-download-btn"
      onclick=${() => downloadSchedule(sessions.value, scheduled.value)}
      aria-label="Download schedule as .ics calendar file"
      disabled=${isEmpty}
      daa-ll="Download-Schedule"
      type="button"
    ></button>
  `;
}
