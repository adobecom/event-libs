import {
  createContext, useState, useContext, useCallback, useEffect, html,
} from '../../v1/deps/htm-preact.js';
import {
  getConfigs,
  upsertConfig as upsertConfigController,
  deleteConfig as deleteConfigController,
  republishConfigs as republishConfigsController,
} from '../scripts/da-controller.js';
import { useDA } from './DAContext.js';
import { SWAN_ENV_OPTIONS } from '../constants.js';
import { getDisplayTitle } from '../utils.js';

const ConfigsContext = createContext();

// eventId pre-fills notificationSubType so a fresh config isn't a blank field prone to
// being copy-pasted from a different event's authored value (see
// docs/swan-unc-dependencies.md's authoring-guide troubleshooting section).
function emptyConfig(eventId) {
  return {
    environment: '',
    notificationSubType: eventId ? `${eventId}.scheduled.notifications` : '',
    appId: '',
    defaultNotificationIconUrl: '',
    defaultNotificationImageUrl: '',
    upcomingOffsetMinutes: 5,
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

  const startNewConfig = useCallback((eventId, eventName) => {
    setActiveConfig({
      configId: crypto.randomUUID(),
      eventId,
      backendEventTitle: eventName,
      config: emptyConfig(eventId),
    });
  }, []);

  const startEditConfig = useCallback((row) => {
    setActiveConfig(row);
  }, []);

  const clearActiveConfig = useCallback(() => setActiveConfig(null), []);

  const updateConfigField = useCallback((key, value) => {
    setActiveConfig((prev) => {
      if (!prev) return prev;
      return { ...prev, config: { ...prev.config, [key]: value } };
    });
  }, []);

  // Resolves the locked dropdown's chosen environment to real endpoint URLs at save
  // time — ans-controller.js/swan-payload.js keep reading ansEndpoint/adobeIoEndpoint
  // exactly as before, unaware a dropdown is even involved. Storing environment
  // alongside the resolved URLs (not just the URLs) lets the editor re-select the right
  // dropdown option on a later edit without reverse-mapping a URL back to a name.
  const saveActiveConfig = useCallback(async () => {
    if (!activeConfig || !org || !repo) return { ok: false };
    const envOption = SWAN_ENV_OPTIONS.find((o) => o.value === activeConfig.config.environment);
    // ConfigEditor.js's saveDisabled guard is the primary defense, but this context layer
    // is the actual save entry point — a future caller/UI regression that bypasses that
    // guard must still not be able to publish a config with no real endpoints (which
    // isSwanEnabled() would treat as merely "disabled," not obviously wrong, at runtime).
    if (!envOption?.ansEndpoint || !envOption?.adobeIoEndpoint) {
      const message = 'Select a fully-configured environment before saving.';
      setToastError(message);
      return { ok: false, error: message };
    }
    const resolvedConfig = {
      ...activeConfig.config,
      ansEndpoint: envOption.ansEndpoint,
      adobeIoEndpoint: envOption.adobeIoEndpoint,
    };
    const result = await upsertConfigController(org, repo, { ...activeConfig, config: resolvedConfig });
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
    if (result.publishOk) setToastSuccess(`Saved and published ${getDisplayTitle(result.data)}`);
    // No toastError on a publish failure — ConfigEditor.js shows a persistent warning
    // instead, since a dismissable toast isn't a strong enough signal that the configId
    // about to be copied won't actually work yet.
    return result;
  }, [activeConfig, org, repo]);

  const republish = useCallback(() => {
    if (!org || !repo) return Promise.resolve({ ok: false });
    return republishConfigsController(org, repo);
  }, [org, repo]);

  const removeConfig = useCallback(async (configId) => {
    if (!org || !repo) return { ok: false };
    const result = await deleteConfigController(org, repo, configId);
    if (!result.ok) {
      setToastError(result.error || 'Failed to delete — please retry');
      return result;
    }
    setConfigs((prev) => prev.filter((r) => r.configId !== configId));
    if (result.publishOk) {
      setToastSuccess('Config deleted');
    } else {
      // The row is gone from the sheet, but the still-live published copy may keep
      // serving it to any page already using its configId until this succeeds — this
      // must read as a warning to retry, not a clean success (mirrors saveActiveConfig's
      // publishOk handling; see Library.js's "Retry publish" action).
      setToastError(`Deleted, but not yet published${result.publishError ? `: ${result.publishError}` : ''} — click "Retry publish" or it may keep working briefly.`);
    }
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
    startEditConfig,
    clearActiveConfig,
    updateConfigField,
    saveActiveConfig,
    republish,
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
