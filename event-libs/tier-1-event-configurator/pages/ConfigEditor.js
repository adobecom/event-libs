import { useState, useEffect, useMemo, html } from '../../v1/deps/htm-preact.js';
import { useNavigation } from '../context/NavigationContext.js';
import { useConfigs } from '../context/ConfigsContext.js';
import { useDA } from '../context/DAContext.js';
import {
  copyTextToClipboard, extractDistinctPrimaryTracks, extractDistinctAllTracks,
  extractDistinctOverrideTexts, extractDistinctProducts,
  isTrackIconEntryComplete, getDisplayTitle, stringifyConfig, copyHomepageConfigLink,
} from '../utils.js';
import {
  CONFIG_TYPES, HOMEPAGE_FIELD_BY_TYPE, isHomepageConfigType, WATCH_DESTINATION_OPTIONS,
} from '../constants.js';
import TrackIconEditor from '../components/TrackIconEditor.js';
import OverrideTrackIconEditor from '../components/OverrideTrackIconEditor.js';
import ProductIconEditor from '../components/ProductIconEditor.js';
import FeaturedSessionsEditor from '../components/FeaturedSessionsEditor.js';
import EpochDateTimeField from '../components/EpochDateTimeField.js';
import LoadingInline from '../components/LoadingInline.js';

