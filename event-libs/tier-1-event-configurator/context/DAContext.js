import { createContext, useState, useContext, useEffect } from '../../v1/deps/htm-preact.js';
import { html } from '../htm-wrapper.js';
import { setDaToken, setDaFetch } from '../scripts/da-controller.js';
import { setEspAuthToken } from '../../v1/utils/esp-controller.js';

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
        // No Milo/IMS bootstrap in this standalone app (no window.adobeIMS),
        // so ESP calls (listEvents/listAllEvents/getEventSessionCatalog) have
        // no token at all otherwise. Reuse DA's own token as a best-effort
        // Authorization Bearer. Known to fail against ESP's gateway as-is
        // (401 ErrInvalidOauthToken — DA's token is scoped to DA's own IMS
        // client, which the gateway doesn't allow-list); kept as the current
        // approach anyway since the alternative (this app bootstrapping its
        // own IMS session via events-milo) hit a harder blocker — IMS
        // appears to reject the check entirely once this app is running
        // inside an iframe, regardless of origin. See PLAN.md.
        setEspAuthToken(sdkToken);
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
