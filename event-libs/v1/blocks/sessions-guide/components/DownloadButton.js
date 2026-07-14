import { html } from '../../../deps/htm-preact.js';
import { sessions, scheduled } from '../../../utils/session-store.js';
import { downloadICS } from '../utils/ics.js';

export function DownloadButton() {
  function handleDownload() {
    const scheduledSessions = sessions.value.filter((s) => scheduled.value.has(s.id));
    downloadICS(scheduledSessions);
  }

  return html`
    <button
      class="sg-download-btn"
      onclick=${handleDownload}
      aria-label="Download schedule as .ics calendar file"
      title="Download .ics"
      type="button"
    ></button>
  `;
}
