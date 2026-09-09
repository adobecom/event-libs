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
import { getDisplayTitle, syncIconConfigWithCatalog } from '../utils.js';
import {
  CONFIG_TYPES, HOMEPAGE_SESSION_FIELDS, HOMEPAGE_FIELD_BY_TYPE, isHomepageConfigType,
} from '../constants.js';

const ConfigsContext = createContext();

// Scoped per config type: Global never carries Homepage session-pick fields, and vice versa.
function emptyConfig(configType = CONFIG_TYPES.GLOBAL) {
  if (isHomepageConfigType(configType)) {
    const { field, metaField } = HOMEPAGE_SESSION_FIELDS[configType];
    return { configName: '', [field]: [], [metaField]: {} };
  }
  return {
    // Purely a label; blank falls through to eventTitle/backendEventTitle/eventId in getDisplayTitle.
    configName: '',
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

  // Keyed by (eventId, env); shared with Library.js so a warmed catalog isn't re-fetched.
  const sessionCatalogCache = useRef(new Map());
  const getSessionCatalogForRow = useCallback((row) => {
    const key = `${row.eventId}:${row.eventServiceEnv || 'prod'}`;
    let promise = sessionCatalogCache.current.get(key);
    if (!promise) {
      // getEventSessionCatalog reads env from a shared global, so flip/restore it around the fetch.
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
  // persistent: true keeps the toast up until manually dismissed instead of auto-timing out.
  const [toastSuccess, setToastSuccess] = useState(null);
  const [toastError, setToastError] = useState(null);

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

  // Returns only the first match — can't disambiguate multiple rows sharing one event+type.
  const findConfigByEventId = useCallback(
    (eventId, configType = CONFIG_TYPES.GLOBAL) => configs.find(
      (c) => c.eventId === eventId && (c.configType || CONFIG_TYPES.GLOBAL) === configType,
    ) || null,
    [configs],
  );

  // eventServiceEnv is row-only, never in config — Library.js's openEdit re-applies it on edit.
  const startNewConfig = useCallback((event, eventServiceEnv, configType = CONFIG_TYPES.GLOBAL) => {
    setActiveConfig({
      // configId lets multiple Global rows per Event ID save without colliding (see da-controller.js's rowMatches).
      configId: crypto.randomUUID(),
      eventId: event.eventId,
      backendEventTitle: event.enTitle || event.eventId,
      eventServiceEnv,
      configType,
      config: emptyConfig(configType),
    });
  }, []);

  // Only style settings carry forward (trackIcons/overrideTrackIcons/products/allowDoubleBooking).
  const startDuplicateConfig = useCallback((sourceRow, event, eventServiceEnv) => {
    const configType = sourceRow.configType || CONFIG_TYPES.GLOBAL;
    const sourceConfig = sourceRow.config || {};
    const config = isHomepageConfigType(configType)
      ? {
        ...emptyConfig(configType),
        ...Object.fromEntries(
          Object.values(HOMEPAGE_FIELD_BY_TYPE[configType]?.ctaFields || {})
            .filter((field) => sourceConfig[field])
            .map((field) => [field, sourceConfig[field]]),
        ),
      }
      : {
        ...emptyConfig(configType),
        trackIcons: sourceConfig.trackIcons || {},
        overrideTrackIcons: sourceConfig.overrideTrackIcons || { byText: {} },
        products: sourceConfig.products || {},
        allowDoubleBooking: !!sourceConfig.allowDoubleBooking,
      };
    setActiveConfig({
      configId: crypto.randomUUID(),
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

  // Keyed by override text instead of track name, with no event-wide fallback.
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

  const updateConfigField = useCallback((key, value) => {
    setActiveConfig((prev) => {
      if (!prev) return prev;
      return { ...prev, config: { ...prev.config, [key]: value } };
    });
  }, []);

  // Global only — Homepage configs don't author trackIcons/overrideTrackIcons/products.
  const syncActiveConfigWithCatalog = useCallback((lists) => {
    if (!activeConfig || isHomepageConfigType(activeConfig.configType || CONFIG_TYPES.GLOBAL)) return null;
    const result = syncIconConfigWithCatalog(activeConfig.config, lists);
    if (result.hasChanges) {
      setActiveConfig((prev) => (prev ? { ...prev, config: result.config } : prev));
    }
    return result;
  }, [activeConfig]);

  const saveActiveConfig = useCallback(async () => {
    if (!activeConfig || !org || !repo) return { ok: false };
    const result = await upsertConfigController(org, repo, activeConfig);
    if (!result.ok) {
      setToastError(result.error || 'Failed to save — please retry');
      return result;
    }
    setConfigs((prev) => {
      const savedType = result.data.configType || CONFIG_TYPES.GLOBAL;
      // Homepage rows match by configId alone; Global rows fall back to eventId+configType.
      const idx = prev.findIndex((r) => (result.data.configId
        ? r.configId === result.data.configId
        : r.eventId === result.data.eventId && (r.configType || CONFIG_TYPES.GLOBAL) === savedType));
      if (idx === -1) return [result.data, ...prev];
      const next = [...prev];
      next[idx] = result.data;
      return next;
    });
    setActiveConfig(result.data);
    setToastSuccess(`Saved config for ${getDisplayTitle(result.data)}`);
    return result;
  }, [activeConfig, org, repo]);

  // row carries configId (Homepage) or eventId+configType (Global), per da-controller.js's rowMatches.
  const removeConfig = useCallback(async (row) => {
    if (!org || !repo) return { ok: false };
    const { eventId, configType = CONFIG_TYPES.GLOBAL, configId } = row;
    const result = await deleteConfigController(org, repo, { eventId, configType, configId });
    if (!result.ok) {
      setToastError(result.error || 'Failed to delete — please retry');
      return result;
    }
    setConfigs((prev) => prev.filter((r) => (configId
      ? r.configId !== configId
      : !(r.eventId === eventId && (r.configType || CONFIG_TYPES.GLOBAL) === configType))));
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
    syncActiveConfigWithCatalog,
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
