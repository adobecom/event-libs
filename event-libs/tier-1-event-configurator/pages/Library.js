import { useState, useMemo, useCallback, html } from '../../v1/deps/htm-preact.js';
import SearchInput from '../components/SearchInput.js';
import EventPicker from '../components/EventPicker.js';
import ManualEventLookup from '../components/ManualEventLookup.js';
import Modal from '../components/Modal.js';
import { useNavigation } from '../context/NavigationContext.js';
import { useConfigs } from '../context/ConfigsContext.js';
import { useEventEnv } from '../context/EventEnvContext.js';
import {
  copyTextToClipboard, formatUpdatedTime, getDisplayTitle,
} from '../utils.js';
import {
  EVENT_BROWSE_ENABLED, CONFIG_TYPES, HOMEPAGE_CONFIG_TYPE_OPTIONS, isHomepageConfigType,
} from '../constants.js';

function configTypeLabel(configType) {
  return HOMEPAGE_CONFIG_TYPE_OPTIONS.find((opt) => opt.value === configType)?.label || null;
}

function ConfigList({
  rows, search, onSearch, searchId, emptyHint, onEdit, onDuplicate, onCopy, onDelete,
}) {
  return html`
    <${SearchInput} \
      id=${searchId} \
      placeholder="Search by event title or Event ID" \
      value=${search} \
      onInput=${onSearch} \
      className="tec-library__search" \
    />

    ${rows.length === 0 && html`<p class="tec-library__empty">${emptyHint}</p>`}

    ${rows.length > 0 && html`
      <ul class="tec-library__list">
        ${rows.map((row) => html`
          <li class="tec-library__item" key=${`${row.eventId}:${row.configType || CONFIG_TYPES.GLOBAL}`}>
            <div class="tec-library__item-info">
              <span class="tec-library__item-title-row">
                <span class="tec-library__item-title">${getDisplayTitle(row)}</span>
                ${row.eventServiceEnv && row.eventServiceEnv !== 'prod' && html`
                  <span class="tec-library__item-env">${row.eventServiceEnv}</span>
                `}
                ${isHomepageConfigType(row.configType) && html`
                  <span class="tec-library__item-type">${configTypeLabel(row.configType)}</span>
                `}
              </span>
              <span class="tec-library__item-meta">
                ${row.backendEventTitle} · ${row.eventId} · updated ${formatUpdatedTime(row.updated)}
              </span>
            </div>
            <div class="tec-library__item-actions">
              <button type="button" class="tec-btn tec-btn--quiet" onClick=${() => onEdit(row)}>Edit</button>
              <button type="button" class="tec-btn tec-btn--quiet" onClick=${() => onDuplicate(row)}>Duplicate</button>
              <button type="button" class="tec-btn tec-btn--quiet" onClick=${() => onCopy(row)}>Copy config</button>
              <button type="button" class="tec-btn tec-btn--quiet tec-btn--danger" onClick=${() => onDelete(row)}>Delete</button>
            </div>
          </li>
        `)}
      </ul>
    `}
  `;
}

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
  const { envName, setEnv } = useEventEnv();

  const [globalSearch, setGlobalSearch] = useState('');
  const [homepageSearch, setHomepageSearch] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerMode, setPickerMode] = useState('new'); // 'new' | 'duplicate'
  const [pendingConfigType, setPendingConfigType] = useState(CONFIG_TYPES.GLOBAL);
  const [duplicateSource, setDuplicateSource] = useState(null);
  const [rowPendingDelete, setRowPendingDelete] = useState(null);
  const [newHomepageMenuOpen, setNewHomepageMenuOpen] = useState(false);
  // If EventPicker's listAllEvents() fails for any reason, fail over to
  // ManualEventLookup for the rest of the session (sticky per page load, not
  // per open, so a transient failure doesn't force a doomed re-attempt).
  const [browseFailed, setBrowseFailed] = useState(false);

  const globalRows = useMemo(() => {
    const term = globalSearch.trim().toLowerCase();
    const sorted = configs
      .filter((row) => !isHomepageConfigType(row.configType))
      .sort((a, b) => new Date(b.updated || 0) - new Date(a.updated || 0));
    if (!term) return sorted;
    return sorted.filter(
      (row) => (row.backendEventTitle || '').toLowerCase().includes(term)
        || (row.config?.eventTitle || '').toLowerCase().includes(term)
        || (row.eventId || '').toLowerCase().includes(term),
    );
  }, [configs, globalSearch]);

  const homepageRows = useMemo(() => {
    const term = homepageSearch.trim().toLowerCase();
    const sorted = configs
      .filter((row) => isHomepageConfigType(row.configType))
      .sort((a, b) => new Date(b.updated || 0) - new Date(a.updated || 0));
    if (!term) return sorted;
    return sorted.filter(
      (row) => (row.backendEventTitle || '').toLowerCase().includes(term)
        || (row.config?.configName || '').toLowerCase().includes(term)
        || (row.eventId || '').toLowerCase().includes(term),
    );
  }, [configs, homepageSearch]);

  const openNewGlobalPicker = useCallback(() => {
    setPickerMode('new');
    setPendingConfigType(CONFIG_TYPES.GLOBAL);
    setDuplicateSource(null);
    setPickerOpen(true);
  }, []);

  const openNewHomepagePicker = useCallback((configType) => {
    setNewHomepageMenuOpen(false);
    setPickerMode('new');
    setPendingConfigType(configType);
    setDuplicateSource(null);
    setPickerOpen(true);
  }, []);

  const openDuplicatePicker = useCallback((row) => {
    setPickerMode('duplicate');
    setPendingConfigType(row.configType || CONFIG_TYPES.GLOBAL);
    setDuplicateSource(row);
    setPickerOpen(true);
  }, []);

  // Restores the ESP env this row was created against before opening it —
  // a full page reload resets EventEnvContext's override to its default
  // (prod), so without this an edit of a non-prod-authored row would
  // silently refetch its session catalog from the wrong tier.
  const openEdit = useCallback((row) => {
    setEnv(row.eventServiceEnv || 'prod');
    startEditConfig(row);
    goToEditor();
  }, [setEnv, startEditConfig, goToEditor]);

  // Event-ID+type collision guard: picking an event that already has a row
  // for this same config type routes to Edit for that row instead of
  // creating a second row — this is what makes (Event ID, config type)
  // collision-proof by construction, not something enforced only at save
  // time (PLAN.md Phase 4). A different config type for the same event is
  // never a collision — Global and Homepage rows coexist independently.
  const handlePickEvent = useCallback((event) => {
    setPickerOpen(false);
    const existing = findConfigByEventId(event.eventId, pendingConfigType);
    if (existing) {
      setToastSuccess('A config already exists for this event — editing it');
      openEdit(existing);
      return;
    }
    if (pickerMode === 'duplicate' && duplicateSource) {
      startDuplicateConfig(duplicateSource, event, envName);
    } else {
      startNewConfig(event, envName, pendingConfigType);
    }
    goToEditor();
  }, [
    findConfigByEventId, openEdit, pickerMode, pendingConfigType, duplicateSource, envName,
    startDuplicateConfig, startNewConfig, goToEditor, setToastSuccess,
  ]);

  const handleBrowseError = useCallback((message) => {
    setBrowseFailed(true);
    window.lana?.log(`tier-1-event-configurator: EventPicker failed, falling back to ManualEventLookup. ${message}`);
  }, []);

  const handleCopyConfig = useCallback(async (row) => {
    // Minified, not stringifyConfig's pretty-printed form: DA joins a metadata cell's
    // multi-line content back with ", ", corrupting multi-line JSON with stray commas.
    const ok = await copyTextToClipboard(JSON.stringify(row.config));
    if (ok) setToastSuccess(`Copied config for ${getDisplayTitle(row)}`);
    else setToastError('Could not copy config — copy it manually from the editor instead');
  }, [setToastSuccess, setToastError]);

  const confirmDelete = useCallback(async () => {
    if (!rowPendingDelete) return;
    await removeConfig(rowPendingDelete.eventId, rowPendingDelete.configType || CONFIG_TYPES.GLOBAL);
    setRowPendingDelete(null);
  }, [rowPendingDelete, removeConfig]);

  const pickerTitle = pickerMode === 'duplicate'
    ? 'Duplicate config — pick the target event'
    : `New ${configTypeLabel(pendingConfigType) || 'config'} — pick an event`;

  return html`
    <div class="tec-page">
      <div class="tec-library__header">
        <div>
          <h1 class="tec-page__title">Event Configurator</h1>
          <p class="tec-page__subtitle">Author and manage event configurations for different surfaces.</p>
        </div>
      </div>

      <section class="tec-library__group">
        <div class="tec-library__group-header">
          <span class="tec-library__group-icon" aria-hidden="true">🌐</span>
          <div class="tec-library__group-heading">
            <h2>Global Configs <span class="tec-library__group-badge tec-library__group-badge--global">Global</span></h2>
            <p class="tec-library__group-desc">Per-event configs used across the event experience (e.g., Session Guide, Event App, etc.).</p>
          </div>
          <button type="button" class="tec-btn tec-btn--primary" onClick=${openNewGlobalPicker}>New config</button>
        </div>

        <${ConfigList} \
          rows=${globalRows} \
          search=${globalSearch} \
          onSearch=${(e) => setGlobalSearch(e.target.value)} \
          searchId="tec-library-search-global" \
          emptyHint='No global configs yet — click "New config" to author one.' \
          onEdit=${openEdit} \
          onDuplicate=${openDuplicatePicker} \
          onCopy=${handleCopyConfig} \
          onDelete=${(row) => setRowPendingDelete(row)} \
        />
      </section>

      <section class="tec-library__group">
        <div class="tec-library__group-header">
          <span class="tec-library__group-icon" aria-hidden="true">🏠</span>
          <div class="tec-library__group-heading">
            <h2>Homepage Configs <span class="tec-library__group-badge tec-library__group-badge--homepage">Homepage</span></h2>
            <p class="tec-library__group-desc">Configs for homepage specific blocks like Upcoming Sessions and Featured Sessions.</p>
          </div>
          <div class="tec-library__new-menu">
            <button type="button" class="tec-btn tec-btn--primary" onClick=${() => setNewHomepageMenuOpen((open) => !open)}>
              New config ▾
            </button>
            ${newHomepageMenuOpen && html`
              <div class="tec-library__new-menu-list" role="menu">
                ${HOMEPAGE_CONFIG_TYPE_OPTIONS.map((opt) => html`
                  <button type="button" role="menuitem" class="tec-library__new-menu-item" onClick=${() => openNewHomepagePicker(opt.value)}>
                    ${opt.label}
                  </button>
                `)}
              </div>
            `}
          </div>
        </div>

        <${ConfigList} \
          rows=${homepageRows} \
          search=${homepageSearch} \
          onSearch=${(e) => setHomepageSearch(e.target.value)} \
          searchId="tec-library-search-homepage" \
          emptyHint='No homepage configs yet — click "New config" to author one.' \
          onEdit=${openEdit} \
          onDuplicate=${openDuplicatePicker} \
          onCopy=${handleCopyConfig} \
          onDelete=${(row) => setRowPendingDelete(row)} \
        />
      </section>

      <div class="tec-library__how-differ">
        <span class="tec-library__group-icon" aria-hidden="true">ℹ️</span>
        <div>
          <strong>How they differ</strong>
          <p>Global configs are used across multiple surfaces. Homepage configs are optimized for the homepage blocks and may have different data needs.</p>
        </div>
      </div>

      ${EVENT_BROWSE_ENABLED && !browseFailed
        ? html`
          <${EventPicker} \
            isOpen=${pickerOpen} \
            onClose=${() => setPickerOpen(false)} \
            onSelect=${handlePickEvent} \
            onError=${handleBrowseError} \
            title=${pickerTitle} \
          />
        `
        : html`
          <${ManualEventLookup} \
            isOpen=${pickerOpen} \
            onClose=${() => setPickerOpen(false)} \
            onSelect=${handlePickEvent} \
            title=${pickerTitle} \
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
          ${' '}<strong>${rowPendingDelete && getDisplayTitle(rowPendingDelete)}</strong> from the library.
          The sheet has no version history, so this can't be undone.
        </p>
      </${Modal}>
    </div>
  `;
}
