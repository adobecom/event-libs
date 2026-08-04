import {
  createContext, useState, useContext, useCallback, useEffect, html,
} from '../../v1/deps/htm-preact.js';
import {
  getConfigs,
  upsertConfig as upsertConfigController,
  deleteConfig as deleteConfigController,
} from '../scripts/da-controller.js';
import { useDA } from './DAContext.js';
import { getDefaultTrackIcon, DEFAULT_ICON_COLOR } from '../default-track-icons.js';
import { getDisplayTitle } from '../utils.js';

const ConfigsContext = createContext();

function emptyConfig() {
  return {
    eventTitle: '',
    trackIcons: {},
    allowDoubleBooking: false,
    featuredSessions: [],
    rfApiUrl: '',
    rfProfileId: '',
  };
}

const ConfigsProvider = ({ children }) => {
  const { org, repo } = useDA();

  const [configs, setConfigs] = useState([]);
  const [isInitialLoading, setIsInitialLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [error, setError] = useState(null);
  const [toastSuccess, setToastSuccess] = useState(null);
  const [toastError, setToastError] = useState(null);

  // The row currently open in the editor — always a full row shape
  // ({ eventId, backendEventTitle, eventServiceEnv, config }), whether
  // freshly created (New/Duplicate) or loaded from the library (Edit).
  const [activeConfig, setActiveConfig] = useState(null);

  const loadConfigs = useCallback(async () => {
    if (!org || !repo) return;
    setIsInitialLoading(true);
    setError(null);
    try {
      const result = await getConfigs(org, repo);
      if (!result.ok) {
        setError(result.error || 'Failed to load the config library');
        return;
      }
      setConfigs(result.data);
      setHasLoaded(true);
    } finally {
      setIsInitialLoading(false);
    }
  }, [org, repo]);

  useEffect(() => {
    if (org && repo && !hasLoaded) loadConfigs();
  }, [org, repo, hasLoaded, loadConfigs]);

  const findConfigByEventId = useCallback(
    (eventId) => configs.find((c) => c.eventId === eventId) || null,
    [configs],
  );

  // Starts a fresh row for a newly picked event. Dedup (routing to Edit when a
  // row already exists for the picked event) is the picker's responsibility —
  // see PLAN.md Phase 4 — so this always assumes no prior row. `eventServiceEnv`
  // is whatever ESP tier was active when the event was picked (Library.js
  // reads it from EventEnvContext) — row-level only, never pasted into the
  // page's Config, since it's purely an authoring-time detail of where this
  // event's data came from, re-applied automatically when the row is edited
  // later (see Library.js's openEdit) so a session-catalog refetch doesn't
  // silently default back to prod after a page reload resets the override.
  const startNewConfig = useCallback((event, eventServiceEnv) => {
    setActiveConfig({
      eventId: event.eventId,
      backendEventTitle: event.enTitle || event.eventId,
      eventServiceEnv,
      config: emptyConfig(),
    });
  }, []);

  // Clones an existing row's config onto a newly picked Event ID. App-stamped
  // identity fields (eventId/backendEventTitle/updated) are dropped rather
  // than carried over stale — upsertConfig re-stamps them at save time.
  // eventTitle (the author's alternative title) is also reset — it names the
  // source event specifically, not a generic style setting like trackIcons,
  // so carrying it over would silently mislabel the new event.
  // `eventServiceEnv` is the *new* pick's env, not the source row's —
  // Duplicate can legitimately target a different tier than its source.
  // rfApiUrl/rfProfileId (MWPW-200311) are always reset blank rather than
  // cloned — unlike a style setting such as trackIcons, silently reusing another
  // event's RainFocus profile id would misroute this new event's live
  // schedule/favorites calls at whatever RF profile the source event used.
  const startDuplicateConfig = useCallback((sourceRow, event, eventServiceEnv) => {
    const clonedConfig = { ...sourceRow.config };
    delete clonedConfig.eventId;
    delete clonedConfig.backendEventTitle;
    delete clonedConfig.updated;
    setActiveConfig({
      eventId: event.eventId,
      backendEventTitle: event.enTitle || event.eventId,
      eventServiceEnv,
      config: {
        ...clonedConfig, eventTitle: '', rfApiUrl: '', rfProfileId: '',
      },
    });
  }, []);

  const startEditConfig = useCallback((row) => {
    setActiveConfig(row);
  }, []);

  const clearActiveConfig = useCallback(() => setActiveConfig(null), []);

  // Merges { icon, color } updates into config.trackIcons[track] for the
  // active config, immutably, so the Config JSON preview (reading
  // activeConfig.config directly) stays in sync automatically.
  const updateTrackIcon = useCallback((track, updates) => {
    setActiveConfig((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        config: {
          ...prev.config,
          trackIcons: {
            ...prev.config.trackIcons,
            [track]: { ...prev.config.trackIcons?.[track], ...updates },
          },
        },
      };
    });
  }, []);

  // Called once real tracks are known (session fetch resolves) — writes a
  // { icon, color: black } entry for any track with a *known* default icon
  // that isn't already in trackIcons (never overwrites an authored/seeded
  // entry). Tracks with no known icon are left unseeded — nothing sensible
  // to auto-pick, and seeding a color alone would trip isTrackIconEntryComplete.
  const seedTrackIcons = useCallback((tracks) => {
    setActiveConfig((prev) => {
      if (!prev) return prev;
      const existing = prev.config.trackIcons || {};
      const additions = {};
      (tracks || []).forEach((track) => {
        if (existing[track]) return;
        const fallback = getDefaultTrackIcon(track);
        if (!fallback?.icon) return;
        additions[track] = { icon: fallback.icon, color: DEFAULT_ICON_COLOR };
      });
      if (Object.keys(additions).length === 0) return prev;
      return {
        ...prev,
        config: { ...prev.config, trackIcons: { ...existing, ...additions } },
      };
    });
  }, []);

  // Sets a single top-level config field (e.g. allowDoubleBooking,
  // featuredSessions, rfApiUrl, rfProfileId) immutably, so the Config JSON
  // preview stays in sync.
  const updateConfigField = useCallback((key, value) => {
    setActiveConfig((prev) => {
      if (!prev) return prev;
      return { ...prev, config: { ...prev.config, [key]: value } };
    });
  }, []);

  const saveActiveConfig = useCallback(async () => {
    if (!activeConfig || !org || !repo) return { ok: false };
    const result = await upsertConfigController(org, repo, activeConfig);
    if (!result.ok) {
      setToastError(result.error || 'Failed to save — please retry');
      return result;
    }
    setConfigs((prev) => {
      const idx = prev.findIndex((r) => r.eventId === result.data.eventId);
      if (idx === -1) return [result.data, ...prev];
      const next = [...prev];
      next[idx] = result.data;
      return next;
    });
    setActiveConfig(result.data);
    setToastSuccess(`Saved config for ${getDisplayTitle(result.data)}`);
    return result;
  }, [activeConfig, org, repo]);

  const removeConfig = useCallback(async (eventId) => {
    if (!org || !repo) return { ok: false };
    const result = await deleteConfigController(org, repo, eventId);
    if (!result.ok) {
      setToastError(result.error || 'Failed to delete — please retry');
      return result;
    }
    setConfigs((prev) => prev.filter((r) => r.eventId !== eventId));
    setToastSuccess('Config deleted');
    return result;
  }, [org, repo]);

  const clearToastError = useCallback(() => setToastError(null), []);
  const clearToastSuccess = useCallback(() => setToastSuccess(null), []);

  const value = {
    configs,
    isInitialLoading,
    error,
    toastSuccess,
    toastError,
    clearToastError,
    clearToastSuccess,
    setToastError,
    setToastSuccess,
    activeConfig,
    findConfigByEventId,
    startNewConfig,
    startDuplicateConfig,
    startEditConfig,
    clearActiveConfig,
    updateTrackIcon,
    seedTrackIcons,
    updateConfigField,
    saveActiveConfig,
    removeConfig,
  };

  return html`
    <${ConfigsContext.Provider} value=${value}>
      ${children}
    </${ConfigsContext.Provider}>
  `;
};

const useConfigs = () => useContext(ConfigsContext);

export { ConfigsContext, ConfigsProvider, useConfigs };
