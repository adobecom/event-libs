import { useState, useEffect, useMemo } from '../../v1/deps/htm-preact.js';
import { html } from '../htm-wrapper.js';
import { getEventSessionCatalog } from '../../v1/utils/esp-controller.js';
import { useNavigation } from '../context/NavigationContext.js';
import { useConfigs } from '../context/ConfigsContext.js';
import { copyTextToClipboard, extractDistinctTracks } from '../utils.js';
import TrackIconEditor from '../components/TrackIconEditor.js';
import FeaturedSessionsEditor from '../components/FeaturedSessionsEditor.js';

export default function ConfigEditor() {
  const { goToLibrary } = useNavigation();
  const {
    activeConfig, saveActiveConfig, clearActiveConfig, updateTrackIcon, updateConfigField,
    setToastSuccess, setToastError,
  } = useConfigs();

  const [sessions, setSessions] = useState([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);
  const [sessionsError, setSessionsError] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  const eventId = activeConfig?.eventId;

  useEffect(() => {
    if (!eventId) return undefined;
    let cancelled = false;
    setIsLoadingSessions(true);
    setSessionsError(null);
    getEventSessionCatalog(eventId).then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        setSessionsError(result.error || 'Failed to load sessions for this event');
        return;
      }
      setSessions(result.data);
    }).finally(() => {
      if (!cancelled) setIsLoadingSessions(false);
    });
    return () => { cancelled = true; };
  }, [eventId]);

  const tracks = useMemo(() => extractDistinctTracks(sessions), [sessions]);

  const configPreview = useMemo(() => {
    if (!activeConfig) return '';
    return JSON.stringify(activeConfig.config, null, 2);
  }, [activeConfig]);

  const handleCancel = () => {
    clearActiveConfig();
    goToLibrary();
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const result = await saveActiveConfig();
      if (result.ok) goToLibrary();
    } finally {
      setIsSaving(false);
    }
  };

  const handleCopy = async () => {
    const ok = await copyTextToClipboard(configPreview);
    if (ok) setToastSuccess('Config copied — paste it into the page\'s tier-1-event-config metadata');
    else setToastError('Could not copy config — select and copy the JSON block manually');
  };

  if (!activeConfig) return null;

  return html`
    <div class="tec-page tec-editor">
      <div class="tec-editor__header">
        <sp-action-button quiet size="m" onClick=${handleCancel}>← Back to library</sp-action-button>
        <h1 class="tec-page__title">${activeConfig.eventTitle}</h1>
        <p class="tec-editor__event-id">${activeConfig.eventId}</p>
      </div>

      <section class="tec-editor__section">
        <h2>Sessions</h2>
        ${isLoadingSessions && html`<p>Loading sessions…</p>`}
        ${sessionsError && html`<p class="tec-editor__error">${sessionsError}</p>`}
        ${!isLoadingSessions && !sessionsError && html`
          <p>${sessions.length} session(s) found — ${tracks.length} distinct track(s).</p>
        `}
      </section>

      <section class="tec-editor__section">
        <h2>Track icons & colors</h2>
        <p>Unauthored tracks fall back to the built-in defaults shown here.</p>
        <${TrackIconEditor}
          tracks=${tracks}
          trackIcons=${activeConfig.config.trackIcons}
          onChange=${updateTrackIcon}
        />
      </section>

      <section class="tec-editor__section">
        <h2>Allow double booking</h2>
        <p>Lets an attendee schedule sessions that overlap in time on this event's Tier 1 surfaces.</p>
        <label class="tec-editor__checkbox">
          <input
            type="checkbox"
            checked=${!!activeConfig.config.allowDoubleBooking}
            onChange=${(e) => updateConfigField('allowDoubleBooking', e.target.checked)}
          />
          Allow double booking
        </label>
      </section>

      <section class="tec-editor__section">
        <h2>Featured sessions</h2>
        <p>Pick which sessions appear in the featured carousel, and set their display order.</p>
        ${!isLoadingSessions && !sessionsError && html`
          <${FeaturedSessionsEditor} \
            sessions=${sessions} \
            tracks=${tracks} \
            featuredSessions=${activeConfig.config.featuredSessions} \
            onChange=${(next) => updateConfigField('featuredSessions', next)} \
          />
        `}
      </section>

      <section class="tec-editor__section">
        <h2>Config JSON</h2>
        <p>This is what gets saved to the row, and what you'll paste into the page's <code>tier-1-event-config</code> metadata after saving.</p>
        <pre class="tec-editor__config-preview">${configPreview}</pre>
        <sp-action-button size="m" onClick=${handleCopy}>Copy config</sp-action-button>
      </section>

      <div class="tec-editor__actions">
        <sp-button treatment="outline" static-color="black" size="l" onClick=${handleCancel}>Cancel</sp-button>
        <sp-button size="l" static-color="black" onClick=${handleSave} disabled=${isSaving || undefined}>
          ${isSaving ? 'Saving…' : 'Save'}
        </sp-button>
      </div>
    </div>
  `;
}
