import {
  createContext, useState, useContext, useCallback, useEffect, useRef, html,
} from '../../v1/deps/htm-preact.js';
import {
  getConfigs,
  upsertConfig as upsertConfigController,
  deleteConfig as deleteConfigController,
} from '../scripts/da-controller.js';
import { getEventSessionCatalog } from '../../v1/utils/esp-controller.js';
import { useDA } from './DAContext.js';
import { useEventEnv } from './EventEnvContext.js';
import { getDisplayTitle } from '../utils.js';
import { CONFIG_TYPES, HOMEPAGE_SESSION_FIELDS, isHomepageConfigType } from '../constants.js';

const ConfigsContext = createContext();

// Scoped per config type — a Global row never carries configName or Homepage session-pick
// fields; each Homepage sub-type only carries its own field+meta pair.
function emptyConfig(configType = CONFIG_TYPES.GLOBAL) {
  if (isHomepageConfigType(configType)) {
    const { field, metaField } = HOMEPAGE_SESSION_FIELDS[configType];
    return { configName: '', [field]: [], [metaField]: {} };
  }
  return {
    eventTitle: '',
    eventStartDateTime: null,
    eventEndDateTime: null,
    trackIcons: {},
    // Nested under byText so no author-typed override text can collide with a config key.
    overrideTrackIcons: { byText: {} },
    products: {},
    allowDoubleBooking: false,
    rfApiUrl: '',
    rfProfileId: '',
    registerUrl: '',
    homepagePath: '',
    broadcastPath: '',
  };
}

