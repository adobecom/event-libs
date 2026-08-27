import {
  useState, useEffect, useMemo, useCallback, html,
} from '../../v1/deps/htm-preact.js';
import SearchInput from '../components/SearchInput.js';
import EventPicker from '../components/EventPicker.js';
import ManualEventLookup from '../components/ManualEventLookup.js';
import Modal from '../components/Modal.js';
import { useNavigation } from '../context/NavigationContext.js';
import { useConfigs } from '../context/ConfigsContext.js';
import { useEventEnv } from '../context/EventEnvContext.js';
import { useDA } from '../context/DAContext.js';
import {
  copyTextToClipboard, copyHomepageConfigLink, formatUpdatedTime, getDisplayTitle,
} from '../utils.js';
import {
  EVENT_BROWSE_ENABLED, CONFIG_TYPES, HOMEPAGE_CONFIG_TYPE_OPTIONS, HOMEPAGE_FIELD_BY_TYPE,
  isHomepageConfigType,
} from '../constants.js';

function configTypeLabel(configType) {
  return HOMEPAGE_CONFIG_TYPE_OPTIONS.find((opt) => opt.value === configType)?.label || null;
}

// Homepage rows are keyed by (eventId, env) for session-catalog caching/readiness — a config
// row's own key (eventId, configType) isn't enough, since the same event's Upcoming Sessions
// and Featured Sessions rows share one identical catalog fetch.
function rowCatalogKey(row) {
  return `${row.eventId}:${row.eventServiceEnv || 'prod'}`;
}

