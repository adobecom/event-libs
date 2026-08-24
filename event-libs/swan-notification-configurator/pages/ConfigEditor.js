import { useState, html } from '../../v1/deps/htm-preact.js';
import ImagePickerModal from '../../tier-1-event-configurator/components/ImagePickerModal.js';
import { useNavigation } from '../context/NavigationContext.js';
import { useConfigs } from '../context/ConfigsContext.js';
import { getDisplayTitle, copyTextToClipboard } from '../utils.js';
import { SWAN_ENV_OPTIONS } from '../constants.js';

export default function ConfigEditor() {
  const { goToLibrary } = useNavigation();
  const {
    activeConfig, saveActiveConfig, clearActiveConfig, updateConfigField, republish,
  } = useConfigs();

  const [isSaving, setIsSaving] = useState(false);
  const [publishWarning, setPublishWarning] = useState(null);
  const [isRetryingPublish, setIsRetryingPublish] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [imagePickerField, setImagePickerField] = useState(null); // 'defaultNotificationIconUrl' | 'defaultNotificationImageUrl' | null

  const handleCancel = () => {
    clearActiveConfig();
    goToLibrary();
  };

  const environmentMissing = !activeConfig?.config?.environment;
  const notificationSubTypeMissing = !activeConfig?.config?.notificationSubType?.trim();
  // Defense-in-depth in case the <select>'s disabled attribute on an unfilled
  // environment option is ever bypassed — an option with no real endpoints yet must
  // never be treated as complete.
  const selectedEnvOption = SWAN_ENV_OPTIONS.find((o) => o.value === activeConfig?.config?.environment);
  const environmentUnavailable = !!activeConfig?.config?.environment && !selectedEnvOption?.ansEndpoint;
  const saveDisabled = environmentMissing || environmentUnavailable || notificationSubTypeMissing || isSaving;

  const handleSave = async () => {
    if (saveDisabled) return;
    setIsSaving(true);
    setPublishWarning(null);
    try {
      const result = await saveActiveConfig();
      if (result.ok && !result.publishOk) setPublishWarning(result.publishError || 'Publishing failed');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRetryPublish = async () => {
    setIsRetryingPublish(true);
    try {
      const result = await republish();
      if (result.ok) setPublishWarning(null);
      else setPublishWarning(result.error || 'Publishing failed');
    } finally {
      setIsRetryingPublish(false);
    }
  };

  const handleCopyId = async () => {
    const ok = await copyTextToClipboard(activeConfig.configId);
    if (!ok) setPublishWarning('Could not copy the config ID — please copy it manually.');
  };

  if (!activeConfig) return null;

  const isSaved = !saveDisabled; // saved row exists once required fields are set and a save has run
  const justSaved = !publishWarning && activeConfig.config.updated;

  return html`
    <div class="snc-page snc-editor">
      <div class="snc-editor__header">
        <button type="button" class="snc-btn snc-btn--icon" onClick=${handleCancel} aria-label="Back to library">←</button>
        <div class="snc-editor__header-text">
          <h1 class="snc-editor__title">${getDisplayTitle(activeConfig)}</h1>
          <p class="snc-editor__event-id">${activeConfig.eventId}</p>
        </div>
      </div>

      <section class="snc-editor__section">
        <h2>Environment</h2>
        <p class="snc-editor__section-hint">Picks the ANS endpoint — never typed directly, to keep the visitor's live sign-in token from ever being sent to an untrusted URL.</p>
        <select
          class="snc-field"
          value=${activeConfig.config.environment}
          onChange=${(e) => updateConfigField('environment', e.target.value)}
        >
          <option value="" disabled>Choose an environment…</option>
          ${SWAN_ENV_OPTIONS.map((opt) => html`
            <option key=${opt.value} value=${opt.value} disabled=${!opt.ansEndpoint}>${opt.label}</option>
          `)}
        </select>
        ${environmentUnavailable && html`
          <p class="snc-editor__error">This environment isn't configured yet — contact events engineering.</p>
        `}
      </section>

      <section class="snc-editor__section">
        <h2>Notification sub-type</h2>
        <p class="snc-editor__section-hint">Identifies this event's notification stream so it doesn't collide with another event's — pre-filled from the event ID, but should stay unique per event.</p>
        <input
          type="text"
          class="snc-field snc-editor__title-input"
          placeholder="e.g. max26.scheduled.notifications"
          value=${activeConfig.config.notificationSubType}
          onInput=${(e) => updateConfigField('notificationSubType', e.target.value)}
        />
        ${notificationSubTypeMissing && html`
          <p class="snc-editor__error">A notification sub-type is required before saving.</p>
        `}
      </section>

      <section class="snc-editor__section">
        <h2>Reminder timing</h2>
        <label class="snc-editor__field-label">
          Minutes before a session starts to send the reminder
          <input
            type="number"
            min="0"
            class="snc-field"
            value=${activeConfig.config.upcomingOffsetMinutes}
            onInput=${(e) => updateConfigField('upcomingOffsetMinutes', Number(e.target.value))}
          />
        </label>
      </section>

      <section class="snc-editor__section">
        <h2>Icon &amp; image</h2>
        <p class="snc-editor__section-hint">Shown on the reminder notification. Optional — leave blank to use the default.</p>
        <label class="snc-editor__field-label">
          Icon URL
          <div class="snc-editor__image-row">
            <input type="text" class="snc-field" readonly value=${activeConfig.config.defaultNotificationIconUrl} />
            <button type="button" class="snc-btn snc-btn--outline" onClick=${() => setImagePickerField('defaultNotificationIconUrl')}>Choose image…</button>
          </div>
        </label>
        <label class="snc-editor__field-label">
          Image URL
          <div class="snc-editor__image-row">
            <input type="text" class="snc-field" readonly value=${activeConfig.config.defaultNotificationImageUrl} />
            <button type="button" class="snc-btn snc-btn--outline" onClick=${() => setImagePickerField('defaultNotificationImageUrl')}>Choose image…</button>
          </div>
        </label>
      </section>

      <section class="snc-editor__section">
        <button type="button" class="snc-btn snc-btn--quiet" onClick=${() => setShowAdvanced((v) => !v)}>
          ${showAdvanced ? '▾' : '▸'} Advanced
        </button>
        ${showAdvanced && html`
          <label class="snc-editor__field-label">
            App ID override
            <input
              type="text"
              class="snc-field"
              placeholder="adobecom (default)"
              value=${activeConfig.config.appId}
              onInput=${(e) => updateConfigField('appId', e.target.value)}
            />
            <span class="snc-editor__section-hint">Only change this if global nav's notification bell for this site is configured with a non-default app ID — otherwise leave blank.</span>
          </label>
        `}
      </section>

      ${publishWarning && html`
        <div class="snc-editor__publish-warning" role="alert">
          <p><strong>Saved, but not published.</strong> ${publishWarning}</p>
          <p>The config ID below will not work on a live page until this succeeds.</p>
          <button type="button" class="snc-btn snc-btn--outline" onClick=${handleRetryPublish} disabled=${isRetryingPublish}>
            ${isRetryingPublish ? 'Retrying…' : 'Retry publish'}
          </button>
        </div>
      `}

      ${isSaved && justSaved && !publishWarning && html`
        <div class="snc-editor__config-id-box">
          <p><strong>Published.</strong> Paste this into the <code>swan-notification-config</code> page-metadata row on every page where reminders should be enabled for this event.</p>
          <div class="snc-editor__config-id-row">
            <code class="snc-editor__config-id-value">${activeConfig.configId}</code>
            <button type="button" class="snc-btn snc-btn--outline" onClick=${handleCopyId}>Copy</button>
          </div>
        </div>
      `}

      <div class="snc-editor__actions">
        <button type="button" class="snc-btn snc-btn--outline snc-btn--l" onClick=${handleCancel}>Cancel</button>
        <button
          type="button"
          class="snc-btn snc-btn--primary snc-btn--l"
          onClick=${handleSave}
          disabled=${saveDisabled}
        >
          ${isSaving ? 'Saving…' : 'Save'}
        </button>
      </div>

      <${ImagePickerModal} \
        isOpen=${!!imagePickerField} \
        onClose=${() => setImagePickerField(null)} \
        onUploaded=${(url) => { updateConfigField(imagePickerField, url); setImagePickerField(null); }} \
      />
    </div>
  `;
}
