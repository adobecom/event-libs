import { createContext, useState, useContext, useEffect } from '../../v1/deps/htm-preact.js';
import { html } from '../htm-wrapper.js';
import { setDaToken, setDaFetch } from '../scripts/da-controller.js';
// import { setEspAuthToken } from '../../v1/utils/esp-controller.js';

const DAContext = createContext();

const DAProvider = ({ children }) => {
  const [token, setToken] = useState(null);
  const [org, setOrg] = useState(null);
  const [repo, setRepo] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function initSdk() {
      try {
        const { default: DA_SDK } = await import('https://da.live/nx/utils/sdk.js');
        const { token: sdkToken, context, actions } = await DA_SDK;
        setToken(sdkToken);
        setOrg(context?.org);
        setRepo(context?.repo);
        setDaToken(sdkToken);
        if (actions?.daFetch) setDaFetch(actions.daFetch);
        // TEMP DIAGNOSTIC (2026-07-22): setEspAuthToken(sdkToken) disabled to
        // test whether ESP calls going out with NO Authorization header (a
        // "simple" CORS request, no preflight) behave differently than with
        // one (which forces a preflight). DA-token reuse is otherwise
        // confirmed working against prod ESP — see PLAN.md — so re-enable
        // this once the CORS gap is closed, don't leave it off long-term.
        // setEspAuthToken(sdkToken);
      } catch (err) {
        window.lana?.log(`DA SDK init error: ${err}`);
        setError('Failed to initialize DA SDK. Please reload the page.');
      } finally {
        setIsLoading(false);
      }
    }
    initSdk();
  }, []);

  const value = { token, org, repo, isLoading, error };

  return html`
    <${DAContext.Provider} value=${value}>
      ${children}
    </${DAContext.Provider}>
  `;
};

const useDA = () => useContext(DAContext);

export { DAContext, DAProvider, useDA };
