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

  // On mount, check if the URL carries schedule data, either as a query param
  // (?schedule={b64}, TEMPORARY current format) or hash fragment (#schedule={b64},
  // DA forwards the parent page hash to the iframe, enabling deep-link open).
  useEffect(() => {
    const url = new URL(window.location.href);
    const queryParam = url.searchParams.get('schedule');
    const hashMatch = url.hash.match(/[#&]schedule=([A-Za-z0-9+/=%-]{20,})/);
    const encodedParam = queryParam || hashMatch?.[1];
    if (!encodedParam) return;
    try {
      const decoded = decodeScheduleParam(encodedParam);
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
