import { useState } from '../../v1/deps/htm-preact.js';
import { html } from '../htm-wrapper.js';
import { useSchedulesData, useSchedulesOperations } from '../context/SchedulesContext.js';
import ScheduleHeader from './editor/ScheduleHeader.js';
import BlockEditor from './editor/BlockEditor.js';

export default function ScheduleEditor() {
  const { activeSchedule } = useSchedulesData();
  const { addBlockLocally, reorderBlocksLocally } = useSchedulesOperations();
  const [editingBlockId, setEditingBlockId] = useState(null);
  const [draggedBlockId, setDraggedBlockId] = useState(null);
  const [dragOverBlockId, setDragOverBlockId] = useState(null);

  const handleBlockDragStart = (blockId) => setDraggedBlockId(blockId);

  const handleBlockDragOver = (blockId) => {
    if (blockId !== draggedBlockId) setDragOverBlockId(blockId);
  };

  const handleBlockDrop = (targetBlockId) => {
    if (draggedBlockId && draggedBlockId !== targetBlockId) {
      reorderBlocksLocally(draggedBlockId, targetBlockId);
    }
    setDraggedBlockId(null);
    setDragOverBlockId(null);
  };

  const handleBlockDragEnd = () => {
    setDraggedBlockId(null);
    setDragOverBlockId(null);
  };

  const handleAddBlock = () => {
    if (!activeSchedule) return;
    const newBlock = {
      id: `block-${crypto.randomUUID()}`,
      title: '',
      fragmentPath: '',
      startDateTime: 0,
      includeLiveStream: false,
      liveStream: { provider: 'MobileRider', streamId: '' },
      isComplete: false,
      isEditingBlockTitle: false,
    };
    addBlockLocally(newBlock);
    requestAnimationFrame(() => {
      const blockTitleInput = document.getElementById(`${newBlock.id}-block-title-input`);
      if (blockTitleInput) {
        const inputElement = blockTitleInput.shadowRoot?.querySelector('input');
        inputElement?.focus();
      }
    });
  };

  if (!activeSchedule) {
    return html`
      <section class="sm-editor">
        <h2>No schedule selected</h2>
      </section>
    `;
  }

  return html`
    <section class="sm-editor">
      <${ScheduleHeader} />
      <section class="sm-editor__content">
        <section class="sm-editor__blocks">
          ${activeSchedule?.blocks?.map((block) => html`
            <${BlockEditor} \
              block=${block} \
              editingBlockId=${editingBlockId} \
              setEditingBlockId=${setEditingBlockId} \
              isDragging=${draggedBlockId === block.id} \
              isDragOver=${dragOverBlockId === block.id && draggedBlockId !== block.id} \
              onBlockDragStart=${handleBlockDragStart} \
              onBlockDragOver=${handleBlockDragOver} \
              onBlockDrop=${handleBlockDrop} \
              onBlockDragEnd=${handleBlockDragEnd} \
            />
          `) || ''}
        </section>
        <button class="sm-editor__add-block" onClick=${handleAddBlock}>
          <p>Add block</p>
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 18 18">
            <path fill="currentColor" fill-rule="evenodd" d="M9,1a8,8,0,1,0,8,8A8,8,0,0,0,9,1Zm5,8.5a.5.5,0,0,1-.5.5H10v3.5a.5.5,0,0,1-.5.5h-1a.5.5,0,0,1-.5-.5V10H4.5A.5.5,0,0,1,4,9.5v-1A.5.5,0,0,1,4.5,8H8V4.5A.5.5,0,0,1,8.5,4h1a.5.5,0,0,1,.5.5V8h3.5a.5.5,0,0,1,.5.5Z"/>
          </svg>
        </button>
      </section>
    </section>
  `;
}
