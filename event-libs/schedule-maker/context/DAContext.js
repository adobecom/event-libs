import { createContext, useState, useContext, useEffect } from '../../v1/deps/htm-preact.js';
import { html } from '../htm-wrapper.js';
import { setDaToken, setDaFetch } from '../scripts/da-controller.js';

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
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('DA SDK init error:', err);
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
const useDAContext = useDA;

export { DAContext, DAProvider, useDA, useDAContext };
