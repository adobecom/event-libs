import { useState, useEffect, useMemo, html } from '../../v1/deps/htm-preact.js';
import { getEventSessionCatalog } from '../../v1/utils/esp-controller.js';
import { useNavigation } from '../context/NavigationContext.js';
import { useConfigs } from '../context/ConfigsContext.js';
import {
  copyTextToClipboard, extractDistinctTracks, isTrackIconEntryComplete, getDisplayTitle, stringifyConfig,
} from '../utils.js';
import TrackIconEditor from '../components/TrackIconEditor.js';
import FeaturedSessionsEditor from '../components/FeaturedSessionsEditor.js';
import LoadingInline from '../components/LoadingInline.js';

export default function ConfigEditor() {
  const { goToLibrary } = useNavigation();
  const {
    activeConfig, saveActiveConfig, clearActiveConfig, updateTrackIcon, seedTrackIcons,
    updateConfigField, setToastSuccess, setToastError,
  } = useConfigs();

  const [sessions, setSessions] = useState([]);
  const [sessionTimes, setSessionTimes] = useState([]);
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
      setSessions(result.data.sessions);
      setSessionTimes(result.data.sessionTimes);
      seedTrackIcons(extractDistinctTracks(result.data.sessions));
    }).finally(() => {
      if (!cancelled) setIsLoadingSessions(false);
    });
    return () => { cancelled = true; };
  }, [eventId, seedTrackIcons]);

  const tracks = useMemo(() => extractDistinctTracks(sessions), [sessions]);

  const configPreview = useMemo(() => {
    if (!activeConfig) return '';
    return stringifyConfig(activeConfig.config);
  }, [activeConfig]);

  // A color authored with no icon to apply it to doesn't make sense (icon
  // alone is fine — color implicitly defaults to black) — flagged here
  // rather than silently saved in a state that can't render (PLAN.md Phase 4).
  const incompleteTracks = useMemo(() => {
    if (!activeConfig) return [];
    return tracks.filter((track) => !isTrackIconEntryComplete(activeConfig.config.trackIcons?.[track]));
  }, [tracks, activeConfig]);

  const handleCancel = () => {
    clearActiveConfig();
    goToLibrary();
  };

  const handleSave = async () => {
    if (incompleteTracks.length > 0) return;
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
        <button type="button" class="tec-btn tec-btn--icon" onClick=${handleCancel} aria-label="Back to library">←</button>
        <div class="tec-editor__header-text">
          <h1 class="tec-editor__title">${getDisplayTitle(activeConfig)}</h1>
          <p class="tec-editor__event-id">${activeConfig.eventId} · Backend title: ${activeConfig.backendEventTitle}</p>
        </div>
      </div>

      <section class="tec-editor__section">
        <h2>Event title</h2>
        <p class="tec-editor__section-hint">Optional alternative display name for this event. Leave blank to use the backend title ("${activeConfig.backendEventTitle}") everywhere this is shown.</p>
        <input
          type="text"
          class="tec-field tec-editor__title-input"
          placeholder=${activeConfig.backendEventTitle}
          value=${activeConfig.config.eventTitle || ''}
          onInput=${(e) => updateConfigField('eventTitle', e.target.value)}
        />
      </section>

      <section class="tec-editor__section">
        <h2>Sessions</h2>
        ${isLoadingSessions && html`<${LoadingInline} label="Loading sessions…" />`}
        ${sessionsError && html`<p class="tec-editor__error">${sessionsError}</p>`}
        ${!isLoadingSessions && !sessionsError && html`
          <p class="tec-editor__section-hint">${sessions.length} session(s) found — ${tracks.length} distinct track(s).</p>
        `}
      </section>

      <section class="tec-editor__section">
        <h2>Track icons & colors</h2>
        <p class="tec-editor__section-hint">Icons pre-fill from the built-in defaults where known. Color always starts black — pick a color per track, or leave both icon and color unset to use the page's own built-in default at render time.</p>
        ${isLoadingSessions && html`<${LoadingInline} label="Loading tracks…" />`}
        ${sessionsError && html`<p class="tec-editor__error">${sessionsError}</p>`}
        ${incompleteTracks.length > 0 && html`
          <p class="tec-editor__error">
            ${incompleteTracks.length} track${incompleteTracks.length === 1 ? '' : 's'} ${incompleteTracks.length === 1 ? 'has' : 'have'} a color set with no icon — pick one, or clear the color, before saving: ${incompleteTracks.join(', ')}
          </p>
        `}
        ${!isLoadingSessions && !sessionsError && html`
          <${TrackIconEditor}
            tracks=${tracks}
            trackIcons=${activeConfig.config.trackIcons}
            onChange=${updateTrackIcon}
          />
        `}
      </section>

      <section class="tec-editor__section">
        <h2>Allow double booking</h2>
        <p class="tec-editor__section-hint">Lets an attendee schedule sessions that overlap in time on this event's Tier 1 surfaces.</p>
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
        <p class="tec-editor__section-hint">Pick which sessions appear in the featured carousel, and set their display order.</p>
        ${isLoadingSessions && html`<${LoadingInline} label="Loading sessions…" />`}
        ${sessionsError && html`<p class="tec-editor__error">${sessionsError}</p>`}
        ${!isLoadingSessions && !sessionsError && html`
          <${FeaturedSessionsEditor} \
            sessions=${sessions} \
            sessionTimes=${sessionTimes} \
            tracks=${tracks} \
            featuredSessions=${activeConfig.config.featuredSessions} \
            onChange=${(next) => updateConfigField('featuredSessions', next)} \
          />
        `}
      </section>

      <section class="tec-editor__section">
        <h2>Config JSON</h2>
        <p class="tec-editor__section-hint">This is what gets saved to the row, and what you'll paste into the page's <code>tier-1-event-config</code> metadata after saving.</p>
        <pre class="tec-editor__config-preview">${configPreview}</pre>
        <button type="button" class="tec-btn tec-btn--outline" onClick=${handleCopy}>Copy config</button>
      </section>

      <div class="tec-editor__actions">
        <button type="button" class="tec-btn tec-btn--outline tec-btn--l" onClick=${handleCancel}>Cancel</button>
        <button type="button" class="tec-btn tec-btn--primary tec-btn--l" onClick=${handleSave} disabled=${isSaving || incompleteTracks.length > 0}>
          ${isSaving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  `;
}