export default function ConfigEditor() {
  const { goToLibrary } = useNavigation();
  const {
    activeConfig, saveActiveConfig, clearActiveConfig, updateTrackIcon,
    updateOverrideTrackIcon, updateProduct, updateConfigField,
    setToastSuccess, setToastError, getSessionCatalogForRow,
  } = useConfigs();
  const { org, repo } = useDA();

  const [sessions, setSessions] = useState([]);
  const [sessionTimes, setSessionTimes] = useState([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);
  const [sessionsError, setSessionsError] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  const eventId = activeConfig?.eventId;
  const eventServiceEnv = activeConfig?.eventServiceEnv;
  const configType = activeConfig?.configType || CONFIG_TYPES.GLOBAL;
  const isHomepage = isHomepageConfigType(configType);
  const homepageMeta = HOMEPAGE_FIELD_BY_TYPE[configType];

  // getSessionCatalogForRow caches by (eventId, env) — if Library.js already prefetched this
  // row (Homepage rows are prefetched as soon as the library loads), opening it for edit right
  // after reuses that result instead of hitting ESP a second time.
  useEffect(() => {
    if (!eventId) return undefined;
    let cancelled = false;
    setIsLoadingSessions(true);
    setSessionsError(null);
    getSessionCatalogForRow({ eventId, eventServiceEnv }).then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        setSessionsError(result.error || 'Failed to load sessions for this event');
        return;
      }
      setSessions(result.data.sessions);
      setSessionTimes(result.data.sessionTimes);
    }).finally(() => {
      if (!cancelled) setIsLoadingSessions(false);
    });
    return () => { cancelled = true; };
  }, [eventId, eventServiceEnv, getSessionCatalogForRow]);

  const primaryTracks = useMemo(() => extractDistinctPrimaryTracks(sessions), [sessions]);
  // Track icons/colors map every track a session can badge, so it covers Additional Event
  // Site Tracks too — `primaryTracks` above stays primary-only for the featured-sessions
  // picker, whose filter matches on the primary track alone.
  const iconTracks = useMemo(() => extractDistinctAllTracks(sessions), [sessions]);
  const overrideTexts = useMemo(() => extractDistinctOverrideTexts(sessions), [sessions]);
  const products = useMemo(() => extractDistinctProducts(sessions), [sessions]);

  const configPreview = useMemo(() => {
    if (!activeConfig) return '';
    return stringifyConfig(activeConfig.config);
  }, [activeConfig]);

  // A color authored with no icon to apply it to doesn't make sense (icon
  // alone is fine — color implicitly defaults to black) — flagged here
  // rather than silently saved in a state that can't render (PLAN.md Phase 4).
  // Global-only: Homepage configs don't author track icons at all.
  const incompleteTracks = useMemo(() => {
    if (!activeConfig || isHomepage) return [];
    return iconTracks.filter((track) => !isTrackIconEntryComplete(activeConfig.config.trackIcons?.[track]));
  }, [iconTracks, activeConfig, isHomepage]);

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

  const handleMetaChange = (sessionId, patch) => {
    const current = activeConfig.config[homepageMeta.metaField] || {};
    updateConfigField(homepageMeta.metaField, {
      ...current,
      [sessionId]: { ...current[sessionId], ...patch },
    });
  };

  const handleCopyHomepageLink = async () => {
    const ok = await copyHomepageConfigLink(org, repo, activeConfig, homepageMeta, sessions, sessionTimes);
    if (ok) setToastSuccess(`Link copied — paste it directly into ${homepageMeta.blockHint}'s doc body`);
    else setToastError('Could not copy the link — please retry');
  };

  const handleCopy = async () => {
    // Minified, not configPreview's pretty-printed form: DA joins a metadata cell's
    // multi-line content back with ", ", corrupting multi-line JSON with stray commas.
    const ok = await copyTextToClipboard(JSON.stringify(activeConfig.config));
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

      ${isHomepage && html`
        <section class="tec-editor__section">
          <h2>Config name</h2>
          <p class="tec-editor__section-hint">Name this config so it's easy to find in the library later. Purely a label — never pasted anywhere.</p>
          <input
            type="text"
            class="tec-field tec-editor__title-input"
            placeholder=${`e.g. "${activeConfig.backendEventTitle} homepage config"`}
            value=${activeConfig.config.configName || ''}
            onInput=${(e) => updateConfigField('configName', e.target.value)}
          />
        </section>
      `}

      ${!isHomepage && html`
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
      `}

      ${!isHomepage && html`
        <section class="tec-editor__section">
          <h2>Event dates</h2>
          <p class="tec-editor__section-hint">Can fall outside the first/last session's times. Picker shows LA time; saved as a UTC epoch — use the epoch field directly for non-LA events. Leave blank if unknown.</p>
          <${EpochDateTimeField}
            idPrefix="tec-event-start"
            label="Event start"
            valueMs=${activeConfig.config.eventStartDateTime}
            onChange=${(ms) => updateConfigField('eventStartDateTime', ms)}
          />
          <${EpochDateTimeField}
            idPrefix="tec-event-end"
            label="Event end"
            valueMs=${activeConfig.config.eventEndDateTime}
            onChange=${(ms) => updateConfigField('eventEndDateTime', ms)}
          />
        </section>
      `}

      <section class="tec-editor__section">
        <h2>Sessions</h2>
        ${isLoadingSessions && html`<${LoadingInline} label="Loading sessions…" />`}
        ${sessionsError && html`<p class="tec-editor__error">${sessionsError}</p>`}
        ${!isLoadingSessions && !sessionsError && html`
          <p class="tec-editor__section-hint">${sessions.length} session(s) found — ${iconTracks.length} distinct track(s) (primary + additional), ${products.length} distinct product(s).</p>
        `}
      </section>

      ${!isHomepage && html`
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
              tracks=${iconTracks}
              trackIcons=${activeConfig.config.trackIcons}
              onChange=${updateTrackIcon}
            />
          `}
        </section>

        <section class="tec-editor__section">
          <h2>Override icons</h2>
          <p class="tec-editor__section-hint">Override Primary Event Site Track always wins swimlane placement and the badge — each distinct override text is its own lane. Map an icon per text below, or leave it on the default for texts you haven't configured yet.</p>
          ${isLoadingSessions && html`<${LoadingInline} label="Loading override text…" />`}
          ${!isLoadingSessions && !sessionsError && html`
            <${OverrideTrackIconEditor}
              overrideTexts=${overrideTexts}
              overrideTrackIcons=${activeConfig.config.overrideTrackIcons?.byText}
              onChangeMapped=${updateOverrideTrackIcon}
            />
          `}
        </section>

        <section class="tec-editor__section">
          <h2>Product icons & page URLs</h2>
          <p class="tec-editor__section-hint">Products already have their own colored icons — no color to set here, just an icon and a page URL per product.</p>
          ${isLoadingSessions && html`<${LoadingInline} label="Loading products…" />`}
          ${!isLoadingSessions && !sessionsError && html`
            <${ProductIconEditor}
              products=${products}
              productConfig=${activeConfig.config.products}
              onChange=${updateProduct}
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
          <h2>RainFocus API</h2>
          <p class="tec-editor__section-hint">
            Lets this event's Tier 1 pages make live RainFocus schedule/favorites calls.
            Part of the Config JSON below — one payload, pasted once into the page's
            <code>tier-1-event-config</code> metadata. The profile id isn't a secret
            (RainFocus restricts access by IP allowlist on their side), but it is specific to
            this event — leave blank and the page falls back to the site's default event.
          </p>
          <label class="tec-editor__field-label" for="tec-rf-api-url">RainFocus API URL</label>
          <input
            id="tec-rf-api-url"
            type="text"
            class="tec-field tec-editor__rf-input"
            placeholder="https://www.adobe.com/max-api/"
            value=${activeConfig.config.rfApiUrl || ''}
            onInput=${(e) => updateConfigField('rfApiUrl', e.target.value)}
          />
          <label class="tec-editor__field-label" for="tec-rf-profile-id">RainFocus profile ID</label>
          <input
            id="tec-rf-profile-id"
            type="text"
            class="tec-field tec-editor__rf-input"
            placeholder="this event's RainFocus profile id"
            value=${activeConfig.config.rfProfileId || ''}
            onInput=${(e) => updateConfigField('rfProfileId', e.target.value)}
          />
        </section>

        <section class="tec-editor__section">
          <h2>Registration</h2>
          <p class="tec-editor__section-hint">Where attendees are sent to register when a logged-in but unregistered user tries to schedule/favorite a session or view My Sessions/My Favorites. Leave blank and the page falls back to its own default.</p>
          <label class="tec-editor__field-label" for="tec-register-url">Registration URL</label>
          <input
            id="tec-register-url"
            type="text"
            class="tec-field tec-editor__rf-input"
            placeholder="/register"
            value=${activeConfig.config.registerUrl || ''}
            onInput=${(e) => updateConfigField('registerUrl', e.target.value)}
          />
        </section>

        <section class="tec-editor__section">
          <h2>Event pages</h2>
          <p class="tec-editor__section-hint">Where a session's "Watch now" CTA sends attendees while it's live: the event homepage for livestreamed sessions, the broadcast page for online-only ones. Root-relative paths on this event's own site. Leave blank and the page falls back to MAX's paths.</p>
          <label class="tec-editor__field-label" for="tec-homepage-path">Homepage path</label>
          <input
            id="tec-homepage-path"
            type="text"
            class="tec-field tec-editor__rf-input"
            placeholder="/max.html"
            value=${activeConfig.config.homepagePath || ''}
            onInput=${(e) => updateConfigField('homepagePath', e.target.value)}
          />
          <label class="tec-editor__field-label" for="tec-broadcast-path">Broadcast page path</label>
          <input
            id="tec-broadcast-path"
            type="text"
            class="tec-field tec-editor__rf-input"
            placeholder="/max/2026/broadcast.html"
            value=${activeConfig.config.broadcastPath || ''}
            onInput=${(e) => updateConfigField('broadcastPath', e.target.value)}
          />
        </section>

        <section class="tec-editor__section">
          <h2>Config JSON</h2>
          <p class="tec-editor__section-hint">This is what gets saved to the row, and what you'll paste into the page's <strong><code>tier-1-event-config</code></strong> metadata after saving.</p>
          <pre class="tec-editor__config-preview">${configPreview}</pre>
          <button type="button" class="tec-btn tec-btn--outline" onClick=${handleCopy}>Copy config</button>
        </section>
      `}

      ${isHomepage && html`
        <section class="tec-editor__section">
          <h2>${homepageMeta.label}</h2>
          <p class="tec-editor__section-hint">
            Pick which sessions appear, and set their order. Your picks are saved with this
            row so you can come back and edit them, but ${homepageMeta.blockHint} doesn't read
            this row directly — it reads the link generated by "Copy Link" below once that's
            pasted into the homepage page's doc body.${homepageMeta.metaHint && html` ${homepageMeta.metaHint} — none of
            them has a source in the session catalog, so fill them in only for sessions that
            actually need one.`}
          </p>
          ${homepageMeta.headingField && html`
            <label class="tec-editor__field-label" for="tec-homepage-heading">Section heading</label>
            <input
              id="tec-homepage-heading"
              type="text"
              class="tec-field tec-editor__heading-input"
              placeholder=${homepageMeta.label}
              value=${activeConfig.config[homepageMeta.headingField] || ''}
              onInput=${(e) => updateConfigField(homepageMeta.headingField, e.target.value)}
            />
          `}
          ${homepageMeta.ctaFields && html`
            <p class="tec-editor__section-hint">${homepageMeta.ctaHint}</p>
            <div class="tec-editor__cta-fields">
              ${Object.entries(homepageMeta.ctaFields).map(([state, field]) => html`
                <label class="tec-editor__field-label" for="tec-cta-${state}" key=${state}>
                  CTA text — ${state}
                </label>
                <input
                  id="tec-cta-${state}"
                  type="text"
                  class="tec-field tec-editor__heading-input"
                  placeholder=${homepageMeta.ctaDefaults?.[state] || ''}
                  value=${activeConfig.config[field] || ''}
                  onInput=${(e) => updateConfigField(field, e.target.value)}
                />
              `)}
            </div>
          `}
          ${homepageMeta.watchDestinationField && html`
            <p class="tec-editor__section-hint">${homepageMeta.watchDestinationHint}</p>
            <fieldset class="tec-editor__watch-destination">
              <legend class="tec-editor__field-label">Watch destination</legend>
              ${WATCH_DESTINATION_OPTIONS.map((opt) => html`
                <label key=${opt.value}>
                  <input
                    type="radio"
                    name="tec-watch-destination"
                    value=${opt.value}
                    checked=${(activeConfig.config[homepageMeta.watchDestinationField] || 'broadcast') === opt.value}
                    onChange=${() => updateConfigField(homepageMeta.watchDestinationField, opt.value)}
                  />
                  ${opt.label}
                </label>
              `)}
            </fieldset>
            ${activeConfig.config[homepageMeta.watchDestinationField] === 'homepage' && html`
              <label class="tec-editor__field-label" for="tec-homepage-anchor-id">Homepage anchor ID</label>
              <input
                id="tec-homepage-anchor-id"
                type="text"
                class="tec-field tec-editor__heading-input"
                placeholder="e.g. live-marquee"
                value=${activeConfig.config[homepageMeta.homepageAnchorIdField] || ''}
                onInput=${(e) => updateConfigField(homepageMeta.homepageAnchorIdField, e.target.value)}
              />
            `}
          `}
          ${isLoadingSessions && html`<${LoadingInline} label="Loading sessions…" />`}
          ${sessionsError && html`<p class="tec-editor__error">${sessionsError}</p>`}
          ${!isLoadingSessions && !sessionsError && html`
            <${FeaturedSessionsEditor} \
              sessions=${sessions} \
              sessionTimes=${sessionTimes} \
              tracks=${primaryTracks} \
              featuredSessions=${activeConfig.config[homepageMeta.field]} \
              onChange=${(next) => updateConfigField(homepageMeta.field, next)} \
              heading="${homepageMeta.label} (display order)" \
              emptyHint="No sessions added yet — add some from the list on the right." \
              meta=${activeConfig.config[homepageMeta.metaField]} \
              onMetaChange=${handleMetaChange} \
              metaFields=${homepageMeta.metaFields} \
            />
            <button type="button" class="tec-btn tec-btn--outline" onClick=${handleCopyHomepageLink}>Copy Link</button>
          `}
        </section>
      `}

      <div class="tec-editor__actions">
        <button type="button" class="tec-btn tec-btn--outline tec-btn--l" onClick=${handleCancel}>Cancel</button>
        <button type="button" class="tec-btn tec-btn--primary tec-btn--l" onClick=${handleSave} disabled=${isSaving || incompleteTracks.length > 0}>
          ${isSaving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  `;
}
