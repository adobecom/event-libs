import { useState, useEffect } from '../../v1/deps/htm-preact.js';
import { html } from '../htm-wrapper.js';
import Sidebar from '../components/Sidebar.js';
import ScheduleEditor from '../components/ScheduleEditor.js';
import SheetImporter from '../components/SheetImporter.js';
import AddScheduleModal from '../components/AddScheduleModal.js';
import { useNavigation } from '../context/NavigationContext.js';
import { useSchedulesData } from '../context/SchedulesContext.js';
import { decodeScheduleParam } from '../scripts/da-controller.js';
import { prepareScheduleForClient } from '../utils.js';

export default function Schedules() {
  const { goToEditSchedule, activePage } = useNavigation();
  const { setActiveSchedule } = useSchedulesData();
  const [isAddScheduleModalOpen, setIsAddScheduleModalOpen] = useState(false);

  // On mount, check if the URL hash carries schedule data (#schedule={b64}).
  // DA forwards only the parent page's hash to this iframe app — not query
  // params — so a ?schedule= link (old ECC format, or a freshly-copied link
  // while Copy Link temporarily emits ?schedule=) will not auto-open here;
  // it can still be found via Sync from the sidebar list.
  useEffect(() => {
    const hash = window.location.hash;
    if (!hash) return;
    const m = hash.match(/[#&]schedule=([A-Za-z0-9+/=%-]{20,})/);
    if (!m) return;
    try {
      const decoded = decodeScheduleParam(m[1]);
      if (decoded?.blocks?.length) {
        const prepared = prepareScheduleForClient(decoded);
        setActiveSchedule(prepared);
        goToEditSchedule();
      }
    } catch { /* ignore malformed hash */ }
  }, []);

  return html`
    <div class="sm-page">
      <h1 class="sm-page__title">Schedule Maker</h1>
      <div class="sm-schedules__container">
        <div class="sm-schedules__sidebar">
          <${Sidebar} setIsAddScheduleModalOpen=${setIsAddScheduleModalOpen} />
        </div>
        <div class="sm-schedules__content">
          ${activePage?.mode === 'import' ? html`<${SheetImporter} />` : html`<${ScheduleEditor} />`}
        </div>
      </div>
      <${AddScheduleModal} isOpen=${isAddScheduleModalOpen} onClose=${() => setIsAddScheduleModalOpen(false)} />
    </div>
  `;
}
