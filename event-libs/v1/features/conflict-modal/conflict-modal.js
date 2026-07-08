import { signal } from '../../deps/htm-preact.js';
import { createTag, loadStyle } from '../../utils/utils.js';

// Page-level, framework-agnostic schedule-conflict modal — mirrors features/toast/toast.js
// so any block (Preact or vanilla) that opts into scheduleAction's showConflictModal can
// surface it, not just sessions-guide.
export const conflict = signal(null);

export function showConflictModal(data) {
  conflict.value = data;
}

export function hideConflictModal() {
  conflict.value = null;
}

let mounted = false;

export function mountConflictModal() {
  if (mounted) return;
  mounted = true;

  loadStyle(new URL('./conflict-modal.css', import.meta.url).href);

  const backdrop = createTag('div', { class: 'sg-modal-backdrop' }, '', { parent: document.body });
  const modal = createTag('div', {
    class: 'sg-conflict-modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Schedule conflict',
  }, '', { parent: document.body });
  backdrop.hidden = true;
  modal.hidden = true;

  let selected = null;
  let saving = false;

  function dismiss() {
    hideConflictModal();
  }

  backdrop.addEventListener('click', dismiss);

  function renderContent(data) {
    modal.textContent = '';
    const { existing, incoming } = data;

    const title = createTag('h3', { class: 'sg-conflict-modal__title' });
    title.textContent = 'Schedule Conflict';
    const desc = createTag('p', { class: 'sg-conflict-modal__desc' });
    desc.textContent = 'These sessions overlap. Choose which one to keep.';

    const optionsEl = createTag('div', { class: 'sg-conflict-modal__options' });

    function buildOption(value, badge, session) {
      const label = createTag('label', { class: 'sg-conflict-option' });
      const input = createTag('input', { type: 'radio', name: 'sg-conflict', value });
      input.addEventListener('change', () => {
        selected = value;
        updateSelection();
        updateSaveState();
      });
      const body = createTag('div', { class: 'sg-conflict-option__body' });
      const badgeEl = createTag('span', { class: 'sg-conflict-option__badge' });
      badgeEl.textContent = badge;
      const titleEl = createTag('p', { class: 'sg-conflict-option__title' });
      titleEl.textContent = session.title;
      body.append(badgeEl, titleEl);
      label.append(input, body);
      return label;
    }

    const existingOption = buildOption('existing', 'Currently scheduled', existing);
    const incomingOption = buildOption('incoming', 'New session', incoming);
    optionsEl.append(existingOption, incomingOption);

    function updateSelection() {
      existingOption.classList.toggle('sg-conflict-option--selected', selected === 'existing');
      incomingOption.classList.toggle('sg-conflict-option--selected', selected === 'incoming');
    }

    const footer = createTag('div', { class: 'sg-conflict-modal__footer' });
    const cancelBtn = createTag('button', { class: 'sg-conflict-modal__btn sg-conflict-modal__btn--cancel', type: 'button' }, 'Cancel');
    const saveBtn = createTag('button', { class: 'sg-conflict-modal__btn sg-conflict-modal__btn--save', type: 'button' }, 'Save');
    cancelBtn.addEventListener('click', dismiss);

    function updateSaveState() {
      saveBtn.disabled = !selected || saving;
      saveBtn.textContent = saving ? 'Saving…' : 'Save';
    }
    updateSaveState();

    saveBtn.addEventListener('click', async () => {
      if (!selected || saving) return;
      saving = true;
      updateSaveState();
      try {
        const keep = selected === 'incoming' ? incoming : existing;
        await data.onConfirm(keep);
      } finally {
        saving = false;
        hideConflictModal();
      }
    });

    footer.append(cancelBtn, saveBtn);
    modal.append(title, desc, optionsEl, footer);
  }

  conflict.subscribe((data) => {
    if (data) {
      selected = null;
      saving = false;
      backdrop.hidden = false;
      modal.hidden = false;
      renderContent(data);
    } else {
      backdrop.hidden = true;
      modal.hidden = true;
    }
  });
}
