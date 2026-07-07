import { html } from '../../../deps/htm-preact.js';
import { useSessionGuide } from '../store/index.js';
import { downloadICS } from '../utils/ics.js';

export function DownloadButton() {
  const { state } = useSessionGuide();
  const { sessions, scheduled } = state;

  function handleDownload() {
    const scheduledSessions = sessions.filter((s) => scheduled.has(s.id));
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