const ConfigsProvider = ({ children }) => {
  const { org, repo } = useDA();
  const { envName, setEnv } = useEventEnv();

  // Shared by Library.js (prefetching every Homepage row up front) and ConfigEditor.js
  // (loading the active row's sessions) so opening a row for edit right after Library
  // already warmed its catalog doesn't re-hit ESP for data that's already in hand.
  // Keyed by (eventId, env) — a row's config type doesn't affect what session-catalog data
  // comes back for its event.
  const sessionCatalogCache = useRef(new Map());
  const getSessionCatalogForRow = useCallback((row) => {
    const key = `${row.eventId}:${row.eventServiceEnv || 'prod'}`;
    let promise = sessionCatalogCache.current.get(key);
    if (!promise) {
      // getEventSessionCatalog reads the ESP env from this shared global override, not from
      // an argument — flip it to the row's own authored env for the fetch, then restore
      // whatever the caller had active, mirroring Library.js's per-row env switch on Edit.
      promise = (async () => {
        const currentEnv = envName;
        setEnv(row.eventServiceEnv || 'prod');
        try {
          return await getEventSessionCatalog(row.eventId);
        } finally {
          setEnv(currentEnv);
        }
      })();
      sessionCatalogCache.current.set(key, promise);
    }
    return promise;
  }, [envName, setEnv]);

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

  // Rows are keyed on (eventId, configType) together — the same event can
  // carry a Global row plus separate Homepage rows (Upcoming Sessions,
  // Featured Sessions) side by side. Absent configType means Global, for
  // rows saved before this field existed.
  const findConfigByEventId = useCallback(
    (eventId, configType = CONFIG_TYPES.GLOBAL) => configs.find(
      (c) => c.eventId === eventId && (c.configType || CONFIG_TYPES.GLOBAL) === configType,
    ) || null,
    [configs],
  );

  // Starts a fresh row for a newly picked event + config type. Dedup (routing
  // to Edit when a row already exists for the picked event+type) is the
  // picker's responsibility — see PLAN.md Phase 4 — so this always assumes no
  // prior row. `eventServiceEnv` is whatever ESP tier was active when the
  // event was picked (Library.js reads it from EventEnvContext) — row-level
  // only, never pasted into the page's Config, since it's purely an
  // authoring-time detail of where this event's data came from, re-applied
  // automatically when the row is edited later (see Library.js's openEdit) so
  // a session-catalog refetch doesn't silently default back to prod after a
  // page reload resets the override.
  const startNewConfig = useCallback((event, eventServiceEnv, configType = CONFIG_TYPES.GLOBAL) => {
    setActiveConfig({
      eventId: event.eventId,
      backendEventTitle: event.enTitle || event.eventId,
      eventServiceEnv,
      configType,
      config: emptyConfig(configType),
    });
  }, []);

  // Builds from a fresh, type-scoped emptyConfig() rather than cloning wholesale — only
  // reusable style settings (trackIcons, overrideTrackIcons, products, allowDoubleBooking)
  // carry forward, Global only. Everything else is event-specific identity data (title,
  // dates, RF credentials, session picks) that would mislabel/misroute the new event.
  const startDuplicateConfig = useCallback((sourceRow, event, eventServiceEnv) => {
    const configType = sourceRow.configType || CONFIG_TYPES.GLOBAL;
    const sourceConfig = sourceRow.config || {};
    const config = isHomepageConfigType(configType)
      ? emptyConfig(configType)
      : {
        ...emptyConfig(configType),
        trackIcons: sourceConfig.trackIcons || {},
        overrideTrackIcons: sourceConfig.overrideTrackIcons || { byText: {} },
        products: sourceConfig.products || {},
        allowDoubleBooking: !!sourceConfig.allowDoubleBooking,
      };
    setActiveConfig({
      eventId: event.eventId,
      backendEventTitle: event.enTitle || event.eventId,
      eventServiceEnv,
      configType,
      config,
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

  // Keyed by override text instead of track name; every value is authored explicitly, with
  // no event-wide fallback.
  const updateOverrideTrackIcon = useCallback((overrideText, updates) => {
    setActiveConfig((prev) => {
      if (!prev) return prev;
      const override = prev.config.overrideTrackIcons || {};
      return {
        ...prev,
        config: {
          ...prev.config,
          overrideTrackIcons: {
            ...override,
            byText: {
              ...override.byText,
              [overrideText]: { ...override.byText?.[overrideText], ...updates },
            },
          },
        },
      };
    });
  }, []);

  // Same merge pattern as updateTrackIcon — { icon, pageUrl } per product, no color.
  const updateProduct = useCallback((product, updates) => {
    setActiveConfig((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        config: {
          ...prev.config,
          products: {
            ...prev.config.products,
            [product]: { ...prev.config.products?.[product], ...updates },
          },
        },
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
      const savedType = result.data.configType || CONFIG_TYPES.GLOBAL;
      const idx = prev.findIndex(
        (r) => r.eventId === result.data.eventId && (r.configType || CONFIG_TYPES.GLOBAL) === savedType,
      );
      if (idx === -1) return [result.data, ...prev];
      const next = [...prev];
      next[idx] = result.data;
      return next;
    });
    setActiveConfig(result.data);
    setToastSuccess(`Saved config for ${getDisplayTitle(result.data)}`);
    return result;
  }, [activeConfig, org, repo]);

  const removeConfig = useCallback(async (eventId, configType = CONFIG_TYPES.GLOBAL) => {
    if (!org || !repo) return { ok: false };
    const result = await deleteConfigController(org, repo, eventId, configType);
    if (!result.ok) {
      setToastError(result.error || 'Failed to delete — please retry');
      return result;
    }
    setConfigs((prev) => prev.filter(
      (r) => !(r.eventId === eventId && (r.configType || CONFIG_TYPES.GLOBAL) === configType),
    ));
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
    updateOverrideTrackIcon,
    updateProduct,
    updateConfigField,
    saveActiveConfig,
    removeConfig,
    getSessionCatalogForRow,
  };

  return html`
    <${ConfigsContext.Provider} value=${value}>
      ${children}
    </${ConfigsContext.Provider}>
  `;
};

const useConfigs = () => useContext(ConfigsContext);

export { ConfigsContext, ConfigsProvider, useConfigs };
