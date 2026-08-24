import {
  useState, useMemo, useCallback, html,
} from '../../v1/deps/htm-preact.js';
import Modal from '../components/Modal.js';
import { useNavigation } from '../context/NavigationContext.js';
import { useConfigs } from '../context/ConfigsContext.js';
import { getDisplayTitle, formatUpdatedTime, copyTextToClipboard } from '../utils.js';

export default function Library({ eventId, eventName }) {
  const { goToEditor } = useNavigation();
  const {
    configs, startNewConfig, startEditConfig, removeConfig, republish, setToastSuccess, setToastError,
  } = useConfigs();

  const [rowPendingDelete, setRowPendingDelete] = useState(null);
  // Persistent (not auto-dismissing, unlike the toast) — a failed delete-publish leaves
  // the old row live on the published sheet, which needs a clear, sticky recovery path
  // rather than relying on a 6s toast the author might miss.
  const [publishRetryNeeded, setPublishRetryNeeded] = useState(false);
  const [isRetryingPublish, setIsRetryingPublish] = useState(false);

  // Pre-scoped to the event already open on the Event Config tab — no cross-event
  // browsing or search, unlike session-guide-configurator's Library (this app has no
  // independent event picker; see constants.js/ConfigsContext.js).
  const eventConfigs = useMemo(
    () => configs
      .filter((row) => row.eventId === eventId)
      .sort((a, b) => new Date(b.updated || 0) - new Date(a.updated || 0)),
    [configs, eventId],
  );

  const handleNew = useCallback(() => {
    startNewConfig(eventId, eventName);
    goToEditor();
  }, [startNewConfig, eventId, eventName, goToEditor]);

  const handleEdit = useCallback((row) => {
    startEditConfig(row);
    goToEditor();
  }, [startEditConfig, goToEditor]);

  const handleCopyId = useCallback(async (row) => {
    const ok = await copyTextToClipboard(row.configId);
    if (ok) setToastSuccess('Config ID copied — paste it into the swan-notification-config metadata row');
    else setToastError('Could not copy the config ID — please retry');
  }, [setToastSuccess, setToastError]);

  const confirmDelete = useCallback(async () => {
    if (!rowPendingDelete) return;
    const result = await removeConfig(rowPendingDelete.configId);
    if (result.ok && !result.publishOk) setPublishRetryNeeded(true);
    setRowPendingDelete(null);
  }, [rowPendingDelete, removeConfig]);

  const handleRetryPublish = useCallback(async () => {
    setIsRetryingPublish(true);
    try {
      const result = await republish();
      if (result.ok) {
        setPublishRetryNeeded(false);
        setToastSuccess('Published');
      } else {
        setToastError(result.error || 'Publishing failed');
      }
    } finally {
      setIsRetryingPublish(false);
    }
  }, [republish, setToastSuccess, setToastError]);

  if (!eventId) {
    return html`
      <div class="snc-page">
        <h1 class="snc-page__title">SWAN Notifications</h1>
        <p class="snc-library__empty">
          Open or start a config on the Event Config tab first — SWAN Notifications configs are scoped to a single event.
        </p>
      </div>
    `;
  }

  return html`
    <div class="snc-page">
      <div class="snc-library__header">
        <div>
          <h1 class="snc-page__title">SWAN Notifications</h1>
          <p class="snc-page__subtitle">${eventName || eventId} — schedule reminders, exported as a short ID to paste into the event page.</p>
        </div>
        <button type="button" class="snc-btn snc-btn--primary snc-btn--l" onClick=${handleNew}>New config</button>
      </div>

      ${publishRetryNeeded && html`
        <div class="snc-editor__publish-warning" role="alert">
          <p><strong>A recent change wasn't published.</strong> A deleted config's configId may keep working briefly until this succeeds.</p>
          <button type="button" class="snc-btn snc-btn--outline" onClick=${handleRetryPublish} disabled=${isRetryingPublish}>
            ${isRetryingPublish ? 'Retrying…' : 'Retry publish'}
          </button>
        </div>
      `}

      ${eventConfigs.length === 0 && html`
        <p class="snc-library__empty">
          No SWAN configs yet for this event — click "New config" to author one.
        </p>
      `}

      ${eventConfigs.length > 0 && html`
        <ul class="snc-library__list">
          ${eventConfigs.map((row) => html`
            <li class="snc-library__item" key=${row.configId}>
              <div class="snc-library__item-info">
                <span class="snc-library__item-title">${getDisplayTitle(row)}</span>
                <span class="snc-library__item-meta">
                  ${row.config?.environment || 'no environment set'} · updated ${formatUpdatedTime(row.updated)}
                </span>
              </div>
              <div class="snc-library__item-actions">
                <button type="button" class="snc-btn snc-btn--quiet" onClick=${() => handleEdit(row)}>Edit</button>
                <button type="button" class="snc-btn snc-btn--quiet" onClick=${() => handleCopyId(row)}>Copy configId</button>
                <button type="button" class="snc-btn snc-btn--quiet snc-btn--danger" onClick=${() => setRowPendingDelete(row)}>Delete</button>
              </div>
            </li>
          `)}
        </ul>
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
          This removes
          ${' '}<strong>${rowPendingDelete && getDisplayTitle(rowPendingDelete)}</strong> from the library.
          Any page still using its configId will stop receiving SWAN notifications.
          The sheet has no version history, so this can't be undone.
        </p>
      </${Modal}>
    </div>
  `;
}
