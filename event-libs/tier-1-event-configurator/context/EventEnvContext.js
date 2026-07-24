import {
  createContext, useState, useContext, useCallback, useMemo,
} from '../../v1/deps/htm-preact.js';
import { html } from '../htm-wrapper.js';
import { setEventServiceEnvOverride, getEventServiceEnv } from '../../v1/utils/utils.js';

const EventEnvContext = createContext();

// Reactive wrapper around v1/utils/utils.js's module-level env override
// (the real source of truth esp-controller.js reads from, so it also works
// for non-React call sites) — a bare module variable can't drive a
// re-rendered UI on its own. Both the env picker's setEnv() and the app-wide
// banner's envName read go through the same setEventServiceEnvOverride().
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
