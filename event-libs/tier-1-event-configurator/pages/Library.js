import { useState, useMemo, useCallback } from '../../v1/deps/htm-preact.js';
import { html } from '../htm-wrapper.js';
import SearchInput from '../components/SearchInput.js';
import EventPicker from '../components/EventPicker.js';
import ManualEventLookup from '../components/ManualEventLookup.js';
import Modal from '../components/Modal.js';
import { useNavigation } from '../context/NavigationContext.js';
import { useConfigs } from '../context/ConfigsContext.js';
import { copyTextToClipboard, formatUpdatedTime } from '../utils.js';
import { EVENT_BROWSE_ENABLED } from '../constants.js';

export default function Library() {
  const { goToEditor } = useNavigation();
  const {
    configs,
    findConfigByEventId,
    startNewConfig,
    startDuplicateConfig,
    startEditConfig,
    removeConfig,
    setToastSuccess,
    setToastError,
  } = useConfigs();

  const [search, setSearch] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerMode, setPickerMode] = useState('new'); // 'new' | 'duplicate'
  const [duplicateSource, setDuplicateSource] = useState(null);
  const [rowPendingDelete, setRowPendingDelete] = useState(null);
  // Official fallback: if the full EventPicker's listAllEvents() call fails
  // for any reason (CORS, the prod-vs-non-prod auth mismatch documented in
  // PLAN.md §5, a real outage), fail over to ManualEventLookup for the rest
  // of the session rather than leaving a broken picker on screen. Sticky
  // per page load — not per open — so a transient failure doesn't force a
  // full re-attempt (and likely re-failure) on every click.
  const [browseFailed, setBrowseFailed] = useState(false);

  const filteredConfigs = useMemo(() => {
    const term = search.trim().toLowerCase();
    const sorted = [...configs].sort(
      (a, b) => new Date(b.updated || 0) - new Date(a.updated || 0),
    );
    if (!term) return sorted;
    return sorted.filter(
      (row) => (row.eventTitle || '').toLowerCase().includes(term)
        || (row.eventId || '').toLowerCase().includes(term),
    );
  }, [configs, search]);

  const handleSearch = useCallback((e) => setSearch(e.target.value), []);

  const openNewPicker = useCallback(() => {
    setPickerMode('new');
    setDuplicateSource(null);
    setPickerOpen(true);
  }, []);

  const openDuplicatePicker = useCallback((row) => {
    setPickerMode('duplicate');
    setDuplicateSource(row);
    setPickerOpen(true);
  }, []);

  const openEdit = useCallback((row) => {
    startEditConfig(row);
    goToEditor();
  }, [startEditConfig, goToEditor]);

  // Event-ID collision guard: picking an event that already has a row routes
  // to Edit for that row instead of creating a second row with the same
  // Event ID — this is what makes Event ID collision-proof by construction,
  // not something enforced only at save time (PLAN.md Phase 4).
  const handlePickEvent = useCallback((event) => {
    setPickerOpen(false);
    const existing = findConfigByEventId(event.eventId);
    if (existing) {
      setToastSuccess('A config already exists for this event — editing it');
      openEdit(existing);
      return;
    }
    if (pickerMode === 'duplicate' && duplicateSource) {
      startDuplicateConfig(duplicateSource, event);
    } else {
      startNewConfig(event);
    }
    goToEditor();
  }, [
    findConfigByEventId, openEdit, pickerMode, duplicateSource,
    startDuplicateConfig, startNewConfig, goToEditor, setToastSuccess,
  ]);

  const handleBrowseError = useCallback((message) => {
    setBrowseFailed(true);
    window.lana?.log(`tier-1-event-configurator: EventPicker failed, falling back to ManualEventLookup. ${message}`);
  }, []);

  const handleCopyConfig = useCallback(async (row) => {
    const ok = await copyTextToClipboard(JSON.stringify(row.config, null, 2));
    if (ok) setToastSuccess(`Copied config for ${row.eventTitle}`);
    else setToastError('Could not copy config — copy it manually from the editor instead');
  }, [setToastSuccess, setToastError]);

  const confirmDelete = useCallback(async () => {
    if (!rowPendingDelete) return;
    await removeConfig(rowPendingDelete.eventId);
    setRowPendingDelete(null);
  }, [rowPendingDelete, removeConfig]);

  return html`
    <div class="tec-page">
      <div class="tec-library__header">
        <h1 class="tec-page__title">Tier 1 Event Configurator</h1>
        <sp-button size="l" static-color="black" onClick=${openNewPicker}>New config</sp-button>
      </div>

      <${SearchInput} \
        id="tec-library-search" \
        placeholder="Search by event title or Event ID" \
        value=${search} \
        onInput=${handleSearch} \
        className="tec-library__search" \
      />

      ${filteredConfigs.length === 0 && html`
        <p class="tec-library__empty">
          No configs yet — click "New config" to author one for a Tier 1 event.
        </p>
      `}

      ${filteredConfigs.length > 0 && html`
        <ul class="tec-library__list">
          ${filteredConfigs.map((row) => html`
            <li class="tec-library__item" key=${row.eventId}>
              <div class="tec-library__item-info">
                <span class="tec-library__item-title">${row.eventTitle}</span>
                <span class="tec-library__item-meta">
                  ${row.eventId} · updated ${formatUpdatedTime(row.updated)}
                </span>
              </div>
              <div class="tec-library__item-actions">
                <sp-action-button quiet size="m" onClick=${() => openEdit(row)}>Edit</sp-action-button>
                <sp-action-button quiet size="m" onClick=${() => openDuplicatePicker(row)}>Duplicate</sp-action-button>
                <sp-action-button quiet size="m" onClick=${() => handleCopyConfig(row)}>Copy config</sp-action-button>
                <sp-action-button quiet size="m" onClick=${() => setRowPendingDelete(row)}>Delete</sp-action-button>
              </div>
            </li>
          `)}
        </ul>
      `}

      ${EVENT_BROWSE_ENABLED && !browseFailed
        ? html`
          <${EventPicker} \
            isOpen=${pickerOpen} \
            onClose=${() => setPickerOpen(false)} \
            onSelect=${handlePickEvent} \
            onError=${handleBrowseError} \
            title=${pickerMode === 'duplicate' ? 'Duplicate config — pick the target event' : 'New config — pick an event'} \
          />
        `
        : html`
          <${ManualEventLookup} \
            isOpen=${pickerOpen} \
            onClose=${() => setPickerOpen(false)} \
            onSelect=${handlePickEvent} \
            title=${pickerMode === 'duplicate' ? 'Duplicate config — enter the target Event ID' : 'New config — enter an Event ID'} \
          />
        `}

      <${Modal} \
        isOpen=${!!rowPendingDelete} \
        onClose=${() => setRowPendingDelete(null)} \
        onConfirm=${confirmDelete} \
        title="Delete config?" \
        confirmText="Delete" \
        size="small" \
      >
        <p>
          This removes the config for
          ${' '}<strong>${rowPendingDelete?.eventTitle}</strong> from the library.
          The sheet has no version history, so this can't be undone.
        </p>
      </${Modal}>
    </div>
  `;
}
