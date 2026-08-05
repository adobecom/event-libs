import { signal } from '../../deps/htm-preact.js';
import {
  createTag, loadStyle, LIBS, getEventConfig,
} from '../../utils/utils.js';
import { formatDuration } from '../../utils/date-time-helper.js';

// Page-level, framework-agnostic schedule-conflict modal — built on Milo's shared
// modal component (the same one sessions-hub.js already uses for its own conflict
// flow) instead of a hand-rolled backdrop + div. Milo's modal already provides a
// focus trap, Escape-to-close, body scroll lock, focus restoration, close (X)
// button, and backdrop-dismiss, so this module only owns the inner content.
export const conflict = signal(null);

let dialogEl = null;

async function getMiloModal() {
  const miloLibs = getEventConfig()?.miloConfig?.miloLibs || LIBS;
  return import(`${miloLibs}/blocks/modal/modal.js`);
}

function buildOption(name, value, session, onSelect) {
  const option = createTag('label', { class: 'sg-conflict-option' });
  const input = createTag('input', { class: 'sg-conflict-option__radio', type: 'radio', name, value });
  input.addEventListener('change', () => onSelect(value, option));

  const titleEl = createTag('p', { class: 'sg-conflict-option__title' });
  titleEl.textContent = session.title;

  const meta = createTag('div', { class: 'sg-conflict-option__meta' });
  const track = createTag('span', { class: 'sg-conflict-option__track' });
  track.textContent = session.track || '';
  const duration = createTag('span', { class: 'sg-conflict-option__duration' });
  if (session.startTimeUtc && session.endTimeUtc) {
    duration.textContent = formatDuration(session.startTimeUtc, session.endTimeUtc, { short: true });
  }
  meta.append(track, duration);

  option.append(input, titleEl, meta);
  return option;
}

function buildContent(data, dismiss) {
  const { existing, incoming } = data;
  let selected = 'incoming';
  let saving = false;

  const wrapper = createTag('div', { class: 'sg-conflict-modal' });
  const title = createTag('h3', { class: 'sg-conflict-modal__title' });
  title.textContent = 'You have conflicting sessions';
  const desc = createTag('p', { class: 'sg-conflict-modal__desc' });
  desc.textContent = 'Select which session you want to keep.';

  const optionsEl = createTag('div', { class: 'sg-conflict-modal__options' });

  function selectOption(value, option) {
    selected = value;
    optionsEl.querySelectorAll('.sg-conflict-option').forEach((el) => {
      el.classList.toggle('sg-conflict-option--selected', el === option);
    });
  }

  const existingOption = buildOption('sg-conflict', 'existing', existing, selectOption);
  const incomingOption = buildOption('sg-conflict', 'incoming', incoming, selectOption);
  incomingOption.querySelector('.sg-conflict-option__radio').checked = true;
  incomingOption.classList.add('sg-conflict-option--selected');
  optionsEl.append(existingOption, incomingOption);

  const footer = createTag('div', { class: 'sg-conflict-modal__footer' });
  const saveBtn = createTag('button', { class: 'sg-conflict-modal__btn sg-conflict-modal__btn--save', type: 'button' }, 'Save');

  function updateSaveState() {
    saveBtn.disabled = saving;
    saveBtn.textContent = saving ? 'Saving…' : 'Save';
  }
  updateSaveState();

  saveBtn.addEventListener('click', async () => {
    if (saving) return;
    saving = true;
    updateSaveState();
    try {
      const keep = selected === 'incoming' ? incoming : existing;
      await data.onConfirm(keep);
    } finally {
      saving = false;
      dismiss();
    }
  });

  footer.append(saveBtn);
  wrapper.append(title, desc, optionsEl, footer);
  return wrapper;
}

export async function showConflictModal(data) {
  conflict.value = data;
  loadStyle(new URL('./conflict-modal.css', import.meta.url).href);
  const { getModal } = await getMiloModal();
  const content = buildContent(data, () => hideConflictModal());
  dialogEl = await getModal(null, { id: 'sg-conflict-modal', content });
}

export async function hideConflictModal() {
  conflict.value = null;
  if (!dialogEl) return;
  const { closeModal } = await getMiloModal();
  closeModal(dialogEl);
  dialogEl = null;
}
