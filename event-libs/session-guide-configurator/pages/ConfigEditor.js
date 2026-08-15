import {
  useState, useEffect, useMemo, html,
} from '../../v1/deps/htm-preact.js';
import { getEventSessionCatalog } from '../../v1/utils/esp-controller.js';
import {
  extractDistinctTracks, extractDistinctOverrideTexts, deriveFacetableAttributes,
} from '../../v1/services/sessions/sessions-api.js';
import { useNavigation } from '../context/NavigationContext.js';
import { useConfigs } from '../context/ConfigsContext.js';
import { useDA } from '../context/DAContext.js';
import { getDisplayTitle, copyRowLinkWithToast } from '../utils.js';
import SwimlaneOrderEditor from '../components/SwimlaneOrderEditor.js';
import FiltersEditor from '../components/FiltersEditor.js';
import RecommendedSessionsEditor from '../components/RecommendedSessionsEditor.js';
import LoadingInline from '../components/LoadingInline.js';

export default function ConfigEditor() {
  const { goToLibrary } = useNavigation();
  const { org, repo } = useDA();
  const {
    activeConfig, saveActiveConfig, clearActiveConfig, updateComponentName, updateConfigField,
    updateNestedConfigField, seedSwimlaneOrder, seedFilterCategories, setToastSuccess, setToastError,
  } = useConfigs();

  const [isSaving, setIsSaving] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [sessionTimes, setSessionTimes] = useState([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);
  const [sessionsError, setSessionsError] = useState(null);

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
      // Swimlanes include real tracks and override-lane names (each distinct Override
      // Primary Event Site Track value is its own swimlane, matching groupByTrack()) —
      // deduped in case a track name and override text collide.
      const swimlaneCandidates = [...new Set([
        ...extractDistinctTracks(result.data.sessions),
        ...extractDistinctOverrideTexts(result.data.sessions),
      ])];
      seedSwimlaneOrder(swimlaneCandidates);
      seedFilterCategories(deriveFacetableAttributes(result.data.sessions));
    }).finally(() => {
      if (!cancelled) setIsLoadingSessions(false);
    });
    return () => { cancelled = true; };
  }, [eventId, seedSwimlaneOrder, seedFilterCategories]);

  const tracks = useMemo(() => extractDistinctTracks(sessions), [sessions]);
  const overrideTexts = useMemo(() => extractDistinctOverrideTexts(sessions), [sessions]);

  const handleCancel = () => {
    clearActiveConfig();
    goToLibrary();
  };

  const componentNameMissing = !activeConfig?.componentName?.trim();

  const handleSave = async () => {
    if (componentNameMissing) return;
    setIsSaving(true);
    try {
      const result = await saveActiveConfig();
      if (result.ok) goToLibrary();
    } finally {
      setIsSaving(false);
    }
  };

  // Encodes activeConfig.config directly — works on unsaved changes too, no save required.
  const handleCopyLink = () => copyRowLinkWithToast(activeConfig, org, repo, setToastSuccess, setToastError);

  if (!activeConfig) return null;

  return html`
    <div class="sgc-page sgc-editor">
      <div class="sgc-editor__header">
        <button type="button" class="sgc-btn sgc-btn--icon" onClick=${handleCancel} aria-label="Back to library">←</button>
        <div class="sgc-editor__header-text">
          <h1 class="sgc-editor__title">${getDisplayTitle(activeConfig)}</h1>
          <p class="sgc-editor__event-id">${activeConfig.eventId} · Backend title: ${activeConfig.backendEventTitle}</p>
        </div>
      </div>

      <section class="sgc-editor__section">
        <h2>Sessions</h2>
        ${isLoadingSessions && html`<${LoadingInline} label="Loading sessions…" />`}
        ${sessionsError && html`<p class="sgc-editor__error">${sessionsError}</p>`}
        ${!isLoadingSessions && !sessionsError && html`
          <p class="sgc-editor__section-hint">${sessions.length} session(s) found — ${tracks.length} distinct track(s), ${overrideTexts.length} distinct override lane(s).</p>
        `}
      </section>

      <section class="sgc-editor__section">
        <h2>Component name</h2>
        <p class="sgc-editor__section-hint">Distinguishes this config from others authored for the same event (e.g. a widget vs. full-page variant).</p>
        <input
          type="text"
          class="sgc-field sgc-editor__title-input"
          placeholder="e.g. MAX 26 — Widget"
          value=${activeConfig.componentName}
          onInput=${(e) => updateComponentName(e.target.value)}
        />
        ${componentNameMissing && html`
          <p class="sgc-editor__error">Component name is required before saving.</p>
        `}
      </section>

      <section class="sgc-editor__section">
        <h2>Page mode</h2>
        <p class="sgc-editor__section-hint">Embedded on page mounts as a drawer widget; Full page renders as a dedicated page layout.</p>
        <label class="sgc-editor__radio">
          <input
            type="radio"
            name="surface"
            value="widget"
            checked=${activeConfig.config.surface === 'widget'}
            onChange=${() => updateConfigField('surface', 'widget')}
          />
          Embedded on page
        </label>
        <label class="sgc-editor__radio">
          <input
            type="radio"
            name="surface"
            value="page"
            checked=${activeConfig.config.surface === 'page'}
            onChange=${() => updateConfigField('surface', 'page')}
          />
          Full page
        </label>
      </section>

      <section class="sgc-editor__section">
        <h2>Theme</h2>
        <label class="sgc-editor__radio">
          <input
            type="radio"
            name="theme"
            value="light"
            checked=${activeConfig.config.theme === 'light'}
            onChange=${() => updateConfigField('theme', 'light')}
          />
          Light
        </label>
        <label class="sgc-editor__radio">
          <input
            type="radio"
            name="theme"
            value="dark"
            checked=${activeConfig.config.theme === 'dark'}
            onChange=${() => updateConfigField('theme', 'dark')}
          />
          Dark
        </label>
      </section>

      <section class="sgc-editor__section">
        <h2>Headings</h2>
        <p class="sgc-editor__section-hint">Shown reflects the viewer's auth state, and separately their pre-/post-event state.</p>
        <label class="sgc-editor__field-label">
          Logged-out
          <input
            type="text"
            class="sgc-field sgc-editor__heading-input"
            value=${activeConfig.config.headings.loggedOut}
            onInput=${(e) => updateNestedConfigField('headings', 'loggedOut', e.target.value)}
          />
        </label>
        <label class="sgc-editor__field-label">
          Logged-in
          <input
            type="text"
            class="sgc-field sgc-editor__heading-input"
            value=${activeConfig.config.headings.loggedIn}
            onInput=${(e) => updateNestedConfigField('headings', 'loggedIn', e.target.value)}
          />
        </label>
        <label class="sgc-editor__field-label">
          Logged-out (post-event)
          <input
            type="text"
            class="sgc-field sgc-editor__heading-input"
            value=${activeConfig.config.headings.loggedOutPostEvent}
            onInput=${(e) => updateNestedConfigField('headings', 'loggedOutPostEvent', e.target.value)}
          />
        </label>
        <label class="sgc-editor__field-label">
          Logged-in (post-event)
          <input
            type="text"
            class="sgc-field sgc-editor__heading-input"
            value=${activeConfig.config.headings.loggedInPostEvent}
            onInput=${(e) => updateNestedConfigField('headings', 'loggedInPostEvent', e.target.value)}
          />
        </label>
      </section>

      <section class="sgc-editor__section">
        <h2>Behavior flags</h2>
        <label class="sgc-editor__checkbox">
          <input
            type="checkbox"
            checked=${!!activeConfig.config.behaviorFlags.enableScheduling}
            onChange=${(e) => updateNestedConfigField('behaviorFlags', 'enableScheduling', e.target.checked)}
          />
          Enable scheduling
        </label>
        <label class="sgc-editor__checkbox">
          <input
            type="checkbox"
            checked=${!!activeConfig.config.behaviorFlags.enableFavoriting}
            onChange=${(e) => updateNestedConfigField('behaviorFlags', 'enableFavoriting', e.target.checked)}
          />
          Enable favoriting
        </label>
        <label class="sgc-editor__checkbox">
          <input
            type="checkbox"
            checked=${!!activeConfig.config.behaviorFlags.enableWatchNowCtas}
            onChange=${(e) => updateNestedConfigField('behaviorFlags', 'enableWatchNowCtas', e.target.checked)}
          />
          Enable Watch Now CTAs
        </label>
        <p class="sgc-editor__section-hint">Allowing double-booking of overlapping sessions is set at the event level via the linked Tier 1 config, not here.</p>
      </section>

      <section class="sgc-editor__section">
        <h2>On-demand swimlane order</h2>
        <p class="sgc-editor__section-hint">Includes both real tracks and Override Primary Event Site Track lanes — each distinct override text is its own swimlane, same as on the live page. Drag to reorder, or focus a handle and press arrow up/down. Unselect an entry to hide it from the session guide entirely, or edit its name to change how it's labeled here — the original value stays shown alongside for reference. Icons/colors are still managed globally via the Tier 1 Event Configurator.</p>
        ${isLoadingSessions && html`<${LoadingInline} label="Loading tracks…" />`}
        ${sessionsError && html`<p class="sgc-editor__error">${sessionsError}</p>`}
        ${!isLoadingSessions && !sessionsError && html`
          <${SwimlaneOrderEditor} \
            tracks=${activeConfig.config.swimlaneOrder} \
            onChange=${(next) => updateConfigField('swimlaneOrder', next)} \
          />
        `}
      </section>

      <section class="sgc-editor__section">
        <h2>Filters</h2>
        <p class="sgc-editor__section-hint">Every facetable attribute from this event's sessions starts enabled — unselect, rename, or reorder the ones shown in the published Session Guide. The original name stays shown alongside the editable one for reference. Filter options themselves are always read live from ESP, not authored here.</p>
        ${isLoadingSessions && html`<${LoadingInline} label="Loading filters…" />`}
        ${sessionsError && html`<p class="sgc-editor__error">${sessionsError}</p>`}
        ${!isLoadingSessions && !sessionsError && html`
          <${FiltersEditor} \
            categories=${activeConfig.config.filterCategories} \
            onChange=${(next) => updateConfigField('filterCategories', next)} \
          />
        `}
      </section>

      <section class="sgc-editor__section">
        <h2>Recommended Sessions</h2>
        <p class="sgc-editor__section-hint">Fills the live carousel when nothing is currently live, and the on-demand view's featured row. Falls back to a randomized selection of the day's sessions when nothing is picked here.</p>
        ${isLoadingSessions && html`<${LoadingInline} label="Loading sessions…" />`}
        ${sessionsError && html`<p class="sgc-editor__error">${sessionsError}</p>`}
        ${!isLoadingSessions && !sessionsError && html`
          <${RecommendedSessionsEditor} \
            sessions=${sessions} \
            sessionTimes=${sessionTimes} \
            tracks=${tracks} \
            recommendedSessions=${activeConfig.config.recommendedSessions} \
            onChange=${(next) => updateConfigField('recommendedSessions', next)} \
          />
        `}
      </section>

      <div class="sgc-editor__actions">
        <button type="button" class="sgc-btn sgc-btn--outline sgc-btn--l" onClick=${handleCancel}>Cancel</button>
        <button
          type="button"
          class="sgc-btn sgc-btn--outline sgc-btn--l"
          onClick=${handleCopyLink}
          disabled=${componentNameMissing}
        >
          Copy link
        </button>
        <button
          type="button"
          class="sgc-btn sgc-btn--primary sgc-btn--l"
          onClick=${handleSave}
          disabled=${isSaving || componentNameMissing}
        >
          ${isSaving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  `;
}
