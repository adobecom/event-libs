import { useState } from '../../v1/deps/htm-preact.js';
import { html } from '../htm-wrapper.js';
import Modal from './Modal.js';
import BuildTableIcon from './BuildTableIcon.js';
import { useSchedulesOperations, useSchedulesData } from '../context/SchedulesContext.js';
import { useNavigation } from '../context/NavigationContext.js';

export default function AddScheduleModal({ isOpen, onClose }) {
  const [scheduleName, setScheduleName] = useState('');
  const { createAndAddSchedule } = useSchedulesOperations();
  const { setActiveSchedule } = useSchedulesData();
  const { goToEditSchedule, goToSheetImport } = useNavigation();

  const handleClose = () => {
    setScheduleName('');
    onClose();
  };

  const handleCreate = () => {
    const created = createAndAddSchedule({ title: scheduleName, blocks: [] });
    setActiveSchedule(created);
    setScheduleName('');
    goToEditSchedule();
    onClose();
  };

  return html`
    <${Modal} isOpen=${isOpen} onClose=${handleClose} size="small" showActions=${false}>
      <div class="add-schedule-form-container">
        <${BuildTableIcon} />
        <h2>Create new schedule</h2>
        <sp-textfield \
          id="schedule-name" \
          class="add-schedule-form-textfield" \
          placeholder="Add schedule name" \
          size="l" \
          value=${scheduleName} \
          onInput=${(e) => setScheduleName(e.target.value)} \
        ></sp-textfield>
        <div class="add-schedule-form-buttons">
          <sp-button size="l" static-color="black" treatment="outline" onClick=${handleCreate} disabled=${!scheduleName.trim()}>
            Create
          </sp-button>
          <sp-button size="l" static-color="black" treatment="outline" onClick=${() => { goToSheetImport(scheduleName); onClose(); }} disabled=${!scheduleName.trim()}>
            Create from Sheet
          </sp-button>
        </div>
      </div>
    </${Modal}>
  `;
}
