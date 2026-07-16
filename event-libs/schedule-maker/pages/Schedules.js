import { useState, useEffect, useRef } from '../../v1/deps/htm-preact.js';
import { html } from '../htm-wrapper.js';
import Sidebar from '../components/Sidebar.js';
import ScheduleEditor from '../components/ScheduleEditor.js';
import SheetImporter from '../components/SheetImporter.js';
import AddScheduleModal from '../components/AddScheduleModal.js';
import { useNavigation } from '../context/NavigationContext.js';
import { useSchedulesData, useSchedulesUI } from '../context/SchedulesContext.js';
import { ScheduleURLUtility } from '../utils.js';

export default function Schedules() {
  const { activePage, goToEditSchedule } = useNavigation();
  const { schedules, activeSchedule, setActiveSchedule } = useSchedulesData();
  const { isInitialLoading } = useSchedulesUI();
  const [isAddScheduleModalOpen, setIsAddScheduleModalOpen] = useState(false);
  const deepLinkHandled = useRef(false);

  useEffect(() => {
    if (isInitialLoading || !schedules.length || deepLinkHandled.current) return;
    deepLinkHandled.current = true;

    const tryDeepLink = async () => {
      // Primary: hash fragment (#scheduleId=) — may be forwarded by DA to iframe
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
      let targetId = hashParams.get('scheduleId');

      // Fallback: ?schedule= query param — works for direct iframe URL access
      if (!targetId) {
        const qp = new URLSearchParams(window.location.search);
        if (qp.get('schedule')) {
          try {
            const decoded = await ScheduleURLUtility.extractScheduleFromURL(window.location.href);
            targetId = decoded?.scheduleId;
          } catch { /* ignore malformed param */ }
        }
      }

      if (!targetId || activeSchedule) return;
      const match = schedules.find((s) => s.scheduleId === targetId);
      if (match) {
        setActiveSchedule(match);
        goToEditSchedule();
      }
    };

    tryDeepLink();
  }, [schedules, isInitialLoading]);

  return html`
    <div class="sm-page">
      <h1 class="sm-page__title">Schedule Maker</h1>
      <div class="sm-schedules__container">
        <div class="sm-schedules__sidebar">
          <${Sidebar} setIsAddScheduleModalOpen=${setIsAddScheduleModalOpen} />
        </div>
        <div class="sm-schedules__content">
          ${activePage.mode === 'import' ? html`<${SheetImporter} />` : html`<${ScheduleEditor} />`}
        </div>
      </div>
      <${AddScheduleModal} isOpen=${isAddScheduleModalOpen} onClose=${() => setIsAddScheduleModalOpen(false)} />
    </div>
  `;
}