function ConfigList({
  rows, search, onSearch, searchId, emptyHint, onEdit, onDuplicate, onCopy, onDelete, isCopyReady,
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
          <li class="tec-library__item" key=${row.configId || `${row.eventId}:${row.configType || CONFIG_TYPES.GLOBAL}`}>
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
              <button \
                type="button" \
                class="tec-btn tec-btn--quiet" \
                onClick=${() => onCopy(row)} \
                disabled=${isHomepageConfigType(row.configType) && !isCopyReady?.(row)} \
                title=${isHomepageConfigType(row.configType) && !isCopyReady?.(row) ? 'Loading this event\'s sessions…' : undefined} \
              >
                ${isHomepageConfigType(row.configType) ? 'Copy Link' : 'Copy config'}
              </button>
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
    getSessionCatalogForRow,
  } = useConfigs();
  const { envName, setEnv } = useEventEnv();
  const { org, repo } = useDA();

  // The ESP session-catalog fetch that "Copy Link" needs (row.config only stores session IDs,
  // not the titles/tracks/times the link is built from) can take several seconds — long enough
  // that browsers drop the click's clipboard-write permission by the time it resolves.
  // ConfigEditor.js's own "Copy Link" avoids this because its session data is already loaded
  // before the click; here there's no equivalent "already open" moment, so instead every
  // Homepage row's catalog is prefetched up front (below) and its "Copy Link" button stays
  // disabled until that row's fetch lands — a click only ever awaits an already-resolved
  // promise, so the clipboard write always runs inside that click's own activation window.
  // getSessionCatalogForRow (from ConfigsContext) caches by (eventId, env), so if you then
  // click "Edit" on a row already prefetched here, ConfigEditor.js reuses this same result
  // instead of hitting ESP again.
  const [readyCatalogKeys, setReadyCatalogKeys] = useState(() => new Set());

  useEffect(() => {
    const homepageConfigs = configs.filter((row) => isHomepageConfigType(row.configType));
    // Sequential, not Promise.all: getSessionCatalogForRow flips the shared env-override
    // global for the duration of an uncached fetch, so concurrent calls for rows on
    // different envs would race and could fetch one row's catalog against another row's env.
    let cancelled = false;
    (async () => {
      for (const row of homepageConfigs) {
        if (cancelled) return;
        const key = rowCatalogKey(row);
        // eslint-disable-next-line no-await-in-loop
        await getSessionCatalogForRow(row);
        if (!cancelled) setReadyCatalogKeys((prev) => (prev.has(key) ? prev : new Set(prev).add(key)));
      }
    })();
    return () => { cancelled = true; };
  }, [configs, getSessionCatalogForRow]);

  const [globalSearch, setGlobalSearch] = useState('');
  const [homepageSearch, setHomepageSearch] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerMode, setPickerMode] = useState('new'); // 'new' | 'duplicate'
  const [pendingConfigType, setPendingConfigType] = useState(CONFIG_TYPES.GLOBAL);
  const [duplicateSource, setDuplicateSource] = useState(null);
  const [rowPendingDelete, setRowPendingDelete] = useState(null);
  const [newHomepageMenuOpen, setNewHomepageMenuOpen] = useState(false);
  // If EventPicker's listAllEvents() fails, fail over to ManualEventLookup (sticky per
  // open, not per keystroke). Scoped to the env that failed — switching env clears it,
  // since failure on one tier says nothing about another.
  const [browseFailed, setBrowseFailed] = useState(false);

  useEffect(() => setBrowseFailed(false), [envName]);

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

  // Event-ID+type collision guard: picking an event that already has a Global
  // row routes to Edit for that row instead of creating a second one — Global
  // is genuinely one config per Event ID (PLAN.md Phase 4). Homepage config
  // types are exempt: a single event can carry several named Upcoming/Featured
  // Sessions configs side by side (see `configName`), so New always creates a
  // fresh row there regardless of what already exists for that event+type.
  const handlePickEvent = useCallback((event) => {
    setPickerOpen(false);
    const isNewFlow = pickerMode !== 'duplicate' || !duplicateSource;
    const guardApplies = isNewFlow && pendingConfigType === CONFIG_TYPES.GLOBAL;
    const existing = guardApplies ? findConfigByEventId(event.eventId, pendingConfigType) : null;
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

  // Homepage rows aren't pasted into tier-1-event-config as JSON — they're shared as the
  // single authored link decoded by upcoming-sessions.js/featured-sessions.js, same as
  // ConfigEditor.js's own "Copy Link" button (copyHomepageConfigLink is the shared
  // implementation both call, so a link copied from either place is identical).
  const handleCopyHomepageLink = useCallback(async (row) => {
    const homepageMeta = HOMEPAGE_FIELD_BY_TYPE[row.configType];
    // The button is disabled until this row's key is in readyCatalogKeys, so this is always
    // already resolved (and cached) by the time a click can happen — no fresh fetch (and no
    // stale clipboard activation) is possible here.
    const result = await getSessionCatalogForRow(row);
    if (!result.ok) {
      setToastError('Could not load this event\'s sessions — copy the link from the editor instead');
      return;
    }
    const ok = await copyHomepageConfigLink(org, repo, row, homepageMeta, result.data.sessions, result.data.sessionTimes);
    if (ok) setToastSuccess(`Link copied — paste it directly into ${homepageMeta.blockHint}'s doc body`);
    else setToastError('Could not copy the link — please retry');
  }, [org, repo, getSessionCatalogForRow, setToastSuccess, setToastError]);

  const handleCopyGlobalConfig = useCallback(async (row) => {
    // Minified, not stringifyConfig's pretty-printed form: DA joins a metadata cell's
    // multi-line content back with ", ", corrupting multi-line JSON with stray commas.
    const ok = await copyTextToClipboard(JSON.stringify(row.config));
    if (!ok) {
      setToastError('Could not copy config — copy it manually from the editor instead');
      return;
    }
    setToastSuccess(`Copied config for ${getDisplayTitle(row)} — paste it into the page's tier-1-event-config metadata`);
  }, [setToastSuccess, setToastError]);

  const handleCopyConfig = useCallback((row) => (
    isHomepageConfigType(row.configType) ? handleCopyHomepageLink(row) : handleCopyGlobalConfig(row)
  ), [handleCopyHomepageLink, handleCopyGlobalConfig]);

  const confirmDelete = useCallback(async () => {
    if (!rowPendingDelete) return;
    await removeConfig(rowPendingDelete);
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
          isCopyReady=${(row) => readyCatalogKeys.has(rowCatalogKey(row))} \
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
