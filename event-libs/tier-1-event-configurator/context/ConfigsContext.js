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
import {
  CONFIG_TYPES, HOMEPAGE_SESSION_FIELDS, HOMEPAGE_FIELD_BY_TYPE, isHomepageConfigType,
} from '../constants.js';

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
    // default: the event-wide fallback for any override text not mapped in byText.
    // One field (not two) so there's nowhere for the two to drift apart, and no
    // author-typed override text can collide with a reserved sentinel key.
    overrideTrackIcons: { default: null, byText: {} },
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

  // Global-only lookup: Global rows are keyed on (eventId, configType)
  // together — absent configType means Global, for rows saved before this
  // field existed. Homepage rows are never looked up this way (their
  // identity is `configId`, since one event can carry several named
  // Upcoming/Featured Sessions rows side by side) — see Library.js's
  // handlePickEvent.
  const findConfigByEventId = useCallback(
    (eventId, configType = CONFIG_TYPES.GLOBAL) => configs.find(
      (c) => c.eventId === eventId && (c.configType || CONFIG_TYPES.GLOBAL) === configType,
    ) || null,
    [configs],
  );

  // Starts a fresh row for a newly picked event + config type. For Global,
  // dedup (routing to Edit when a row already exists for the picked event) is
  // the picker's responsibility — see PLAN.md Phase 4 — so this always
  // assumes no prior row. Homepage rows get their own `configId` instead:
  // there's no dedup to assume away, since a single event is expected to
  // carry several named Homepage rows (Upcoming/Featured Sessions) side by
  // side. `eventServiceEnv` is whatever ESP tier was active when the event
  // was picked (Library.js reads it from EventEnvContext) — row-level only,
  // never pasted into the page's Config, since it's purely an authoring-time
  // detail of where this event's data came from, re-applied automatically
  // when the row is edited later (see Library.js's openEdit) so a
  // session-catalog refetch doesn't silently default back to prod after a
  // page reload resets the override.
  const startNewConfig = useCallback((event, eventServiceEnv, configType = CONFIG_TYPES.GLOBAL) => {
    setActiveConfig({
      ...(isHomepageConfigType(configType) ? { configId: crypto.randomUUID() } : {}),
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
  // Homepage duplicates get their own fresh `configId`, same as startNewConfig — a
  // duplicate is always a new row, never a second write to the source row's identity.
  const startDuplicateConfig = useCallback((sourceRow, event, eventServiceEnv) => {
    const configType = sourceRow.configType || CONFIG_TYPES.GLOBAL;
    const sourceConfig = sourceRow.config || {};
    const config = isHomepageConfigType(configType)
      ? {
        ...emptyConfig(configType),
        // CTA text is a reusable style setting (same wording across events), not
        // event-specific identity data, so it carries forward like Global's trackIcons
        // etc. do below — unlike the session picks, which reset per event.
        ...Object.fromEntries(
          Object.values(HOMEPAGE_FIELD_BY_TYPE[configType]?.ctaFields || {})
            .filter((field) => sourceConfig[field])
            .map((field) => [field, sourceConfig[field]]),
        ),
      }
      : {
        ...emptyConfig(configType),
        trackIcons: sourceConfig.trackIcons || {},
        overrideTrackIcons: sourceConfig.overrideTrackIcons || { default: null, byText: {} },
        products: sourceConfig.products || {},
        allowDoubleBooking: !!sourceConfig.allowDoubleBooking,
      };
    setActiveConfig({
      ...(isHomepageConfigType(configType) ? { configId: crypto.randomUUID() } : {}),
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

  // Same merge pattern as updateTrackIcon, keyed by override text instead of track name —
  // each distinct text an author has typed is its own swimlane, with its own entry under
  // overrideTrackIcons.byText.
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

  // Merges { icon, color } updates into overrideTrackIcons.default — the event-wide
  // fallback applied to any override text not specifically mapped above.
  const updateOverrideDefaultIcon = useCallback((updates) => {
    setActiveConfig((prev) => {
      if (!prev) return prev;
      const override = prev.config.overrideTrackIcons || {};
      return {
        ...prev,
        config: {
          ...prev.config,
          overrideTrackIcons: {
            ...override,
            default: { ...override.default, ...updates },
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
      // Homepage rows match by configId alone (several can share one event+type);
      // Global rows have no configId, so fall back to eventId+configType.
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

  // `row` carries whatever identity it has — configId for Homepage rows,
  // eventId+configType for Global rows — mirroring da-controller.js's rowMatches.
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
    updateOverrideDefaultIcon,
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
