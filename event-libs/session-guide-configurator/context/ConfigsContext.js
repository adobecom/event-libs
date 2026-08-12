import {
  createContext, useState, useContext, useCallback, useEffect, html,
} from '../../v1/deps/htm-preact.js';
import {
  getConfigs,
  upsertConfig as upsertConfigController,
  deleteConfig as deleteConfigController,
} from '../scripts/da-controller.js';
import { useDA } from './DAContext.js';
import { getDisplayTitle } from '../utils.js';

const ConfigsContext = createContext();

function emptyConfig() {
  return {
    surface: 'widget',
    theme: 'dark',
    headings: {
      loggedOut: '', loggedIn: '', loggedOutPostEvent: '', loggedInPostEvent: '',
    },
    behaviorFlags: {
      enableScheduling: true,
      enableFavoriting: true,
      enableWatchNowCtas: true,
      enableBrandConciergeRibbon: true,
    },
    filterCategories: [],
    swimlaneOrder: [],
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

  // Always a full row shape, whether freshly created or loaded from the library.
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

  // An event can have many configs, so picking an event that already has rows is
  // expected, not an error — there's no dedup-by-event check.
  const startNewConfig = useCallback((event, eventServiceEnv) => {
    setActiveConfig({
      configId: crypto.randomUUID(),
      componentName: '',
      eventId: event.eventId,
      backendEventTitle: event.enTitle || event.eventId,
      eventServiceEnv,
      config: emptyConfig(),
    });
  }, []);

  // Clones a row's settings as-is onto the same event; only componentName gets a
  // "(copy)" suggestion.
  const startDuplicateConfig = useCallback((sourceRow) => {
    setActiveConfig({
      configId: crypto.randomUUID(),
      componentName: sourceRow.componentName ? `${sourceRow.componentName} (copy)` : '',
      eventId: sourceRow.eventId,
      backendEventTitle: sourceRow.backendEventTitle,
      eventServiceEnv: sourceRow.eventServiceEnv,
      config: { ...sourceRow.config },
    });
  }, []);

  const startEditConfig = useCallback((row) => {
    setActiveConfig(row);
  }, []);

  const clearActiveConfig = useCallback(() => setActiveConfig(null), []);

  // componentName lives at the row level, not inside config, hence a separate setter.
  const updateComponentName = useCallback((componentName) => {
    setActiveConfig((prev) => (prev ? { ...prev, componentName } : prev));
  }, []);

  const updateConfigField = useCallback((key, value) => {
    setActiveConfig((prev) => {
      if (!prev) return prev;
      return { ...prev, config: { ...prev.config, [key]: value } };
    });
  }, []);

  const updateNestedConfigField = useCallback((group, key, value) => {
    setActiveConfig((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        config: { ...prev.config, [group]: { ...prev.config[group], [key]: value } },
      };
    });
  }, []);

  // Seeds swimlane candidates (real tracks + override-lane texts, already deduped by
  // the caller) from the live catalog on top of swimlaneOrder: drops entries no longer
  // live, appends new ones (enabled by default), and otherwise leaves the author's
  // existing order/enabled/displayName state untouched.
  const seedSwimlaneOrder = useCallback((tracks) => {
    setActiveConfig((prev) => {
      if (!prev) return prev;
      const existing = prev.config.swimlaneOrder || [];
      const liveTracks = tracks || [];
      const liveTrackSet = new Set(liveTracks);
      // Backfills displayName on entries seeded before that field existed.
      let backfilled = false;
      const stillValid = existing
        .filter((r) => liveTrackSet.has(r.track))
        .map((r) => {
          if (r.displayName) return r;
          backfilled = true;
          return { ...r, displayName: r.track };
        });
      const existingTrackSet = new Set(existing.map((r) => r.track));
      const newOnes = liveTracks
        .filter((t) => !existingTrackSet.has(t))
        .map((t) => ({ track: t, displayName: t, enabled: true }));
      if (newOnes.length === 0 && stillValid.length === existing.length && !backfilled) return prev;
      return {
        ...prev,
        config: { ...prev.config, swimlaneOrder: [...stillValid, ...newOnes] },
      };
    });
  }, []);

  // Seeds newly-discovered facetable attributes on top of filterCategories (enabled
  // by default), without disturbing existing order/state. Display order is the array
  // order — there's no separate `order` field. `label` keeps the original ESP label
  // alongside the editable `displayName`.
  const seedFilterCategories = useCallback((candidateAttributes) => {
    setActiveConfig((prev) => {
      if (!prev) return prev;
      const existing = prev.config.filterCategories || [];
      const candidates = candidateAttributes || [];
      const candidatesById = new Map(candidates.map((c) => [c.attributeId, c]));
      // Backfills label on entries seeded before that field existed.
      let backfilled = false;
      const stillValid = existing
        .filter((c) => candidatesById.has(c.attributeId))
        .map((c) => {
          if (c.label) return c;
          backfilled = true;
          return { ...c, label: candidatesById.get(c.attributeId).label ?? c.displayName };
        });
      const existingIds = new Set(existing.map((c) => c.attributeId));
      const newOnes = candidates
        .filter((c) => !existingIds.has(c.attributeId))
        .map((c) => ({
          attributeId: c.attributeId, label: c.label, displayName: c.label, enabled: true,
        }));
      if (newOnes.length === 0 && stillValid.length === existing.length && !backfilled) return prev;
      return {
        ...prev,
        config: { ...prev.config, filterCategories: [...stillValid, ...newOnes] },
      };
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
      const idx = prev.findIndex((r) => r.configId === result.data.configId);
      if (idx === -1) return [result.data, ...prev];
      const next = [...prev];
      next[idx] = result.data;
      return next;
    });
    setActiveConfig(result.data);
    setToastSuccess(`Saved ${getDisplayTitle(result.data)}`);
    return result;
  }, [activeConfig, org, repo]);

  const removeConfig = useCallback(async (configId) => {
    if (!org || !repo) return { ok: false };
    const result = await deleteConfigController(org, repo, configId);
    if (!result.ok) {
      setToastError(result.error || 'Failed to delete — please retry');
      return result;
    }
    setConfigs((prev) => prev.filter((r) => r.configId !== configId));
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
    startNewConfig,
    startDuplicateConfig,
    startEditConfig,
    clearActiveConfig,
    updateComponentName,
    updateConfigField,
    updateNestedConfigField,
    seedSwimlaneOrder,
    seedFilterCategories,
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
