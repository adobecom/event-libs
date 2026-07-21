import { useState } from '../../v1/deps/htm-preact.js';
import { html } from '../htm-wrapper.js';
import { useSchedulesData } from '../context/SchedulesContext.js';
import { useNavigation } from '../context/NavigationContext.js';
import SearchInput from './SearchInput.js';
import EventPicker from './EventPicker.js';

function AccordionSection({ iconClass, icon, title, isOpen, onToggle, children }) {
  return html`
    <div class="sm-sidebar__section">
      <button \
        type="button" \
        class="sm-sidebar__section-header" \
        aria-expanded=${isOpen} \
        onclick=${onToggle} \
      >
        <span class="sm-sidebar__section-icon ${iconClass}">${icon}</span>
        <span class="sm-sidebar__section-title">${title}</span>
        <svg class="sm-sidebar__section-chevron ${isOpen ? 'sm-sidebar__section-chevron--open' : ''}" width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M3 8.5L7 4.5L11 8.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
      ${isOpen && html`<div class="sm-sidebar__section-body">${children}</div>`}
    </div>
  `;
}

function Sidebar({ setIsAddScheduleModalOpen }) {
  const [search, setSearch] = useState('');
  const [isNewSectionOpen, setIsNewSectionOpen] = useState(true);
  const [isFindSectionOpen, setIsFindSectionOpen] = useState(false);
  const { goToEditSchedule } = useNavigation();
  const { schedules, activeSchedule, setActiveSchedule, hasSynced } = useSchedulesData();

  const handleAddSchedule = () => setIsAddScheduleModalOpen(true);

  const handleSearch = (e) => {
    e.preventDefault();
    setSearch(e.target.value);
  };

  const handleSelectSchedule = (schedule) => {
    setActiveSchedule(schedule);
    goToEditSchedule();
  };

  const showFilter = hasSynced && schedules.length > 0;
  const filteredSchedules = schedules?.filter((s) => (s.title || '').toLowerCase().includes(search.toLowerCase()));

  return html`
    <div class="sm-sidebar">
      <div class="sm-sidebar__accordion">
        <${AccordionSection} \
          iconClass="sm-sidebar__section-icon--new" \
          icon=${html`
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M9 3.5V14.5M3.5 9H14.5" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>
            </svg>
          `} \
          title="New schedule" \
          isOpen=${isNewSectionOpen} \
          onToggle=${() => setIsNewSectionOpen((prev) => !prev)} \
        >
          <p class="sm-sidebar__section-description">Create a schedule from scratch.</p>
          <sp-button class="sm-sidebar__button" static-color="black" onclick=${handleAddSchedule}>
            <sp-icon slot="icon">
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path d="M9 3.5V14.5M3.5 9H14.5" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>
              </svg>
            </sp-icon>
            Create new schedule
          </sp-button>
        </${AccordionSection}>

        <${AccordionSection} \
          iconClass="sm-sidebar__section-icon--find" \
          icon=${html`
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <circle cx="8" cy="8" r="5.25" stroke="currentColor" stroke-width="1.5"/>
              <path d="M15 15L12 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
          `} \
          title="Find existing schedules" \
          isOpen=${isFindSectionOpen} \
          onToggle=${() => setIsFindSectionOpen((prev) => !prev)} \
        >
          <p class="sm-sidebar__section-description">Scan a DA folder for docs with schedule links.</p>
          <${EventPicker} />
        </${AccordionSection}>
      </div>

      <div class="sm-sidebar__divider"></div>

      ${showFilter && html`
        <${SearchInput} \
          placeholder="Filter schedules" \
          value="${search}" \
          onInput="${handleSearch}" \
          className="sm-sidebar__search" \
        />
      `}
      <div class="sm-sidebar__schedules">
        ${filteredSchedules?.length === 0 && !search && html`
          <p class="sm-sidebar__empty">No schedules yet. Create one above, or scan a folder to find existing links.</p>
        `}
        ${filteredSchedules?.length === 0 && search && html`
          <p class="sm-sidebar__empty">No schedules match "${search}".</p>
        `}
        ${filteredSchedules?.map((schedule) => html`
          <button \
            key="${schedule.scheduleId}" \
            class="sm-sidebar__schedule ${activeSchedule?.scheduleId === schedule.scheduleId ? 'sm-sidebar__schedule--active' : ''}" \
            onclick=${() => handleSelectSchedule(schedule)} \
          >
            <span class="sm-sidebar__schedule-title">${schedule.title}</span>
            ${!schedule.isComplete && html`
              <svg class="sm-sidebar__incomplete-icon" width="20" height="20" viewBox="0 0 20 20" fill="none" title="Schedule has incomplete blocks">
                <path d="M9.99936 15.1233C9.76871 15.1315 9.54398 15.0496 9.37275 14.895C9.04242 14.5304 9.04242 13.9751 9.37275 13.6104C9.5421 13.4521 9.76758 13.3677 9.99939 13.3757C10.2357 13.3662 10.4653 13.4559 10.6324 13.6231C10.7945 13.7908 10.8816 14.017 10.8738 14.2499C10.8862 14.4846 10.8042 14.7145 10.6461 14.8886C10.4725 15.0531 10.2382 15.1382 9.99936 15.1233Z" fill="#F03823"/>
                <path d="M10 11.75C9.58594 11.75 9.25 11.4141 9.25 11V7C9.25 6.58594 9.58594 6.25 10 6.25C10.4141 6.25 10.75 6.58594 10.75 7V11C10.75 11.4141 10.4141 11.75 10 11.75Z" fill="#F03823"/>
                <path d="M16.7334 18H3.2666C2.46631 18 1.74365 17.5898 1.33398 16.9023C0.924314 16.2148 0.906734 15.3838 1.28759 14.6797L8.021 2.23242C8.41455 1.50488 9.17286 1.05273 10 1.05273C10.8271 1.05273 11.5855 1.50488 11.979 2.23242L18.7124 14.6797C19.0933 15.3838 19.0757 16.2148 18.666 16.9023C18.2563 17.5898 17.5337 18 16.7334 18ZM10 2.55273C9.86572 2.55273 9.53223 2.59082 9.34033 2.94531L2.60693 15.3926C2.42382 15.7314 2.55664 16.0244 2.62255 16.1338C2.68798 16.2441 2.88183 16.5 3.26659 16.5H16.7334C17.1182 16.5 17.312 16.2441 17.3774 16.1338C17.4434 16.0244 17.5762 15.7314 17.3931 15.3926L10.6597 2.94531C10.4678 2.59082 10.1343 2.55273 10 2.55273Z" fill="#F03823"/>
              </svg>
            `}
          </button>
        `)}
      </div>

    </div>
  `;
}

export default Sidebar;
