import { useState } from '../../v1/deps/htm-preact.js';
import { html } from '../htm-wrapper.js';
import BuildTableIcon from '../components/BuildTableIcon.js';
import CreateManuallyScheduleModal from '../components/CreateManuallyScheduleModal.js';
import SearchInput from '../components/SearchInput.js';
import EventPicker from '../components/EventPicker.js';
import { useNavigation } from '../context/NavigationContext.js';
import { useSchedulesOperations, useSchedulesData } from '../context/SchedulesContext.js';

export default function Home() {
  const { goToEditSchedule, goToSheetImport } = useNavigation();
  const { schedules, setActiveSchedule, eventFolder } = useSchedulesData();
  const { createAndAddSchedule, syncSchedules } = useSchedulesOperations();

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createModalMode, setCreateModalMode] = useState('manually');
  const [search, setSearch] = useState('');

  const filteredSchedules = schedules?.filter(
    (s) => (s.title || '').toLowerCase().includes(search.toLowerCase()),
  ) ?? [];

  const handleCreateManuallyBtn = () => {
    setIsCreateModalOpen(true);
    setCreateModalMode('manually');
  };

  const handleCreateFromSheetBtn = () => {
    setIsCreateModalOpen(true);
    setCreateModalMode('sheet');
  };

  const handleSelectSchedule = (schedule) => {
    setActiveSchedule(schedule);
    goToEditSchedule();
  };

  const handleCreateSchedule = async (scheduleName) => {
    const newScheduleResponse = await createAndAddSchedule({
      title: scheduleName,
      isComplete: false,
      blocks: [],
    });
    if (newScheduleResponse.error) return;
    setActiveSchedule(newScheduleResponse);
    goToEditSchedule();
  };

  const handleCreateFromSheet = (scheduleName) => {
    goToSheetImport(scheduleName);
  };

  const handleSearch = (e) => {
    e.preventDefault();
    setSearch(e.target.value);
  };

  return html`
    <div class="sm-page">
      <h1 class="sm-page__title">Schedule Maker</h1>
      <${EventPicker} />
      ${eventFolder && html`
        <div class="sm-home__quick-actions">
          <div class="sm-home__quick-actions-icon"><${BuildTableIcon} /></div>
          <div class="sm-home__quick-actions-content">
            <h2>Create a new schedule</h2>
            <div class="sm-home__quick-actions-buttons">
              <sp-button size="xl" static-color="black" treatment="outline" onClick=${handleCreateManuallyBtn}>
                Create Manually
              </sp-button>
              <sp-button size="xl" static-color="black" treatment="outline" onClick=${handleCreateFromSheetBtn}>
                Create from Sheet
              </sp-button>
            </div>
          </div>
        </div>
        <div class="sm-home__schedules">
          <div class="sm-home__schedules-header">
            <h2>Select Schedule</h2>
            <div class="sm-home__schedules-actions">
              <${SearchInput} \
                placeholder="Search schedules" \
                value=${search} \
                onInput=${handleSearch} \
                className="sm-home__schedules-search" \
              />
              <sp-action-button onClick=${syncSchedules} title="Scan DA documents to sync active/draft status and discover new schedules">
                Sync
              </sp-action-button>
            </div>
          </div>
          <ul class="sm-home__schedules-list">
            ${filteredSchedules.map((schedule) => html`
              <li class="sm-home__schedules-item" key=${schedule.scheduleId}>
                <sp-action-button quiet size="l" onClick=${() => handleSelectSchedule(schedule)}>
                  ${schedule.title}
                </sp-action-button>
              </li>
            `)}
          </ul>
        </div>
      `}
      <${CreateManuallyScheduleModal} \
        isOpen=${isCreateModalOpen} \
        onClose=${() => setIsCreateModalOpen(false)} \
        onConfirm=${createModalMode === 'manually' ? handleCreateSchedule : handleCreateFromSheet} \
      />
    </div>
  `;
}
