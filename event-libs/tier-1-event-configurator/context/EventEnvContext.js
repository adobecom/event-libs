import {
  createContext, useState, useContext, useCallback, useMemo,
} from '../../v1/deps/htm-preact.js';
import { html } from '../htm-wrapper.js';
import { setEventServiceEnvOverride, getEventServiceEnv } from '../../v1/utils/utils.js';

const EventEnvContext = createContext();

// Reactive wrapper around v1/utils/utils.js's plain module-level env
// override — that override is the real source of truth esp-controller.js
// reads from (so it works for non-React call sites too), but a bare module
// variable can't drive a re-rendered UI on its own. This context is the one
// place both directions meet: ManualEventLookup.js's env picker calls
// setEnv(), and the app-wide env badge (TierOneEventConfigurator.js) reads
// envName — both backed by the same setEventServiceEnvOverride() call, so
// they can never drift apart.
const EventEnvProvider = ({ children }) => {
  const [envName, setEnvName] = useState(() => getEventServiceEnv().name);

  const setEnv = useCallback((name) => {
    setEventServiceEnvOverride(name);
    setEnvName(getEventServiceEnv().name);
  }, []);

  const value = useMemo(() => ({ envName, setEnv }), [envName, setEnv]);

  return html`
    <${EventEnvContext.Provider} value=${value}>
      ${children}
    </${EventEnvContext.Provider}>
  `;
};

const useEventEnv = () => useContext(EventEnvContext);

export { EventEnvProvider, useEventEnv };
